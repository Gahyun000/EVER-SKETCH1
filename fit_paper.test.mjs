// 방향을 바꿀 때 **종이 밖으로 나간 요소를 안으로 끌어들인다** (사용자 결정 ㄴ + 알림 한 줄).
//
// **무엇이 문제였나.** 방향을 바꾸면 종이 크기만 바뀌고 **요소 좌표는 그대로**다.
// 가로(1040×720)에서 만든 것을 세로(432×576)로 바꾸면 오른쪽 것들이 종이 밖에 남는다.
// 화면에서는 잘려서 안 보이니, **내보내고 나서야 없어진 걸 안다.**
//
// **왜 「비율대로 다시 배치」가 아닌가.** 그림은 그쪽이 곱다. 그런데 사람이 맞춰 둔 자리가
// **전부** 바뀐다 — 안 나간 것까지. 방향 한 번 눌렀다고 공들인 배치가 통째로 흐트러지면
// 고쳐 준 게 아니라 망가뜨린 것이다. 그래서 **나간 것만** 민다.
//
// 이 검사가 지키는 것은 셋이다.
//   ㉠ 안 나간 것은 **손도 대지 않는다** (같은 객체 그대로)
//   ㉡ 나간 것은 종이 안에 들어온다 — 그리고 **크기는 안 줄인다**
//   ㉢ 옮겼으면 **말을 한다**, 그리고 그 말은 되돌릴 수 있다
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs fit_paper.test.mjs

import { readFileSync } from 'node:fs'
import { fitPagesToPaper } from './src/canvas/fitPaper.ts'

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

const LAND = [1040, 720], PORT = [432, 576]
const el = (id, x, y, w = 180, h = 60) => ({ id, type: 'round', x, y, w, h, text: '' })
const page = (id, els) => ({ id, cardKey: 'note', fields: {}, free: true, els, conns: [], strokes: [] })

// ── 1. 안 나간 것은 손도 안 댄다 ───────────────────
//
// 새 객체를 만들면 리액트가 「바뀌었다」고 보고 다시 그리고,
// 이력에도 안 바뀐 것이 바뀐 것처럼 쌓인다.
{
  const inside = el(1, 10, 10)
  const p = page(1, [inside])
  const r = fitPagesToPaper([p], ...PORT)
  check(r.moved === 0, '다 안에 있으면 옮긴 것이 0이다', String(r.moved))
  check(r.pages[0] === p, '쪽 객체가 **그대로**다')
  check(r.pages[0].els[0] === inside, '요소 객체도 그대로다')
}
{
  // 한 쪽만 나갔으면 **나머지 쪽은** 그대로여야 한다.
  const clean = page(1, [el(1, 10, 10)])
  const dirty = page(2, [el(2, 900, 10)])
  const r = fitPagesToPaper([clean, dirty], ...PORT)
  check(r.pages[0] === clean, '안 나간 쪽은 건드리지 않는다 (한 쪽이 나갔어도)')
  check(r.pages[1] !== dirty, '나간 쪽만 새로 만든다')
}

// ── 2. 나간 것이 안으로 들어온다 ───────────────────
{
  const [W, H] = PORT
  const out = [el(1, 900, 10), el(2, 10, 700), el(3, -40, -30)]
  const r = fitPagesToPaper([page(1, out)], W, H)
  check(r.moved === 3, '나간 셋을 모두 옮겼다', String(r.moved))
  for (const e of r.pages[0].els) {
    check(e.x >= 0 && e.y >= 0 && e.x + e.w <= W && e.y + e.h <= H,
      `요소 ${e.id} 가 종이 안에 들어왔다`, JSON.stringify({ x: e.x, y: e.y }))
  }
  // **오른쪽·아래 가장자리에 붙인다** — 가운데로 몰면 원래 배치와 더 멀어진다.
  const a = r.pages[0].els[0]
  check(a.x === W - a.w, '오른쪽으로 나간 것은 오른쪽 가장자리에 붙는다', String(a.x))
  const b = r.pages[0].els[1]
  check(b.y === H - b.h, '아래로 나간 것은 아래 가장자리에 붙는다', String(b.y))
  // 나간 축만 건드린다.
  check(a.y === 10, '세로로는 안 나갔으므로 세로 좌표는 그대로다', String(a.y))
}

// ── 3. 크기는 **안 줄인다** ────────────────────────
//
// 요소가 종이보다 크면 왼쪽 위에 맞춘다. 줄이면 표의 칸 너비 같은 것이 같이 망가진다.
{
  const big = el(1, 300, 300, 900, 800)
  const r = fitPagesToPaper([page(1, [big])], ...PORT)
  const g = r.pages[0].els[0]
  check(g.w === 900 && g.h === 800, '종이보다 큰 것도 **줄이지 않는다**', `${g.w}×${g.h}`)
  check(g.x === 0 && g.y === 0, '대신 왼쪽 위에 맞춘다', `${g.x},${g.y}`)
}

