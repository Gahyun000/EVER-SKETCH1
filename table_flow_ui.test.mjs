// ㄷ · **표가 차기 전에 말해 주고, 차면 다음 장에 이어 적는다.**
//
// **무엇이 문제였나.** 표준 양식 로드맵은 한 장에 본문 12줄이 정상인데,
// 더 넣으면 이렇게 됐다 (세로 720 · 윗변 94 · 한 줄 40 · 머리글 2 · 꼬리말 자리 50):
//
//     13줄  꼬리말 자리를 덮는다                        ← 화면은 **아무 말 없음**
//     14줄  표가 위로 기어 올라간다(윗변 94 → 80)        ← 아무 말 없음
//     15줄  더 올라가 제목 글상자를 파고든다(→ 40)       ← 아무 말 없음
//     16줄  종이를 통째로 덮는다(→ 0)                   ← **이제야** 경고
//     17줄~ 줄 높이가 줄기 시작한다(37.9 → 34.3 → …)
//
// 옛 경고는 「표 높이 ≥ 종이 높이」였다. **네 줄 늦다.**
//
// 게다가 그 경고는 「다음 장에 이어 적어 주세요」라고 하면서 **그럴 단추를 안 줬다.**
// 사람이 할 수 있는 건 새 쪽에 표를 복사하는 것뿐인데, 그렇게 만든 표에는 `contFrom`
// 이 없어서 서버가 「표가 2개예요」로 **저장을 막았다.** 앱이 시킨 대로 했는데 앱이 거절했다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs table_flow_ui.test.mjs

import { readFileSync } from 'node:fs'
import { bottomLimit, rowHeight, isFull, dataCapacity } from './src/canvas/tableCapacity.ts'
import { FOOT_ZONE } from './src/cards/sizing.ts'
import { makeContinuation, isContinuation, dataRows } from './src/canvas/tableFlow.ts'

const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')
const bare = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

// 표준 양식의 실제 값. server/template_seed.py 에서 가져왔다.
const PAGE_H = 720, Y0 = 94, RH = 40, HEAD = 2
const roadmap = (dataRowsN) => ({
  y: Y0, h: RH * (HEAD + dataRowsN), rows: HEAD + dataRowsN, cols: 18,
  slot: 'SLOT-A', type: 'table',
})

// ── 1. 한계선은 **종이**가 정한다 ────────────────
//
// 처음에는 꼬리말 글상자의 지금 y 로 재려 했다. 실물에서 걸렸다 —
// 꼬리말은 **만들 때 표 바로 밑에** 놓인다(5줄 양식이면 y=392). 그걸 한계로 삼으면
// 표가 **처음부터** 꽉 찬 것이 되어, 줄 하나만 더해도 새 쪽이 생긴다.
// 한계는 종이가 정하는 것이지 지금 배치가 정하는 것이 아니다.
{
  check(bottomLimit(PAGE_H) === PAGE_H - FOOT_ZONE,
    '한계선은 종이 아래끝에서 꼬리말 자리(50)를 뺀 곳이다', String(bottomLimit(PAGE_H)))
  check(FOOT_ZONE === 50, '꼬리말 자리는 50 — 서버 `template_seed.FOOT_ZONE` 의 거울이다')
  // **만들었을 때의 꼬리말 자리로 재면 안 된다**는 것을 숫자로 남긴다.
  const seededFootY = 392            // 5줄짜리 표준 양식의 실제 값
  const seeded = roadmap(5)
  check(!isFull(seeded, bottomLimit(PAGE_H)),
    '갓 만든 5줄 양식은 **안 찼다**', 'y+h=' + (seeded.y + seeded.h))
  check(isFull(seeded, seededFootY),
    '(참고) 꼬리말 y 로 쟀다면 갓 만든 양식이 이미 「꽉 찼다」가 된다 — 그래서 안 쓴다')
}

// ── 2. **12줄**이 나온다 — 서버와 같은 답 ────────
//
// server/template_seed.py `_max_data_rows()` = (720-94-50)//40 - 2 = 12.
// 두 곳이 같은 답을 내는지가 이 검사의 핵심이다.
{
  const lim = bottomLimit(PAGE_H)
  check(dataCapacity(roadmap(12), HEAD, lim) === 12,
    '이 장에 들어가는 본문 줄이 **12**다 — 서버 `_max_data_rows()` 와 같다',
    String(dataCapacity(roadmap(12), HEAD, lim)))
  check(rowHeight(roadmap(12)) === RH, '한 줄 높이를 바르게 읽는다', String(rowHeight(roadmap(12))))
}

