// **쪽을 더하거나 지운 일도 ⌘Z 로 돌아온다.**
//
// 2026-09-16 · 사용자 신고 ⑥ 의 남은 절반. 되돌리기 이력이 **쪽마다** 따로라
// (canvas/history.ts 의 undoStacks 는 쪽 id 로 키를 잡는다) 쪽이 생기고 없어지는 일은
// 어느 쪽의 것도 아니어서 ⌘Z 가 아무 일도 안 했다. 사용자 눈에는 단축키가 죽은 것이다.
//
// 고친 방법: 문서 전체를 통째로 기억하는 스택을 **하나 더** 두고, 둘 중 **나중에 쌓인**
// 것부터 되돌린다. 순서를 안 보면 「쪽을 지우고 → 글자를 고치고 → ⌘Z」에서 글자가
// 아니라 쪽이 돌아온다 — 방금 한 일부터 돌아와야 한다.
//
// 이 파일은 그 순서를 **실제로 쌓아 보고** 잰다. 정규식으로 코드 모양만 보는 것이
// 아니라, history.ts 를 불러 번호가 제대로 도는지 확인한다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs undo_page.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const H = await import('./src/canvas/history.ts')
const hk = bare(read('./src/builder/Hotkeys.tsx'))
const st = bare(read('./src/state/store.ts'))
const model = read('./src/canvas/model.ts')

// ── ① 나중에 한 일부터 ─────────────────────────────
{
  H.resetHistory()
  check(H.nextUndoKind(1) === null, '아무것도 안 했으면 되돌릴 것도 없다')

  H.pushSnap(1, 'A')                       // 쪽 안에서 글자를 고쳤다
  check(H.nextUndoKind(1) === 'page', '쪽 안의 일 하나뿐이면 그것부터')

  H.pushDocSnap('D1')                      // 쪽을 지웠다
  check(H.nextUndoKind(1) === 'doc',
    '**쪽을 지운 것이 더 나중이면 그것부터** — 예전에는 이게 아예 안 돌아왔다')

  H.pushSnap(1, 'B')                       // 다시 글자를 고쳤다
  check(H.nextUndoKind(1) === 'page',
    '**그 뒤에 글자를 고쳤으면 글자부터** — 순서를 안 보면 쪽이 먼저 돌아온다')

  check(H.popSnap(1) === 'B', '글자가 먼저 돌아온다')
  check(H.nextUndoKind(1) === 'doc', '그 다음이 쪽이다')
  check(H.popDocSnap() === 'D1', '쪽이 돌아온다')
  check(H.nextUndoKind(1) === 'page', '그 다음이 처음 글자다')
  check(H.popSnap(1) === 'A', '처음 글자가 돌아온다')
  check(H.nextUndoKind(1) === null, '다 돌아왔다')
}

// ── ② 쪽마다 따로라는 성질은 그대로 ──────────────────
// 문서 이력은 **더한** 것이지 쪽별 이력을 대신하는 게 아니다.
{
  H.resetHistory()
  H.pushSnap(1, 'p1')
  H.pushSnap(2, 'p2')
  check(H.nextUndoKind(1) === 'page' && H.nextUndoKind(2) === 'page', '두 쪽 다 제 것을 든다')
  check(H.popSnap(1) === 'p1' && H.popSnap(2) === 'p2', '섞이지 않는다')
  H.pushDocSnap('D')
  check(H.nextUndoKind(1) === 'doc' && H.nextUndoKind(99) === 'doc',
    '문서 이력은 **어느 쪽에서 눌러도** 보인다 — 쪽이 사라졌을 수도 있으니까')
}

// ── ③ 다시하기 ───────────────────────────────────
{
  H.resetHistory()
  H.pushDocSnap('D1')
  check(H.nextRedoKind(1) === null, '되돌리기 전에는 다시할 것이 없다')
  H.popDocSnap(); H.pushDocRedo('CUR')
  check(H.nextRedoKind(1) === 'doc', '되돌린 뒤에는 다시할 수 있다')
  check(H.popDocRedo() === 'CUR', '다시하면 그 모습이 나온다')
  check(H.nextRedoKind(1) === null, '한 번뿐이다')
}

// ── ④ 새 작업은 다시하기를 무효로 ───────────────────
// 되돌린 뒤 다른 일을 하면 앞으로 갈 길은 사라진다. **양쪽 다** 지워야 한다 —
// 한쪽만 지우면 「쪽을 되돌리고 글자를 고쳤는데 ⌘⇧Z 가 옛 쪽을 되살리는」 일이 난다.
{
  H.resetHistory()
  H.pushDocRedo('R'); H.pushRedo(1, 'r1')
  H.pushSnap(1, 'new')
  check(H.nextRedoKind(1) === null, '쪽 안에서 새 일을 하면 다시하기가 **양쪽 다** 사라진다')

  H.resetHistory()
  H.pushDocRedo('R'); H.pushRedo(1, 'r1')
  H.pushDocSnap('new')
  check(H.nextRedoKind(1) === null, '쪽을 더하거나 지워도 마찬가지다')
}

