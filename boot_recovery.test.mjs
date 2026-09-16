// **기동이 어떤 경우에도 「불러오는 중…」에 갇히지 않는지** 지킨다.
//
// 2026-09-07 에 「명령창엔 아무 이상이 없는데 화면이 안 뜬다」는 신고를 받았다.
// 재현은 못 했지만(서버·DB·dist·레거시 초안을 실제 것으로 돌려도 정상),
// **그 증상을 만들 수 있는 자리**가 코드에 있었다:
//
//     try { await migrateLegacyDraftOnce() } catch {}      ← try/finally **바깥**
//     try { await get().loadList() } finally { loading:false }
//
// `catch` 는 **던지는** 것만 잡는다. 응답이 영영 안 오는 요청이나 막힌 IndexedDB 는
// 던지지 않고 그냥 안 끝난다. 그러면 그 줄에서 멈추고, `bootedFor` 는 이미 찍혀 있어
// 다시 시도되지도 않는다 — 화면에는 「불러오는 중…」만 남고 어디에도 오류가 안 찍힌다.
// **그래서 명령창이 조용했던 것이다.**
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs boot_recovery.test.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { withTimeout, BOOT_STEP_MS } from './src/persistence/projects.ts'

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8')
let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

// ══════════ 시간으로 끊는다 ══════════
{
  const never = new Promise(() => {})          // 던지지도, 끝나지도 않는다
  let caught = null
  const t0 = Date.now()
  try { await withTimeout(never, 60) } catch (e) { caught = e }
  const dt = Date.now() - t0
  check(!!caught, '**안 끝나는 약속을 끊는다** (이게 없으면 그 줄에서 영원히 멈춘다)')
  check(dt < 500, `끊는 데 오래 안 걸린다 (${dt}ms)`)
  check(String(caught?.message).includes('시간 초과'), '왜 끊겼는지 말한다', caught?.message)
}
{
  const ok = await withTimeout(Promise.resolve('값'), 1000)
  check(ok === '값', '제때 끝나면 값을 그대로 준다')
}
{
  let caught = null
  try { await withTimeout(Promise.reject(new Error('원래 오류')), 1000) } catch (e) { caught = e }
  check(String(caught?.message) === '원래 오류', '원래 오류는 그대로 넘긴다 (시간 초과로 덮지 않는다)')
}
{
  // 늦게 끝나는 약속이 나중에 성공해도 이미 끊은 결과를 뒤엎지 않는다.
  let late
  const p = new Promise((r) => { late = r })
  let caught = null
  const t = withTimeout(p, 40).catch((e) => { caught = e })
  await new Promise((r) => setTimeout(r, 90))
  late('늦은 값')
  await t
  check(!!caught, '끊긴 뒤에 늦게 도착해도 결과가 뒤집히지 않는다')
}
check(BOOT_STEP_MS >= 3000 && BOOT_STEP_MS <= 15000,
  `기다리는 시간이 사람이 견딜 만하다 (${BOOT_STEP_MS}ms)`)

// ══════════ 소스에서 못박는 규칙 ══════════
const src = read('./src/persistence/projects.ts')
const lib = read('./src/persistence/LibraryScreen.tsx')
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const code = bare(src)

