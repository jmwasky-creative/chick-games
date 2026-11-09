#!/usr/bin/env python3
"""把多文件项目打包成单个 HTML（CSS / JS 全部内联），便于分发或上传分享。
输出: standalone.html
"""
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(ROOT, 'index.html'), encoding='utf-8') as f:
    html = f.read()

# 内联 CSS
def css_repl(m):
    path = os.path.join(ROOT, m.group(1))
    with open(path, encoding='utf-8') as f:
        return '<style>\n' + f.read() + '\n</style>'

html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css_repl, html)

# 内联 JS
def js_repl(m):
    path = os.path.join(ROOT, m.group(1))
    with open(path, encoding='utf-8') as f:
        code = f.read()
    return '<script>\n' + code + '\n</script>'

html = re.sub(r'<script src="([^"]+)"></script>', js_repl, html)

out = os.path.join(ROOT, 'standalone.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)

size = os.path.getsize(out)
print('生成 %s (%.1f KB)' % (out, size / 1024))
left = re.findall(r'(?:src|href)="(?!http)([^"]+)"', html)
print('未内联的外部引用:', left if left else '无')
