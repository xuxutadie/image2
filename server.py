#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CYBER FORGE - Python 本地代理服务器
解决跨域CORS问题，无需安装任何依赖（仅用Python标准库）

使用方法: python server.py
然后浏览器打开 http://localhost:3456
"""

import http.server
import json
import ssl
import sys
import os
import time
from urllib.request import Request, urlopen, HTTPError, URLError
from urllib.parse import urlparse, unquote

PORT = 3456

# Database logic
DB_FILE = 'users.json'
IP_FILE = 'ip_records.json'
users_db = {}
ip_records = {}

def load_db():
    global users_db, ip_records
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r', encoding='utf-8') as f:
                users_db = json.load(f)
        except:
            pass
    if os.path.exists(IP_FILE):
        try:
            with open(IP_FILE, 'r', encoding='utf-8') as f:
                ip_records = json.load(f)
        except:
            pass

def save_db():
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(users_db, f, indent=2, ensure_ascii=False)
    with open(IP_FILE, 'w', encoding='utf-8') as f:
        json.dump(ip_records, f, indent=2, ensure_ascii=False)

load_db()

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[代理] {args[0]}")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors()
        self.end_headers()

    def send_json_response(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_cors()
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def do_GET(self):
        # 静态文件服务
        path = self.path.split('?')[0]
        if path == '/' or path == '/index.html':
            file_path = 'index.html'
        elif path == '/api/admin/users':
            # 管理员获取所有用户列表
            load_db()
            user_list = list(users_db.values())
            user_list.sort(key=lambda x: x.get('registeredAt', 0), reverse=True)
            self.send_json_response(200, {'success': True, 'users': user_list})
            return
        elif path == '/api/user':
            query = urlparse(self.path).query
            params = dict(qc.split('=') for qc in query.split('&') if '=' in qc)
            user_id = params.get('id')
            load_db()
            if user_id and user_id in users_db:
                self.send_json_response(200, {'success': True, 'user': users_db[user_id]})
            else:
                self.send_json_response(404, {'error': '用户不存在'})
            return
        else:
            file_path = unquote(path.lstrip('/'))

        try:
            with open(file_path, 'rb') as f:
                content = f.read()

            ext_map = {
                '.html': 'text/html; charset=utf-8',
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.svg': 'image/svg+xml',
            }
            ext = file_path.rsplit('.', 1)[-1].lower() if '.' in file_path else ''
            mime = ext_map.get(f'.{ext}', 'application/octet-stream')

            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_cors()
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_response(404)
            self.send_cors()
            self.end_headers()
            self.wfile.write(b'File not found')

    def do_POST(self):
        path = self.path.split('?')[0]
        if path == '/api/generate':
            self.handle_proxy()
            return
            
        # Parse body
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        try:
            params = json.loads(body) if body else {}
        except json.JSONDecodeError:
            params = {}

        if path == '/api/login':
            self.handle_login(params)
        elif path == '/api/recharge' or path == '/api/admin/recharge':
            self.handle_recharge(params)
        elif path == '/api/admin/deleteUser':
            self.handle_delete_user(params)
        else:
            self.send_response(404)
            self.send_cors()
            self.end_headers()

    def handle_login(self, params):
        username = params.get('username', '').strip()
        password = params.get('password', '').strip()
        real_name = params.get('realName', '').strip()
        is_register = params.get('isRegister', False)
        client_ip = self.client_address[0]

        if not username or not password:
            self.send_json_response(400, {'error': '用户名和密码不能为空'})
            return
            
        if is_register and not real_name:
            self.send_json_response(400, {'error': '注册时必须填写真实姓名'})
            return

        load_db()
        user = None
        for uid, u in users_db.items():
            if u.get('username') == username:
                user = u
                break

        is_new = False
        if is_register:
            if user:
                self.send_json_response(400, {'error': '用户名已存在'})
                return
            
            now_ms = int(time.time() * 1000)
            one_month_ms = 30 * 24 * 60 * 60 * 1000
            if client_ip in ip_records and now_ms - ip_records[client_ip] < one_month_ms:
                self.send_json_response(403, {'error': '该IP本月已注册过账号，请勿频繁注册。'})
                return
                
            new_id = f'uid_{now_ms}'
            user = {
                'id': new_id,
                'username': username,
                'realName': real_name,
                'password': password,
                'points': 580,
                'registeredAt': now_ms,
                'registerIp': client_ip
            }
            users_db[new_id] = user
            ip_records[client_ip] = now_ms
            is_new = True
            save_db()
            print(f"[注册] 新用户 {username} (IP: {client_ip}), 赠送 580 积分")
        else:
            if not user:
                self.send_json_response(404, {'error': '用户不存在'})
                return
            if user.get('password') != password:
                self.send_json_response(401, {'error': '密码错误'})
                return
            print(f"[登录] 用户 {user.get('username')}, 积分 {user.get('points')}")

        safe_user = user.copy()
        if 'password' in safe_user:
            del safe_user['password']
            
        self.send_json_response(200, {'success': True, 'user': safe_user, 'isNew': is_new})

    def handle_recharge(self, params):
        user_id = params.get('userId')
        points = params.get('points')
        
        load_db()
        if user_id and user_id in users_db and points:
            try:
                users_db[user_id]['points'] += int(points)
                save_db()
                username = users_db[user_id].get('username')
                current_pts = users_db[user_id].get('points')
                print(f"[充值] 为 {username} 充值 {points} 积分，当前 {current_pts}")
                self.send_json_response(200, {'success': True, 'user': users_db[user_id]})
            except ValueError:
                self.send_json_response(400, {'error': '充值金额无效'})
        else:
            self.send_json_response(400, {'error': '充值失败'})

    def handle_delete_user(self, params):
        user_id = params.get('userId')
        
        load_db()
        if user_id and user_id in users_db:
            username = users_db[user_id].get('username')
            register_ip = users_db[user_id].get('registerIp')
            
            del users_db[user_id]
            if register_ip and register_ip in ip_records:
                del ip_records[register_ip]
                
            save_db()
            print(f"[管理员删除] 删除了用户 {username}")
            self.send_json_response(200, {'success': True})
        else:
            self.send_json_response(400, {'error': '删除失败，用户不存在'})

    def handle_proxy(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)

        try:
            params = json.loads(body)
        except json.JSONDecodeError:
            self.send_json_error(400, '请求数据格式错误')
            return

        api_key = params.pop('apiKey', None)
        endpoint = params.pop('endpoint', None)

        if not api_key:
            self.send_json_error(400, '未提供API密钥')
            return
        if not endpoint:
            self.send_json_error(400, '未提供API接口地址')
            return

        post_data = json.dumps(params).encode('utf-8')
        print(f'[代理] 请求 -> {endpoint}')
        print(f'[代理] 模型: {params.get("model")}, 尺寸: {params.get("size")}, 画质: {params.get("quality")}')

        req = Request(
            endpoint,
            data=post_data,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}',
            },
            method='POST'
        )

        try:
            resp = urlopen(req, timeout=600)
            resp_body = resp.read()
            self.send_response(resp.status)
            self.send_header('Content-Type', 'application/json')
            self.send_cors()
            self.end_headers()
            self.wfile.write(resp_body)
            print(f'[代理] 响应 <- {resp.status}')
        except HTTPError as e:
            err_body = e.read()
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.send_cors()
            self.end_headers()
            self.wfile.write(err_body)
            print(f'[代理] 错误 <- {e.code}')
        except URLError as e:
            self.send_json_error(502, f'代理请求失败: {str(e.reason)}')
        except Exception as e:
            self.send_json_error(502, f'代理请求失败: {str(e)}')

    def send_json_error(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_cors()
        self.end_headers()
        self.wfile.write(json.dumps({'error': {'message': message}}).encode('utf-8'))

    def send_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')


if __name__ == '__main__':
    server = http.server.HTTPServer(('0.0.0.0', PORT), ProxyHandler)
    print('')
    print('  ⚡ CYBER FORGE 代理服务器已启动 (Python) ⚡')
    print('  ──────────────────────────────────────────')
    print(f'  本地地址: http://localhost:{PORT}')
    print(f'  接口代理: POST /api/generate')
    print('  按 Ctrl+C 停止服务器')
    print('')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n服务器已停止')
        server.server_close()
