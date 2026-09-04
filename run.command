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
FOLIO_PORT=8811
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
PORT="${PORT:-8820}"
# 바인딩 주소 — 기본 0.0.0.0(같은 망의 다른 PC에서 접속 가능).
# 내 PC에서만 쓰려면: HOST=127.0.0.1 ./run.command
HOST="${HOST:-0.0.0.0}"
URL="http://127.0.0.1:${PORT}"

# 포트 충돌 확인 (UDS-105 §6): 이미 사용 중이면 명확히 안내하고 중단
if curl -s -o /dev/null --max-time 1 "${URL}/"; then
  echo "[!] 포트 ${PORT} 이(가) 이미 사용 중입니다. 기존 서버를 종료하거나 다른 포트로 실행하세요. 예: PORT=8830 ./run.command"
  exit 1
fi

echo "▶ 서버 시작: ${URL}  (바인딩 ${HOST}:${PORT} · EVER-FOLIO: http://127.0.0.1:${FOLIO_PORT})"
if [ "${HOST}" = "0.0.0.0" ]; then
  LANIP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
  [ -n "${LANIP}" ] && echo "   같은 망에서 접속: http://${LANIP}:${PORT}"
fi
echo "   로그는 이 창에 출력됩니다. 종료: Ctrl+C"
# 브라우저 자동 오픈 — AUTO_OPEN=0 이면 생략
if [ "${AUTO_OPEN:-1}" != "0" ]; then ( sleep 2; open "${URL}" >/dev/null 2>&1 ) & fi
exec python -m uvicorn server.app:app --host "${HOST}" --port "${PORT}"
