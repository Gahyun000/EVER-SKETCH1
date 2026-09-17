#!/bin/bash
# ebook_html 원클릭 실행 — 프론트 빌드 + 백엔드(FastAPI) 기동, 브라우저 자동 오픈
# + EVER-FOLIO(uniever_ebook 이북 라이브러리 · 8811)도 같이 기동
# 자동열기 끄기: AUTO_OPEN=0 ./run.command   |  다른 포트: PORT=8830 ./run.command
# 빠른 재시작: SKIP_BUILD=1 ./run.command  (기존 dist 그대로 — 설치·빌드 생략)
# 강제 재설치: FORCE_INSTALL=1 ./run.command
set -e
cd "$(dirname "$0")"

echo "▶ ebook_html 준비 중..."

# 1) 프론트엔드 의존성 + 빌드
#
# 예전에는 npm install 을 무조건 돌렸다. 잠금파일이 한 글자도 안 바뀐 날에도
# npm 은 240개 · 137MB 짜리 트리를 통째로 훑고, 기본값으로 audit 와 funding 을
# 네트워크로 조회한다. 바뀐 게 없는데도 매번 그 시간을 낸다.
#
# 그래서 **잠금파일이 바뀌었을 때만** 설치한다.
# 판단 근거는 package-lock.json 의 체크섬이고, 도장은 node_modules 안에 둔다 —
# node_modules 를 지우면 도장도 함께 사라져 자동으로 다시 설치된다.
# (막혔을 때 가장 흔히 하는 'node_modules 지우고 다시' 가 그대로 통한다)
LOCK_SUM="$(shasum -a 256 package-lock.json 2>/dev/null | cut -d' ' -f1)"
STAMP="node_modules/.install-stamp"

if [ "${SKIP_BUILD:-0}" = "1" ] && [ -f dist/index.html ]; then
  echo "· SKIP_BUILD=1 — 의존성 설치·빌드 생략 (기존 dist 사용)"
else
  if [ "${FORCE_INSTALL:-0}" != "1" ] && [ -d node_modules ] && [ -f "${STAMP}" ] \
     && [ -n "${LOCK_SUM}" ] && [ "$(cat "${STAMP}")" = "${LOCK_SUM}" ]; then
    echo "· 의존성 그대로 — npm install 생략 (다시 받으려면 FORCE_INSTALL=1)"
  else
    echo "· npm install (의존성이 바뀌었습니다)"
    # audit·funding 은 설치와 상관없는 네트워크 조회다. 기다릴 이유가 없다.
    npm install --no-audit --no-fund
    # 도장은 node_modules 가 실제로 생겼을 때만 찍는다.
    # set -e 가 걸려 있어서, 여기서 쓰기가 실패하면 서버 기동까지 통째로 멈춘다 —
    # 설치가 끝난 뒤에 그러면 원인을 짐작하기 어렵다. 못 찍으면 다음에 한 번 더
    # 설치할 뿐이니, 조용히 넘어가는 쪽이 안전하다.
    [ -d node_modules ] && printf '%s' "${LOCK_SUM}" > "${STAMP}" || true
  fi
  echo "· 프론트엔드 빌드"
  npm run build
fi

# 2) 백엔드 가상환경 + 의존성
if [ ! -d server/.venv ]; then
  echo "· python 가상환경 생성 (최초 1회)"
  python3 -m venv server/.venv
fi
# shellcheck disable=SC1091
source server/.venv/bin/activate
pip install -q --upgrade pip
pip install -q fastapi "uvicorn[standard]" pillow python-docx beautifulsoup4 pymupdf python-multipart

# 2.5) EVER-FOLIO (uniever_ebook 이북 라이브러리) 같이 기동 — 8811
#      형제 앱. EVER-SKETCH 상단바의 'EVER-FOLIO' 칩이 http://127.0.0.1:8811 로 연결된다.
FOLIO_PORT="$(node -p "require('./ports.json').folio" 2>/dev/null || echo 8811)"
FOLIO_DIR="$(cd ../uniever_ebook/ebook-generator 2>/dev/null && pwd || true)"
if [ -n "$FOLIO_DIR" ] && [ -f "$FOLIO_DIR/serve.py" ]; then
  if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:${FOLIO_PORT}/"; then
    echo "· EVER-FOLIO 이미 실행 중 (${FOLIO_PORT})"
  else
    echo "· EVER-FOLIO 기동 (uniever_ebook 라이브러리 · ${FOLIO_PORT})"
    (
      cd "$FOLIO_DIR"
      [ -d .venv ] || python3 -m venv .venv >/dev/null 2>&1 || true
      if [ -x .venv/bin/python ]; then
        .venv/bin/pip install -q --upgrade pip pillow >/dev/null 2>&1 || true
        EBOOK_PORT="${FOLIO_PORT}" .venv/bin/python serve.py >/tmp/everfolio.log 2>&1 &
      else
        EBOOK_PORT="${FOLIO_PORT}" python3 serve.py >/tmp/everfolio.log 2>&1 &
      fi
    )
  fi
else
  echo "· (EVER-FOLIO 폴더를 못 찾아 건너뜀 — ../uniever_ebook/ebook-generator)"
fi

