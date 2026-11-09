#!/bin/zsh
# start-games.sh — iTerm 一键拉起《小鸡游戏集》hub 服务
#
# 用法：iTerm 开新窗口 → 粘贴下面这条命令
#   bash /Users/a1/workplace/codex/自建游戏/start-games.sh
#
# 关掉这个 iTerm 窗口 = 服务停止。不要用 WorkBuddy 后台任务跑，关 WorkBuddy 会停。

PORT=8765
ROOT=/Users/a1/workplace/codex/自建游戏
PY=/Users/a1/.workbuddy/binaries/python/envs/default/bin/python3

# 端口占用直接报错退出（避免两个实例打架）
if lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✗ 端口 ${PORT} 已被占用："
  lsof -nP -iTCP:${PORT} -sTCP:LISTEN
  exit 1
fi

cd "$ROOT" || exit 1
IP=$(ipconfig getifaddr en0 2>/dev/null || echo 127.0.0.1)

# 每次启动自动刷 QR（跟着当前 en0 IP 走，避免换 Wi-Fi 后扫码失效）
echo "🔄 刷新二维码..."
"$PY" "$ROOT/qr.py" "${PORT}" 2>/dev/null
if [ ! -s "$ROOT/qr.png" ]; then
  echo "  (qr.png 刷新失败，继续启动服务——扫码仍可用旧 QR)"
fi

echo "🐤 小鸡游戏集 hub 服务启动中..."
echo "   根目录: ${ROOT}"
echo "   端口:   ${PORT}"
echo "   本机 IP: ${IP}"
echo "   hub:    http://127.0.0.1:${PORT}/"
echo "   扫码页: http://127.0.0.1:${PORT}/qr.html"
echo "   关闭此 iTerm 窗口 = 停止服务"
echo

python3 -m http.server ${PORT} --bind 0.0.0.0 --directory "${ROOT}"

