// **쓰다가 ②③ 가 넘치면 통째로 다음 쪽으로.**
//
// 2026-09-16 · 사용자 판단 **ㄴ** — 「②③ 를 통째로 넘긴다」, 줄을 쪼개 잇지 않는다.
//
// 처음 만들 때는 이미 그렇게 됩니다(server/template_seed.build_template_pages).
// 모자랐던 건 **편집 중**이었습니다. 한 쪽짜리 양식에서 ② 에 줄을 계속 더하면
// 예전에는 ② 만 조각나 다음 쪽으로 가고 ③ 은 1쪽에 남았습니다 — 읽는 사람이
// 같은 표를 두 쪽에서 찾아야 합니다.
//
// 이 검사가 지키는 것
//   · ①과 같은 쪽일 때만 통째로 넘긴다 (②③ 만 있는 쪽에서 또 넘치면 조각내 잇는다)
//   · ②와 ③이 **함께** 간다 — 하나만 가면 안 된다
//   · 이름표도 따라간다 — 표만 가면 「② 진행 현황」이라는 글자가 1쪽에 남는다
//   · 꼬리말은 양쪽 다 제자리로 — 1쪽은 로드맵 밑, 2쪽은 덩어리 밑
//   · 자리는 **문서에서 읽는다** — 서버 상수를 베껴 적지 않는다
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs list_spill.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const { planListSpill, canSpillListBlock, isListSlot, placeFoot, FALLBACK_FOOT_GAP } =
  await import('./src/canvas/listSpill.ts')
const rp = bare(read('./src/builder/chrome/RightPanel.tsx'))
const st = bare(read('./src/state/store.ts'))

// 실제 양식과 같은 모양의 한 쪽. 로드맵 윗변 94, ②③ 는 그보다 한참 아래.
const el = (o) => ({ id: o.id, type: o.type || 'text', slot: o.slot, x: o.x ?? 24, y: o.y,
  w: o.w ?? 400, h: o.h, text: '', color: '', fs: 12, rows: o.rows, cols: o.cols })
const onePage = () => [
  el({ id: 1, slot: 'head', y: 24, h: 32 }),
  el({ id: 2, slot: 'SLOT-A', y: 72, h: 18 }),                                  // ① 이름표
  el({ id: 3, slot: 'SLOT-A', type: 'table', y: 94, h: 280, rows: 7, cols: 18 }),
  el({ id: 4, slot: 'SLOT-B', y: 394, h: 18 }),                                 // ② 이름표
  el({ id: 5, slot: 'SLOT-B', type: 'table', y: 416, h: 160, rows: 5, cols: 2 }),
  el({ id: 6, slot: 'SLOT-C', y: 394, h: 18 }),                                 // ③ 이름표
  el({ id: 7, slot: 'SLOT-C', type: 'table', y: 416, h: 160, rows: 5, cols: 1 }),
  el({ id: 8, slot: 'foot', y: 594, h: 14 }),
]

// ── ① 언제 통째로 넘기는가 ────────────────────────
{
  check(canSpillListBlock(onePage()) === true, '①과 ②③ 가 한 쪽에 있으면 통째로 넘길 수 있다')
  const listOnly = onePage().filter((e) => e.slot !== 'SLOT-A')
  check(canSpillListBlock(listOnly) === false,
    '**②③ 만 있는 쪽에서는 안 넘긴다** — 거기서 또 넘치면 조각내 잇는다')
  const roadmapOnly = onePage().filter((e) => !isListSlot(e.slot))
  check(canSpillListBlock(roadmapOnly) === false, '①만 있는 쪽도 넘길 게 없다')
  check(isListSlot('SLOT-B') && isListSlot('SLOT-C'), '②③ 가 덩어리다')
  check(!isListSlot('SLOT-A') && !isListSlot('foot') && !isListSlot(undefined),
    '①·꼬리말은 덩어리가 아니다')
}

// ── ② 둘이 **함께** 간다 ──────────────────────────
{
  const p = planListSpill(onePage())
  check(!!p, '계획이 나온다')
  const ids = p.move.map((e) => e.id).sort((a, b) => a - b)
  check(JSON.stringify(ids) === '[4,5,6,7]',
    '**② 와 ③ 이, 이름표까지 넷이 함께 간다**', JSON.stringify(ids))
  const stayIds = p.stay.map((e) => e.id).sort((a, b) => a - b)
  check(JSON.stringify(stayIds) === '[1,2,3,8]', '①과 머리글·꼬리말은 남는다', JSON.stringify(stayIds))
  check(p.stay.length + p.move.length === onePage().length, '잃어버린 요소가 없다')
}

