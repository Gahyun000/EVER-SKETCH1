#!/bin/bash
# **세운다.** 대장 §2 가 요구하는 네 이름 중 하나.
#
# **이 폴더에서 띄운 것만 세운다.** 포트만 보고 죽이면 남의 프로세스를 죽일 수 있다 —
# 8808 은 이 앱 것이지만, 누가 먼저 물고 있을 때 그걸 죽이는 건 우리가 할 일이 아니다.
# 그래서 명령줄에 `server.app:app` 이 들어간 우리 uvicorn 만 고른다.
#
# EVER-FOLIO(8811)는 **건드리지 않는다.** 형제 앱이고, 다른 데서 먼저 띄워 두었을 수
# 있다. `run.command` 도 이미 떠 있으면 그대로 두고 지나간다 — 세우는 쪽도 같아야 한다.
cd "$(dirname "$0")"
PORT="$(node -p "require('./ports.json').backend" 2>/dev/null || echo 8808)"

PIDS="$(pgrep -f "uvicorn server.app:app" 2>/dev/null)"
if [ -z "${PIDS}" ]; then
  echo "· 이미 서 있습니다 (uvicorn server.app:app 없음)"
else
  echo "· 세웁니다: PID ${PIDS}"
  # shellcheck disable=SC2086
  kill ${PIDS} 2>/dev/null
  # 열까지 세며 기다린다. 안 죽으면 그때 세게 — 바로 -9 로 가면 저장 중이던 것이 깨진다.
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 0.4
    pgrep -f "uvicorn server.app:app" >/dev/null 2>&1 || break
  done
  if pgrep -f "uvicorn server.app:app" >/dev/null 2>&1; then
    echo "  (안 죽어서 강제로 세웁니다)"
    pkill -9 -f "uvicorn server.app:app" 2>/dev/null
  fi
fi

# `run.command` 가 띄운 로그 비춤이(tail -f)도 같이 정리한다. 남겨 두면 창이 안 닫힌다.
pkill -f "tail -f /tmp/eversketch.log" 2>/dev/null

# 정말 내려갔는지 **확인하고 말한다.** 「세웠습니다」만 찍고 실제로는 살아 있는
# 세우기가 제일 나쁘다 — 다음 기동이 「포트 사용 중」으로 막히고 까닭을 모른다.
sleep 0.3
if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:${PORT}/"; then
  echo "[!] ${PORT} 이(가) 아직 응답합니다. 이 폴더가 안 띄운 다른 서버일 수 있습니다."
  exit 1
fi
echo "· ${PORT} 내려갔습니다. (EVER-FOLIO 8811 은 건드리지 않았습니다)"