// ── 3. **경고가 네 줄 당겨졌다** ────────────────
{
  const lim = bottomLimit(PAGE_H)
  const full = (n) => isFull(roadmap(n), lim)
  check(!full(11), '11줄 — 아직 여유가 있다')
  check(full(12), '**12줄에서 「찼다」고 말한다** (옛 판정은 16줄이었다)')
  check(full(13) && full(14) && full(15) && full(16), '그 뒤로도 계속 찼다고 말한다')

  // 옛 판정이었다면 무엇을 놓쳤는지 숫자로 남긴다.
  const oldWarn = (n) => roadmap(n).h >= PAGE_H - 1
  check(!oldWarn(15) && oldWarn(16), '(참고) 옛 판정은 16줄에서야 울었다')
  const missed = [12, 13, 14, 15].filter((n) => full(n) && !oldWarn(n))
  check(missed.length === 4, '옛 판정이 놓치던 네 줄을 이제 잡는다', missed.join(','))
}

// ── 4. 이미 망가진 옛 자료도 잡는다 ─────────────
//
// 높이가 종이에 맞춰 잘리고 윗변이 0 이 된 자료가 이미 나가 있을 수 있다.
{
  const broken = { y: 0, h: PAGE_H, rows: 20, cols: 18 }
  check(isFull(broken, bottomLimit(PAGE_H)), '높이가 잘린 옛 자료도 「찼다」로 본다')
  // 줄 수를 모르면 함부로 판정하지 않는다.
  check(!isFull({ y: 0, h: 100, rows: 0 }, bottomLimit(PAGE_H)), '줄 수가 0 이면 판정하지 않는다')
}

// ── 5. 세로 종이·다른 자리에서도 맞는다 ──────────
{
  // 표를 위로 끌어 올려 두면 그만큼 더 들어간다.
  const lim = bottomLimit(PAGE_H)
  const high = { y: 54, h: RH * (HEAD + 12), rows: HEAD + 12 }
  check(dataCapacity(high, HEAD, lim) === 13, '표를 40 올리면 한 줄 더 들어간다',
    String(dataCapacity(high, HEAD, lim)))
  check(!isFull(high, lim), '그래서 12줄이어도 아직 안 찼다')
}

// ── 6. 이은 조각이 제대로 만들어진다 ────────────
{
  const head = { id: 1, type: 'table', slot: 'SLOT-A', x: 20, y: Y0, w: 1000, h: RH * 14,
    rows: 14, cols: 18, cells: Array.from({ length: 14 }, () => Array(18).fill('')),
    colw: [2.74, 3.21].concat(Array(12).fill(1)).concat([1.48, 1.48, 1.48, 1.48]) }
  head.cells[0][0] = '사업 그룹'; head.cells[1][2] = '1'; head.cells[5][0] = '품질'
  const cont = makeContinuation(head, 12, HEAD, Y0, 99)

  check(isContinuation(cont), '조각에 `contFrom` 이 붙는다 — 서버가 이걸로 한 표로 센다')
  check(cont.contFrom === 12, '「앞에 12줄이 있었다」를 적어 둔다', String(cont.contFrom))
  check(cont.slot === head.slot, '같은 슬롯이다 — 취합이 둘을 한 표로 본다')
  check(cont.cols === head.cols, '열 수가 같다 (다르면 서버가 거부한다)')
  check(cont.cells[0][0] === '사업 그룹' && cont.cells[1][2] === '1',
    '**머리글을 다시 붙인다** — 2쪽만 펼친 사람에게 열 이름이 없으면 숫자 덩어리다')
  check(dataRows(cont, HEAD) === 1, '본문은 빈 한 줄로 시작한다', String(dataRows(cont, HEAD)))
  check(cont.cells[HEAD][0] === '', '그 줄은 비어 있다 — 앞 장 내용을 옮겨오지 않는다')
  check(cont.id === 99 && head.id === 1, '머리 조각은 그대로 있다')
}

