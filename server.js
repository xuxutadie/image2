/**
 * CYBER FORGE - MySQL 正式商用版后端
 * 使用方法:
 * 1. 启动 MySQL 服务
 * 2. 可通过环境变量配置连接信息
 * 3. 执行: npm install && node server.js
 * 4. 浏览器打开: http://localhost:8080
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const PORT = parseInt(process.env.PORT || '8080', 10);
const LEGACY_USERS_FILE = path.join(__dirname, 'users.json');
const LEGACY_IP_FILE = path.join(__dirname, 'ip_records.json');
const JSON_SETTINGS_FILE = path.join(__dirname, 'app_settings.json');
const QUALITY_COSTS = { '1k': 58, '2k': 98, '4k': 128 };
const BCRYPT_ROUNDS = 10;
const GENERATION_JOB_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_APP_SETTINGS = {
  apiEndpoint: 'https://api.openai-hk.com/v1/images/generations',
  apiKey: '',
  model: 'gpt-image-2',
  apiEnabled: false,
  timerEnd: null,
};

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'cyber_forge',
  charset: 'utf8mb4',
};

let pool = null;
let useJsonStore = false;
let jsonUsers = {};
let jsonIpRegistrations = {};
let jsonAppSettings = {};
const generationJobs = new Map();

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`[JSON] 读取 ${path.basename(filePath)} 失败:`, error.message);
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function loadJsonStore() {
  const rawUsers = readJsonFile(LEGACY_USERS_FILE, {});
  const normalizedUsers = {};

  for (const user of Object.values(rawUsers)) {
    if (!user || !user.id || !user.username) continue;

    let passwordHash = user.password_hash || null;
    if (!passwordHash && user.password) {
      passwordHash = await bcrypt.hash(String(user.password), BCRYPT_ROUNDS);
    }

    const registeredAt = parseInt(user.registered_at || user.registeredAt || Date.now(), 10);
    normalizedUsers[user.id] = {
      id: user.id,
      username: user.username,
      real_name: user.real_name || user.realName || null,
      password_hash: passwordHash,
      points: parseInt(user.points || 0, 10),
      registered_at: registeredAt,
      register_ip: user.register_ip || user.registerIp || null,
      open_id: user.open_id || user.openId || null,
      created_at: parseInt(user.created_at || registeredAt, 10),
      updated_at: parseInt(user.updated_at || Date.now(), 10),
    };
  }

  jsonUsers = normalizedUsers;
  jsonIpRegistrations = readJsonFile(LEGACY_IP_FILE, {});
  jsonAppSettings = readJsonFile(JSON_SETTINGS_FILE, {});
}

function persistJsonUsers() {
  writeJsonFile(LEGACY_USERS_FILE, jsonUsers);
}

function persistJsonIpRegistrations() {
  writeJsonFile(LEGACY_IP_FILE, jsonIpRegistrations);
}

function persistJsonSettings() {
  writeJsonFile(JSON_SETTINGS_FILE, jsonAppSettings);
}

async function initDatabase() {
  try {
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

    await query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key VARCHAR(64) PRIMARY KEY,
        setting_value TEXT NULL,
        updated_at BIGINT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await ensureDefaultSettings();
    await migrateLegacyData();
  } catch (error) {
    useJsonStore = true;
    pool = null;
    await loadJsonStore();
    await ensureDefaultSettings();
    console.warn(`[启动] MySQL 不可用，已切换到 JSON 本地模式: ${error.message}`);
  }
}

async function ensureDefaultSettings() {
  if (useJsonStore) {
    jsonAppSettings = {
      api_endpoint: jsonAppSettings.api_endpoint || DEFAULT_APP_SETTINGS.apiEndpoint,
      api_key: jsonAppSettings.api_key || DEFAULT_APP_SETTINGS.apiKey,
      model: jsonAppSettings.model || DEFAULT_APP_SETTINGS.model,
      api_enabled: Object.prototype.hasOwnProperty.call(jsonAppSettings, 'api_enabled')
        ? jsonAppSettings.api_enabled
        : (DEFAULT_APP_SETTINGS.apiEnabled ? '1' : '0'),
      timer_end: jsonAppSettings.timer_end || '',
    };
    persistJsonSettings();
    return;
  }

  const now = Date.now();
  const defaults = {
    api_endpoint: DEFAULT_APP_SETTINGS.apiEndpoint,
    api_key: DEFAULT_APP_SETTINGS.apiKey,
    model: DEFAULT_APP_SETTINGS.model,
    api_enabled: DEFAULT_APP_SETTINGS.apiEnabled ? '1' : '0',
    timer_end: '',
  };

  for (const [key, value] of Object.entries(defaults)) {
    await query(
      `INSERT INTO app_settings (setting_key, setting_value, updated_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = setting_value, updated_at = updated_at`,
      [key, String(value ?? ''), now]
    );
  }
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

async function getAppSettings() {
  if (useJsonStore) {
    let apiEnabled = jsonAppSettings.api_enabled === '1';
    let timerEnd = jsonAppSettings.timer_end || null;

    if (timerEnd && new Date(timerEnd) <= new Date()) {
      apiEnabled = false;
      timerEnd = null;
      jsonAppSettings.api_enabled = '0';
      jsonAppSettings.timer_end = '';
      persistJsonSettings();
    }

    return {
      apiEndpoint: jsonAppSettings.api_endpoint || DEFAULT_APP_SETTINGS.apiEndpoint,
      apiKey: jsonAppSettings.api_key || DEFAULT_APP_SETTINGS.apiKey,
      model: jsonAppSettings.model || DEFAULT_APP_SETTINGS.model,
      apiEnabled,
      timerEnd,
    };
  }

  const rows = await query('SELECT setting_key, setting_value FROM app_settings');
  const map = {};
  for (const row of rows) {
    map[row.setting_key] = row.setting_value;
  }
  let apiEnabled = map.api_enabled === '1';
  let timerEnd = map.timer_end || null;

  if (timerEnd && new Date(timerEnd) <= new Date()) {
    apiEnabled = false;
    timerEnd = null;
    await query(
      `UPDATE app_settings
       SET setting_value = CASE
         WHEN setting_key = 'api_enabled' THEN '0'
         WHEN setting_key = 'timer_end' THEN ''
         ELSE setting_value
       END,
       updated_at = ?
       WHERE setting_key IN ('api_enabled', 'timer_end')`,
      [Date.now()]
    );
  }

  return {
    apiEndpoint: map.api_endpoint || DEFAULT_APP_SETTINGS.apiEndpoint,
    apiKey: map.api_key || DEFAULT_APP_SETTINGS.apiKey,
    model: map.model || DEFAULT_APP_SETTINGS.model,
    apiEnabled,
    timerEnd,
  };
}

async function saveAppSettings(nextSettings) {
  if (useJsonStore) {
    jsonAppSettings.api_endpoint = nextSettings.apiEndpoint || DEFAULT_APP_SETTINGS.apiEndpoint;
    jsonAppSettings.api_key = nextSettings.apiKey || '';
    jsonAppSettings.model = nextSettings.model || DEFAULT_APP_SETTINGS.model;
    jsonAppSettings.api_enabled = nextSettings.apiEnabled ? '1' : '0';
    jsonAppSettings.timer_end = nextSettings.timerEnd || '';
    persistJsonSettings();
    return getAppSettings();
  }

  const now = Date.now();
  const entries = {
    api_endpoint: nextSettings.apiEndpoint || DEFAULT_APP_SETTINGS.apiEndpoint,
    api_key: nextSettings.apiKey || '',
    model: nextSettings.model || DEFAULT_APP_SETTINGS.model,
    api_enabled: nextSettings.apiEnabled ? '1' : '0',
    timer_end: nextSettings.timerEnd || '',
  };

  for (const [key, value] of Object.entries(entries)) {
    await query(
      `INSERT INTO app_settings (setting_key, setting_value, updated_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)`,
      [key, String(value), now]
    );
  }

  return getAppSettings();
}

async function getUserById(userId) {
  if (useJsonStore) {
    return jsonUsers[userId] || null;
  }
  return getOne('SELECT * FROM users WHERE id = ?', [userId]);
}

async function getUserByUsername(username) {
  if (useJsonStore) {
    return Object.values(jsonUsers).find((user) => user.username === username) || null;
  }
  return getOne('SELECT * FROM users WHERE username = ?', [username]);
}

async function updateUserPoints(userId, delta, action, note) {
  if (useJsonStore) {
    const user = jsonUsers[userId];
    if (!user) {
      return null;
    }

    const nextPoints = user.points + delta;
    if (nextPoints < 0) {
      return null;
    }

    user.points = nextPoints;
    user.updated_at = Date.now();
    jsonUsers[userId] = user;
    persistJsonUsers();
    return { ...user };
  }

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

function getForwardHeaders(proxyRes) {
  return {
    'Content-Type': proxyRes.headers['content-type'] || 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };
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

function createJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function cleanupExpiredJobs() {
  const now = Date.now();
  for (const [jobId, job] of generationJobs.entries()) {
    if (now - job.updatedAt > GENERATION_JOB_TTL_MS) {
      generationJobs.delete(jobId);
    }
  }
}

function parseApiImages(rawText) {
  const parsedImages = [];

  try {
    const data = JSON.parse(rawText);
    if (data.data && Array.isArray(data.data)) {
      data.data.forEach((item, index) => {
        if (item && (item.url || item.b64_json)) {
          parsedImages.push({
            url: item.url || null,
            b64: item.b64_json || null,
            index,
          });
        }
      });
      if (parsedImages.length > 0) {
        return parsedImages;
      }
    }
  } catch (error) {
    // Ignore and continue with NDJSON parsing.
  }

  const partialParts = {};
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'image_generation.completed' && obj.b64_json) {
        parsedImages.push({ url: null, b64: obj.b64_json, index: parsedImages.length });
      } else if (obj.type === 'image_generation.partial_image' && obj.b64_json) {
        const idx = obj.partial_image_index || 0;
        if (!partialParts[idx]) partialParts[idx] = [];
        partialParts[idx].push(obj.b64_json);
      } else if (obj.b64_json && !obj.type) {
        parsedImages.push({ url: null, b64: obj.b64_json, index: parsedImages.length });
      } else if (obj.data && Array.isArray(obj.data)) {
        obj.data.forEach((item) => {
          if (item && (item.url || item.b64_json)) {
            parsedImages.push({
              url: item.url || null,
              b64: item.b64_json || null,
              index: parsedImages.length,
            });
          }
        });
      }
    } catch (error) {
      // Ignore malformed non-JSON lines.
    }
  }

  for (const idx of Object.keys(partialParts).sort((a, b) => Number(a) - Number(b))) {
    parsedImages.push({
      url: null,
      b64: partialParts[idx].join(''),
      index: Number(idx),
    });
  }

  return parsedImages;
}

function parseApiErrorMessage(rawText, statusCode) {
  try {
    const data = JSON.parse(rawText);
    return data.error?.message || data.message || `HTTP ${statusCode}`;
  } catch (error) {
    const firstLine = rawText.split('\n').map((line) => line.trim()).find(Boolean);
    return firstLine || `HTTP ${statusCode}`;
  }
}

function parseRawRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function requestUpstream(targetUrl, headers, body, job) {
  return new Promise((resolve, reject) => {
    const isHttps = targetUrl.protocol === 'https:';
    const options = {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: 'POST',
      headers,
      timeout: 3600000,
      rejectUnauthorized: false,
    };

    const proxyReq = (isHttps ? https : http).request(options, (proxyRes) => {
      const chunks = [];
      proxyRes.on('data', (chunk) => {
        chunks.push(chunk);
      });
      proxyRes.on('end', () => {
        resolve({
          statusCode: proxyRes.statusCode || 502,
          bodyText: Buffer.concat(chunks).toString('utf8'),
        });
      });
      proxyRes.on('error', reject);
    });

    proxyReq.on('error', (err) => {
      if (job.cancelRequested) {
        reject(new Error('GENERATION_CANCELLED'));
        return;
      }
      reject(err);
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy(new Error('UPSTREAM_TIMEOUT'));
    });

    job.activeRequest = proxyReq;
    proxyReq.write(body);
    proxyReq.end();
  });
}

async function runGenerationJob(job) {
  if (job.status === 'cancelled') {
    return;
  }

  job.status = 'processing';
  job.startedAt = Date.now();
  job.updatedAt = job.startedAt;

  try {
    const upstream = await requestUpstream(job.targetUrl, job.headers, job.body, job);

    if (job.cancelRequested || job.status === 'cancelled') {
      job.status = 'cancelled';
      job.updatedAt = Date.now();
      return;
    }

    if (upstream.statusCode !== 200) {
      job.status = 'failed';
      job.errorMessage = parseApiErrorMessage(upstream.bodyText, upstream.statusCode);
      job.updatedAt = Date.now();
      console.error(`[生成任务] 上游返回失败 ${upstream.statusCode}: ${job.errorMessage}`);
      return;
    }

    const images = parseApiImages(upstream.bodyText);
    if (!images.length) {
      job.status = 'failed';
      job.errorMessage = 'API未返回图片';
      job.updatedAt = Date.now();
      return;
    }

    const actionLabel = job.type === 'multipart' ? `参考图生成(${job.quality})` : `普通生成(${job.quality})`;
    const updatedUser = await updateUserPoints(job.user.id, -job.cost, 'generate', actionLabel);
    if (!updatedUser) {
      job.status = 'failed';
      job.errorMessage = '积分扣减失败，请检查是否有并发生成任务';
      job.updatedAt = Date.now();
      return;
    }

    job.status = 'completed';
    job.completedAt = Date.now();
    job.updatedAt = job.completedAt;
    job.result = {
      images,
      user: normalizeUser(updatedUser),
    };
    console.log(`[扣费] 用户 ${updatedUser.username} 扣除 ${job.cost} 积分，剩余 ${updatedUser.points}`);
  } catch (error) {
    if (job.cancelRequested || error.message === 'GENERATION_CANCELLED') {
      job.status = 'cancelled';
      job.updatedAt = Date.now();
      return;
    }

    job.status = 'failed';
    job.errorMessage = error.message === 'UPSTREAM_TIMEOUT'
      ? 'API请求超时（超过60分钟），可能模型拥堵，请稍后重试'
      : `代理请求失败: ${error.message}`;
    job.updatedAt = Date.now();
    console.error('[生成任务] 执行失败:', error);
  } finally {
    job.activeRequest = null;
  }
}

async function createGenerationJob(req, res) {
  cleanupExpiredJobs();

  const contentType = req.headers['content-type'] || '';
  const userId = req.headers['x-user-id'];
  const requestedQuality = req.headers['x-quality'] || '1k';
  const settings = await getAppSettings();

  if (!settings.apiEnabled) {
    sendJson(res, 503, { error: { message: 'API当前已禁用，请联系管理员' } });
    return;
  }

  if (!settings.apiKey || !settings.apiEndpoint) {
    sendJson(res, 503, { error: { message: '管理员尚未配置可用的API，请联系管理员' } });
    return;
  }

  const rawBody = await parseRawRequestBody(req);
  let quality = requestedQuality;
  let type = 'json';
  let targetUrl = new URL(settings.apiEndpoint || DEFAULT_APP_SETTINGS.apiEndpoint);
  let headers = {};

  if (contentType.includes('multipart/form-data')) {
    type = 'multipart';
    targetUrl = new URL((settings.apiEndpoint || DEFAULT_APP_SETTINGS.apiEndpoint).replace(/\/generations\/?$/, '/edits'));
    headers = {
      'Content-Type': contentType,
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Length': rawBody.length,
    };
  } else {
    let params;
    try {
      params = JSON.parse(rawBody.toString('utf8') || '{}');
    } catch (error) {
      sendJson(res, 400, { error: { message: '请求数据格式错误' } });
      return;
    }

    quality = params.quality || requestedQuality;
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Length': rawBody.length,
    };
  }

  const authResult = await ensureUserCanAfford(userId, quality);
  if (!authResult.ok) {
    sendJson(res, authResult.status, authResult.body);
    return;
  }

  const cost = QUALITY_COSTS[quality] || QUALITY_COSTS['1k'];
  const jobId = createJobId();
  const job = {
    id: jobId,
    userId,
    user: authResult.user,
    cost,
    quality,
    type,
    status: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    startedAt: null,
    completedAt: null,
    targetUrl,
    headers,
    body: rawBody,
    activeRequest: null,
    cancelRequested: false,
    errorMessage: '',
    result: null,
  };

  generationJobs.set(jobId, job);
  runGenerationJob(job).catch((error) => {
    job.status = 'failed';
    job.errorMessage = error.message || '生成任务执行失败';
    job.updatedAt = Date.now();
  });

  sendJson(res, 202, {
    success: true,
    jobId,
    status: job.status,
  });
}

function getGenerationJob(req, res, url) {
  cleanupExpiredJobs();
  const jobId = url.searchParams.get('id');
  const requesterId = req.headers['x-user-id'];
  const job = jobId ? generationJobs.get(jobId) : null;

  if (!job) {
    sendJson(res, 404, { error: '生成任务不存在或已过期' });
    return;
  }

  if (requesterId && requesterId !== job.userId) {
    sendJson(res, 403, { error: '无权查看该生成任务' });
    return;
  }

  sendJson(res, 200, {
    success: true,
    job: {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      updatedAt: job.updatedAt,
      errorMessage: job.errorMessage || '',
      result: job.status === 'completed' ? job.result : null,
    },
  });
}

async function cancelGenerationJob(req, res) {
  const { jobId, userId } = await parseRequestBody(req);
  const job = jobId ? generationJobs.get(jobId) : null;

  if (!job) {
    sendJson(res, 404, { error: '生成任务不存在或已过期' });
    return;
  }

  if (userId && userId !== job.userId) {
    sendJson(res, 403, { error: '无权取消该生成任务' });
    return;
  }

  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    sendJson(res, 200, { success: true, status: job.status });
    return;
  }

  job.cancelRequested = true;
  job.status = 'cancelled';
  job.updatedAt = Date.now();

  if (job.activeRequest) {
    job.activeRequest.destroy(new Error('GENERATION_CANCELLED'));
  }

  sendJson(res, 200, { success: true, status: 'cancelled' });
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, X-Quality');

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
        const ipLastRegisteredAt = useJsonStore
          ? parseInt(jsonIpRegistrations[clientIp] || 0, 10)
          : ((await getOne('SELECT * FROM ip_registrations WHERE ip = ?', [clientIp])) || {}).last_registered_at;
        if (ipLastRegisteredAt && now - ipLastRegisteredAt < oneMonthMs) {
          sendJson(res, 403, { error: '该IP本月已注册过账号，请勿频繁注册。' });
          return;
        }

        const newId = `uid_${now}`;
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        if (useJsonStore) {
          jsonUsers[newId] = {
            id: newId,
            username,
            real_name: realName,
            password_hash: passwordHash,
            points: 580,
            registered_at: now,
            register_ip: clientIp,
            open_id: null,
            created_at: now,
            updated_at: now,
          };
          jsonIpRegistrations[clientIp] = now;
          persistJsonUsers();
          persistJsonIpRegistrations();
        } else {
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
        }
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

    if (req.method === 'GET' && pathname === '/api/settings/public') {
      const settings = await getAppSettings();
      sendJson(res, 200, {
        success: true,
        settings: {
          apiEndpoint: settings.apiEndpoint,
          model: settings.model,
          apiEnabled: settings.apiEnabled,
          timerEnd: settings.timerEnd,
          apiConfigured: !!settings.apiKey,
        },
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/settings') {
      const settings = await getAppSettings();
      sendJson(res, 200, { success: true, settings });
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
      const users = useJsonStore
        ? Object.values(jsonUsers).sort((a, b) => b.registered_at - a.registered_at)
        : await query('SELECT * FROM users ORDER BY registered_at DESC');
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

    if (req.method === 'POST' && pathname === '/api/admin/settings') {
      const data = await parseRequestBody(req);
      const apiEndpoint = (data.apiEndpoint || '').trim();
      const apiKey = (data.apiKey || '').trim();
      const model = (data.model || DEFAULT_APP_SETTINGS.model).trim();
      const apiEnabled = data.apiEnabled === true;
      const timerEnd = data.timerEnd ? String(data.timerEnd) : null;

      if (!apiEndpoint) {
        sendJson(res, 400, { error: 'API接口地址不能为空' });
        return;
      }

      const settings = await saveAppSettings({
        apiEndpoint,
        apiKey,
        model,
        apiEnabled: apiEnabled && !!apiKey,
        timerEnd: apiEnabled && !!apiKey ? timerEnd : null,
      });

      sendJson(res, 200, { success: true, settings });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/admin/deleteUser') {
      const { userId } = await parseRequestBody(req);
      const user = userId ? await getUserById(userId) : null;
      if (!user) {
        sendJson(res, 400, { error: '删除失败，用户不存在' });
        return;
      }
      if (useJsonStore) {
        delete jsonUsers[userId];
        if (user.register_ip) {
          delete jsonIpRegistrations[user.register_ip];
        }
        persistJsonUsers();
        persistJsonIpRegistrations();
      } else {
        await query('DELETE FROM users WHERE id = ?', [userId]);
        if (user.register_ip) {
          await query('DELETE FROM ip_registrations WHERE ip = ?', [user.register_ip]);
        }
      }
      sendJson(res, 200, { success: true });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate') {
      await createGenerationJob(req, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/generate/status') {
      getGenerationJob(req, res, url);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate/cancel') {
      await cancelGenerationJob(req, res);
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

// 2K/4K 出图耗时较长，关闭默认请求超时，避免连接被服务端提前断开。
server.requestTimeout = 0;
server.timeout = 0;

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
