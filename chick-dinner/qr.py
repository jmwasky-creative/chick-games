#!/usr/bin/env python3
"""生成《小鸡回家吃饭》扫码访问页。

用法:
    python3 qr.py            # 默认端口 8765
    python3 qr.py 9000       # 指定端口

产出（与本脚本同目录）:
    qr.png    二维码图片，可直接发给别人或打印
    qr.html   展示页（图片已内嵌 base64，双击就能看，不依赖服务器）

二维码内容 = http://<本机局域网IP>:<端口>/ ，手机扫码后直接用浏览器打开游戏。
换网络 / 换端口后重跑一次本脚本即可；server.py 启动时也会自动调用本模块刷新。
"""
import base64
import os
import socket
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))


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
<title>扫码玩《小鸡回家吃饭》</title>
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
  <h1>小鸡回家吃饭</h1>
  <div class="sub">手机扫码，浏览器直接开玩</div>
  <img src="data:image/png;base64,__B64__" alt="扫码访问">
  <div class="url"><a href="__URL__">__URL__</a></div>
  <div class="tip">手机需与本电脑连同一个 Wi-Fi<br>点地面走 · 按住红色按钮发射激光<br>二档破木门 · 三档破铁门</div>
  <div class="meta">网卡 __IFACE__ · 端口 __PORT__ · 重跑 <code>python3 qr.py</code> 可刷新</div>
</div></body></html>
"""


def generate(port=8765, root=ROOT):
    """生成二维码与扫码页，返回局域网访问地址。"""
    import segno  # 延迟导入：只在真正生成时才需要

    ip, iface = lan_ip()
    url = "http://%s:%d/" % (ip, port)

    # error='h' 高纠错：屏幕上反光 / 光线差时手机更容易扫出来
    qr = segno.make(url, error="h")
    png_path = os.path.join(root, "qr.png")
    qr.save(png_path, scale=12, border=4, dark="#5A4632", light="#FFF6E0")
    with open(png_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    html = (HTML.replace("__B64__", b64)
                .replace("__URL__", url)
                .replace("__IFACE__", iface)
                .replace("__PORT__", str(port)))
    with open(os.path.join(root, "qr.html"), "w", encoding="utf-8") as f:
        f.write(html)

    return url


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    url = generate(port, ROOT)
    print("二维码内容: " + url)
    print("已生成: " + os.path.join(ROOT, "qr.png"))
    print("已生成: " + os.path.join(ROOT, "qr.html"))
    print("手机扫码后用浏览器打开；若扫不出，先确认手机与本机在同一 Wi-Fi。")
