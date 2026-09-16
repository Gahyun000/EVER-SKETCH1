// **칸 글자를 고쳐도 ⌘Z 가 먹는다.**
//
// 2026-09-16 · 사용자: 「뒤로가기(⌘Z)가 제대로 작동 안 함」. 실제 서버에서 재 봤다.
//
//     친 뒤            가나다제목
//     칸 **안**에서 ⌘Z  가나제목   ← 한 글자씩 (브라우저가 하는 일)
//     칸을 **나온** 뒤 ⌘Z 가제목    ← **아무 일도 안 일어남**
//
// 까닭: 도형을 옮기거나 색을 칠할 때는 되돌릴 자리를 찍는데(`snap()`), **칸 글자에는
// 아무것도 안 찍고 있었다.** 되돌릴 게 없으니 ⌘Z 가 할 일이 없었다.
//
// 고침은 둘.
//   · 칸에 **들어갈 때** 그 쪽의 모습을 재 두고, **나올 때 달라졌으면** 되돌리기에 넣는다.
//     들어갔다 그냥 나온 것까지 세면 ⌘Z 를 눌러도 화면이 안 바뀌는 **헛걸음**이 쌓인다 —
//     사람은 「또 안 되네」로 읽는다. 그래서 **바뀐 것만** 센다.
//   · 되돌린 뒤에도 **고른 것을 놓지 않는다**. 연달아 되돌리면 어디를 보고 있었는지 잃었다.
//
// 칸 **안**에서 한 번에 얼마나 물러나는지는 **한 글자씩**으로 둔다(사용자 선택 ㄱ) —
// 지금 브라우저가 하는 그대로다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs undo_cell.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const fl = bare(read('./src/canvas/FreeLayer.tsx'))
const hk = bare(read('./src/builder/Hotkeys.tsx'))
const hist = bare(read('./src/canvas/history.ts'))

// ── ① 쪽의 모습을 만드는 곳이 하나다 ──────────────────
check(/^function snapOf\(pg: Page\): string/m.test(fl), '쪽의 모습을 만드는 함수가 **파일 맨 바깥**에 있다')
check(/function snap\(\) \{ pushSnap\(page\.id, snapOf\(page\)\) \}/.test(fl),
  '도형·색을 고칠 때도 같은 함수를 쓴다 — 두 벌이면 견줄 수가 없다')

// ── ② 들어갈 때 재 두고 나올 때 견준다 ────────────────
check(/const editSnapRef = useRef<string \| null>\(null\)/.test(fl), '들어가기 직전의 모습을 담을 자리가 있다')
{
  const n = (fl.match(/if \(editSnapRef\.current == null\) editSnapRef\.current = snapOf\(page\)/g) || []).length
  // 칸에 들어오는 길이 **둘**이다(더블클릭 · 키보드). 한쪽만 찍으면 한쪽만 되돌아간다.
  check(n === 2, '칸에 들어오는 **두 길** 모두에서 잰다', n + '곳')
}
{
  const i = fl.indexOf('function commitEditing')
  const blk = fl.slice(i, i + 800)
  check(/const before = editSnapRef\.current/.test(blk), '나올 때 그 모습을 꺼낸다')
  check(/editSnapRef\.current = null/.test(blk), '꺼낸 뒤 비운다 — 다음 칸에 옛 모습이 딸려가면 안 된다')
  // 스토어는 방금 바뀌었다. 이 함수가 들고 있는 `page` 는 옛것이라 그걸로 견주면 늘 「달라졌다」가 된다.
  check(/useBuilder\.getState\(\)\.pages\.find/.test(blk), '**지금 값**을 다시 읽어 견준다')
  check(/snapOf\(now\) !== before/.test(blk), '달라졌을 때만')
  check(/pushSnap\(page\.id, before\)/.test(blk), '되돌릴 자리로 **들어가기 전 모습**을 넣는다')
}

