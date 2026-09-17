#!/bin/bash
# **멈췄을 때 눌러 보는 것.** (2026-09-17)
#
# 화면에 「자료를 받는 데 너무 오래 걸려…」나 흰 화면이 떴을 때, **그 상태 그대로**
# 새 터미널 창에서 이 파일을 실행한다. 서버를 다시 띄우면 증거가 사라진다.
#
# 여기서 고치는 것은 없다. **어느 층에서 멈췄는지만 본다.**
#   ① 정적 파일은 되는데 API 만 안 되나  → 서버는 살아 있고 요청 처리가 막힌 것
#   ② 정적 파일도 안 되나                → 서버 자체가 멈췄거나 못 닿는 것
#   ③ 로그의 마지막 줄이 언제인가         → 언제부터 대답을 그만뒀나
#   ④ 열린 연결이 몇 개인가              → 브라우저가 붙잡고 있는 것
#   ⑤ 파이썬 스레드가 지금 어디 서 있나   → **여기가 진짜 답이 나오는 자리**
cd "$(dirname "$0")"
PORT="${PORT:-$(node -p "require('./ports.json').backend" 2>/dev/null || echo 8808)}"
URL="http://127.0.0.1:${PORT}"
LOG="${LOG:-/tmp/eversketch.log}"
OUT="/tmp/eversketch-진단-$(date +%H%M%S).txt"
exec > >(tee "$OUT") 2>&1

echo "════ EVER-SKETCH 멈춤 진단 · $(date '+%F %T') ════"
echo

echo "── ① 어느 길이 막혔나 (각 5초까지만 기다린다) ──"
probe() { printf '  %-34s ' "$1"
  curl -s -o /dev/null -m 5 -w 'HTTP %{http_code} · %{time_total}초\n' "${URL}$1" \
    || echo '**대답 없음(5초 초과 또는 못 닿음)**'; }
probe /favicon.svg
probe /assets/
probe /api/auth/me
probe /api/projects
probe /api/folders
echo "  · /favicon.svg 는 되는데 /api/* 만 5초를 넘기면 → 서버는 살아 있고 **요청 처리**가 막힌 것"
echo "  · 둘 다 안 되면 → 서버가 멈췄거나 포트가 다른 것"
echo

echo "── ② 서버가 마지막으로 남긴 말 ──"
if [ -f "$LOG" ]; then
  echo "  로그: $LOG (마지막 수정 $(date -r "$LOG" '+%T'))"
  tail -12 "$LOG" | sed 's/^/  /'
else
  echo "  !! $LOG 가 없다 — run.command 로 띄운 게 맞는지 확인"
fi
echo

echo "── ③ 서버 프로세스와 스레드 ──"
SRV=$(pgrep -f "uvicorn server.app:app" | head -1)
if [ -z "$SRV" ]; then
  echo "  !! uvicorn 이 안 떠 있다. **이게 원인이다** — 서버가 죽은 것."
else
  echo "  PID $SRV · 스레드 $(ps -M "$SRV" 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')개 · $(ps -o %cpu=,rss=,etime= -p "$SRV")"
  echo "  (스레드가 40개 언저리에서 멈춰 있으면 **스레드가 다 찬 것** — 동기 라우트가 안 끝나고 쌓였다는 뜻)"
fi
echo

echo "── ④ ${PORT} 에 붙어 있는 연결 ──"
if command -v lsof >/dev/null; then
  lsof -nP -iTCP:${PORT} 2>/dev/null | awk 'NR>1{print $NF}' | sort | uniq -c | sed 's/^/  /'
  echo "  (ESTABLISHED 가 브라우저 탭 수보다 훨씬 많거나 CLOSE_WAIT 가 쌓여 있으면 그쪽이 단서)"
else
  echo "  lsof 없음 — 건너뜀"
fi
echo

echo "── ⑤ 지금 파이썬이 어디에 서 있나 (제일 중요) ──"
if [ -n "$SRV" ]; then
  if command -v py-spy >/dev/null; then
    py-spy dump --pid "$SRV" 2>&1 | sed 's/^/  /'
  else
    echo "  py-spy 가 없다. 한 줄이면 깔린다:"
    echo "      pip3 install py-spy"
    echo "  깔고 이 파일을 **멈춘 상태에서 다시** 실행하면, 스레드마다 어느 코드 줄에"
    echo "  서 있는지 그대로 찍힌다. 그게 원인을 그냥 알려 준다."
  fi
fi
echo
echo "════ 끝 · 이 내용이 $OUT 에도 저장됐다 ════"
