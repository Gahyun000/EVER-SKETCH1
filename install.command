#!/bin/bash
# EVER-SKETCH 설치 — 전달받은 DB(ever-sketch-db_*.db)를 깔고 run.command 로 기동한다.
#
# 쓰는 법:
#   1) 전달받은 ever-sketch-db_*.db 파일을 이 폴더(저장소 루트)에 넣는다.
#   2) install.command 더블클릭.   (파일을 직접 지정: ./install.command 경로/파일.db)
#
# 기존 DB 가 있으면 지우지 않고 server/_db_backup/ 에 옮겨 둔다(gitignore).
# 설치 후 로그인은 보낸 사람 PC 와 같은 아이디·비밀번호로 한다.
set -e
cd "$(dirname "$0")"

DEST="${EVER_SKETCH_DB:-${EBOOK_HTML_DB:-server/ebook_html.db}}"
# 포트 정본은 ports.json — run.command 와 같은 값을 본다.
PORT="${PORT:-$(node -p "require('./ports.json').backend" 2>/dev/null || echo 8808)}"

# 1) 설치할 파일 고르기 — 인자로 받거나, 이 폴더에서 가장 최근 것
SRC="$1"
if [ -z "$SRC" ]; then
  SRC="$(ls -t ever-sketch-db_*.db 2>/dev/null | head -1 || true)"
fi
if [ -z "$SRC" ] || [ ! -f "$SRC" ]; then
  echo "[!] 설치할 DB 파일을 찾지 못했습니다."
  echo "    전달받은 ever-sketch-db_*.db 파일을 이 폴더에 넣고 다시 실행하세요:"
  echo "    $(pwd)"
  exit 1
fi
echo "▶ 설치할 DB: $SRC"

# 2) 서버가 DB 를 잡고 있으면 교체하지 않는다
if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:${PORT}/"; then
  echo "[!] 서버가 실행 중입니다(포트 ${PORT}). 서버 창에서 Ctrl+C 로 끈 뒤 다시 실행하세요."
  exit 1
fi

# 3) 정상적인 EVER-SKETCH DB 인지 확인
python3 - "$SRC" <<'PY'
import sqlite3, sys
try:
    c = sqlite3.connect("file:%s?mode=ro" % sys.argv[1], uri=True)
    ok = c.execute("PRAGMA integrity_check").fetchone()[0]
    users = c.execute("SELECT COUNT(*) FROM Users").fetchone()[0]
    admins = c.execute("SELECT COUNT(*) FROM Users WHERE role='admin' AND status='active'").fetchone()[0]
except sqlite3.Error as e:
    sys.exit("[!] EVER-SKETCH DB 파일이 아닙니다: %s" % e)
if ok != "ok":
    sys.exit("[!] DB 파일이 손상되었습니다: %s" % ok)
print("· 계정 %d명 (활성 관리자 %d명)" % (users, admins))
PY

# 4) 기존 DB 백업 후 교체
mkdir -p "$(dirname "$DEST")"
if [ -f "$DEST" ]; then
  BAK_DIR="$(dirname "$DEST")/_db_backup"
  mkdir -p "$BAK_DIR"
  BAK="$BAK_DIR/$(basename "$DEST").before_install_$(date +%Y%m%d_%H%M%S)"
  mv "$DEST" "$BAK"
  echo "· 기존 DB 백업: $BAK"
fi
rm -f "${DEST}-wal" "${DEST}-shm"
cp "$SRC" "$DEST"
echo "▶ 설치 완료: $DEST"
echo "   보낸 사람 PC 와 같은 아이디·비밀번호로 로그인하세요."
echo

# 5) 바로 기동
exec ./run.command
