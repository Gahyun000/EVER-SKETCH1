// **폴더가 말없이 사라지지 않는가.**
//
// 2026-09-16 · 사용자가 「10월 폴더가 없어졌다」고 했다. 자료는 멀쩡한데 폴더만,
// 오류 한 줄 없이. 까닭은 셋이 겹친 것이었다.
//   ① `boot()` 이 폴더를 **비운다** (계정이 바뀌면 앞사람 것이 남으면 안 되니 옳다)
//   ② 다시 **채우는 일은 화면(나무)에 맡겨** 두었다 — 비운 쪽과 채우는 쪽이 갈렸다
//   ③ 그 화면은 오류를 **삼킨다** (폴더 못 읽었다고 자료까지 못 보게 할 순 없으니 옳다)
// 셋 다 따로 보면 맞는 말인데, 겹치면 **한 번 못 받는 순간 폴더가 조용히 없어진다.**
// 실제로 그랬고, 그래서 서버 로그를 뒤져야 원인이 보였다.
//
// 여기서 지키는 것.
//   · 기다림에 **끝이 있다** — 부르는 데가 셋이라 제한은 안쪽에 있어야 한다
//   · **비운 사람이 도로 채운다**
//   · 삼키더라도 **자국은 남긴다** — 삼킨 사실까지 없어지면 아무도 못 찾는다
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs folders_resilience.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const store = bare(read('./src/persistence/projects.ts'))
const tree = bare(read('./src/shell/SideTree.tsx'))
const css = read('./src/shell/shell.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '')

const lf = store.slice(store.indexOf('loadFolders: async'), store.indexOf('boot: async'))
const boot = store.slice(store.indexOf('boot: async'), store.indexOf('loadList: async'))

// ── ① 기다림에 끝이 있다 ────────────────────────────
check(/withTimeout\(apiListFolders/.test(lf), '첫 요청에 시간 제한이 있다')
check(/withTimeout\(\s*fetch/.test(lf), '**둘째 요청에도** 있다 — 여기서 멈춰 본 적이 있다')
check((lf.match(/await/g) || []).length === (lf.match(/await withTimeout/g) || []).length,
  'loadFolders 안에 제한 없는 기다림이 하나도 없다')
// 제한은 **안쪽**에 있어야 한다 — 부르는 데가 나무·자료 목록·boot 셋이다.
check(!/withTimeout\(get\(\)\.loadFolders/.test(boot),
  '제한을 부르는 쪽마다 감싸지 않는다 (한 곳만 빠뜨려도 그 길이 영영 기다린다)')

// ── ② 비운 사람이 도로 채운다 ───────────────────────
check(/folders: \[\]/.test(boot), 'boot 이 폴더를 비운다 (계정이 바뀔 때 필요하다)')
check(/loadFolders\(\)/.test(boot), '**그리고 boot 이 도로 채운다**')
check(boot.indexOf('folders: []') < boot.indexOf('loadFolders()'),
  '비우는 것이 먼저, 채우는 것이 나중')

// ── ③ 삼키되 자국은 남긴다 ─────────────────────────
check(/foldersError: loadErrorText\(e, '폴더'\)/.test(lf),
  '못 읽으면 까닭을 남긴다 — 갈래를 따져서(닿지 못함·거절·시간 초과)')
check(/foldersError: null/.test(lf), '읽고 나면 그 자국을 지운다')
check(/throw e/.test(lf), '부르는 쪽이 제 나름대로 굴 수 있게 다시 던진다')
check(/\.catch\(\(\) => \{/.test(tree) || /catch\(\(\) =>/.test(tree),
  '나무는 여전히 삼킨다 (폴더 때문에 자료를 못 보면 안 된다)')
check(/foldersError &&/.test(tree), '삼킨 사실을 나무가 **보여 준다**')
check(/다시<\/button>/.test(tree), '그 자리에서 다시 받아 볼 수 있다')
check(/\.sh-terr\{/.test(css), '그 줄에 모양이 있다')
// 못 읽었으면 나무가 통째로 사라지면 안 된다 — 사라지면 말할 자리도 없어진다.
check(/!rows\.length && !foldersError/.test(tree),
  '못 읽었을 때는 나무가 통째로 숨지 않는다')

// ── 나란히 돌린다 ───────────────────────────────────
// 줄줄이 기다리면 8초 + 8초다. 이관은 목록과 아무 상관 없는 부가 작업인데
// 목록을 붙잡고 있었다.
// **곁다리는 아예 안 기다린다.** 「불러오는 중」은 자료 목록의 말이라, 이관이나
// 폴더가 굼뜨다고 목록이 더 서 있을 까닭이 없다(살아 있는 서버에서 8.5초를 봤다).
check(/void Promise\.all\(\[/.test(boot), '이관·폴더는 띄워 두고 안 기다린다')
check(/await withTimeout\(get\(\)\.loadList\(\)/.test(boot), '기다리는 것은 목록뿐이다')
check(boot.indexOf('void Promise.all') < boot.indexOf('await withTimeout(get().loadList'),
  '곁다리를 먼저 띄우고 목록을 기다린다')
check(!/await withTimeout\(migrateLegacyDraftOnce\(\), BOOT_STEP_MS\)\s*\}?\s*catch[\s\S]{0,80}await withTimeout\(get\(\)\.loadList/.test(boot),
  '이관이 끝나야 목록을 받기 시작하지 않는다')
// 폴더가 실패해도 목록은 뜬다 — 서로를 끌고 내려가지 않는다.
check(/loadFolders\(\)\.catch\(/.test(boot), '폴더가 실패해도 목록은 뜬다')
check(/loadList\(\), BOOT_STEP_MS\)\s*\n?\s*\.catch/.test(boot) || /listError: loadErrorText/.test(boot),
  '목록이 실패하면 그것은 화면에 말한다')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
