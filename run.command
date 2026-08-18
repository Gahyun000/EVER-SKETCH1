#!/bin/bash
# ebook_html 원클릭 실행 — 프론트 빌드 + 백엔드(FastAPI) 기동, 브라우저 자동 오픈
# + EVER-FOLIO(uniever_ebook 이북 라이브러리 · 8811)도 같이 기동
# 자동열기 끄기: AUTO_OPEN=0 ./run.command   |  다른 포트: PORT=8830 ./run.command
set -e
cd "$(dirname "$0")"

echo "▶ ebook_html 준비 중..."

# 1) 프론트엔드 의존성 + 빌드 (npm install은 항상 실행 — 새 의존성 lucide-react 등 반영)
echo "· npm install (의존성 확인/설치)"
npm install
echo "· 프론트엔드 빌드"
npm run build

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
URL="http://127.0.0.1:${PORT}"

# 포트 충돌 확인 (UDS-105 §6): 이미 사용 중이면 명확히 안내하고 중단
if curl -s -o /dev/null --max-time 1 "${URL}/"; then
  echo "[!] 포트 ${PORT} 이(가) 이미 사용 중입니다. 기존 서버를 종료하거나 다른 포트로 실행하세요. 예: PORT=8830 ./run.command"
  exit 1
fi

echo "▶ 서버 시작: ${URL}  (EVER-FOLIO: http://127.0.0.1:${FOLIO_PORT})"
echo "   로그는 이 창에 출력됩니다. 종료: Ctrl+C"
# 브라우저 자동 오픈 — AUTO_OPEN=0 이면 생략
if [ "${AUTO_OPEN:-1}" != "0" ]; then ( sleep 2; open "${URL}" >/dev/null 2>&1 ) & fi
exec python -m uvicorn server.app:app --host 127.0.0.1 --port "${PORT}"
