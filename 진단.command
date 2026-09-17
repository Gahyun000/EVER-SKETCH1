#!/bin/bash
# **멈췄을 때 눌러 보는 것.** (2026-09-17 · v2)
#
# 화면에 오류가 떴거나 흰 화면일 때, **그 상태 그대로** 새 터미널 창에서 실행한다.
# 서버를 다시 띄우면 증거가 사라진다. 여기서 고치는 것은 없다 — 어디서 끊겼는지만 본다.
#
# ── v1 이 거짓말을 했다(2026-09-17, 사용자 제보로 발견) ────────────────
#
# v1 은 닿지 못한 것을 전부 「**5초 초과** 또는 못 닿음」이라고 적었다. 그런데
# 사용자가 받은 값은 `HTTP 000 · 0.000161초` — **0.16밀리초**다. 5초를 기다린 게
# 아니라 **아무도 안 듣고 있어 즉시 튕긴 것**이다. 둘은 원인이 정반대인데
# 한 문장으로 뭉쳐 두어 「서버가 느린가」를 한참 뒤졌다.
#
# 게다가 **찌른 주소를 안 찍었다.** 그래서 「서버가 죽었다」와 「포트를 잘못 봤다」가
# 화면에서 똑같이 보였다. 둘은 할 일이 완전히 다르다.
#
# 그리고 ③ 이 「uvicorn 이 안 떠 있다 → **이게 원인이다**」라고 **단정**했는데,
# 바로 위 ② 에는 서버가 답한 로그가 찍혀 있었다. 제 증거와 모순되는 결론을 내놓았다.
# 이제 ①②③ 을 **서로 맞춰 보고**, 어긋나면 어긋났다고 말한다.
cd "$(dirname "$0")"
PORT="${PORT:-$(node -p "require('./ports.json').backend" 2>/dev/null || echo 8808)}"
URL="http://127.0.0.1:${PORT}"
LOG="${LOG:-/tmp/eversketch.log}"
OUT="/tmp/eversketch-진단-$(date +%H%M%S).txt"
exec > >(tee "$OUT") 2>&1

echo "════ EVER-SKETCH 멈춤 진단 v2 · $(date '+%F %T') ════"
echo
# **찌른 주소를 맨 먼저 찍는다.** 이게 없으면 「서버가 죽었다」와 「포트를 잘못 봤다」가
# 화면에서 구분이 안 된다 — v1 이 딱 그랬다.
echo "  찌르는 곳: ${URL}   (ports.json 의 backend)"
if [ ! -f ports.json ]; then
  echo "  [!] ports.json 이 없습니다. 이 파일이 저장소 뿌리에 있어야 포트를 압니다."
fi
echo

# ── ① 어느 길이 막혔나 ──────────────────────────────────
# curl 은 세 가지를 **다르게** 돌려준다. 그 셋을 갈라 적는 것이 이 칸의 전부다.
#   · 코드가 있음        → 서버가 답했다
#   · 000 인데 **즉시**   → 아무도 안 듣고 있다(연결 거부). 서버가 죽었거나 포트가 다르다
#   · 000 인데 **5초 걸림** → 붙기는 했는데 답이 없다. 처리가 막힌 것
echo "── ① 어느 길이 막혔나 (각 5초까지만) ──"
ALIVE=0; DEAD=0; SLOW=0
probe() {
  local path="$1" out code secs
  out=$(curl -s -o /dev/null -m 5 -w '%{http_code} %{time_total}' "${URL}${path}" 2>/dev/null)
  code=${out%% *}; secs=${out##* }
  [ -z "$code" ] && code=000
  [ -z "$secs" ] && secs=0
  if [ "$code" != "000" ]; then
    ALIVE=$((ALIVE+1)); printf '  %-22s HTTP %s · %s초\n' "$path" "$code" "$secs"
  elif awk "BEGIN{exit !($secs >= 4.5)}"; then
    SLOW=$((SLOW+1)); printf '  %-22s **붙었는데 답이 없다** (%s초 기다리다 끊음)\n' "$path" "$secs"
  else
    DEAD=$((DEAD+1)); printf '  %-22s **아무도 안 듣는다** (%s초 만에 튕김 — 연결 거부)\n' "$path" "$secs"
  fi
}
probe /favicon.svg
probe /api/auth/me
probe /api/projects
probe /api/folders
echo
if [ "$SLOW" -gt 0 ] && [ "$ALIVE" -gt 0 ]; then
  echo "  → 정적 파일은 되는데 **API 만 답을 안 한다.** 서버는 살아 있고 요청 처리가 막혔다."
  echo "    ⑤ 의 스레드 덤프가 어디서 멈췄는지 알려 준다."
elif [ "$DEAD" -gt 0 ] && [ "$ALIVE" -eq 0 ]; then
  echo "  → **${PORT} 을 아무도 안 듣고 있다.** 기다리다 끊긴 게 아니라 즉시 튕겼다."
  echo "    서버가 죽었거나, 다른 포트로 떠 있다. ③ 과 ④ 를 보라."
elif [ "$ALIVE" -gt 0 ] && [ "$DEAD" -eq 0 ] && [ "$SLOW" -eq 0 ]; then
  echo "  → **지금은 다 정상이다.** 오류가 났던 그 순간이 아니라면 이 진단으로는 안 잡힌다."
  echo "    (401 은 정상이다 — 이 스크립트에는 로그인 쿠키가 없다.)"
fi
echo

# ── ② 서버가 마지막으로 남긴 말 ──────────────────────────
echo "── ② 서버가 마지막으로 남긴 말 ──"
if [ -f "$LOG" ]; then
  # stat 의 모양이 맥과 리눅스가 다르다. 맥이 먼저, 안 되면 리눅스, 그래도 안 되면 포기.
  # (숫자가 아니면 「몇 초 전」을 아예 안 적는다 — 틀린 숫자보다 없는 편이 낫다.)
  MODS=$(stat -f %m "$LOG" 2>/dev/null || stat -c %Y "$LOG" 2>/dev/null || echo '')
  MOD=$(date -r "$LOG" '+%T' 2>/dev/null || echo '?')
  if printf '%s' "$MODS" | grep -Eq '^[0-9]+$'; then
    echo "  $LOG · 마지막 기록 ${MOD} ($(( $(date '+%s') - MODS ))초 전)"
  else
    echo "  $LOG · 마지막 기록 ${MOD}"
  fi
  tail -12 "$LOG" | sed 's/^/  /'
else
  echo "  !! $LOG 가 없다 — run.command(또는 start.command)로 띄운 게 맞는지 확인"
fi
echo

# ── ③ 서버 프로세스 ────────────────────────────────────
echo "── ③ 서버 프로세스와 스레드 ──"
SRV=$(pgrep -f "uvicorn server.app:app" | head -1)
if [ -z "$SRV" ]; then
  echo "  uvicorn(server.app:app)을 못 찾았다."
else
  echo "  PID $SRV · 스레드 $(ps -M "$SRV" 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')개 · $(ps -o %cpu=,rss=,etime= -p "$SRV")"
  echo "  (스레드가 40개 언저리에서 멈춰 있으면 **스레드가 다 찬 것** — 동기 라우트가 안 끝나고 쌓였다)"
fi
echo

# ── ④ 포트를 누가 쥐고 있나 ─────────────────────────────
echo "── ④ ${PORT} 을 누가 쥐고 있나 ──"
if command -v lsof >/dev/null; then
  HOLD=$(lsof -nP -iTCP:"${PORT}" 2>/dev/null)
  if [ -z "$HOLD" ]; then
    echo "  아무도 안 쥐고 있다."
  else
    printf '%s\n' "$HOLD" | head -8 | sed 's/^/  /'
    echo "  연결 상태: $(printf '%s\n' "$HOLD" | awk 'NR>1{print $NF}' | sort | uniq -c | tr '\n' ' ')"
  fi
  # **다른 포트로 떠 있는 경우를 잡는다.** v1 에는 이 칸이 없어서, 포트가 어긋났을 때
  # 「서버가 죽었다」로만 보였다. 2026-09-17 에 8820→8808 로 옮긴 참이라 더 그렇다.
  OTHER=$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -i python | awk '{print $NF}' | sort -u)
  [ -n "$OTHER" ] && echo "  (참고) 파이썬이 듣고 있는 자리: $(printf '%s ' $OTHER)"
