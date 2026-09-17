// 트리 · 머메이드 — **글로 뼈대를 잡고 요소로 펼친다** (사용자 결정 가-ㄷ · 나-둘 다).
//
// **왜 만드나.** 마인드맵은 방사형이고 깊이가 한 단계다. PM 의 일(기획→설계→개발→검수,
// 그 아래 산출물)은 **순서와 깊이**가 있어서 방사형에 안 들어간다. 실제로 마인드맵 가지를
// 손으로 끌어다 트리 모양을 만들어 쓰고 계셨다 — 도구가 안 도와준 것이다.
//
// **왜 렌더가 아니라 파서인가.** 머메이드 라이브러리로 그리면 결과가 SVG 한 덩어리다.
// 그러면 상자 하나를 못 잡는다 — 마인드맵을 카드에서 요소로 바꾼 이유가 그것이었다.
// 그래서 머메이드는 **입력 형식**으로만 쓰고, 읽어서 상자와 선으로 펼친다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs tree_mermaid.test.mjs

import { readFileSync } from 'node:fs'
import { parseMermaid, toMermaid } from './src/cards/mermaid.ts'
import {
  treeParts, treeSlots, treeCapacity, treeSteps, treeFits, bestDir, relayoutTree, isTreePage,
  NODE_W, NODE_H, LR_COL, LR_ROW, TD_COL, TD_ROW, PAD_X, PAD_TOP,
} from './src/cards/treeEls.ts'

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
const ids = () => { let i = 1; return () => i++ }
const SAMPLE = `graph LR
  A[기획] --> B[설계]
  A --> C[문제 보고]
  B --> D{안 고르기}
  D -->|채택| E[개발]
  D -->|보류| C`

// ── 1. 문법을 읽는다 ──────────────────────────────
{
  const g = parseMermaid(SAMPLE)
  check(g.dir === 'LR', '방향을 읽는다', g.dir)
  check(g.order.length === 5, '상자 다섯을 찾았다', String(g.order.length))
  check(g.nodes.A.label === '기획', '네모 라벨', g.nodes.A.label)
  check(g.nodes.D.shape === 'dec', '{ } 는 **판단**이다 — 갈림길은 모양이 달라야 한다', g.nodes.D.shape)
  check(g.edges.length === 5, '선 다섯', String(g.edges.length))
  check(g.edges.find((e) => e.to === 'E').label === '채택', '선 이름(|채택|)을 읽는다')
  check(g.errors.length === 0, '멀쩡한 글에는 오류가 없다')
}
{
  const g = parseMermaid('A(둥근)\nB{판단}\nC[네모]')
  check(g.nodes.A.shape === 'round' && g.nodes.B.shape === 'dec' && g.nodes.C.shape === 'box',
    '괄호 모양 셋이 각각 다른 상자가 된다')
  check(parseMermaid('graph TD\nA-->B').dir === 'TD', 'graph TD 를 읽는다')
  check(parseMermaid('graph TB\nA-->B').dir === 'TD', 'TB 도 위→아래로 읽는다 (가까운 쪽으로)')
  check(parseMermaid('%% 메모\nA-->B').errors.length === 0, '%% 주석은 오류가 아니다')
  check(parseMermaid('한글노드[기획] --> 다음').order.length === 2, '한글 id 도 받는다')
}

// ── 2. **못 읽은 줄을 버리지 않는다** ───────────────
//
// 조용히 무시하면 「내가 쓴 게 왜 안 나오지」가 되고, 사람은 제 오타를 못 찾는다.
{
  const g = parseMermaid('graph LR\nA --> B\n이건 뭐라고 쓴 걸까\nB ==> C')
  check(g.errors.length === 2, '못 읽은 줄 둘을 남겼다', String(g.errors.length))
  check(g.errors[0].line === 3, '**줄 번호**를 알려 준다', String(g.errors[0].line))
  check(g.errors[0].text.includes('이건 뭐라고'), '**원문 그대로** 담는다')
  check(g.order.length === 2, '못 읽은 줄 때문에 나머지가 죽지는 않는다')
}

