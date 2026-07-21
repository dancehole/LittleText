#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LittleText 云同步后端 —— 极简、零依赖（仅 Python 标准库）。

功能：在云端为【单个用户】保留一份数据文件副本。
  - POST   <prefix>/sync?token=XXX   上传覆盖（导出到云端保存）
  - GET    <prefix>/sync?token=XXX   下载读取（从云端导入），无数据返回 404
  - DELETE <prefix>/sync?token=XXX   清空云端副本
  - OPTIONS                          CORS 预检
  - GET    /                          健康检查

不做：增量同步、冲突合并、多人协作（本项目仅单人使用）。

安全要点：
  - 数据按 token 的 sha256 散列作为文件名，杜绝路径穿越与越权读取他人文件。
  - POST 先写临时文件再原子替换，避免半写损坏。
  - 请求体上限 16MB，防滥用。

部署（任选其一）：
  1) 直接运行：        python3 server.py
  2) 改端口：        PORT=9000 python3 server.py
  3) 改数据目录：    SYNC_DATA_DIR=/var/littletext python3 server.py
  4) 反代到域名（推荐）：用 nginx 将 https://dancehole.cn/api/littletext/
     转发到本服务，前端同步地址填 https://dancehole.cn/api/littletext/sync
"""
import hashlib
import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# ---- 可配置项（环境变量优先） ----
DATA_DIR = os.environ.get(
    "SYNC_DATA_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "sync_data"),
)
PORT = int(os.environ.get("PORT", "8000"))
HOST = os.environ.get("HOST", "0.0.0.0")
MAX_BODY = 16 * 1024 * 1024  # 16 MB 上限

# CORS：单人使用，允许任意来源即可（不携带 cookie）
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Sync-Token",
}


def safe_mkdir():
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
    except OSError as e:
        print(f"[ERROR] 无法创建数据目录 {DATA_DIR}: {e}", file=sys.stderr)
        sys.exit(1)


def file_for_token(token: str) -> str:
    """token -> 数据文件路径（token 经哈希后仅作文件名，杜绝路径穿越）"""
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return os.path.join(DATA_DIR, digest + ".json")


def is_sync_path(path: str) -> bool:
    path = path.split("?")[0]
    path = re.sub(r"/+$", "", path)
    return path.endswith("/sync")


def get_token(handler) -> str:
    qs = parse_qs(urlparse(handler.path).query)
    token = qs.get("token", [None])[0]
    if not token:
        token = handler.headers.get("X-Sync-Token")
    return token or ""


class Handler(BaseHTTPRequestHandler):
    # HTTP/1.0 关闭 keep-alive，连接随请求结束，线程不留驻，内存最低
    protocol_version = "HTTP/1.0"
    server_version = "LittleTextSync/1.0"

    # ---------- 通用响应 ----------
    def _send(self, code, body=None):
        self.send_response(code)
        for k, v in CORS.items():
            self.send_header(k, v)
        if body is None:
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if isinstance(body, (dict, list)):
            payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_header("Content-Type", "application/json; charset=utf-8")
        elif isinstance(body, str):
            payload = body.encode("utf-8")
            self.send_header("Content-Type", "text/plain; charset=utf-8")
        else:
            payload = body
            self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return b""
        if length > MAX_BODY:
            return None
        return self.rfile.read(length)

    # ---------- 路由 ----------
    def do_OPTIONS(self):
        self.send_response(204)
        for k, v in CORS.items():
            self.send_header(k, v)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if not is_sync_path(self.path):
            return self._send(200, {"status": "ok", "service": "LittleText sync"})
        token = get_token(self)
        if not token:
            return self._send(401, {"ok": False, "error": "缺少 token"})
        fp = file_for_token(token)
        if not os.path.exists(fp):
            return self._send(404, {"ok": False, "error": "云端暂无备份"})
        try:
            with open(fp, "r", encoding="utf-8") as f:
                payload = json.load(f)
        except (OSError, ValueError):
            return self._send(500, {"ok": False, "error": "读取失败"})
        return self._send(200, payload)

    def do_POST(self):
        if not is_sync_path(self.path):
            return self._send(404, {"ok": False, "error": "not found"})
        token = get_token(self)
        if not token:
            return self._send(401, {"ok": False, "error": "缺少 token"})
        raw = self._read_body()
        if raw is None:
            return self._send(413, {"ok": False, "error": "数据过大（上限 16MB）"})
        try:
            parsed = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self._send(400, {"ok": False, "error": "内容不是合法 JSON"})
        fp = file_for_token(token)
        tmp = fp + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(parsed, f, ensure_ascii=False)
            os.replace(tmp, fp)  # 原子替换，避免半写文件
        except OSError as e:
            return self._send(500, {"ok": False, "error": f"写入失败: {e}"})
        return self._send(200, {"ok": True, "size": os.path.getsize(fp)})

    def do_DELETE(self):
        if not is_sync_path(self.path):
            return self._send(404, {"ok": False, "error": "not found"})
        token = get_token(self)
        if not token:
            return self._send(401, {"ok": False, "error": "缺少 token"})
        fp = file_for_token(token)
        if os.path.exists(fp):
            try:
                os.remove(fp)
            except OSError:
                return self._send(500, {"ok": False, "error": "删除失败"})
        return self._send(200, {"ok": True})

    def log_message(self, fmt, *args):
        sys.stderr.write("[sync] " + (fmt % args) + "\n")


def main():
    safe_mkdir()
    print(f"LittleText 云同步已启动 → http://{HOST}:{PORT}/")
    print(f"数据目录: {DATA_DIR}")
    print("同步接口: GET/POST/DELETE  <你的域名>/api/littletext/sync?token=你的令牌")
    print("（Ctrl+C 停止）")
    try:
        httpd = ThreadingHTTPServer((HOST, PORT), Handler)
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")


if __name__ == "__main__":
    main()
