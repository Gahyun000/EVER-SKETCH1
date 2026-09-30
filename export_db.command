#!/bin/bash
# EVER-SKETCH DB 내보내기 — 내 PC의 계정·프로젝트 DB를 한 파일로 떠서 다른 사람에게 넘긴다.
# 받는 쪽은 이 파일을 저장소 폴더에 넣고 install.command 를 실행한다.
#
# DB 는 git 에 올리지 않는다(.gitignore *.db — 비밀번호 해시와 전체 작업본이 들어 있다).
# 결과 파일은 메신저·USB 등으로 직접 전달한다.
#
# 서버가 켜져 있어도 된다 — sqlite backup API 로 일관된 스냅숏을 뜬다(WAL 포함).
set -e
cd "$(dirname "$0")"

SRC="${EVER_SKETCH_DB:-${EBOOK_HTML_DB:-server/ebook_html.db}}"
if [ ! -f "$SRC" ]; then
  echo "[!] DB 파일이 없습니다: $SRC"
  echo "    서버를 한 번도 실행하지 않았거나 다른 위치를 쓰고 있습니다."
  exit 1
fi

OUT_DIR="${OUT_DIR:-$HOME/Desktop}"
OUT="$OUT_DIR/ever-sketch-db_$(date +%Y%m%d_%H%M).db"

python3 - "$SRC" "$OUT" <<'PY'
import sqlite3, sys
src, out = sys.argv[1], sys.argv[2]
s = sqlite3.connect(src)
d = sqlite3.connect(out)
s.backup(d)
s.close()
# 로그인 세션은 넘기지 않는다 — 내 브라우저 쿠키가 남의 서버에서 통하면 안 된다.
d.execute("DELETE FROM Sessions")
d.commit()
# 받는 쪽에서 파일 하나로 끝나도록 WAL 을 본체에 합친다.
d.execute("PRAGMA journal_mode=DELETE")
d.execute("VACUUM")
users = d.execute("SELECT COUNT(*) FROM Users").fetchone()[0]
admins = d.execute("SELECT COUNT(*) FROM Users WHERE role='admin' AND status='active'").fetchone()[0]
d.close()
print("· 계정 %d명 (활성 관리자 %d명)" % (users, admins))
PY

echo "▶ 내보내기 완료: $OUT"
echo "   이 파일을 받는 사람의 EVER-SKETCH 폴더에 넣고 install.command 를 실행하게 하세요."
echo "   (비밀번호 해시와 전체 작업본이 들어 있습니다. git·공개 채널에 올리지 마세요.)"
open -R "$OUT" >/dev/null 2>&1 || true