// ── 3. 글 → 그림 → 글이 같다 ──────────────────────
//
// 되읽기는 편의 기능이면서 **파서가 제대로 읽었는지 스스로 확인하는 수단**이다.
{
  const g = parseMermaid(SAMPLE)
  const back = parseMermaid(toMermaid(g))
  check(back.order.length === g.order.length && back.edges.length === g.edges.length,
    '뽑았다가 다시 읽으면 상자·선 수가 같다')
  check(back.nodes.D.shape === 'dec' && back.nodes.D.label === '안 고르기', '모양과 라벨이 살아남는다')
  check(back.edges.find((e) => e.to === 'E').label === '채택', '선 이름도 살아남는다')
  check(back.dir === g.dir, '방향도 살아남는다')
  // 외톨이도 안 잃는다.
  const lone = parseMermaid(toMermaid(parseMermaid('A[혼자]')))
  check(lone.order.length === 1, '아무 데도 안 이어진 상자도 안 잃는다')
}

// ── 4. 트리로 앉힌다 ──────────────────────────────
{
  const g = parseMermaid(SAMPLE)
  const t = treeParts(g, ...LAND, ids(), 'LR')
  check(t.els.length === 5, '상자 다섯이 나온다')
  check(t.conns.length === 5, '선 다섯이 나온다')
  check(t.conns.every((c) => c.kind === 'ortho'), '**꺾은선**이다 — 직선은 대각선이 엇갈려 읽기 어렵다')
  check(t.conns.every((c) => c.arrow === 'end'), '화살촉이 있다 — 트리는 **방향이 있는 관계**다')
  const byText = Object.fromEntries(t.els.map((e) => [e.text, e]))
  check(byText['기획'].x < byText['설계'].x, '왼→오른: 자식이 부모보다 오른쪽')
  check(byText['설계'].x < byText['안 고르기'].x, '레벨이 깊을수록 더 오른쪽')
  check(byText['안 고르기'].type === 'diamond', '판단은 마름모로 그린다')
  // **앱이 아는 도형 이름만 쓴다.** 처음에 'rect' 라고 적었더니 화면에는 그럴듯하게
  // 그려졌지만, 그건 앱의 이름이 아니라 내보내기의 기본값에 우연히 걸린 것이었다.
  // 모르는 이름은 **되는 것처럼 보이다가** 도형 갤러리·PPTX 에서 어긋난다.
  {
    const tb = bare(read('./src/builder/chrome/EditToolbar.tsx'))
    const known = new Set((tb.match(/\{ t: '([a-zA-Z0-9]+)', label:/g) || [])
      .map((m) => m.replace(/.*'([a-zA-Z0-9]+)'.*/, '$1')))
    const used = [...new Set(t.els.map((e) => e.type))]
    check(known.size > 5, '(사전) 도형 갤러리에서 이름 목록을 읽었다', known.size + '개')
    check(used.every((u) => known.has(u)),
      '트리가 쓰는 도형이 **전부 앱이 아는 이름**이다',
      used.filter((u) => !known.has(u)).join(',') || '')
    const pp = bare(read('./src/export/exportPptx.ts'))
    check(used.every((u) => new RegExp('\\b' + u + ':').test(pp)),
      '그 이름들이 **PPTX 내보내기 표에도** 있다 — 기본값에 우연히 걸리지 않는다',
      used.filter((u) => !new RegExp('\\b' + u + ':').test(pp)).join(','))
  }
  check(t.els.every((e) => e.w === NODE_W && e.h === NODE_H), '상자 크기가 한결같다')
  check(t.rootId === byText['기획'].id, '뿌리를 알려 준다 — 「이게 트리였다」의 표시')
  // 종이 밖으로 안 나간다.
  check(t.els.every((e) => e.x >= 0 && e.y >= 0 && e.x + e.w <= LAND[0] && e.y + e.h <= LAND[1]),
    '전부 종이 안에 있다')
}
{
  // 위→아래도 된다(사용자 결정 나-둘 다).
  const g = parseMermaid(SAMPLE.replace('graph LR', 'graph TD'))
  const t = treeParts(g, ...LAND, ids())
  const byText = Object.fromEntries(t.els.map((e) => [e.text, e]))
  check(byText['기획'].y < byText['설계'].y, '위→아래: 자식이 부모보다 아래')
  check(Math.abs(byText['기획'].x - byText['설계'].x) < TD_COL * 3, '가로로는 가까이 모인다')
}

// ── 5. 부모는 자식들의 **가운데** ─────────────────
{
  const g = parseMermaid('graph LR\nA-->B\nA-->C\nA-->D')
  const { slot } = treeSlots(g)
  check(slot.A === (slot.B + slot.D) / 2, '자식 셋의 한가운데에 부모가 온다',
    `A=${slot.A} B=${slot.B} D=${slot.D}`)
}

// ── 6. **고리가 있어도 안 터진다** ────────────────
//
// 머메이드는 그물도 그릴 수 있지만 트리는 부모가 하나여야 한다.
// 되돌아오는 선은 부모로 삼지 않고 **선만** 남긴다.
{
  const g = parseMermaid('graph LR\nA-->B\nB-->C\nC-->A')
  let t
  try { t = treeParts(g, ...LAND, ids(), 'LR') } catch (e) { t = { err: e.message } }
  check(!t.err, '고리(A→B→C→A)에서 안 터진다', t.err || '')
  check(t.els.length === 3, '상자 셋 그대로')
  check(t.conns.length === 3, '**되돌아오는 선도 그린다** — 안 그리면 글과 그림이 달라진다')
  const { depth } = treeSlots(g)
  check(depth.A === 0 && depth.B === 1 && depth.C === 2, '깊이는 먼저 만난 길로 정해진다',
    JSON.stringify(depth))
}
{
  // 부모가 둘인 경우 — 먼저 만난 쪽이 부모, 나머지는 선만.
  const g = parseMermaid('graph LR\nA-->C\nB-->C')
  const { depth } = treeSlots(g)
  check(depth.C === 1, '부모가 둘이면 먼저 만난 쪽 아래에 놓인다', String(depth.C))
  const t = treeParts(g, ...LAND, ids(), 'LR')
  check(t.conns.length === 2, '둘째 선도 남는다')
}
{
  check(treeParts(parseMermaid(''), ...LAND, ids()).els.length === 0, '빈 글이면 빈 결과 — 안 터진다')
  const self = treeParts(parseMermaid('A-->A'), ...LAND, ids())
  check(self.els.length === 1 && self.conns.length === 0, '자기 자신으로 가는 선은 버린다')
}

// ── 7. 이 종이에 얼마나 들어가나 ──────────────────
//
// 재 본 값 — 화면이 이 숫자를 그대로 말해 준다.
{
  const L = treeCapacity('LR', ...LAND), T = treeCapacity('TD', ...LAND)
  check(L.levels === 5 && L.slots === 10, '가로 · 왼→오른 5레벨 × 10줄', JSON.stringify(L))
  check(T.levels === 6 && T.slots === 6, '가로 · 위→아래 6레벨 × 6칸', JSON.stringify(T))
  const P = treeCapacity('TD', ...PORT)
  check(P.slots === 2, '**세로 · 위→아래는 2칸뿐** — 그래서 화면이 말려야 한다', JSON.stringify(P))
}

// ── 7-2. **간격을 종이에 맞춰 줄인다** ────────────
//
// 상수 간격을 그대로 쓰면 잎이 많을 때 아래가 종이를 넘고, 가장자리로 잘리면서 포개진다.
// 눕히는 것(§8)으로는 안 풀리는 자리다 — 방향이 아니라 **줄 수**가 문제이기 때문이다.
{
  const many = 'graph LR\n' + Array.from({ length: 12 }, (_, i) => `  R --> N${i}[잎 ${i}]`).join('\n')
  const g = parseMermaid(many)
  const { rows } = treeSlots(g)
  check(rows === 12, '잎 열둘', String(rows))
  const step = treeSteps('LR', ...LAND, 2, rows)
  check(step.row < LR_ROW, '기본 줄 간격(56)보다 **좁혀진다**', String(Math.round(step.row)))
  check(step.row >= NODE_H + 6, '그래도 상자보다 좁게는 안 줄인다 — 그 아래는 겹친다', String(Math.round(step.row)))

  const t = treeParts(g, ...LAND, ids(), 'LR')
  check(t.els.every((e) => e.y + e.h <= LAND[1]), '열둘이 모두 **종이 안에** 들어간다')
  let worst = 0
  for (let i = 0; i < t.els.length; i++) for (let j = i + 1; j < t.els.length; j++) {
    const a = t.els[i], b = t.els[j]
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
    if (ox > 0 && oy > 0) worst = Math.max(worst, Math.min(ox, oy))
  }
  check(worst === 0, '잎이 열둘이어도 **안 겹친다**', worst + 'px')
}

// ── 8. 방향을 바꿔도 포개지지 않는다 ──────────────
//
// 자르면 오른쪽 절반이 한 줄에 쌓인다. 트리는 레벨과 줄이 곧 뜻이라 더 심하다.
{
  const g = parseMermaid(SAMPLE)
  const t = treeParts(g, ...LAND, ids(), 'LR')
  const page = { els: t.els, conns: t.conns, treeRoot: t.rootId, treeDir: 'LR' }
  const r = relayoutTree(page, ...PORT)
  check(!!r, '트리는 다시 앉힌다')
  const after = r.els
  let worst = 0
  for (let i = 0; i < after.length; i++) for (let j = i + 1; j < after.length; j++) {
    const a = after[i], b = after[j]
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
    if (ox > 0 && oy > 0) worst = Math.max(worst, Math.min(ox, oy))
  }
  check(worst === 0, '세로로 바꿔도 **아무것도 안 겹친다**', worst + 'px')
  check(after.every((e) => e.x >= 0 && e.x + e.w <= PORT[0]), '종이 밖으로도 안 나간다')
  // **안 들어가면 눕힌다.** 세로에 왼→오른 4레벨은 물리적으로 안 들어간다 —
  // 그대로 앉히면 3레벨째부터 통째로 포개진다(측정 38px = 상자 높이 그대로).
  check(r.dir === 'TD', '세로 종이에서는 **위→아래로 눕혔다**', r.dir)
  check(treeFits('TD', ...PORT, 4, 2) && !treeFits('LR', ...PORT, 4, 2),
    '(근거) 세로에서 4레벨은 왼→오른으로 안 들어가고 위→아래로는 들어간다')
}
{
  // 트리가 아니면 건드리지 않는다.
  check(bestDir('LR', ...LAND, 4, 2) === 'LR', '가로에서는 원하신 방향을 그대로 둔다')
  check(bestDir('LR', ...PORT, 12, 2) === 'LR',
    '둘 다 안 들어가면 원하신 방향 그대로 — **말없이 망가뜨리지 않고 화면이 넘친다고 말한다**')
  check(relayoutTree({ els: [{ id: 1, x: 0, y: 0, w: 10, h: 10 }], conns: [] }, ...PORT) === null,
    'treeRoot 가 없으면 null — 부르는 쪽이 평소대로 자른다')
  const g = parseMermaid('A-->B')
  const t = treeParts(g, ...LAND, ids(), 'LR')
  check(relayoutTree({ els: t.els, conns: t.conns, treeRoot: 999 }, ...PORT) === null,
    '뿌리를 지운 쪽도 null')
  // 트리 밖의 상자는 그대로 둔다.
  const memo = { id: 900, type: 'round', x: 900, y: 40, w: 120, h: 40, text: '메모' }
  const out = relayoutTree({ els: [...t.els, memo], conns: t.conns, treeRoot: t.rootId, treeDir: 'LR' }, ...PORT)
  check(out.els.find((e) => e.id === 900) === memo, '선으로 안 이어진 상자는 **그대로 둔다**')
}

// ── 9. 화면·창고에 실제로 이어졌는가 ──────────────
{
  const st = bare(read('./src/state/store.ts'))
  check(/if \(cardKey === 'tree'\)/.test(st), '창고가 트리를 가로챈다 — 카드가 아니라 **펼침**이다')
  // 2026-09-15: 여기 있던 「한 줄 그대로」 검사가 `treeRoots` 를 끼우면서 깨졌다.
  // 지키려던 규칙은 「무엇을 적어 두는가」이지 「어떤 순서로 적는가」가 아니다 —
  // 지우지 말고 **규칙 쪽으로** 다시 쓴다. 뿌리 목록이 는 것도 여기서 같이 지킨다.
  check(/treeRoot: rootId/.test(st) && /treeDir: laid\.dir/.test(st) && /treeSrc: src/.test(st),
    '뿌리·**실제로 앉힌 방향**·머메이드 원문을 쪽에 적어 둔다 (원하신 방향이 아니라 앉힌 방향)')
  check(/const rs = roots\.length \? roots : \[rootId\]/.test(st) && /treeRoots: rs/.test(st),
    '**뿌리를 전부** 적어 둔다 — 글에 줄기를 둘 쓰면 부모 없는 상자가 둘이다(①ㄹ)')
  check(/const laid = layoutTree\(els, conns, W, H, dir, rs\)/.test(st),
    '**처음 펼칠 때부터 접어 넣는다**(③) — 깊은 그림은 아래 띠로 이어 그린다')
  check(/free: true/.test(st.slice(st.indexOf("cardKey === 'tree'"), st.indexOf("cardKey === 'tree'") + 700)),
    '자유 캔버스로 만든다 — 상자를 하나씩 잡을 수 있어야 한다')

  const fp = bare(read('./src/canvas/fitPaper.ts'))
  // 2026-09-15: 2단계에서 `relayoutTree` → `layoutTree` 로 갈아탔다. 접어 넣기 때문에
  // **상자 수가 달라져서** 옛 길(같은 자리끼리 견주기)로는 셈이 안 맞는다.
  check(/layoutTree\(p\.els, p\.conns, W, H/.test(fp), '방향을 바꿀 때 트리도 다시 앉힌다')
  check(/treeDir: laid\.dir/.test(fp),
    '눕혔으면 **그 사실을 쪽에 적는다** — 안 적으면 다음에 옛 방향으로 되읽어 레벨이 밀린다')
  check(/isTreePage\(p\)/.test(fp), '트리인지는 **쪽에 적힌 명단**으로 가른다 — 마인드맵과 섞이지 않게')

  const cp = bare(read('./src/builder/CardPicker.tsx'))
  // **2026-09-17 에 다시 썼다 — 지운 게 아니다.**
  // 이 줄은 `setAskTree(true); return` 이라는 **코드 모양**을 박아 뒀다. 머메이드를 TB·LR
  // 두 문으로 가르면서 그 일이 `pickMermaid` 라는 함수로 옮겨 갔고, 하는 일은 그대로인데
  // (넣기 전에 글을 받는다) 모양만 달라져서 깨졌다. 재던 것은 「고르자마자 넣어 버리지
  // 않는가」이므로 **그 성질을 직접** 잰다 — 이름이 또 바뀌어도 이번에는 안 깨진다.
  const mi = cp.indexOf('function pickMermaid')
  const door = cp.slice(mi, cp.indexOf('\n', cp.indexOf('setAskTree', mi)))
  check(mi > 0 && /setAskTree\(true\)/.test(door) && !/addCard\(/.test(door),
    '머메이드는 고르자마자 안 넣는다 — **글 받는 화면을 먼저 연다**')
  check(/run: \(\) => pickMermaid\(d\)/.test(cp),
    '목록의 머메이드 타일이 그 문으로 간다 — addCard 로 바로 가면 빈 트리가 생긴다')
  check(/if \(key === 'tree'\) \{ pickMermaid\(MM_DOORS\[0\]\); return \}/.test(cp),
    '다른 데서 tree 가 들어와도 문으로 돌린다 — 빈 글로 펼치면 상자 하나 없는 쪽이 된다')
  check(/addCard\('tree', undefined, mm\)/.test(cp), '쓴 글을 그대로 넘긴다')
  check(/g\.errors\.length > 0/.test(cp), '못 읽은 줄을 화면이 보여 준다')
  check(/cpk-mmwarn/.test(cp) && /세로 종이는 트리가/.test(cp),
    '**세로 종이에서 말린다** — 넣고 나서 알면 늦다(위→아래 2칸)')
  check(/한 띠에/.test(cp) && /레벨/.test(cp), '한 띠에 몇 레벨까지 들어가는지 숫자로 말한다')
  check(/개 띠로 접어/.test(cp), '깊으면 **몇 개 띠로 접는지** 미리 말한다(③)')
  check(/넘칩니다/.test(cp), '넘치면 넘친다고 말한다')

  const reg = bare(read('./src/cards/registry.ts'))
  check(/key: 'tree'/.test(reg), '카드 목록에 보인다')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
