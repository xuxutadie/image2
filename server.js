/**
 * CYBER FORGE - MySQL 正式商用版后端
 * 使用方法:
 * 1. 启动 MySQL 服务
 * 2. 可通过环境变量配置连接信息
 * 3. 执行: npm install && node server.js
 * 4. 浏览器打开: http://localhost:3456
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const PORT = 3456;
const LEGACY_USERS_FILE = path.join(__dirname, 'users.json');
const LEGACY_IP_FILE = path.join(__dirname, 'ip_records.json');
const QUALITY_COSTS = { '1k': 58, '2k': 98, '4k': 128 };
const BCRYPT_ROUNDS = 10;

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'cyber_forge',
  charset: 'utf8mb4',
};

let pool = null;

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function initDatabase() {
  const bootstrap = await mysql.createConnection({
    host: MYSQL_CONFIG.host,
    port: MYSQL_CONFIG.port,
    user: MYSQL_CONFIG.user,
    password: MYSQL_CONFIG.password,
    charset: MYSQL_CONFIG.charset,
    multipleStatements: true,
  });

  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${MYSQL_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await bootstrap.end();

  pool = mysql.createPool({
    host: MYSQL_CONFIG.host,
    port: MYSQL_CONFIG.port,
    user: MYSQL_CONFIG.user,
    password: MYSQL_CONFIG.password,
    database: MYSQL_CONFIG.database,
    charset: MYSQL_CONFIG.charset,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      real_name VARCHAR(255) NULL,
      password_hash VARCHAR(255) NULL,
      points INT NOT NULL DEFAULT 0,
      registered_at BIGINT NOT NULL,
      register_ip VARCHAR(64) NULL,
      open_id VARCHAR(255) NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_users_registered_at (registered_at),
      INDEX idx_users_register_ip (register_ip)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ip_registrations (
      ip VARCHAR(64) PRIMARY KEY,
      last_registered_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS point_logs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id VARCHAR(64) NOT NULL,
      change_amount INT NOT NULL,
      balance_after INT NOT NULL,
      action VARCHAR(64) NOT NULL,
      note VARCHAR(255) NULL,
      created_at BIGINT NOT NULL,
      INDEX idx_point_logs_user_id (user_id),
      INDEX idx_point_logs_created_at (created_at),
      CONSTRAINT fk_point_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await migrateLegacyData();
}

async function migrateLegacyData() {
  const row = await getOne('SELECT COUNT(*) AS count FROM users');
  if (row && row.count > 0) return;

  let legacyUsers = {};
  let legacyIpRecords = {};

  if (fs.existsSync(LEGACY_USERS_FILE)) {
    try {
      legacyUsers = JSON.parse(fs.readFileSync(LEGACY_USERS_FILE, 'utf8'));
    } catch (error) {
      console.error('读取旧 users.json 失败:', error.message);
    }
  }

  if (fs.existsSync(LEGACY_IP_FILE)) {
    try {
      legacyIpRecords = JSON.parse(fs.readFileSync(LEGACY_IP_FILE, 'utf8'));
    } catch (error) {
      console.error('读取旧 ip_records.json 失败:', error.message);
    }
  }

  for (const user of Object.values(legacyUsers)) {
    const passwordHash = user.password
      ? await bcrypt.hash(user.password, BCRYPT_ROUNDS)
      : null;
    const createdAt = parseInt(user.registeredAt || Date.now(), 10);

    await query(
      `INSERT INTO users
       (id, username, real_name, password_hash, points, registered_at, register_ip, open_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE username = VALUES(username)`,
      [
        user.id,
        user.username,
        user.realName || null,
        passwordHash,
        parseInt(user.points || 0, 10),
        createdAt,
        user.registerIp || null,
        user.openId || null,
        createdAt,
        Date.now(),
      ]
    );
  }

  for (const [ip, timestamp] of Object.entries(legacyIpRecords)) {
    await query(
      `INSERT INTO ip_registrations (ip, last_registered_at)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE last_registered_at = VALUES(last_registered_at)`,
      [ip, parseInt(timestamp || 0, 10)]
    );
  }

  console.log('[MySQL] 旧 JSON 数据已迁移到 MySQL');
}

function normalizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    realName: row.real_name,
    points: row.points,
    registeredAt: row.registered_at,
    registerIp: row.register_ip,
    openId: row.open_id,
  };
}

async function getUserById(userId) {
  return getOne('SELECT * FROM users WHERE id = ?', [userId]);
}

async function getUserByUsername(username) {
  return getOne('SELECT * FROM users WHERE username = ?', [username]);
}

async function updateUserPoints(userId, delta, action, note) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
    const user = rows[0];
    if (!user) {
      await conn.rollback();
      return null;
    }

    const nextPoints = user.points + delta;
    if (nextPoints < 0) {
      await conn.rollback();
      return null;
    }

    await conn.execute(
      'UPDATE users SET points = ?, updated_at = ? WHERE id = ?',
      [nextPoints, Date.now(), userId]
    );
    await conn.execute(
      `INSERT INTO point_logs (user_id, change_amount, balance_after, action, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, delta, nextPoints, action, note || '', Date.now()]
    );
    await conn.commit();
    return { ...user, points: nextPoints };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  }[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('文件未找到');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

async function ensureUserCanAfford(userId, quality) {
  const user = await getUserById(userId);
  if (!user) {
    return { ok: false, status: 401, body: { error: { message: '请先登录' } } };
  }

  const cost = QUALITY_COSTS[quality] || QUALITY_COSTS['1k'];
  if (user.points < cost) {
    return { ok: false, status: 402, body: { error: { message: '积分不足，请充值' } } };
  }

  return { ok: true, user, cost };
}

function proxyRequest(req, res) {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    proxyMultipart(req, res);
  } else {
    proxyJson(req, res);
  }
}

function proxyMultipart(req, res) {
  const apiKey = req.headers['x-api-key'];
  const endpoint = req.headers['x-api-endpoint'];
  const reqContentType = req.headers['content-type'];
  const userId = req.headers['x-user-id'];
  const quality = req.headers['x-quality'] || '1k';

  if (!apiKey || !endpoint) {
    sendJson(res, 400, { error: { message: '未提供API密钥或接口地址' } });
    return;
  }

  ensureUserCanAfford(userId, quality)
    .then((authResult) => {
      if (!authResult.ok) {
        sendJson(res, authResult.status, authResult.body);
        return;
      }

      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const rawBody = Buffer.concat(chunks);
        const targetUrl = new URL(endpoint);
        const isHttps = targetUrl.protocol === 'https:';
        const options = {
          hostname: targetUrl.hostname,
          port: targetUrl.port || (isHttps ? 443 : 80),
          path: targetUrl.pathname + targetUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': reqContentType,
            Authorization: `Bearer ${apiKey}`,
            'Content-Length': rawBody.length,
          },
          timeout: 3600000,
          rejectUnauthorized: false,
        };

        let responded = false;
        const proxyReq = (isHttps ? https : http).request(options, (proxyRes) => {
          const respChunks = [];
          proxyRes.on('data', (chunk) => respChunks.push(chunk));
          proxyRes.on('end', async () => {
            if (responded) return;
            responded = true;
            if (proxyRes.statusCode === 200) {
              const updatedUser = await updateUserPoints(
                authResult.user.id,
                -authResult.cost,
                'generate',
                `参考图生成(${quality})`
              );
              if (updatedUser) {
                console.log(`[扣费] 用户 ${updatedUser.username} 扣除 ${authResult.cost} 积分，剩余 ${updatedUser.points}`);
              }
            }
            res.writeHead(proxyRes.statusCode, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(Buffer.concat(respChunks));
          });
        });

        proxyReq.on('error', (err) => {
          if (responded) return;
          responded = true;
          sendJson(res, 502, { error: { message: `代理请求失败: ${err.message}` } });
        });

        proxyReq.on('timeout', () => {
          if (responded) return;
          responded = true;
          proxyReq.destroy();
          sendJson(res, 504, { error: { message: 'API请求超时（超过60分钟），可能模型拥堵，请稍后重试' } });
        });

        proxyReq.write(rawBody);
        proxyReq.end();
      });
    })
    .catch((error) => {
      console.error('[代理] multipart 错误:', error);
      sendJson(res, 500, { error: { message: '服务器内部错误' } });
    });
}

function proxyJson(req, res) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    let params;
    try {
      params = JSON.parse(body || '{}');
    } catch (error) {
      sendJson(res, 400, { error: { message: '请求数据格式错误' } });
      return;
    }

    const { apiKey, endpoint } = params;
    if (!apiKey || !endpoint) {
      sendJson(res, 400, { error: { message: '未提供API密钥或接口地址' } });
      return;
    }

    const apiBody = {};
    for (const key of Object.keys(params)) {
      if (key !== 'apiKey' && key !== 'endpoint') apiBody[key] = params[key];
    }

    const userId = req.headers['x-user-id'];
    const quality = apiBody.quality || '1k';
    const authResult = await ensureUserCanAfford(userId, quality);
    if (!authResult.ok) {
      sendJson(res, authResult.status, authResult.body);
      return;
    }

    const postData = JSON.stringify(apiBody);
    const targetUrl = new URL(endpoint);
    const isHttps = targetUrl.protocol === 'https:';
    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 3600000,
      rejectUnauthorized: false,
    };

    let responded = false;
    const proxyReq = (isHttps ? https : http).request(options, (proxyRes) => {
      let responseBody = '';
      proxyRes.on('data', (chunk) => { responseBody += chunk; });
      proxyRes.on('end', async () => {
        if (responded) return;
        responded = true;
        if (proxyRes.statusCode === 200) {
          const updatedUser = await updateUserPoints(
            authResult.user.id,
            -authResult.cost,
            'generate',
            `普通生成(${quality})`
          );
          if (updatedUser) {
            console.log(`[扣费] 用户 ${updatedUser.username} 扣除 ${authResult.cost} 积分，剩余 ${updatedUser.points}`);
          }
        }
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(responseBody);
      });
    });

    proxyReq.on('error', (err) => {
      if (responded) return;
      responded = true;
      sendJson(res, 502, { error: { message: `代理请求失败: ${err.message}` } });
    });

    proxyReq.on('timeout', () => {
      if (responded) return;
      responded = true;
      proxyReq.destroy();
      sendJson(res, 504, { error: { message: 'API请求超时（超过60分钟），可能模型拥堵，请稍后重试' } });
    });

    proxyReq.write(postData);
    proxyReq.end();
  });
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (error) {
        reject(error);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  try {
    if (req.method === 'POST' && pathname === '/api/login') {
      const data = await parseRequestBody(req);
      const username = (data.username || '').trim();
      const password = (data.password || '').trim();
      const realName = (data.realName || '').trim();
      const isRegister = data.isRegister === true;
      const clientIp = ((req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0]).trim();

      if (!username || !password) {
        sendJson(res, 400, { error: '用户名和密码不能为空' });
        return;
      }

      if (isRegister && !realName) {
        sendJson(res, 400, { error: '注册时必须填写真实姓名' });
        return;
      }

      let user = await getUserByUsername(username);
      let isNew = false;

      if (isRegister) {
        if (user) {
          sendJson(res, 400, { error: '用户名已存在' });
          return;
        }

        const now = Date.now();
        const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
        const ipRecord = await getOne('SELECT * FROM ip_registrations WHERE ip = ?', [clientIp]);
        if (ipRecord && now - ipRecord.last_registered_at < oneMonthMs) {
          sendJson(res, 403, { error: '该IP本月已注册过账号，请勿频繁注册。' });
          return;
        }

        const newId = `uid_${now}`;
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        await query(
          `INSERT INTO users
           (id, username, real_name, password_hash, points, registered_at, register_ip, open_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [newId, username, realName, passwordHash, 580, now, clientIp, null, now, now]
        );
        await query(
          `INSERT INTO ip_registrations (ip, last_registered_at)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE last_registered_at = VALUES(last_registered_at)`,
          [clientIp, now]
        );
        await query(
          `INSERT INTO point_logs (user_id, change_amount, balance_after, action, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [newId, 580, 580, 'register_bonus', '新用户注册赠送积分', now]
        );
        user = await getUserById(newId);
        isNew = true;
      } else {
        if (!user) {
          sendJson(res, 404, { error: '用户不存在' });
          return;
        }
        const passwordOk = user.password_hash
          ? await bcrypt.compare(password, user.password_hash)
          : false;
        if (!passwordOk) {
          sendJson(res, 401, { error: '密码错误' });
          return;
        }
      }

      sendJson(res, 200, { success: true, user: normalizeUser(user), isNew });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/user') {
      const userId = url.searchParams.get('id');
      const user = userId ? await getUserById(userId) : null;
      if (!user) {
        sendJson(res, 404, { error: '用户不存在' });
        return;
      }
      sendJson(res, 200, { success: true, user: normalizeUser(user) });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/recharge') {
      const { userId, points } = await parseRequestBody(req);
      const delta = parseInt(points, 10);
      if (!userId || Number.isNaN(delta) || delta <= 0) {
        sendJson(res, 400, { error: '充值失败' });
        return;
      }
      const updatedUser = await updateUserPoints(userId, delta, 'user_recharge', '用户自助充值');
      if (!updatedUser) {
        sendJson(res, 400, { error: '充值失败' });
        return;
      }
      sendJson(res, 200, { success: true, user: normalizeUser(updatedUser) });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/users') {
      const users = await query('SELECT * FROM users ORDER BY registered_at DESC');
      sendJson(res, 200, { success: true, users: users.map(normalizeUser) });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/recharge') {
      const { userId, points } = await parseRequestBody(req);
      const delta = parseInt(points, 10);
      if (!userId || Number.isNaN(delta) || delta <= 0) {
        sendJson(res, 400, { error: '充值失败' });
        return;
      }
      const updatedUser = await updateUserPoints(userId, delta, 'admin_recharge', '管理员手动充值');
      if (!updatedUser) {
        sendJson(res, 400, { error: '充值失败' });
        return;
      }
      sendJson(res, 200, { success: true, user: normalizeUser(updatedUser) });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/deleteUser') {
      const { userId } = await parseRequestBody(req);
      const user = userId ? await getUserById(userId) : null;
      if (!user) {
        sendJson(res, 400, { error: '删除失败，用户不存在' });
        return;
      }
      await query('DELETE FROM users WHERE id = ?', [userId]);
      if (user.register_ip) {
        await query('DELETE FROM ip_registrations WHERE ip = ?', [user.register_ip]);
      }
      sendJson(res, 200, { success: true });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate') {
      proxyRequest(req, res);
      return;
    }

    let filePath;
    if (pathname === '/' || pathname === '/index.html') {
      filePath = path.join(__dirname, 'index.html');
    } else {
      filePath = path.join(__dirname, decodeURIComponent(pathname));
    }

    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403);
      res.end('禁止访问');
      return;
    }

    serveFile(res, filePath);
  } catch (error) {
    console.error('[服务器] 错误:', error);
    sendJson(res, 500, { error: '服务器内部错误' });
  }
});

initDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log('');
      console.log('  CYBER FORGE MySQL 后端已启动');
      console.log('  ---------------------------');
      console.log(`  本地地址: http://localhost:${PORT}`);
      console.log(`  MySQL: ${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database}`);
      console.log('  按 Ctrl+C 停止服务器');
      console.log('');
    });
  })
  .catch((error) => {
    console.error('MySQL 初始化失败:', error.message);
    process.exit(1);
  });
