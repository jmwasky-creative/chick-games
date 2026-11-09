#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""《小鸭上学记》构建脚本。

把 src/ 下的 CSS / JS 内联成**单文件** index.html（唯一发布物）。
- 只用 Python 标准库，不引任何第三方工具链。
- JS 加载顺序 = 文件名前缀数字升序（00 → 90），与模板里的书写顺序无关。
- **残留外链检查是构建失败条件**：非空即 sys.exit(1)。零外链靠机器强制，不靠自觉。

用法：python3 build.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
JS_DIR = os.path.join(SRC, 'js')
TPL = os.path.join(SRC, 'index.template.html')
OUT = os.path.join(ROOT, 'index.html')
MAX_KB = 300  # A14：单文件体积红线


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def build_css():
    """内联 CSS：按文件名排序拼接（style.css 单文件，保留扩展位）。"""
    files = sorted(f for f in os.listdir(SRC) if f.endswith('.css'))
    if not files:
        sys.exit('构建失败：src/ 下没有 .css 文件')
    return '\n\n'.join(read(os.path.join(SRC, f)) for f in files), files


def build_js():
    """内联 JS：按**文件名前缀数字升序**拼接，并插入分区注释保留可定位性。"""
    if not os.path.isdir(JS_DIR):
        sys.exit('构建失败：缺少 src/js/ 目录')
    files = sorted(f for f in os.listdir(JS_DIR) if f.endswith('.js'))
    if not files:
        sys.exit('构建失败：src/js/ 下没有 .js 文件')
    parts = []
    for name in files:
        parts.append('/* ==== src/js/%s ==== */\n%s' % (name, read(os.path.join(JS_DIR, name))))
    return '\n\n'.join(parts), files


def main():
    tpl = read(TPL)
    css, css_files = build_css()
    js, js_files = build_js()

    # 用 lambda 做替换，避免反斜杠/分组引用被 re.sub 二次解释
    html = re.sub(r'<link rel="stylesheet" href="[^"]+">',
                  lambda m: '<style>\n' + css + '\n</style>', tpl)

    seen = {'done': False}

    def js_repl(_m):
        if seen['done']:
            return ''          # 其余 script 标签整体丢弃，只保留合并后的那一个
        seen['done'] = True
        return '<script>\n' + js + '\n</script>'

    html = re.sub(r'[ \t]*<script src="js/[0-9A-Za-z_\-]+\.js"></script>\n?', js_repl, html)
    if not seen['done']:
        sys.exit('构建失败：模板里没有 <script src="js/xx.js"></script> 占位标签')

    # ---------- 检查 1：未内联的外部/相对引用（src / href） ----------
    refs = re.findall(r'(?:src|href)="([^"]*)"', html)
    left = [r for r in refs if r and not r.startswith('#')]
    if left:
        print('构建失败：未内联的外部引用 → %s' % left)
        sys.exit(1)

    # ---------- 检查 2：源码里的禁用模式 ----------
    banned = [
        (r'https?://', '外链 URL'),
        (r'\bcdn\b', 'CDN 引用'),
        (r'\bfetch\s*\(', 'fetch()'),
        (r'XMLHttpRequest', 'XMLHttpRequest'),
        (r'<img\b', '<img> 标签'),
        (r'<audio\b', '<audio> 标签'),
        (r'@import', 'CSS @import'),
        (r'\bimport\s+[\w{*]', 'ES import'),
        (r'\brequire\s*\(', 'require()'),
        (r'Comic Sans MS', 'Comic Sans MS 字体（iOS 缺失）'),
    ]
    problems = []
    for path in [os.path.join(SRC, f) for f in css_files] + \
                [os.path.join(JS_DIR, f) for f in js_files] + [TPL]:
        body = read(path)
        for pat, label in banned:
            for hit in re.finditer(pat, body, re.I):
                line = body[:hit.start()].count('\n') + 1
                problems.append('%s:%d 命中禁用模式「%s」' % (os.path.relpath(path, ROOT), line, label))
    if problems:
        print('构建失败：源码含禁用模式')
        for p in problems[:20]:
            print('  ' + p)
        sys.exit(1)

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)

    size = os.path.getsize(OUT)
    print('生成 %s（%.1f KB）' % (os.path.relpath(OUT, ROOT), size / 1024.0))
    print('内联 CSS：%s' % ' + '.join(css_files))
    print('内联 JS 顺序（文件名前缀升序）：%s' % ' → '.join(js_files))
    print('未内联的外部引用：无')
    if size > MAX_KB * 1024:
        print('⚠️ 警告：单文件 %.1f KB 超过 %d KB 红线' % (size / 1024.0, MAX_KB))


if __name__ == '__main__':
    main()