else
  echo "  lsof 없음 — 건너뜀"
fi
echo

# ── ⑤ 지금 파이썬이 어디에 서 있나 ──────────────────────
echo "── ⑤ 지금 파이썬이 어디에 서 있나 (멈춤일 때 제일 중요) ──"
if [ -z "$SRV" ]; then
  echo "  서버가 없어서 볼 것이 없다."
elif command -v py-spy >/dev/null; then
  py-spy dump --pid "$SRV" 2>&1 | sed 's/^/  /'
else
  echo "  py-spy 가 없다. 한 줄이면 깔린다:  pip3 install py-spy"
  echo "  깔고 **멈춘 상태에서 다시** 실행하면 스레드마다 어느 코드 줄에 서 있는지 찍힌다."
fi
echo

# ── ⑥ 앞뒤가 맞는가 ────────────────────────────────────
# **v1 이 여기서 거짓말을 했다.** ② 에 서버가 답한 로그가 있는데 ③ 은 「서버가 죽은 것」
# 이라고 단정했다. 제 증거와 모순되는 결론은 없느니만 못하다 — 사람을 엉뚱한 데로 보낸다.
echo "── ⑥ 앞뒤가 맞는가 ──"
if [ -z "$SRV" ] && [ "$ALIVE" -gt 0 ]; then
  echo "  [?] **어긋난다.** 프로세스는 못 찾았는데 ① 에서는 서버가 답했다."
  echo "      pgrep 이 못 찾는 모양으로 떠 있을 수 있다(다른 명령줄). ④ 의 PID 를 보라."
  echo "      → stop.command 도 같은 pgrep 을 쓰므로 **그것도 못 세울 수 있다.**"
elif [ -n "$SRV" ] && [ "$ALIVE" -eq 0 ] && [ "$DEAD" -gt 0 ]; then
  echo "  [?] **어긋난다.** 서버 프로세스는 살아 있는데 ${PORT} 은 연결을 거부했다."
  echo "      → 다른 포트로 떠 있을 가능성이 크다. ④ 의 「파이썬이 듣고 있는 자리」를 보라."
elif [ -z "$SRV" ] && [ "$DEAD" -gt 0 ]; then
  echo "  맞는다. 프로세스도 없고 포트도 안 듣는다 — **서버가 꺼져 있다.**"
  echo "  그런데 ② 의 마지막 기록이 방금이라면, **조금 전까지는 살아 있다가 죽은 것**이다."
  echo "  터미널 창에 파이썬 오류(Traceback)가 남아 있는지 보고, 있으면 그것이 원인이다."
else
  echo "  ①②③ 이 서로 어긋나지 않는다."
fi
echo
echo "════ 끝 · 이 내용이 $OUT 에도 저장됐다 ════"
