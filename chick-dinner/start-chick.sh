#!/bin/zsh
# start-chick.sh — iTerm 一键拉起小鸡游戏静态服务
#
# 用法（任选其一）：
#   1) iTerm 已开 → 切到任意窗口 → 粘贴下面这条 cd + python server.py 命令
#   2) 想用脚本：bash start-chick.sh
#
# 服务常驻的秘诀：用 iTerm 单独窗口跑，**关窗口就停服务**；不要 WorkBuddy 内部后台任务。

PORT=8765
PY=/Users/a1/.workbuddy/binaries/python/envs/default/bin/python
ROOT=/Users/a1/workplace/codex/自建游戏/chick-game

# 端口占用直接报错退出（避免两个实例打架）
if lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✗ 端口 ${PORT} 已被占用："
  lsof -nP -iTCP:${PORT} -sTCP:LISTEN
  exit 1
fi

cd "$ROOT" || exit 1
echo "🐤 小鸡回家吃饭服务启动中..."
echo "   端口: ${PORT}"
echo "   本机 IP: $(ipconfig getifaddr en0 2>/dev/null || echo 127.0.0.1)"
echo "   扫码页: http://127.0.0.1:${PORT}/qr.html"
echo "   关闭此 iTerm 窗口 = 停止服务"
echo

"$PY" server.py "$PORT"