#!/usr/bin/env python3
"""Serve only the standalone VJ on a stable loopback origin. Python 3.8+."""
import argparse
import errno
import hashlib
import http.server
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request
from urllib.parse import urlsplit
import webbrowser

APP = 'DYING-SCREAM-VJ-v17'
ROOT = Path(__file__).resolve().parent
HTML = ROOT / 'index.html'
ROOT_ID = hashlib.sha256(str(ROOT).encode()).hexdigest()[:16]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        route = urlsplit(self.path).path
        if route == '/__vj_health__':
            body = json.dumps({'app': APP, 'root_id': ROOT_ID}).encode()
            mime = 'application/json'
        elif route in ('/', '/index.html', '/download', '/mic_test.html'):
            try:
                body = (ROOT/'mic_test.html' if route=='/mic_test.html' else HTML).read_bytes()
            except OSError:
                self.send_error(500, 'index.html missing. Extract the complete ZIP first.')
                return
            mime = 'text/html; charset=utf-8'
        elif route == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Permissions-Policy', 'microphone=(self), fullscreen=(self)')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        if route == '/download':
            self.send_header('Content-Disposition', 'attachment; filename="DYING_SCREAM_AUTO_VJ_v17_MIC_ISOLATION.html"')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print('[VJ] ' + fmt % args)

def open_browser(url):
    if sys.platform == 'darwin':
        result = subprocess.run(['open', '-a', 'Safari', url], check=False)
        if result.returncode == 0:
            return
    webbrowser.open(url)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-open', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('port must be 1..65535')
    if not HTML.is_file():
        print('index.htmlがありません。ZIPをすべて展開してから起動してください。', file=sys.stderr)
        return 1
    url = 'http://127.0.0.1:{}/'.format(args.port)
    try:
        server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError as error:
        if error.errno == errno.EADDRINUSE:
            try:
                # Loopback only; do not send this health check through an Internet proxy.
                opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                with opener.open(url + '__vj_health__', timeout=1) as response:
                    existing = json.load(response)
                if existing == {'app': APP, 'root_id': ROOT_ID}:
                    print('このVJは既に起動しています: ' + url)
                    if not args.no_open:
                        open_browser(url)
                    return 0
            except (OSError, ValueError):
                pass
            print('ポート{}は別の処理で使用中です。先に起動したサーバーを終了してください。'.format(args.port), file=sys.stderr)
            print('別ポートを明示する場合: python3 launch_vj.py --port 8766（URLが変わるため権限も再確認）', file=sys.stderr)
        else:
            print('サーバーを起動できません: ' + str(error), file=sys.stderr)
        return 1
    print('DYING SCREAM v17: ' + url, flush=True)
    print('SafariでこのURLを直接開いてください。停止はこのターミナルでControl+C。', flush=True)
    print('HTMLのダウンロード: ' + url + 'download', flush=True)
    if not args.no_open:
        open_browser(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nVJサーバーを停止しました。')
    finally:
        server.server_close()
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