check(/withTimeout\(migrateLegacyDraftOnce\(\)/.test(code),
  '레거시 이관을 시간으로 끊는다 — 부가 작업이 화면을 잡아 두지 않는다')
check(/withTimeout\(get\(\)\.loadList\(\)/.test(code), '목록 받기도 시간으로 끊는다')
check(!/^\s*try \{ await migrateLegacyDraftOnce\(\) \} catch/m.test(code),
  '이관이 try/finally **바깥**에 있지 않다 (그게 갇히던 자리다)')

// finally 가 반드시 loading 을 끈다
const boot = code.slice(code.indexOf('boot: async'), code.indexOf('loadList: async'))
check(/finally \{[\s\S]{0,120}loading: false/.test(boot),
  'boot 은 **어떤 길로 끝나든** loading 을 끈다')
// **모양이 바뀌어 다시 썼다**(2026-09-16). 전에는 「`await` 뒤에는 반드시
// `withTimeout` 이 온다」를 글자로 봤다. 이제 boot 은 셋을 **나란히** 돌리느라
// `await Promise.all([...])` 한 번만 기다린다 — 옛 규칙대로면 그 한 줄이 걸린다.
// 하지만 **지키려던 것은 그대로다: boot 안의 기다림 가운데 시간 제한 없는 것이 없다.**
// 그래서 「`await` 뒤 글자」가 아니라 **기다리는 것 하나하나**를 본다.
{
  const inside = boot.slice(boot.indexOf('Promise.all'), boot.indexOf('} catch'))
  check(/withTimeout\(migrateLegacyDraftOnce\(\)/.test(inside), '이관에 시간 제한이 있다')
  check(/withTimeout\(get\(\)\.loadList\(\)/.test(inside), '목록에 시간 제한이 있다')
  // 폴더는 `loadFolders` **안쪽**에 제한이 있다 — 부르는 데가 셋이라(나무·목록 화면·
  // boot) 바깥에 두면 한 곳만 빠뜨려도 그 길만 영영 기다린다.
  const lf = code.slice(code.indexOf('loadFolders: async'), code.indexOf('boot: async'))
  check(/withTimeout\(apiListFolders/.test(lf) && /withTimeout\(\s*fetch/.test(lf),
    '폴더는 제 안에 시간 제한을 갖는다 (두 요청 다)')
  check((lf.match(/await/g) || []).length === (lf.match(/await withTimeout/g) || []).length,
    'loadFolders 안의 기다림도 전부 시간 제한을 거친다')

  // **나란히 돌린다.** 줄줄이 기다리면 8초 + 8초라 「불러오는 중」이 16초까지 갔다.
  check(/void Promise\.all\(\[/.test(boot), '곁다리는 띄워만 두고 안 기다린다')
  check(boot.indexOf('Promise.all') < boot.indexOf('await withTimeout(get().loadList'),
    '이관이 목록보다 앞에 서서 붙잡지 않는다')

  // **비운 사람이 도로 채운다.** boot 이 folders 를 비우므로 boot 이 다시 받아야 한다 —
  // 채우는 일을 화면에만 맡겨 두면 그 화면이 한 번 못 받는 순간 빈 채로 남는다.
  check(/folders: \[\]/.test(boot) && /loadFolders\(\)/.test(boot),
    'boot 이 폴더를 비웠으면 boot 이 다시 받는다')
}

// 실패를 조용히 0개로 두지 않는다
//
// **글자를 못박던 것을 뗐다**(2026-09-16). 전에는 `listError: '목록을 불러오지
// 못했어요.'` 라는 **문장 그대로**를 봤다. 그 문장이 없어진 것은 뜻이 바뀌어서가
// 아니라, 한 문장이 **서로 다른 세 가지**를 뭉뚱그리고 있어서다 — 서버에 닿지
// 못한 것 · 서버가 거절한 것 · 기다리다 끊은 것. 사용자가 실제로 겪었을 때
// 화면만 보고는 어느 쪽인지 알 수 없어 서버 로그를 뒤져야 했다.
// 이제 글은 `loadError.ts` 가 갈래에 맞춰 만든다(자세한 것은 load_error.test.mjs).
// **지키려던 것은 그대로다: 실패를 빈 목록으로 삼키지 않는다.**
{
  // **`openProject:` 로 끊으면 안 된다** — 같은 이름이 타입 선언에도 있고 그게 앞에
  // 나와서 자른 조각이 비어 버린다(여기서 한 번 걸렸다). 구현부끼리 자른다.
  const ll0 = code.indexOf('loadList: async')
  const ll = code.slice(ll0, code.indexOf('openProject: async', ll0))
  const cat = ll.slice(ll.indexOf('} catch'))
  check(/list: \[\]/.test(cat) && /listError:/.test(cat),
    '못 받아 오면 **빈 목록과 함께 까닭을 남긴다**')
  check(/loadErrorText\(e, '목록'\)/.test(cat),
    '그 까닭은 갈래를 따져 적는다 — 한 문장으로 뭉치지 않는다')
  check(!/listError: null/.test(cat),
    '실패하고서 까닭을 지우지 않는다')
}
check(/listError \? \(/.test(bare(lib)) && /다시 시도/.test(lib),
  '**0개와 못 받아 온 것을 갈라 그리고**, 다시 시도할 길을 준다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