# 3) 서버 실행 (프론트 dist + /api/build 동시 서빙)
# **포트는 ports.json 한 곳에서 온다**(2026-09-17). 예전에는 여기·run.cmd·
# vite.config.ts 세 군데에 8820 이 따로 적혀 있었고, 대장·레지스트리는 8808 로
# 예약돼 있었다 — 넷이 다 달랐는데 아무도 몰랐다. 흩어진 값은 반드시 갈라진다.
# node 는 바로 위에서 npm 을 쓰므로 이미 있다. 못 읽으면 멈춘다 — 조용히 옛 값으로
# 되돌아가면 또 남의 포트를 물고 뜬다(8820 은 DataBuilder 것이다).
PORT_DEFAULT="$(node -p "require('./ports.json').backend" 2>/dev/null || true)"
if ! printf '%s' "${PORT_DEFAULT}" | grep -Eq '^[0-9]+$'; then
  echo "[X] ports.json 에서 backend 포트를 못 읽었습니다. 이 파일이 정본입니다." >&2
  exit 1
fi
PORT="${PORT:-${PORT_DEFAULT}}"
# 바인딩 주소 — 기본 0.0.0.0(같은 망의 다른 PC에서 접속 가능).
# 내 PC에서만 쓰려면: HOST=127.0.0.1 ./run.command
HOST="${HOST:-0.0.0.0}"
URL="http://127.0.0.1:${PORT}"

# 포트 충돌 확인 (UDS-105 §6): 이미 사용 중이면 명확히 안내하고 중단
if curl -s -o /dev/null --max-time 1 "${URL}/"; then
  # **아무 번호나 권하지 않는다**(2026-09-17). 예전에는 「예: PORT=8830」이라고 적혀 있었는데,
  # 8830 은 아무도 예약한 적 없는 번호다 — 바로 옆 8831 은 Uni_SR, 8832 는 DataBuilder 것이다.
  # port-governance 는 「예약 없이 포트를 집지 말라」고 못박아 두었는데, 우리 안내문이
  # 그 반대를 시키고 있었다. 급하면 임시로 쓰라는 말은 남겨 두되, 정본에 되먹이라고 적는다.
  echo "[!] 포트 ${PORT} 이(가) 이미 사용 중입니다."
  echo "    · 우리 서버가 이미 떠 있는 것이면: ./stop.command"
  echo "    · 남이 쓰고 있으면: 그 프로세스를 먼저 세우세요 (lsof -nP -iTCP:${PORT})"
  echo "    · 이 프로젝트의 포트를 바꿔야 하면 대장에서 먼저 예약하고 ports.json 에 옮겨 적으세요."
  echo "      (PORT=<번호> ./run.command 로 한 번만 띄워 볼 수는 있지만, 예약 없이 굳히지 마세요)"
  exit 1
fi

echo "▶ 서버 시작: ${URL}  (바인딩 ${HOST}:${PORT} · EVER-FOLIO: http://127.0.0.1:${FOLIO_PORT})"
if [ "${HOST}" = "0.0.0.0" ]; then
  LANIP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
  [ -n "${LANIP}" ] && echo "   같은 망에서 접속: http://${LANIP}:${PORT}"
fi
# ── 로그는 **파일에 쓰고** 창에는 tail 로 비춘다 (2026-09-16) ─────────────
#
# **터미널이 출력을 안 받아 가면 서버가 통째로 멈춘다.** 전에는 uvicorn 의 출력이
# 이 창으로 곧장 갔다. 창이 출력을 멈추면(Ctrl+S 로 흐름을 멈췄거나 창이 못 따라가면)
# 쓰기가 막히고, 요청 한 건에 로그 한 줄이라 출력 버퍼가 차는 순간 **서버가 아무 말
# 없이 대답을 그만둔다.** 오류도 안 난다 — 브라우저에는 그냥 (pending) 만 뜬다.
#
# 실제로 겪었다. 재현해 보니 1,052번째 요청에서 멈췄고(버퍼 64KB ÷ 한 줄 62바이트),
# 출력을 한 번 비워 주니 그 자리에서 되살아났다.
#
# 이제 서버는 파일에 쓴다 — 파일은 안 막힌다. 창이 멈추면 `tail` 만 멈추고
# **서버는 계속 돈다.** EVER-FOLIO 는 처음부터 이렇게 하고 있었고, 그래서 한 번도
# 안 멈췄다. 같은 창에서 형제 앱만 멀쩡했던 이유가 그것이다.
LOG="${LOG:-/tmp/eversketch.log}"
: > "${LOG}" 2>/dev/null || LOG="$(mktemp -t eversketch)"
echo "   로그: ${LOG} (이 창에 함께 비춥니다) · 종료: Ctrl+C"
# 브라우저 자동 오픈 — AUTO_OPEN=0 이면 생략
if [ "${AUTO_OPEN:-1}" != "0" ]; then ( sleep 2; open "${URL}" >/dev/null 2>&1 ) & fi

python -m uvicorn server.app:app --host "${HOST}" --port "${PORT}" >>"${LOG}" 2>&1 &
SRV=$!
tail -f "${LOG}" &
TAIL=$!
# Ctrl+C 한 번에 둘 다 정리한다. `exec` 를 뗐으므로 신호를 직접 받아 넘겨야 한다.
trap 'kill ${SRV} ${TAIL} 2>/dev/null; wait ${SRV} 2>/dev/null; exit 0' INT TERM
wait ${SRV}
kill ${TAIL} 2>/dev/null