// ── ③ 되돌린 뒤 고른 것을 놓지 않는다 ─────────────────
check(/const restore = \(pageId: number, snapJson: string\)/.test(hk), '되돌리는 길이 한 곳으로 모였다')
{
  const i = hk.indexOf('const restore =')
  const blk = hk.slice(i, i + 600)
  check(/const keep = ui\.selEl/.test(blk), '되돌리기 전에 무엇을 골랐는지 기억한다')
  check(/now\.els\.some\(\(el\) => el\.id === keep\)/.test(blk), '되돌린 모습에 **그게 아직 있는지** 본다')
  check(/ui\.setSel\(alive \? keep : null\)/.test(blk), '있으면 잡고, 없으면 놓는다')
}
{
  // 2026-09-16 · ⑥ 의 남은 절반(쪽을 더하고 지운 일도 ⌘Z 로)을 고치면서 이 갈래가
  // `undoOnce` · `redoOnce` 두 함수로 빠졌다. 옛 지킴이는 **한 줄짜리 모양**을 붙잡고
  // 있어서 바로 걸렸다 — 지우지 않고 다시 쓴다. 지켜야 할 것은 세 가지다.
  const i = hk.indexOf('const undoOnce = ')
  const j = hk.indexOf("if (mod && lower === 'z')", i)
  const blk = hk.slice(i, j)
  check(i > 0 && j > i, '되돌리기·다시하기가 한 자리에 모여 있다')
  // ① 쪽 안의 일을 되돌릴 때는 **늘 놓기**가 아니다. 선택을 놓는 것은 문서를 통째로
  //    되돌릴 때뿐이다 — 그때는 고르던 것이 아예 없어졌을 수 있다.
  const pageBranch = blk.replace(/if \(next(Undo|Redo)Kind\(page\.id\) === 'doc'\)[^\n]*\n/g, '')
  check(!/ui\.setSel\(null\)/.test(pageBranch), '「늘 놓기」가 안 남아 있다')
  check(/bs\.undoDoc\(\); ui\.setSel\(null\)/.test(blk),
    '문서를 통째로 되돌릴 때**만** 놓는다')
  // ② 되돌리기와 다시하기가 같은 길(restore)을 쓴다.
  check((blk.match(/restore\(page\.id, s\)/g) || []).length === 2, '되돌리기와 다시하기가 **같은 길**을 쓴다')
}
{
  // ③ ⌘Z·⌘⇧Z·⌘Y 가 전부 그 두 함수로 들어간다. 하나라도 따로 놀면 「⌘Y 만 이상한」
  //    상태가 된다 — 예전에 ⌘Y 가 제 코드를 따로 들고 있었다.
  const z = hk.slice(hk.indexOf("if (mod && lower === 'z')"), hk.indexOf("k === 'Escape'"))
  check(/if \(e\.shiftKey\) redoOnce\(\); else undoOnce\(\)/.test(z), '⌘Z 와 ⌘⇧Z 가 그리로 간다')
  check(/lower === 'y'\) \{ e\.preventDefault\(\); redoOnce\(\)/.test(z), '⌘Y 도 같은 길로 간다')
  check(!/popSnap\(page\.id\)/.test(z) && !/popRedo\(page\.id\)/.test(z),
    '단축키 자리에 **같은 코드를 또** 적어 두지 않았다')
}

// ── ④ 되돌리기 살림은 그대로다 ───────────────────────
// 여기 손대지 않았다는 것을 못 박는다 — 쌓는 규칙이 바뀌면 위 전부가 흔들린다.
check(/redoStacks\.delete\(pageId\)/.test(hist), '새 일이 생기면 「다시하기」는 무효가 된다')
check(/if \(a\.length > 60\) a\.shift\(\)/.test(hist), '되돌리기는 예순 걸음까지 기억한다')
check(/export function resetHistory/.test(hist), '자료를 바꿔 열면 통째로 비운다')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