// ── 7. 화면이 실제로 이어 붙였는가 ──────────────
{
  const rp = bare(read('./src/builder/chrome/RightPanel.tsx'))
  check(/import \{ bottomLimit, dataCapacity, isFull \}/.test(rp), '새 판정을 들여온다')
  check(!/el\.h >= PAGE_H - 1/.test(rp), '옛 판정(표 높이 ≥ 종이 높이)이 남아 있지 않다')
  check(/const tableFull = isTableEl && isFull\(el, tableLimit\)/.test(rp), '새 판정을 쓴다')

  // **경고 조건과 이어 붙이는 조건이 같아야 한다.** 갈라지면
  // 「경고는 떴는데 안 이어진다」나 그 반대가 생긴다.
  // 2026-09-16 에 이 지킴이가 **제 일을 했다.** ②③ 를 통째로 넘기는 갈래를 넣으면서
  // 이 줄이 한 줄에서 블록으로 바뀌었는데, 옛 지킴이는 한 줄 모양을 글자 그대로
  // 붙잡고 있어서 바로 걸렸다. 지우지 않고 **다시 쓴다** — 지켜야 할 것은 모양이 아니라
  // 「경고 조건과 넘기는 조건이 같다」는 것이다.
  const gate = rp.slice(rp.indexOf('if (tableFull && ar + 1 >= (el.rows || 0))'))
  check(gate.startsWith('if (tableFull && ar + 1 >= (el.rows || 0))'),
    '**끝에** 더하는데 찼으면 넘긴다 — 경고와 **같은 조건**이다')
  const body = gate.slice(0, gate.indexOf('patchTable(addRow'))
  check(/spillThenAddRow\(\); return/.test(body) && /flowToNext\(\); return/.test(body),
    '그 조건 안에서 **둘 중 하나로** 갈라진다 — 통째로 넘기거나, 조각내 잇거나')
  check(!/patchTable\(addRow/.test(body), '갈라진 뒤에는 그냥 줄을 더하는 길로 안 샌다')
  check(/continueTable\(page\.id, el\.id, headLocked\)/.test(rp), '창고의 이어 붙이기를 부른다')

  // 숫자를 말해 준다.
  check(/이 장은 <b>\{tableCap\}줄<\/b>까지 들어가요/.test(rp),
    '차기 **전에도** 몇 줄까지인지 말해 준다 — 「찼다」만 알면 다 쓰고 나서야 안다')
  check(/이 장은 <b>\{tableCap\}줄<\/b>까지예요/.test(rp), '찼을 때도 숫자로 말한다')

  // 저절로 되는 일이라 되돌릴 길이 있어야 한다.
  check(/undoContinue\(\)/.test(rp), '되돌릴 수 있다')
  // **되돌리기 줄을 참/거짓 하나로 들면 안 된다.** 실물에서 걸렸다 —
  // 이어 적으면서 새 조각을 고르게 되는데, 그 선택 바뀜이 「다른 것을 골랐다」로
  // 읽혀 방금 켠 줄을 그 자리에서 껐다. 조각 **id** 로 들면 그 다툼이 없다.
  check(/flowedEl != null && flowedEl === selElId/.test(rp),
    '되돌리기 줄은 **그 조각을 보고 있을 때만** 뜬다 (참/거짓 한 개로 들지 않는다)')
  check(!/setJustFlowed/.test(rp), '참/거짓 방식이 남아 있지 않다')
  check(/setFlowedEl\(made\.elId\)/.test(rp), '이어 적어 만든 조각의 id 를 적어 둔다')
  check(/setOpenSec\(\(o\) => \(o\.row \? o : \{ \.\.\.o, row: true \}\)\)/.test(rp),
    '「행」 묶음을 펴 준다 — 접혀 있으면 방금 알린 줄이 그 뒤에 숨는다')
  // 그 조각에 뭔가 쓰기 시작하면 되돌리기는 사라져야 한다.
  const pt = rp.slice(rp.indexOf('function patchTable'), rp.indexOf('function patchTable') + 300)
  check(/setFlowedEl\(null\)/.test(pt),
    '조각을 고치기 시작하면 되돌리기 줄이 사라진다 — 그동안 쓴 것까지 날리면 안 된다')

  // **가운데 끼우기는 안 건드린다.** 되흐름은 이 설계의 밖이다(tableFlow.ts).
  const upBtn = rp.slice(rp.indexOf('↑ 위에 추가') - 400, rp.indexOf('↑ 위에 추가'))
  check(!/flowToNext/.test(upBtn),
    '「위에 추가」는 그대로다 — 되흐름(뒤 줄을 다음 장으로 밀기)은 안 한다')
}

// ── 7-2. **골라 준 것이 지워지지 않는다** ────────
//
// 실물에서만 보인 것. 이어 적으면서 새 조각을 골라 줬는데 오른쪽 패널이 쪽 모드로
// 남고 되돌리기 줄이 아예 안 떴다. 범인은 「쪽이 바뀌면 선택을 비운다」는 효과였다 —
// `continueTable` 이 보는 쪽을 새 쪽으로 바꾸므로 그 효과가 곧바로 지웠다.
// **「유령 선택」은 「쪽이 바뀌었다」가 아니라 「이 쪽에 없다」여야 한다.**
{
  const uc = bare(read('./src/builder/useCanvasCommands.ts'))
  check(!/useEffect\(\(\) => \{ setSel\(null\) \}, \[selId, setSel\]\)/.test(uc),
    '「쪽이 바뀌면 무조건 비운다」가 남아 있지 않다')
  check(/if \(page && page\.els\.some\(\(e\) => e\.id === selEl\)\) return/.test(uc),
    '고른 것이 **이 쪽에 있으면** 그대로 둔다')
  check(/if \(selEl == null\) return/.test(uc),
    '이미 비어 있으면 아무것도 안 한다 — 안 그러면 스스로를 다시 부른다')
}

// ── 8. 창고가 되돌릴 것을 들고 있다 ─────────────
{
  const st = bare(read('./src/state/store.ts'))
  check(/lastCont = \{ pages: s\.pages, selectedPageId: s\.selectedPageId \}/.test(st),
    '이어 붙이기 **전**을 적어 둔다')
  check(/undoContinue: \(\)/.test(st), '되돌리기가 있다')
  check(/lastCont = null/.test(st), '한 번 되돌리면 비운다 — 두 번 누르면 엉뚱한 것이 돌아온다')
  check(/return \{ pages: back\.pages, selectedPageId: back\.selectedPageId \}/.test(st),
    '보던 쪽도 함께 되돌린다 — 쪽만 지우면 없는 쪽을 보고 있게 된다')
}

// ── 9. **조각이라고 종이 위에 말해 준다** ────────
//
// 조각은 머리글을 다시 달고 있어서 그냥 보면 새 표처럼 보인다.
// 그러면 2쪽만 펼친 사람이 앞 장을 안 찾아보고 같은 내용을 또 적는다.
{
  const fl = bare(read('./src/canvas/FreeLayer.tsx'))
  check(/el\.type === 'table' && isContinuation\(el\)/.test(fl), '조각일 때만 띠를 그린다')
  check(/앞 장에서 이어짐/.test(fl), '무엇인지 글자로 말한다')
  check(/\{\(el\.contFrom \|\| 0\) \+ 1\}줄부터/.test(fl), '몇 줄부터인지도 말한다')

  const css = bare(read('./src/builder/chrome.css'))
  const i = css.indexOf('.tbl-cont{')
  const rule = i < 0 ? '' : css.slice(i, css.indexOf('}', i) + 1)
  check(!!rule, '그 띠의 모양이 있다')
  check(/top: Math\.max\(0, el\.y - 16\)/.test(fl),
    '표 **밖 위쪽**에 붙인다 — 안에 넣으면 칸 하나를 잡아먹어 취합이 열 수를 잘못 센다')
  // 왼쪽 위는 요소 도구막대가 뜨는 자리다 — 거기 두면 표를 고르는 순간 글자가 가린다.
  check(/left: el\.x \+ el\.w/.test(fl) && /transform:translateX\(-100%\)/.test(css),
    '**오른쪽 끝**에 붙인다 — 왼쪽 위는 요소 도구막대 자리다')
  // **요소 밖에 그린다.** `.fel` 은 overflow:hidden 이라 안에 두면 통째로 잘린다.
  // 실물에서 그렇게 나왔다 — DOM 에는 있는데 화면에는 없었다.
  const idx = bare(read('./src/index.css'))
  // `.freelayer.passthru .fel{...}` 도 같은 글자로 걸린다 — **줄 맨 앞의** 규칙만 본다.
  const felRule = (idx.split('\n').find((l) => l.startsWith('.fel{')) || '')
  check(/overflow:hidden/.test(felRule), '(사전) `.fel` 이 넘치는 것을 자른다 — 그래서 안에 두면 안 된다', felRule.slice(0,40))
  check(!/className="tbl-cont"[\s\S]{0,200}feltable/.test(fl) && /key=\{'cont' \+ el\.id\}/.test(fl),
    '띠를 요소 **밖**에 그린다 (요소 안에 두면 잘려서 화면에 안 보인다)')
  check(/pointer-events:none/.test(rule), '띠가 표 조작을 가로채지 않는다')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
