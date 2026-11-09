#!/usr/bin/env python3
"""《小鸡回家吃饭》静态服务
用法:
    python3 server.py            # 默认 8080
    python3 server.py 9000       # 指定端口
访问 http://localhost:8080/
"""
import http.server
import socketserver
import os
import sys
import webbrowser

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
    }

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # 开发期禁用缓存，改完刷新即可见效
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    os.chdir(ROOT)
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)
    # 启动时刷新扫码页：换 Wi-Fi 或换端口后二维码自动跟着变
    try:
        import qr
        lan_url = qr.generate(PORT, ROOT)
        print('手机扫码 → ' + lan_url)
        print('扫码页   → http://localhost:%d/qr.html' % PORT)
    except Exception as e:
        print('（未生成二维码：%s · 可手动运行 python3 qr.py %d）' % (e, PORT))
    with Server(('0.0.0.0', PORT), Handler) as httpd:
        url = 'http://localhost:%d/' % PORT
        print('小鸡回家吃饭 → ' + url)
        print('根目录: ' + ROOT)
        print('Ctrl+C 停止')
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n已停止')
