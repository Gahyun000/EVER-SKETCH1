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

/**
 * **주석을 걷어 낸 소스.** 이걸 안 쓰면 검사가 거짓으로 통과한다 —
 * 바로 위 주석이 찾으려는 글자를 적어 두고 있으면, 정작 코드에서 지워도 주석이 걸린다.
 * 이 파일에서 **두 번** 그랬다(2026-09-08): `dismissible={false}` 와 `cancel="closeX"`.
 * 둘 다 「왜 이렇게 했는지」를 주석에 적어 둔 자리라, 앞으로도 계속 그럴 것이다.
 * 그래서 소스에서 무언가를 찾는 검사는 **전부** 이걸 통과시킨다.
 */
const bare = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
const readBare = (p) => bare(read(p))

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

// A② 때는 확인창 셋(es-confirm·lib-confirm·ui-scrim)만 봤다. 그래서
// 도움말·환경설정·AI정리·예시영상·삽입 다섯이 손으로 그린 채로 통과했다 —
// **검사가 좁으면 「없다」가 아니라 「안 봤다」다.** 덮개 이름을 다 적는다.
// **낱말 하나를 통째로** 본다. `\b...\b` 로 `scrim` 을 찾으면 `cpk-scrim` 까지 걸린다
// (`-` 와 `s` 사이가 낱말 경계다). 실제로 걸렸고, 그건 대화상자가 아니다.
const DIALOG_SCRIMS = ['es-confirm', 'lib-confirm', 'ui-scrim', 'scrim', 'demo-scrim', 'ins-scrim']
// **예외 하나.** `cpk-scrim` 은 「새 페이지」 버튼에 붙은 **드롭다운**의 클릭 받이다.
// 화면 가운데 뜨는 창이 아니라 ui/Modal 로 옮기지 않는다 — 대신 Esc 를 넣었고,
// 그건 아래에서 따로 확인한다. 예외를 **글로 적어 둔다**: 다음 사람이
// 「왜 이건 통과하지」를 코드에서 찾지 않도록.
const classOf = (line) => {
  const m = /<div\s+className=(["'])([^"']*)\1/.exec(line)
  return m ? m[2].split(/\s+/) : []
}
const HAND = (line) => classOf(line).some((c) => DIALOG_SCRIMS.includes(c))
const hits = []
for (const f of tsxFiles) {
  bare(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
    if (HAND(line)) hits.push(`${f.replace(ROOT, 'src/')}:${i + 1}`)
  })
}
check(hits.length === 0,
  '스크림을 손으로 그린 곳이 없다 — 확인창은 ui/Modal 로만 만든다',
  hits.join(', '))

// ── 2-2. 덮개 클래스가 껍데기와 싸우지 않는다 ───────────
//
// `scrimClassName` 은 `.ui-scrim` 과 **같은 요소**에 붙는다. 그 클래스가
// position·z-index 를 다시 적으면 어느 쪽이 이기는지 **번들 순서가 정한다** —
// 오늘 되고 내일 안 되는 종류의 버그다.
const SCRIMS = ['scrim', 'demo-scrim', 'ins-scrim', 'es-confirm', 'lib-confirm']
for (const f of cssFiles) {
  const src = readFileSync(f, 'utf8')
  for (const name of SCRIMS) {
    const re = new RegExp('\\.' + name + '\\s*\\{([^}]*)\\}', 'g')
    let m
    while ((m = re.exec(src))) {
      check(!/z-index|position\s*:\s*fixed/.test(m[1]),
        `.${name} 이 껍데기의 자리·순서를 다시 적지 않는다 (${f.replace(ROOT, 'src/')})`,
        m[1].trim().slice(0, 60))
    }
  }
}

// ── 3. 껍데기가 지키기로 한 것들 ────────────────────
const modal = read('./src/ui/Modal.tsx')
const mcss = read('./src/ui/modal.css')

check(/e\.key !== 'Escape'/.test(modal) && /addEventListener\('keydown', onKey, true\)/.test(modal),
  'Esc 로 닫힌다 — capture 로 잡아 캔버스로 새지 않게 한다')
check(/document\.body\.style\.overflow = 'hidden'/.test(modal), '배경 스크롤을 잠근다')
check(/prev && document\.contains\(prev\)\) prev\.focus\(\)/.test(modal), '닫을 때 포커스를 원래 자리로 돌려놓는다')
check(/e\.key !== 'Tab'/.test(modal) && /first\.focus\(\)/.test(modal), 'Tab 이 창 안에 갇힌다')
check(/role="dialog" aria-modal="true"/.test(modal), '읽어 주는 도구에게 대화상자라고 알린다')

// **나가는 길은 타입이 지킨다.**
// `footer` 만 필수이던 때에는 「footer 가 있다」만 보장했지 「나갈 수 있다」를
// 보장하지 않았다 — `footer={<button>삭제</button>}` 하나짜리 창을 만들 수 있었다.
check(/\n  cancel: ModalCancel/.test(modal),
  'cancel 은 필수다 — 나가는 길이 없는 창은 타입이 거절한다')
check(/footer\?: ReactNode/.test(modal),
  'footer 는 선택이다 — 보기만 하는 창은 행동 버튼이 없다')
check(/\{ label: string; onClick: \(\) => void \} \| 'closeX'/.test(modal),
  '나가는 길은 「버튼」이거나 「✕」다 — 둘 다 없을 수는 없다')