// ── ③ 어디에 앉는가 — **문서에서 읽는다** ─────────────
// 2쪽 배치에서 ②③ 표의 윗변은 로드맵 표의 윗변과 같은 높이다(BLOCK_Y = ROADMAP_Y).
// 서버 상수를 여기에 베껴 적지 않고, ① 의 윗변에 맞춘다.
{
  const p = planListSpill(onePage())
  const tb = p.move.filter((e) => e.type === 'table')
  check(tb.every((e) => e.y === 94), '②③ 표가 ① 표와 **같은 높이**로 올라간다',
    JSON.stringify(tb.map((e) => e.y)))
  check(p.dy === 416 - 94, '올라간 만큼이 맞다', String(p.dy))
  const labels = p.move.filter((e) => e.type !== 'table')
  check(labels.every((e) => e.y === 394 - p.dy),
    '이름표도 **같이** 올라간다 — 표와의 간격이 그대로다', JSON.stringify(labels.map((e) => e.y)))
}

// ── ④ 꼬리말은 양쪽 다 제자리 ─────────────────────
{
  const p = planListSpill(onePage())
  // 원래 간격: 꼬리말 594 − 덩어리 아래끝 576 = 18
  const foot1 = p.stay.find((e) => e.slot === 'foot')
  check(foot1.y === 94 + 280 + 18,
    '1쪽 꼬리말이 **로드맵 바로 밑으로 당겨 올라간다** — 안 그러면 종이 아래에 홀로 남는다',
    String(foot1.y))
  check(p.gap === 18, '덩어리와 꼬리말 사이를 **재서** 쓴다', String(p.gap))
  // 간격은 재서 쓴다. 문서가 20px 을 쓰면 20px 이 따라와야 한다.
  const wide = onePage().map((e) => (e.slot === 'foot' ? { ...e, y: 596 } : e))
  check(planListSpill(wide).gap === 20, '문서가 쓰는 간격을 그대로 쓴다(20px)')
  // 꼬리말이 아예 없으면 기본값으로.
  const noFoot = onePage().filter((e) => e.slot !== 'foot')
  check(planListSpill(noFoot).gap === FALLBACK_FOOT_GAP, '꼬리말이 없으면 기본 간격을 쓴다')
}

// ── ④-2 **줄을 더한 뒤에도** 꼬리말이 표 속에 안 파묻힌다 ──
//
// 2026-09-16 · 옮긴 쪽을 **사진으로 보고** 알았다. 여기까지의 검사는 전부 통과하고
// 있었다 — 옮기는 것까지만 재고, 그 다음에 줄이 하나 더 들어가는 것을 안 쟀다.
// 옮긴 직후 한 줄이 더해지면 표가 그만큼 자라는데 꼬리말은 제자리에 있어서,
// 꼬리말 글자가 **표 한가운데에 찍혀** 있었다.
{
  const p = planListSpill(onePage())
  const foot = { ...onePage().find((e) => e.slot === 'foot') }
  // 옮긴 **직후**의 새 쪽 — 꼬리말은 덩어리 바로 밑에 잘 앉아 있다.
  const fresh = placeFoot([...p.move, foot], p.gap)
  const freshBottom = Math.max(...p.move.map((e) => e.y + e.h))
  check(fresh.find((e) => e.slot === 'foot').y === freshBottom + p.gap,
    '옮긴 직후에는 꼬리말이 제자리다')
  // 그 다음 줄이 하나 더해진다 — 표가 그만큼 자란다.
  const before = fresh.map((e) => (e.type === 'table' && e.slot === 'SLOT-B'
    ? { ...e, h: e.h + 32, rows: (e.rows || 0) + 1 } : e))
  const grown = before.filter((e) => e.slot !== 'foot')
  const buried = before.find((e) => e.slot === 'foot')
  const tallBottom = Math.max(...grown.map((e) => e.y + e.h))
  check(buried.y < tallBottom, '(전제) 그냥 두면 꼬리말이 표 안에 들어간다', buried.y + ' < ' + tallBottom)

  const after = placeFoot(before, p.gap)
  const moved = after.find((e) => e.slot === 'foot')
  check(moved.y === tallBottom + p.gap, '**다시 앉히면 표 바로 밑으로 내려간다**', String(moved.y))
  check(after.filter((e) => e.slot !== 'foot').every((e, i) =>
    e.y === before.filter((x) => x.slot !== 'foot')[i].y), '꼬리말 말고는 아무것도 안 움직인다')
  // **양식 덩어리만 센다.** 처음 쓴 지킴이는 「머리글은 빼고 센다」였는데, 일부러
  // 머리글을 세게 바꿔 봐도 40/40 이 그대로였다 — 머리글은 늘 맨 위라 답이 같다.
  // 아무 일도 안 하는 지킴이였다. 진짜 지켜야 할 것은 이쪽이다.
  const doodle = { ...onePage()[0], id: 99, slot: undefined, y: 640, h: 60 }
  const withDoodle = placeFoot([...before, doodle], p.gap)
  check(withDoodle.find((e) => e.slot === 'foot').y === tallBottom + p.gap,
    '**끌어다 놓은 도형은 꼬리말을 안 끌고 간다** — 세면 꼬리말이 종이 밖으로 밀린다',
    String(withDoodle.find((e) => e.slot === 'foot').y))
  const withHead = placeFoot([{ ...onePage()[0] }, ...before], p.gap)
  check(withHead.find((e) => e.slot === 'foot').y === tallBottom + p.gap, '머리글도 안 센다')
  check(placeFoot([foot], p.gap)[0].y === foot.y, '잴 게 없으면 그대로 둔다')
}

