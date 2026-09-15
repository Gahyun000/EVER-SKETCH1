// 편집에 들어갔다 나와도 **서 있던 폴더가 남는가.**
//
// 2026-09-15 · 사용자가 화면 기록으로 잡아 준 문제의 나머지 절반. 사이드바를 눌러
// 목록으로 돌아오면 깊은 폴더에서 일하던 사람도 늘 「전체」에 떨어졌다.
//
// 원인은 이 한 줄이었다 — `LibraryScreen` 안의
//
//   const [here, setHere] = useState<string | null>(null)
//
// 편집으로 화면이 바뀌면 이 화면이 통째로 내려갔다가 다시 태어나고, 그때 `here` 가
// `null` 로 돌아간다. 폴더를 셋 파고 들어가 자료 하나 고치고 나오면 처음부터
// 다시 들어가야 했다.
//
// 화면에 두었던 이유는 있었다 — **계정이 바뀌면 지워지게** 하려는 것이다(`key={uid}`).
// 그래서 스토어로 올리면서 그 보호를 `boot()` 으로 옮겼다. 그쪽은
// account_switch.test.mjs 가 지킨다. 여기서는 **옮겼다는 것 자체**를 지킨다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs folder_here.test.mjs
import { readFileSync } from 'node:fs'
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')

const { useProjects } = await import('./src/persistence/projects.ts')

// ── 스토어가 들고 있는가 ─────────────────────────────
{
  const st = useProjects.getState()
  check(st.here === null, '처음에는 뿌리(전체)에 선다')
  check(Array.isArray(st.folders) && st.folders.length === 0, '폴더는 빈 배열로 시작한다 — undefined 면 folders.filter 가 터진다')
  check(st.maxDepth === 3, '폴더 깊이 한도 기본값은 3')
  check(typeof st.setHere === 'function' && typeof st.loadFolders === 'function',
    '폴더를 옮기고 받아 오는 일이 스토어에 있다')
}

// **이게 그 성질이다.** 화면이 몇 번을 내려갔다 올라와도 스토어는 그대로다.
{
  useProjects.getState().setHere('f_deep')
  // 편집으로 갔다가
  useProjects.setState({ view: 'editor', activeId: 'p1' })
  check(useProjects.getState().here === 'f_deep', '편집으로 넘어가도 서 있던 폴더가 남는다')
  // 목록으로 돌아온다
  useProjects.getState().setView('library')
  check(useProjects.getState().here === 'f_deep', '목록으로 돌아오면 그 폴더에 그대로 선다 (⑦ㄱ)')
  useProjects.getState().setHere(null)
  check(useProjects.getState().here === null, '뿌리로도 돌아갈 수 있다')
}

// ── 화면이 다시 들고 있지 않은가 ─────────────────────
// 되돌아가면 증상도 그대로 돌아온다. 되돌린 것을 바로 잡아낸다.
{
  const lib = read('./src/persistence/LibraryScreen.tsx')
  check(!/useState<Crumb\[\]>\(\[\]\)[\s\S]*?const \[here/.test(lib) && !/const \[here, setHere\] = useState/.test(lib),
    '`here` 를 화면이 다시 들고 있지 않다')
  check(!/const \[folders, setFolders\] = useState/.test(lib),
    '`folders` 를 화면이 다시 들고 있지 않다')
  check(!/const \[maxDepth, setMaxDepth\] = useState/.test(lib),
    '`maxDepth` 를 화면이 다시 들고 있지 않다')
  check(/const here = useProjects\(\(s\) => s\.here\)/.test(lib), '화면은 스토어에서 읽는다')
  check(/const folders = useProjects\(\(s\) => s\.folders\)/.test(lib), '폴더도 스토어에서 읽는다')

  // 받아 오기는 스토어가, **무슨 말을 할지는 화면이** 정한다 —
  // 같은 실패라도 목록 화면에서는 빨간 줄이지만 사이드바에서는 조용히 지나가야 한다.
  check(/await loadFoldersInto\(\)/.test(lib) && /setFErr\(e instanceof FolderApiError/.test(lib),
    '받아 오는 일은 스토어가 하고 사람에게 할 말은 화면이 정한다')
  check(!/const every = await fetch\('\/api\/folders\?all=true'/.test(lib),
    '폴더를 받아 오는 코드가 두 벌로 남아 있지 않다')

  const store = read('./src/persistence/projects.ts')
  check(/Array\.isArray\(rows\) \? rows : \[\]/.test(store),
    '배열이 아니면 빈 배열을 넣는다 — 폴더 하나 못 읽었다고 목록을 통째로 잃지 않는다')
  check(/set\(\{ bootedFor: uid, loading: true, folders: \[\], here: null, maxDepth: 3 \}\)/.test(store),
    '계정이 바뀌면 폴더도 함께 비운다 — `key={uid}` 가 해 주던 일이다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
