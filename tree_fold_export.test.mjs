// **접은 것이 결재·공유·내보내기로 새어 나가면 안 된다** (사용자 결정 ②ㄴ · 2026-09-15).
//
// **왜 이 검사가 있나.** 처음에 제가 「보이는 대로 내보내기」를 권했다. 큰 트리를
// 윗단만 펴서 한 장으로 내면 요약이 된다는 이유였다. 사용자가 「트리를 만든 데는
// 이유가 있을 텐데 왜 접어서 나가지」라고 되물어 다시 보니, 새는 곳이 내보내기만이
// 아니었다 —
//
//   ApprovalViewer → SlideViewer → PageWithCanvas → FreeLayer
//
// 팀 공유와 결재함이 **편집 화면과 같은 것**으로 승인본을 그린다. `hidden` 을 그대로
// 따르면 **결재자가 작성자보다 적게 보고 승인한다.** 그건 `doc_state` 의 잠금이
// 막으려는 바로 그 일이다(「결재자가 본 것과 작성자가 가진 것이 달라지지 않게」).
//
// 그래서 규칙은 한 줄이다: **`hidden` 은 `interactive` 일 때만 듣는다.**
// 이 검사는 그 한 줄이 지켜지는지만 본다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs tree_fold_export.test.mjs

import { readFileSync } from 'node:fs'
import { layoutTree, newNode, TREE_CONN } from './src/cards/treeOps.ts'

const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')
const bare = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; return }
  fail++
  console.log('  X ' + label + (extra ? '  — ' + extra : ''))
}

// ── 1. 숨기는 곳은 FreeLayer 한 곳뿐이고, interactive 가 잠근다 ─────
{
  const src = bare(read('./src/canvas/FreeLayer.tsx'))
  check(/if \(interactive\) for \(const e of page\.els\) if \(e && e\.hidden\) hiddenIds\.add/.test(src),
    '`hidden` 을 모으는 줄이 `interactive` 로 잠겨 있다')
  check(/const shownEls = hiddenIds\.size \? page\.els\.filter/.test(src),
    '안 그릴 상자는 그 목록으로만 걸러낸다')
  check(/shownEls\.map\(\(el\) => \{/.test(src), '상자를 그릴 때 걸러낸 목록을 쓴다')
  check(/if \(!shownConn\(c\)\) return null/.test(src), '숨은 상자에 붙은 선도 안 그린다')
  // `hidden` 을 보는 다른 자리가 새로 생기면 여기서 잡는다.
  const spots = (src.match(/\.hidden\b/g) || []).length
  check(spots <= 2, 'FreeLayer 에서 `hidden` 을 보는 자리는 한둘뿐',
    `${spots}군데 — 늘었다면 interactive 밖에서 보는 곳이 생긴 것`)
}

// ── 2. 결재·공유는 interactive 를 끄고 그린다 ──────────────────────
{
  const sv = bare(read('./src/approvals/SlideViewer.tsx'))
  check(/interactive=\{false\}/.test(sv), '승인본 뷰어는 interactive={false} 로 그린다')
  const pwc = bare(read('./src/cards/PageWithCanvas.tsx'))
  check(/<FreeLayer[^>]*interactive=\{interactive\}/.test(pwc),
    'PageWithCanvas 가 그 값을 FreeLayer 까지 그대로 넘긴다')
}

// ── 3. 내보내기는 `hidden` 을 아예 모른다 ──────────────────────────
// 여기서 한 번 헛다리를 짚었다. exportPptx 에 `hidden` 이라는 글자가 있어서 걸렸는데,
// 읽어 보니 **CSS 의 `visibility:hidden`** 이었다 — 우리 `el.hidden` 과는 남이다.
// 그래서 글자를 찾는 대신 **어디서 값을 가져오는지**를 본다.
{
  const src = bare(read('./src/export/exportPptx.ts'))
  check(/for \(const el of p\.els\)/.test(src),
    '자유 요소는 **모델**에서 가져온다 — 화면에 안 그려도 나간다')
  check(/for \(const c of p\.conns\)/.test(src), '선도 모델에서 가져온다')
  check(/el\.hidden/.test(src) === false, '`el.hidden` 을 보는 곳이 없다')
  check(/const inFree = \(el: Element\) => !!el\.closest\('\.freelayer'\)/.test(src),
    'DOM 을 훑는 쪽은 자유레이어를 아예 건너뛴다')
  // 그래도 DOM 을 찍는 쪽이 있으니, 그 화면도 펴진 채로 그려져야 한다.
  const ex = bare(read('./src/builder/ExportLayer.tsx'))
  check(/interactive=\{false\}/.test(ex), '내보내기용 화면도 interactive={false} 로 그린다')
}

// ── 4. 접어도 **문서에서 사라지지 않는다** ─────────────────────────
{
  const els = [], conns = []
  for (let i = 1; i <= 6; i++) {
    els.push(newNode(i, 'n' + i))
    if (i > 1) conns.push({ from: i - 1, to: i, ...TREE_CONN })
  }
  els[1] = { ...els[1], folded: true }
  const r = layoutTree(els, conns, 1040, 720, 'LR', [1])
  check(r.els.length === 6, '접어도 상자 수는 그대로', `${r.els.length}개`)
  check(r.els.filter((e) => e.hidden).length === 4, '넷이 숨음 표시를 단다',
    `${r.els.filter((e) => e.hidden).length}개`)
  check(r.conns.length === 5, '선도 그대로 남는다', `${r.conns.length}개`)
  // 「내보내기」가 보는 것 = 거른 적 없는 els
  check(r.els.every((e) => e.text), '숨은 상자도 글자를 그대로 들고 있다')
}

// ── 5. 폈다 접었다 해도 안 잃는다 ──────────────────────────────────
{
  const els = [], conns = []
  for (let i = 1; i <= 6; i++) {
    els.push(newNode(i, 'n' + i))
    if (i > 1) conns.push({ from: i - 1, to: i, ...TREE_CONN })
  }
  let cur = { els, conns }
  for (let round = 0; round < 3; round++) {
    cur.els = cur.els.map((e) => (e.id === 3 ? { ...e, folded: !e.folded } : e))
    const r = layoutTree(cur.els, cur.conns, 1040, 720, 'LR', [1])
    cur = { els: r.els, conns: r.conns }
    check(r.els.filter((e) => e.echoOf == null).length === 6,
      `${round + 1}번째 접었다 펴도 상자 6개`,
      `${r.els.filter((e) => e.echoOf == null).length}개`)
    check(r.overlapping === 0, `${round + 1}번째에도 겹침 0`)
  }
}

// ── 6. 왜 이렇게 정했는지 코드에 남아 있나 ─────────────────────────
{
  const src = read('./src/canvas/FreeLayer.tsx')
  check(/결재자가 덜 보는 일이 없다|승인본이 작업본보다 적으면 안 된다/.test(src),
    'FreeLayer 에 이 규칙의 이유가 적혀 있다')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
