// 편집 화면에서 사이드바가 **펴지는가.**
//
// 2026-09-15 · 사용자가 화면 기록으로 잡아 준 문제. 스케치 화면에서 사이드바를 펴려고
// 눌렀더니 펴지는 게 아니라 **자료 목록 첫 화면으로 나가 버렸다.** 원인은 두 줄이었다.
//
//   const shut = folded || view === 'editor'    // 편집이면 무조건 접힘
//   onClick={() => onView(it.k)}                // 접힌 아이콘을 누르면 화면이 옮겨 감
//
// 펴는 단추는 `folded` 만 바꾸는데 `view === 'editor'` 가 계속 참이라 **눌러도 안 펴졌고**,
// 접힌 열에 남은 것은 아이콘뿐이라 그걸 누르면 편집에서 나갔다. 사이드바를 펴려던
// 손짓이 그대로 나가는 길이었던 셈이다.
//
// 여기서 지키는 것 셋.
//   · 편집에서도 펴진다 — 접힘이 화면 이름에 박혀 있지 않다
//   · 편집의 접힘은 목록과 **따로** 기억된다. 기본은 접힘, 한 번 펴면 다음에도 펴진 채
//   · 접힌 아이콘을 누르면 **먼저 펴기만** 한다 (사용자 결정 ⑪ㄱ)
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs shell_fold.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')

// ── 기억하는 자리 ────────────────────────────────────
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)) },
  removeItem: (k) => { store.delete(k) },
}
const {
  shellFolded, rememberShellFolded,
  shellFoldedEditor, rememberShellFoldedEditor,
} = await import('./src/persistence/prefs.ts')

check(shellFoldedEditor() === true,
  '편집은 **접힌 채로 시작한다** — 필름 + 캔버스 + 오른쪽 패널로 이미 꽉 차 있다')
check(shellFolded() === false,
  '목록은 펴진 채로 시작한다 — 여기서는 갈 곳이 늘 보여야 한다')

rememberShellFoldedEditor(false)
check(shellFoldedEditor() === false,
  '편집에서 한 번 펴면 **다음에도 펴진 채로** 시작한다')
check(shellFolded() === false, '편집에서 편 것이 목록 쪽 기억을 건드리지 않는다')

rememberShellFolded(true)
check(shellFolded() === true, '목록에서 접으면 목록만 접힌다')
check(shellFoldedEditor() === false, '목록에서 접은 것이 편집 쪽 기억을 되돌리지 않는다')

// **키가 겹치면 서로 덮어쓴다.** 한 값으로 묶여 있던 것이 문제의 절반이었다.
check(store.has('es_shell_folded') && store.has('es_shell_folded_editor'),
  '저장 키가 둘로 갈려 있다', [...store.keys()].join(','))

// 「아직 고른 적 없음」과 「안 접기로 함」을 가른다 — 안 가르면 기억하는 뜻이 없다.
store.delete('es_shell_folded_editor')
check(shellFoldedEditor() === true, '고른 적이 없으면(null) 접힘')
rememberShellFoldedEditor(false)
check(store.get('es_shell_folded_editor') === '0' && shellFoldedEditor() === false,
  "안 접기로 한 것('0')은 접힘이 아니다")

// 저장이 막힌 브라우저 — 기본값 하나 못 읽었다고 화면이 안 뜨면 안 된다.
globalThis.localStorage = {
  getItem: () => { throw new Error('blocked') },
  setItem: () => { throw new Error('blocked') },
  removeItem: () => { throw new Error('blocked') },
}
let threw = false
try { check(shellFoldedEditor() === true, '읽기가 막혀도 접힘으로 떨어진다') } catch { threw = true }
check(!threw, '읽기가 막혀도 **던지지 않는다**')
threw = false
try { rememberShellFoldedEditor(false) } catch { threw = true }
check(!threw, '쓰기가 막혀도 **던지지 않는다**')

// ── 셸이 그 기억을 쓰는가 ────────────────────────────
{
  const shell = read('./src/shell/AppShell.tsx')

  // 이게 그 버그다. 되살아나면 편집에서 또 안 펴진다.
  check(!/shut\s*=\s*folded\s*\|\|\s*view === 'editor'/.test(shell),
    "접힘이 화면 이름에 박혀 있지 않다 — `folded || view === 'editor'` 가 없다")
  check(/const shut = inEditor \? foldedEd : folded/.test(shell),
    '편집이면 편집 쪽 접힘을, 아니면 목록 쪽 접힘을 본다')
  check(/const \[foldedEd, setFoldedEd\] = useState\(\(\) => shellFoldedEditor\(\)\)/.test(shell),
    '편집 쪽 접힘을 기억에서 읽어 온다')
  check(/if \(inEditor\) \{ setFoldedEd\(v\); rememberShellFoldedEditor\(v\) \}/.test(shell),
    '편집에서 접거나 펴면 **편집 쪽 기억에** 쓴다')
  check(/else \{ setFolded\(v\); rememberShellFolded\(v\) \}/.test(shell),
    '목록에서 접거나 펴면 목록 쪽 기억에 쓴다')

  // ⑪ㄱ — 접힌 아이콘은 먼저 편다.
  check(/if \(shut\) \{ fold\(false\); return \}\s*\n\s*onView\(it\.k\)/.test(shell),
    '접혀 있으면 **먼저 펴기만** 하고 화면은 안 옮긴다 (⑪ㄱ)')
  check(!/onClick=\{\(\) => onView\(it\.k\)\}/.test(shell),
    '접힘을 안 보고 바로 옮겨 가던 옛 길이 남아 있지 않다')
  check(/title=\{shut \? `\$\{it\.t\} · 누르면 메뉴가 펴집니다` : it\.t\}/.test(shell),
    '접혀 있을 때는 **무엇이 일어날지 글자로도** 말한다 — 아이콘만으로는 모른다')

  // 이미 있던 약속들이 그대로인지. 고치다 흘리기 쉬운 자리다.
  check(/fold\(!shut\)/.test(shell), '경계선 손잡이는 여전히 한 자리에 한 물건이다')
  check(/if \(shut\) return/.test(shell), '접혀 있으면 끌어서 폭을 바꾸지 않는다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