check(/cancel === 'closeX' \? \([\s\S]{0,200}ui-modal-x/.test(modal),
  '✕ 는 closeX 라고 적은 창에만 나온다')

// 취소가 없는 창(보기만 하는 창)은 실제로 closeX 를 쓰고 있는가.
for (const [f, why] of [['./src/builder/DemoPlayer.tsx', '예시영상'],
                        ['./src/builder/InsertPicker.tsx', '삽입 고르기']]) {
  check(/cancel="closeX"/.test(readBare(f)), `${why} 은 취소가 없으므로 ✕ 를 단다`)
}

// **`busy` 와 `dismissible` 은 다른 일을 한다.** 한 값이 겸하면,
// 처리가 끝난 뒤 Esc 한 번에 임시 비밀번호가 사라진다.
check(/dismissible\?: boolean/.test(modal) && /dismissRef\.current/.test(modal),
  '「아직 안 끝났다(busy)」와 「실수로 닫으면 되돌릴 수 없다(dismissible)」를 갈라 둔다')
check(/dismissible=\{false\}/.test(readBare('./src/auth/UsersAdmin.tsx')),
  '임시 비밀번호 창은 Esc 로 안 닫힌다 — 그 창에만 있는 값이다')

// **대화상자가 아니어도 나가는 길은 있어야 한다.**
// 「새 페이지 고르기」는 버튼에 붙은 드롭다운이라 ui/Modal 로 옮기지 않았다.
// 그런데 나가는 길이 **바깥 누르기 하나뿐이었다** — 버튼도 Esc 도 없었다.
check(/e\.key !== 'Escape'/.test(readBare('./src/builder/CardPicker.tsx')),
  '새 페이지 드롭다운도 Esc 로 닫힌다 — 모달이 아니어도 갇히면 안 된다')

// ── 4. 빨강은 「잃는다」는 뜻이다 ──────────────────
//
// 표준은 「되돌릴 수 없는 일은 **눈으로도 글로도** 구분한다」고 적었다.
// 지키기 전에는 빨강이 **「승인이 아닌 쪽」**이라는 뜻으로 쓰이고 있었다 —
// 결재함의 반려·거절·거두기·그만두기가 전부 빨강인데 넷 다 아무것도 안 잃는다.
// 빨강이 흔해지면, 정작 이북 삭제·계정 중지에서 **아무 말도 안 하게 된다.**
//
// 그래서 규칙을 뒤집어 못박는다:
// **빨강 버튼이 있는 창은 무엇을 잃는지 글로 적혀 있어야 한다.**
// 잃는 게 없으면 빨강을 쓰지 않는다 — 그게 「눈으로도 글로도」의 뜻이다.
const LOSS = /되돌릴 수 없|지울 수 없|사라집니다|사라지므로|다시 로그인할 수 없|저장되지 않을 수 있/
// **낱말만 본다.** 처음에는 `className={'... danger'}` 모양을 찾았는데,
// UsersAdmin 의 중지 버튼은 `` className={`es-mini ${... ? 'danger' : 'primary'}`} `` 라
// 안쪽 따옴표에서 끊겨 **아예 검사되지 않았다.** 가장 위험한 창 하나가
// 조용히 빠져 있었던 셈이다 — 모양을 맞추는 정규식은 이렇게 샌다.
const DANGER = /\bdanger\b/

for (const f of tsxFiles) {
  const src = bare(readFileSync(f, 'utf8'))
  let i = 0
  while ((i = src.indexOf('<Modal', i)) !== -1) {
    const j = src.indexOf('</Modal>', i)
    const seg = src.slice(i, j === -1 ? src.length : j)
    i = j === -1 ? src.length : j + 1
    if (!DANGER.test(seg)) continue
    const title = (/title=(\{[^\n]*|"[^"]*")/.exec(seg) || [, '(제목 없음)'])[1].slice(0, 30)
    check(LOSS.test(seg),
      `빨강 버튼이 있는 창은 무엇을 잃는지 글로 적는다 — ${f.replace(ROOT, 'src/')} ${title}`)
  }
}

// **이 검사의 한계를 적어 둔다.** 창 하나가 여러 일을 하면(결재함은 승인·반려·허락·
// 거절·거두기·그만두기 여섯을 한 창으로 묻는다) 「빨강 버튼」과 「잃는다는 문구」가
// **같은 갈래인지** 이 검사는 모른다 — 다른 갈래의 문구가 대신 걸린다.
// 실제로 반려를 다시 빨강으로 되돌려 봤더니 잡히지 않았다.
// 그래서 그 창만 따로, **무엇이 빨강이어야 하는지**를 못박는다.
const ap = bare(read('./src/approvals/ApprovalsPanel.tsx'))
check(/className=\{'es-mini' \+ \(confirm === 'approve' \? ' primary' : ''\)\}/.test(ap),
  '결재함에서 빨강은 아무 데도 안 쓴다 — 여섯 갈래 중 잃는 것이 있는 갈래가 없다')

// 본문 글자는 껍데기가 정한다 — 창마다 들고 오면 13px 과 13.5px 로 갈린다.
check(/\.ui-modal-body\s*\{[^}]*font-size/.test(mcss), '본문 글자 크기를 껍데기가 한 곳에서 정한다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