// ── ⑤ 자료를 바꿔 열면 비운다 ──────────────────────
// 쪽 id 는 자료마다 1부터 다시 시작한다. 안 비우면 ⌘Z 한 번이 **앞 자료의 쪽**을 덮어쓴다.
{
  H.pushDocSnap('X'); H.pushSnap(1, 'Y')
  H.resetHistory()
  check(H.nextUndoKind(1) === null && H.nextRedoKind(1) === null, '문서 이력도 함께 비운다')
  check(H.hasDocUndo() === false, '남은 것이 없다')
}

// ── ⑥ 쪽이 바뀌는 길에는 **전부** 기억을 남긴다 ────────
// 하나라도 빠지면 「어떤 건 ⌘Z 가 되고 어떤 건 안 되는」 상태가 된다 — 제일 나쁜 종류다.
{
  // 타입 선언(`removePage: (pageId: number) => void`)이 파일 앞쪽에 먼저 나온다.
  // 거기부터 세면 본문을 못 보고 헛다리를 짚는다 — **구현부부터** 본다.
  const impl = st.slice(st.indexOf('create<BuilderState>((set, get) => ({'))
  // **제 몸통만 잘라 본다.** 처음에는 이름 뒤 1400자를 봤는데, 그러면 옆 동네의
  // pushDocSnap 이 걸려서 **duplicatePage 를 통째로 빼도 38/38 이 그대로였다**
  // (2026-09-16 파괴 검사 D3). 다음 최상위 항목(`\n  이름: `) 전까지로 끊는다.
  const bodyOf = (name) => {
    const i = impl.indexOf('\n  ' + name + ': (')
    if (i < 0) return ''
    const rest = impl.slice(i + 3)
    const m = /\n {2}[a-zA-Z_]\w*: /.exec(rest)
    return m ? rest.slice(0, m.index) : rest
  }
  for (const [name, where] of [
    ['addCard', 'const g = get(); pushDocSnap(docSnap(g.pages, g.selectedPageId))'],
    ['removePage', null], ['movePage', null], ['reorderPage', null], ['duplicatePage', null],
    ['continueTable', null], ['spillListBlock', null],
  ]) {
    const seg = bodyOf(name)
    check(!!seg && /pushDocSnap\(docSnap\(/.test(seg), name + ' 이 되돌릴 것을 남긴다',
      seg ? '몸통 ' + seg.length + '자' : '몸통을 못 찾음')
    if (where) check(seg.includes(where), name + ' 은 **바꾸기 전에** 남긴다')
  }
  check(/pushDocSnap[\s\S]{0,200}dropHistory\(pageId\)/.test(bodyOf('removePage')),
    '지우기 전에 남기고 **그 다음에** 쪽별 이력을 버린다 — 순서가 바뀌면 빈 것을 저장한다')
}

// ── ⑦ 단축키가 그 순서를 쓴다 ──────────────────────
{
  check(/nextUndoKind, nextRedoKind/.test(model), 'model 이 새 판정을 다시 내보낸다')
  check(/nextUndoKind\(page\.id\) === 'doc'\) \{ bs\.undoDoc\(\)/.test(hk),
    '⌘Z 가 **나중에 한 것**을 보고 고른다')
  check(/nextRedoKind\(page\.id\) === 'doc'\) \{ bs\.redoDoc\(\)/.test(hk), '⌘⇧Z·⌘Y 도 같다')
  const z = hk.slice(hk.indexOf("lower === 'z'"), hk.indexOf("k === 'Escape'"))
  check(/if \(e\.shiftKey\) redoOnce\(\); else undoOnce\(\)/.test(z), '되돌리기와 다시하기가 한 길로 간다')
  check(/lower === 'y'\) \{ e\.preventDefault\(\); redoOnce\(\)/.test(z), '⌘Y 도 같은 길이다')
  // 문서를 통째로 되돌리면 고르고 있던 것이 없어졌을 수 있다.
  check(/bs\.undoDoc\(\); ui\.setSel\(null\)/.test(hk),
    '문서를 되돌리면 선택을 놓는다 — 없어진 것을 붙잡고 있으면 다음 Delete 가 엉뚱한 것을 지운다')
}

// ── ⑧ 되돌릴 길은 **한 벌**이다 ────────────────────
// 인라인 「되돌리기」 단추와 ⌘Z 가 서로 다른 것을 들고 있으면 같은 일이 두 번 되돌아간다.
{
  check(!/lastCont/.test(st), '한 칸짜리 `lastCont` 는 없어졌다')
  check(/undoContinue: \(\) => \{ if \(hasDocUndo\(\)\) useBuilder\.getState\(\)\.undoDoc\(\) \}/.test(st),
    '인라인 단추도 ⌘Z 와 **같은 것**을 되돌린다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