// ── 4. 빈 쪽·망가진 쪽에서 안 터진다 ───────────────
//
// 이 함수는 방향 단추 하나에 **모든 쪽**을 훑는다. 한 쪽이 이상하다고
// 화면이 하얘지면 안 된다 — 2026-09-13 에 바로 그 일을 겪었다.
{
  const odd = [page(1, []), { id: 2, els: null }, null, page(4, [null, el(5, 900, 10)])]
  let r
  try { r = fitPagesToPaper(odd, ...PORT) } catch (e) { r = { err: e.message } }
  check(!r.err, 'els 가 없거나 쪽이 비어 있어도 안 터진다', r.err || '')
  check(r.moved === 1, '성한 것 하나만 옮겼다', String(r.moved))
}

// ── 5. 가로로 되돌리면 되돌아오지 **않는다** ───────
//
// 끌어들이는 것은 한 방향이다. 세로에서 민 것을 가로로 바꾼다고 제자리로 못 간다 —
// 어디 있었는지 함수는 모른다. 그래서 **되돌리기가 따로 있어야 한다**(§6).
{
  const p = page(1, [el(1, 900, 10)])
  const once = fitPagesToPaper([p], ...PORT)
  const back = fitPagesToPaper(once.pages, ...LAND)
  check(back.moved === 0 && back.pages[0].els[0].x === PORT[0] - 180,
    '가로로 되돌려도 제자리로 안 돌아온다 — 그래서 되돌리기가 필요하다',
    String(back.pages[0].els[0].x))
}

// ── 6. 창고가 실제로 이 규칙대로 이어져 있다 ───────
{
  const st = bare(read('./src/state/store.ts'))
  check(/fitPagesToPaper\(s\.pages, W, H\)/.test(st), '방향을 바꿀 때 실제로 부른다')
  check(/lastFit = \{ pages: s\.pages, orientation: s\.orientation \}/.test(st),
    '옮기기 **전** 쪽을 들고 있는다 — 되돌리기가 볼 것')
  check(/if \(moved\)/.test(st), '안 옮겼으면 아무것도 안 들고 있는다 (거짓 되돌리기 방지)')
  check(/ebook:fitted/.test(st), '옮겼다고 화면에 알린다')
  check(/undoFit: \(\)/.test(st), '되돌리기가 있다')
  check(/lastFit = null/.test(st), '한 번 되돌리면 비운다 — 두 번 누르면 엉뚱한 것이 돌아온다')
  check(/return \{ pages: back\.pages, orientation: back\.orientation \}/.test(st),
    '**방향도 같이** 되돌린다 — 쪽만 돌리면 또 밖으로 나간 채로 남는다')
  check(!/setOrientation\(back/.test(st),
    '되돌릴 때 setOrientation 을 거치지 않는다 — 거치면 그 자리에서 또 끌어들인다')
}

// ── 7. 알림 한 줄 ─────────────────────────────────
{
  const ly = bare(read('./src/builder/Layout.tsx'))
  check(/addEventListener\('ebook:fitted'/.test(ly), '화면이 그 알림을 듣는다')
  check(/removeEventListener\('ebook:fitted'/.test(ly), '떠날 때 귀를 뗀다')
  check(/<FitToast \/>/.test(ly), '실제로 그려진다 — 만들어만 두면 아무도 못 본다')
  check(/undoFit\(\)/.test(ly), '되돌리기 단추가 창고를 부른다')
  check(/setTimeout\(\(\) => setMoved\(0\), 10_000\)/.test(ly), '10초 뒤 저절로 사라진다')
  check(/role="status"/.test(ly), '읽어 주는 화면에도 들린다 (role=status)')
  // 묶음이 flex(gap:10px)다. 문장을 맨몸으로 두면 「요소 / 3개 / 를 …」 로 벌어진다 —
  // 2026-09-14 실물 확인에서 실제로 그렇게 나왔다.
  check(/<span>요소 <b>\{moved\}개<\/b>를/.test(ly),
    '문장이 **한 덩어리**다 — flex 틈이 글자 사이를 벌리지 않는다')

  // **확인창을 가리지 않는다.** modal_shell 검사가 같은 규칙을 넓게 지키지만,
  // 여기서도 한 번 못박는다 — 이 줄을 만든 것이 이 작업이기 때문이다.
  const css = bare(read('./src/builder/chrome.css'))
  const i = css.indexOf('.fit-toast{')
  const rule = i < 0 ? '' : css.slice(i, css.indexOf('}', i) + 1)
  const z = Number((/z-index:\s*(\d+)/.exec(rule) || [])[1])
  check(z > 0 && z < 4200, '알림이 확인창(4200) **아래**에 있다', String(z))
  check(z < 4000, '전체 덮개(4000) 아래이기도 하다 — 남은 알림이 결재함 위에 뜨면 안 된다', String(z))
  check(z > 121, '그래도 편집기 안 것들(최대 121)보다는 위다', String(z))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
