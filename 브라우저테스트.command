#!/bin/bash
# **브라우저 회귀 테스트 — 두 번 눌러 돌린다.** (2026-09-21)
#
# `e2e/run_all.mjs` 를 파인더에서 열면 **코드만 보인다.** 그것은 웹 페이지가 아니라
# 터미널에서 `node` 로 돌리는 스크립트이기 때문이다(실제로 그렇게 열어 보고 막혔다).
# 이 파일이 터미널을 열어 대신 돌리고, **결과를 증적 폴더에 그대로 남긴다** —
# 맥에서 돌린 이 기록이 정본 증적이다(작업 컨테이너에서 돌린 것은 참고용).
#
# 하는 일
#   ① 소스가 빌드보다 새로우면 먼저 빌드한다. 모의 서버는 dist/ 를 그대로 서빙하므로
#      **빌드가 옛것이면 옛 화면을 테스트하고도 초록이 뜬다.** 조용한 거짓말이라 여기서 막는다.
#   ② 테스트용 크로미움이 없으면 한 번 내려받는다(최초 1회).
#   ③ run_all.mjs 를 돌리고 창을 닫지 않는다 — 결과를 읽을 시간이 있어야 한다.
cd "$(dirname "$0")"

STAMP=$(date +%Y-%m-%d_%H%M)
mkdir -p qc_docs/테스트증적
OUT="qc_docs/테스트증적/증적_${STAMP}_e2e전체_맥.txt"
exec > >(tee "$OUT") 2>&1

pause() { echo; read -n1 -r -p "창을 닫으려면 아무 키나 누르세요…"; echo; }

echo "════ EVER-SKETCH 브라우저 회귀 · $(date '+%F %T') ════"
echo "  커밋 $(GIT_OPTIONAL_LOCKS=0 git rev-parse --short HEAD 2>/dev/null || echo '?') · 기록 → $OUT"
echo

if ! command -v node >/dev/null; then
  echo "[!] node 가 없습니다. run.command 로 한 번 띄운 적이 있다면 PATH 문제일 수 있어요."
  pause; exit 1
fi

# ① 빌드가 소스를 따라잡았는가
if [ ! -f dist/index.html ]; then
  echo "· dist 가 없어 빌드합니다"
  npm run build || { echo "[!] 빌드 실패 — 위 오류를 보세요"; pause; exit 1; }
else
  NEWER=$(find src ports.json -type f -newer dist/index.html 2>/dev/null | head -3)
  if [ -n "$NEWER" ]; then
    echo "· 소스가 빌드보다 새롭습니다 — 먼저 빌드합니다"
    echo "$NEWER" | sed 's/^/    /'
    npm run build >/dev/null || { echo "[!] 빌드 실패 — npm run build 로 오류를 확인하세요"; pause; exit 1; }
    echo "  빌드 완료"
  else
    echo "· 빌드가 최신입니다"
  fi
fi

# ② 테스트용 크로미움
if ! node -e "const fs=require('fs');process.exit(fs.existsSync(require('playwright').chromium.executablePath())?0:1)" 2>/dev/null; then
  echo "· 테스트용 크로미움이 없어 한 번 내려받습니다 (최초 1회, 1~2분)"
  npx playwright install chromium || { echo "[!] 내려받기 실패 — 네트워크를 확인하세요"; pause; exit 1; }
fi
echo

# ③ 실행
node e2e/run_all.mjs
CODE=$?

echo
if [ $CODE -eq 0 ]; then echo "✅ 전체 통과"; else echo "❌ 실패가 있습니다 — 위에서 ✗ 로 시작하는 줄을 보세요"; fi
echo "결과 파일: $OUT"
pause
exit $CODE
