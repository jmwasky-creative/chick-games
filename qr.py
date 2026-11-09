#!/usr/bin/env python3
"""生成《小鸡游戏集》扫码访问页（指向伞根 hub）。

用法:
    python3 qr.py            # 默认端口 8765
    python3 qr.py 9000       # 指定端口

产出（与本脚本同目录）:
    qr.png         局域网二维码（http://<IP>:<端口>/），本机起服务时给同 Wi-Fi 的手机扫
    qr.html        局域网扫码展示页（图片内嵌 base64，双击就能看，不依赖服务器）
    qr-online.png  线上二维码（https://jmwasky-creative.github.io/chick-games/），公网可扫
    qr-online.html 线上扫码展示页（图片内嵌 base64）

hub 页底部的扫码区引用 qr-online.png（公网版），局域网那份留着本地服务时用。
换网络 / 换端口后重跑一次本脚本即可；qr.py 独立运行也可由 server.py 启动时调用刷新。
"""
import base64
import os
import socket
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

# 云上应用地址（sites 发布后的分享链接）；改域名后重跑本脚本刷新 qr-online.png
ONLINE_URL = "https://jmwasky-creative.github.io/chick-games/"


def lan_ip():
    """优先取 Wi-Fi 网卡(en0)的局域网地址。"""
    for iface in ("en0", "en1", "en2", "en3"):
        try:
            out = subprocess.check_output(
                ["ipconfig", "getifaddr", iface], stderr=subprocess.DEVNULL
            ).decode().strip()
        except Exception:
            out = ""
        if out:
            return out, iface
    # 兜底：用 UDP 探测出口网卡（不发真实数据包）
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("192.168.0.1", 1))
        return s.getsockname()[0], "auto"
    except Exception:
        return "127.0.0.1", "loopback"
    finally:
        s.close()


HTML = """<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>扫码玩《小鸡游戏集》</title>
<style>
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;
background:radial-gradient(circle at 50% 30%,#FFE9B8,#F5A623 70%,#E8802B);font-family:"PingFang SC","Microsoft YaHei",sans-serif;color:#5A4632;}
.card{background:#FFF6E0;border-radius:30px;padding:34px 30px;box-shadow:0 14px 40px rgba(0,0,0,.25);text-align:center;max-width:92vw;}
h1{font-size:36px;margin:0 0 6px;color:#7A4A1E;}
.sub{font-size:20px;opacity:.8;margin-bottom:18px;}
img{width:340px;max-width:76vw;border-radius:16px;background:#fff;padding:10px;}
.url{font-size:19px;word-break:break-all;margin-top:14px;color:#8A5A2B;}
.url a{color:#8A5A2B;}
.tip{font-size:18px;opacity:.75;margin-top:10px;line-height:1.7;}
.meta{font-size:15px;opacity:.6;margin-top:12px;}
.chick{font-size:64px;}
</style></head><body>
<div class="card">
  <div class="chick">🐤</div>
  <h1>小鸡游戏集</h1>
  <div class="sub">手机扫码，浏览器直接开玩</div>
  <img src="data:image/png;base64,__B64__" alt="扫码访问">
  <div class="url"><a href="__URL__">__URL__</a></div>
  <div class="tip">__TIP__</div>
  <div class="meta">__META__</div>
</div></body></html>
"""


def _write_qr(url, tip, meta, png_path, html_path):
    """用 segno 画一张高纠错二维码，并写出内嵌 base64 的展示页。"""
    import segno  # 延迟导入：只在真正生成时才需要

    # error='h' 高纠错：屏幕上反光 / 光线差时手机更容易扫出来
    qr = segno.make(url, error="h")
    qr.save(png_path, scale=12, border=4, dark="#5A4632", light="#FFF6E0")
    with open(png_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    html = (HTML.replace("__B64__", b64)
                .replace("__URL__", url)
                .replace("__TIP__", tip)
                .replace("__META__", meta))
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)

    return png_path, html_path


def generate(port=8765, root=ROOT):
    """生成局域网二维码与扫码页，返回局域网访问地址。"""
    ip, iface = lan_ip()
    url = "http://%s:%d/" % (ip, port)
    _write_qr(url,
              "手机需与本电脑连同一个 Wi-Fi<br>5 款小鸡小游戏 · 选一个开始玩",
              "网卡 %s · 端口 %d · 重跑 <code>python3 qr.py</code> 可刷新" % (iface, port),
              os.path.join(root, "qr.png"),
              os.path.join(root, "qr.html"))
    return url


def generate_online(root=ROOT):
    """生成指向云上应用的二维码与扫码页，返回线上地址。"""
    _write_qr(ONLINE_URL,
              "不用连 Wi-Fi，随时随地都能扫<br>5 款小鸡小游戏 · 选一个开始玩",
              "云上应用 · 改域名后重跑 <code>python3 qr.py</code> 可刷新",
              os.path.join(root, "qr-online.png"),
              os.path.join(root, "qr-online.html"))
    return ONLINE_URL


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    url = generate(port, ROOT)
    online = generate_online(ROOT)
    print("局域网二维码: " + url)
    print("  已生成: %s / %s" % (os.path.join(ROOT, "qr.png"),
                                 os.path.join(ROOT, "qr.html")))
    print("线上二维码: " + online)
    print("  已生成: %s / %s" % (os.path.join(ROOT, "qr-online.png"),
                                 os.path.join(ROOT, "qr-online.html")))
    print("手机扫码后用浏览器打开；局域网那份需确认手机与本机在同一 Wi-Fi。")
