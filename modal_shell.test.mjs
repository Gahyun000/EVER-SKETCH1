// 확인창은 **하나의 껍데기**로 뜨고, **아무것도 그것을 가리지 못한다**.
//
// 이 파일이 생긴 이유가 둘이다.
//
// 하나. 껍데기를 옮기면서 하마터면 창을 안 보이게 만들 뻔했다.
//   `ui-scrim` 은 z-index 300 이었고, 결재함·계정·팀 화면은 4000 짜리 덮개 위에 뜬다.
//   그대로 갈아 끼웠다면 관리자가 「승인」을 눌렀을 때 확인창이 **덮개 뒤로 숨는다** —
//   화면은 멈춘 채(스크림이 클릭을 먹으니까) 아무 일도 안 일어난 것처럼 보인다.
//   `es-confirm` 이 4200 이던 것은 우연이 아니었는데, 그 4200 은 CSS 파일 안에만 있었고
//   **아무도 그 이유를 지키고 있지 않았다.** 여기서 지킨다.
//
// 둘. 손으로 그린 확인창이 여덟 개까지 늘어난 것은 급할 때 그게 제일 빨라서다.
//   Esc·포커스·배경 잠금을 매번 잊는 종류의 일이라, 사람이 눈으로 찾는 대신 여기서 막는다.
//
// 실행: node modal_shell.test.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')
const ROOT = new URL('./src/', import.meta.url).pathname

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

// ── 1. 확인창은 무엇보다 위에 있다 ─────────────────────
//
// **가장 큰 z-index 를 직접 찾는다.** 「4200 이라고 적혀 있다」로 못박으면
// 내일 누가 5000 짜리 덮개를 만들 때 이 검사는 통과하면서 창은 숨는다.
const cssFiles = []
const walkCss = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkCss(p)
    else if (name.endsWith('.css')) cssFiles.push(p)
  }
}
walkCss(ROOT)

const zs = []
for (const f of cssFiles) {
  const src = readFileSync(f, 'utf8')
  // 규칙 하나를 통째로 보고, 그 안의 z-index 를 선택자와 함께 모은다.
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(src))) {
    const zm = /z-index:\s*(\d+)/.exec(m[2])
    if (!zm) continue
    const sel = m[1].trim().split('\n').pop().trim()
    // 화면을 덮지 않는 것들은 뺀다 — 표 안 배지, 마퀴 같은 것.
    if (!/position:\s*fixed/.test(m[2])) continue
    zs.push({ sel, z: Number(zm[1]), file: f.replace(ROOT, 'src/') })
  }
}

const scrim = zs.find((r) => r.sel.includes('.ui-scrim'))
check(!!scrim, '(사전) .ui-scrim 의 z-index 를 찾았다 — 못 찾으면 아래 검사가 조용히 통과한다')

if (scrim) {
  const above = zs.filter((r) => !r.sel.includes('.ui-scrim') && r.z >= scrim.z)
  check(above.length === 0,
    `확인창(z-index ${scrim.z})을 가리는 것이 없다`,
    above.map((r) => `${r.sel} ${r.z} (${r.file})`).join(', '))
}

// ── 2. 껍데기는 하나다 ─────────────────────────────
//
// **`<div>` 에 직접 붙은 것만 잡는다.** 옮긴 창들은 화면 검사가 찾던 선택자를
// `scrimClassName="es-confirm"` 으로 그대로 넘겨 주고 있어서,
// 글자로 잡으면 방금 고친 코드를 틀렸다고 한다.
const tsxFiles = []
const walkTsx = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkTsx(p)
    else if (/\.tsx$/.test(name)) tsxFiles.push(p)
  }
}
walkTsx(ROOT)

const HAND = /<div\s+className=(["'])[^"']*\b(es-confirm|lib-confirm|ui-scrim)\b/
const hits = []
for (const f of tsxFiles) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (HAND.test(line)) hits.push(`${f.replace(ROOT, 'src/')}:${i + 1}`)
  })
}
check(hits.length === 0,
  '스크림을 손으로 그린 곳이 없다 — 확인창은 ui/Modal 로만 만든다',
  hits.join(', '))

// ── 3. 껍데기가 지키기로 한 것들 ────────────────────
const modal = read('./src/ui/Modal.tsx')
const mcss = read('./src/ui/modal.css')

check(/e\.key !== 'Escape'/.test(modal) && /addEventListener\('keydown', onKey, true\)/.test(modal),
  'Esc 로 닫힌다 — capture 로 잡아 캔버스로 새지 않게 한다')
check(/document\.body\.style\.overflow = 'hidden'/.test(modal), '배경 스크롤을 잠근다')
check(/prev && document\.contains\(prev\)\) prev\.focus\(\)/.test(modal), '닫을 때 포커스를 원래 자리로 돌려놓는다')
check(/e\.key !== 'Tab'/.test(modal) && /first\.focus\(\)/.test(modal), 'Tab 이 창 안에 갇힌다')
check(/role="dialog" aria-modal="true"/.test(modal), '읽어 주는 도구에게 대화상자라고 알린다')

// 닫기 ✕ 는 없다 — 모든 창에 「취소」가 있다(사용자 결정 2026-09-08).
// 대신 **나가는 길이 하나도 없는 창**을 못 만들도록 footer 를 필수로 받는다.
check(!/ui-modal-x/.test(modal) && !/ui-modal-x/.test(mcss),
  '닫기 ✕ 는 없다 — 나가는 길은 「취소」 하나로 족하다')
check(/\n  footer: ReactNode/.test(modal),
  'footer 는 필수다 — 비워 두면 Esc 를 아는 사람만 나갈 수 있는 창이 된다')

// **`busy` 와 `dismissible` 은 다른 일을 한다.** 한 값이 겸하면,
// 처리가 끝난 뒤 Esc 한 번에 임시 비밀번호가 사라진다.
check(/dismissible\?: boolean/.test(modal) && /dismissRef\.current/.test(modal),
  '「아직 안 끝났다(busy)」와 「실수로 닫으면 되돌릴 수 없다(dismissible)」를 갈라 둔다')
// **주석을 걷어 내고 본다.** 바로 위 주석이 `dismissible={false}` 라고 적어 두었기 때문에,
// 그냥 찾으면 속성을 지워도 주석이 대신 걸려 **검사가 거짓으로 통과한다.**
// 실제로 그랬다 — 일부러 지워 봤더니 아무것도 안 잡혔다(2026-09-08).
const bare = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
check(/dismissible=\{false\}/.test(bare(read('./src/auth/UsersAdmin.tsx'))),
  '임시 비밀번호 창은 Esc 로 안 닫힌다 — 그 창에만 있는 값이다')

// 본문 글자는 껍데기가 정한다 — 창마다 들고 오면 13px 과 13.5px 로 갈린다.
check(/\.ui-modal-body\s*\{[^}]*font-size/.test(mcss), '본문 글자 크기를 껍데기가 한 곳에서 정한다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
