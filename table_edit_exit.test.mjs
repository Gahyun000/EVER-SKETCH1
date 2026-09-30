// **표 안에서 나가는 길** — 밖을 누르지 않고도 편집이 풀린다.
//
// 2026-09-17 화면 기록 + 2026-09-18 · 사용자:
//   「표 클릭했을때 밖에 클릭해야 글씨 풀리는게 불편함」
//   「드래그 하려면 밖에 클릭해야해서 귀찮음」
//
// 영상을 프레임으로 뜯어 재 보니 둘은 **한 가지 일**이었다.
//
//   편집 상태는 칸이 아니라 **표 전체**에 걸린다 — `editing = el.id`.
//   그래서 편집 중에는 표 안의 **모든 칸**이 contentEditable 이고,
//   칸의 onPointerDown 은 `if (editingThis) { e.stopPropagation(); return }` 로
//   **어느 칸을 눌러도 그냥 돌아섰다.**
//
//   → 글자 커서만 칸 사이를 옮겨 다닌다(편집이 안 풀린다).
//   → 끌어도 칸 범위 선택(startCellDrag)이 시작되지 않는다.
//   → 푸는 길은 빈 곳이나 다른 요소를 누르는 것뿐 — 그게 「밖에 클릭」이다.
//     게다가 밖을 누르면 **엉뚱한 요소가 골라진다**(영상에서 제목 글상자가 잡혔다).
//
// 고친 것: 엑셀·파워포인트와 같게 한다.
//   같은 칸을 누르면  → 글자 사이로 커서 이동(브라우저에 맡긴다).
//   다른 칸을 누르면  → 값 커밋 + 편집 끄기 + 그 칸 고르기 + 끌면 범위 선택.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs table_edit_exit.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')
const fl = bare(readFileSync('./src/canvas/FreeLayer.tsx', 'utf8'))

// ── ① 옛 줄이 안 남아 있다 ────────────────────────────
{
  check(!/if \(editingThis\) \{ e\.stopPropagation\(\); return \}/.test(fl),
    '**「편집 중이면 그냥 돌아선다」 한 줄이 사라졌다** — 그 줄이 신고된 두 불편의 원인이었다')
}

// ── ② 편집 중 갈래가 칸 onPointerDown 안에 있다 ───────
const i = fl.indexOf('if (editingThis) {')
const blk = i < 0 ? '' : fl.slice(i, i + 1200)
{
  check(i > 0, '표 칸의 onPointerDown 에 편집 중 갈래가 있다')
  check(/if \(adding\) return/.test(fl.slice(Math.max(0, i - 220), i)),
    '도형을 놓는 중이면 여전히 흘려보낸다 — 그 앞줄을 밀어내지 않았다')
}

// ── ③ 같은 칸은 건드리지 않는다 ───────────────────────
{
  // 같은 칸에서까지 편집을 끄면 **글자 가운데를 못 고친다** — 고치려다 더 나빠지는 자리다.
  check(/cur && cur\.node === e\.currentTarget\) return/.test(blk),
    '**같은 칸을 누르면 커서만 옮긴다** — 글자 사이를 짚는 일은 그대로 된다')
  const iSame = blk.indexOf('cur.node === e.currentTarget')
  const iEnd = blk.indexOf('endEditing()')
  check(iSame > 0 && iEnd > 0 && iSame < iEnd,
    '같은 칸 판정이 **편집을 끄기 전에** 온다')
}

// ── ④ 다른 칸이면: 값부터 커밋하고 → 그 칸을 고르고 → 끌기까지 이어진다 ──
{
  check(/endEditing\(\)/.test(blk),
    '**값부터 커밋하고 편집을 끈다**(endEditing) — 곧바로 setEditing(null) 하면 방금 친 글자가 날아간다')
  check(/pickRange\(el, r, c, r, c\)/.test(blk), '누른 그 칸이 골라진다')
  check(/startCellDrag\(el, r, c, e\.currentTarget\)/.test(blk),
    '**그대로 끌면 범위 선택이 이어진다** — 「드래그하려면 밖을 클릭」이 없어지는 지점')
  check(/e\.preventDefault\(\)/.test(blk),
    '새 칸에 글자 커서가 꽂히지 않는다 — 여기서부터는 칸 고르기다')
  check(/isContentEditable\) ae\.blur\(\)/.test(blk),
    '옛 칸의 포커스를 뗀다 — 쥔 채 남으면 Hotkeys 가 Delete 를 삼킨다')
  const iEnd = blk.indexOf('endEditing()')
  const iPick = blk.indexOf('pickRange(el, r, c, r, c)')
  check(iEnd > 0 && iPick > 0 && iEnd < iPick,
    '**커밋이 칸 고르기보다 먼저다** — 순서가 뒤집히면 옛 값이 덮어쓴다')
  check(/e\.shiftKey && ts\) \{ pickRange\(el, ts\.r0, ts\.c0, r, c\)/.test(blk),
    'Shift 클릭이면 편집 중에 눌러도 범위가 넓어진다')
}

// ── ⑤ 편집 중에도 표를 옮길 수 있다 ───────────────────
{
  // ⠿ 손잡이는 제 겹에 따로 그린다. 크기 손잡이 겹(editing == null)에 얹으면
  // **편집하는 동안 사라져** 다시 「밖을 눌러야」 한다.
  const j = fl.indexOf('className="tbl-move"')
  check(j > 0, '표 이동 손잡이(⠿)가 있다')
  const layer = fl.lastIndexOf('{active &&', j)
  const guard = layer > 0 ? fl.slice(layer, j) : ''
  check(guard.length > 0 && !/editing == null/.test(guard),
    '**그 겹에는 `editing == null` 가드가 없다** — 칸을 고치는 중에도 표를 옮길 수 있다')
}

// ── ⑤-2 표를 옮기면 편집이 풀린다 — 테두리든 ⠿ 든 (2026-09-21 · 시안 ㄷ) ──
{
  check(/if \(editRef\.current && \(editRef\.current\.id !== el\.id \|\| el\.type === 'table'\)\) endEditing\(\)/.test(fl),
    '**표는 제 것이어도** 요소 누름(테두리 · ⠿)에서 편집을 끝낸다 — 잡는 자리마다 결과가 다르지 않게')
  const k = fl.indexOf("el.type === 'table')) endEditing()")
  const after = fl.slice(k, k + 600)
  check(/if \(editRef\.current == null\)[\s\S]{0,260}ae\.blur\(\)/.test(after),
    '끝낸 뒤 칸이 쥔 포커스도 뗀다 — 남으면 이어 치는 글자가 칸으로 샌다')
}

// ── ⑥ Escape 와 Enter·Tab 은 그대로 ────────────────
{
  check(/e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); endEditing\(\); return \}/.test(fl),
    'Escape 로 나가는 길은 그대로 있다')
  check(/endEditing\(\); pickRange\(el, nr, nc, nr, nc\)/.test(fl),
    'Enter·Tab 은 값을 저장하고 옆 칸을 고른다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