// ── ⑤ 원본을 건드리지 않는다 ──────────────────────
// 되돌리기가 **옮기기 전 모습**을 그대로 들고 있어야 한다.
{
  const src = onePage()
  const before = JSON.stringify(src)
  planListSpill(src)
  check(JSON.stringify(src) === before, '계획을 세워도 원본은 그대로다')
}

// ── ⑥ 헛돌지 않는다 ──────────────────────────────
{
  check(planListSpill(onePage().filter((e) => e.slot !== 'SLOT-A')) === null, '① 이 없으면 계획이 없다')
  check(planListSpill(onePage().filter((e) => !isListSlot(e.slot))) === null, '②③ 가 없으면 계획이 없다')
  // 이미 ① 과 같은 높이면 옮겨 봐야 제자리다 — 빈 쪽만 하나 늘어난다.
  const already = onePage().map((e) => (isListSlot(e.slot) ? { ...e, y: e.y - 322 } : e))
  check(planListSpill(already) === null, '**이미 그 높이면 안 옮긴다** — 빈 쪽만 생긴다')
}

// ── ⑦ 창고와 화면이 이 길을 쓴다 ───────────────────
{
  check(/spillListBlock: \(pageId\) =>/.test(st), '창고에 통째로 넘기는 길이 있다')
  check(/planListSpill\(src\.els\)/.test(st), '자리 계산은 순수 함수가 한다 — 창고에서 다시 재지 않는다')
  const sp = st.slice(st.indexOf('spillListBlock: (pageId)'), st.indexOf('updateEl: (pageId, elId, patch)'))
  // 2026-09-16 · ⑥ 을 고치면서 한 칸짜리 `lastCont` 를 **문서 단위 이력으로 합쳤다.**
  // 두 벌을 따로 두면 인라인 단추로 한 번, ⌘Z 로 또 한 번, 같은 일이 두 번 되돌아간다.
  // 지킴이도 새 길을 보도록 다시 쓴다 — 지켜야 할 것은 「되돌릴 길이 남는다」이다.
  check(/pushDocSnap\(docSnap\(s\.pages, s\.selectedPageId\)\)/.test(sp),
    '**되돌릴 것을 남긴다** — 저절로 일어나는 일이라 되돌릴 길이 없으면 안 된다')
  check(!/lastCont/.test(st), '되돌릴 길이 **한 벌**이다 — 두 벌이면 같은 일이 두 번 되돌아간다')
  check(/e\.slot === 'head'/.test(sp) && /slot === 'foot'/.test(sp),
    '머리글·꼬리말을 새 쪽에도 붙인다 — 2쪽만 열어 본 사람도 누구 자료인지 알아야 한다')
  check(/pages\[i\] = \{ \.\.\.src, els: plan\.stay \}/.test(sp), '원래 쪽에서는 덜어 낸다')
  check(/placeFoot\(\[\.\.\.heads, \.\.\.plan\.move, \.\.\.foots\], plan\.gap\)/.test(sp),
    '새 쪽의 꼬리말 자리도 **같은 함수**가 정한다 — 두 군데서 정하면 갈라진다')
  check(/settleFoot: \(pageId, gap\) => set/.test(st), '꼬리말을 다시 앉히는 길이 있다')

  check(/if \(canSpill\) \{ spillThenAddRow\(\); return \}/.test(rp),
    '「↓ 아래 추가」가 찼을 때 통째로 넘긴다')
  check(/isListSlot\(el\.slot\) && canSpillListBlock\(page\.els\)/.test(rp),
    '②③ 이면서 ①과 같은 쪽일 때만이다')
  // 옮긴 **뒤에** 줄을 더해야 한다. 옛 page 를 그대로 쓰면 빈 쪽에 줄이 들어간다.
  const fn = rp.slice(rp.indexOf('function spillThenAddRow'), rp.indexOf('function flowToNext'))
  check(/useBuilder\.getState\(\)\.pages\.find\(\(p\) => p\.id === made\.pageId\)/.test(fn),
    '**옮겨 간 쪽을 다시 읽는다** — 옛 page 를 쓰면 빈 쪽에 줄을 더한다')
  check(/if \(isFull\(moved, tableLimit\)\) \{ continueTable/.test(fn),
    '옮겨도 모자라면 그때는 조각내 잇는다')
  check(/settleFoot\(made\.pageId, made\.gap\)/.test(fn),
    '**줄을 더한 뒤 꼬리말을 다시 앉힌다** — 안 하면 꼬리말이 표 속에 파묻힌다')
  check(/setFlowedSpill\(true\)/.test(fn), '방금 한 일이 통째로 넘기기였다고 기억한다')
  check(/flowedSpill$[\s\S]{0,160}통째로 다음 장으로 옮겼어요/m.test(rp) ||
        /flowedSpill\s*\n?\s*\?\s*'②③ 를 통째로 다음 장으로 옮겼어요/.test(rp),
    '안내도 「이어 적는다」가 아니라 「통째로 옮겼다」로 말한다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
