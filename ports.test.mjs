// **포트가 한 값으로 모여 있는가.**
//
// 2026-09-17 · 이 파일이 생긴 이유를 먼저 적는다.
//
// 대장과 레지스트리는 EVER-SKETCH 를 **8808** 로 예약해 두었는데, 앱은 **8820** 으로
// 떠 있었다. 예약은 2026-09-02 에 「실기동 전」 상태로 받아 놓고, 그 뒤 실행기를 아무도
// 안 맞춘 것이다. 8820 은 표준지침이 **DataBuilder_AI_Agent** 에 예약한 포트다.
//
// **아무 경보도 안 울렸다.** 셋 다 조용하다.
//   · 앱은 잘 뜬다 — 8820 이 비어 있었으니까.
//   · 대장의 「중복 0건」 점검도 통과한다 — 8820 이 포트표에 **없었기** 때문이다
//     (§2 본문의 예약 문장에만 있었다).
//   · 테스트도 다 통과한다 — 포트를 재는 테스트가 없었으니까.
// 사람이 대장을 다시 펴 보기 전에는 알 길이 없었다. 실제로 보름 걸렸다.
//
// **재는 것은 두 가지다.**
//   ① 값이 **한 곳**에 있는가 — 흩어진 값은 반드시 갈라진다. 이번이 그 증거다.
//      (`run.command`·`run.cmd`·`vite.config.ts`·진단 스크립트 네 군데에 8820 이
//       따로 적혀 있었고, 대장은 8808 이었다. 넷이 다 달랐다.)
//   ② 그 한 값이 **정본과 같은가** — 레지스트리에서 읽어 와서 대조한다. 숫자를 여기
//      박아 두면 포트를 옮길 때 이 파일도 같이 고치게 되고, 그러면 둘이 함께 틀린 채로
//      통과한다. 가드가 아니라 메아리가 된다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs ports.test.mjs
import { readFileSync, existsSync } from 'node:fs'

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
/** 주석을 걷는다(`#`·`rem`·`//`·`/* *​/`). **주석에 적힌 말은 하는 일이 아니다.** */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*(#|rem\s|REM\s|\/\/).*$/gm, '')

const PORTS = JSON.parse(read('./ports.json'))

// ── ① 정본은 한 곳이다 ────────────────────────────────
{
  check(Number.isInteger(PORTS.backend), 'ports.json 에 backend 포트가 있다', String(PORTS.backend))
  check(Number.isInteger(PORTS.folio), 'ports.json 에 folio 포트가 있다', String(PORTS.folio))
  // **없음과 안 정함은 다르다.** 프론트 포트는 진짜로 없다(BE 단독 서빙).
  check(PORTS.frontend === null,
    '프론트 포트는 **없음(null)** 으로 적혀 있다 — 빠뜨린 것과 구분된다')
  check(PORTS.backend !== PORTS.folio, '앱과 EVER-FOLIO 가 같은 포트를 쓰지 않는다')
  // 표준 배정 풀 밖으로 나가면 다음 감사가 「어디서 온 값이냐」를 묻는다.
  check(PORTS.backend >= 8800 && PORTS.backend <= 9199,
    '백엔드 예약 풀(8800–9199) 안이다 — port-governance 의 Allocation policy')
}

// ── ② 실행기가 **제 숫자를 안 들고 있다** ───────────────
// 여기가 이 파일의 핵심이다. 한 군데라도 숫자를 직접 적으면 그날부터 갈라진다.
{
  const LAUNCHERS = ['run.command', 'run.cmd', 'vite.config.ts', '진단.command']
  for (const f of LAUNCHERS) {
    check(existsSync(f), `${f} 가 있다`)
    if (!existsSync(f)) continue
    const src = read(f)
    // 주석은 걷는다 — 「예전에 8820 이었다」는 **기록**이라 지우면 안 된다.
    const bare = src
      .replace(/^\s*(#|rem |REM |\/\/).*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const nums = [...bare.matchAll(/\b(8[0-9]{3}|5[0-9]{3})\b/g)].map((m) => m[0])
    // 대비값(|| 8811, || 8808)은 허용한다 — 정본을 못 읽었을 때 쓰는 값이라
    // 정본과 **같기만 하면** 갈라질 수 없다.
    const bad = nums.filter((n) => Number(n) !== PORTS.backend && Number(n) !== PORTS.folio)
    check(bad.length === 0,
      `**${f} 가 제 포트 숫자를 안 들고 있다**`, bad.join(' '))
    check(/ports\.json/.test(src), `${f} 가 ports.json 을 읽는다`)
  }
}

// ── ③ 정본이 대장·레지스트리와 같은가 ────────────────────
// 레지스트리는 표준팩(default_skill)이 정본이고, 이 저장소 안 사본은 **이식본**이다.
// 이식본을 고치면 표준 검증(UNIEVER_SKILL_MANIFEST 해시)이 깨진다 — 그래서 읽기만 한다.
{
  const REG = './skills/dev-standard-control-tower/references/agent-port-registry.json'
  if (!existsSync(REG)) {
    check(false, '이식된 포트 레지스트리가 있다', REG)
  } else {
    const reg = JSON.parse(read(REG))
    const rows = []
    const walk = (o) => {
      if (Array.isArray(o)) o.forEach(walk)
      else if (o && typeof o === 'object') {
        if (o.name && (o.backend_port !== undefined || o.backend_ports)) rows.push(o)
        Object.values(o).forEach(walk)
      }
    }
    walk(reg)
    const mine = rows.find((r) => r.name === 'EVER-SKETCH')
    check(!!mine, '레지스트리에 EVER-SKETCH 예약이 있다')
    if (mine) {
      const be = mine.backend_port ?? (mine.backend_ports || [])[0]
      check(be === PORTS.backend,
        '**예약한 포트로 실제로 뜬다** — 예약만 하고 실기동을 안 맞춘 것이 이번 일이었다',
        `예약 ${be} · ports.json ${PORTS.backend}`)
    }

    // **남의 포트를 물지 않는가.** 다른 프로젝트가 잡아 둔 포트와 겹치면 안 된다.
    const others = rows.filter((r) => r.name !== 'EVER-SKETCH')
    const taken = new Map()
    for (const r of others) {
      for (const p of [r.frontend_port, r.backend_port,
                       ...(r.frontend_ports || []), ...(r.backend_ports || []),
                       ...(r.auxiliary_ports || [])]) {
        if (Number.isInteger(p)) taken.set(p, r.name)
      }
    }
    check(!taken.has(PORTS.backend),
      '**우리 포트를 다른 프로젝트가 안 잡고 있다**', taken.get(PORTS.backend) || '')
  }
}

// ── ④ 표준 런처 네 이름이 있는가 ─────────────────────────
// 대장 §2: 「모든 폴더에 start.bat·start.command·stop.bat·stop.command 를 갖춘다」.
// 없으면 대장의 자동 점검이 이 프로젝트를 「런처 없음」으로 본다.
{
  for (const f of ['start.command', 'stop.command', 'start.bat', 'stop.bat']) {
    check(existsSync(f), `표준 런처 ${f} 가 있다`)
  }
  // **절차를 두 벌 적지 않았는가.** start 가 run 을 부르지 않고 제 손으로 띄우면
  // 언젠가 한쪽만 고쳐진다 — 포트가 갈라진 것과 똑같은 일이 절차에서 벌어진다.
  //
  // **주석을 걷고 본다**(부숴 보고 알았다, 2026-09-17). 걷지 않으면 이 줄은 헛돈다 —
  // 두 파일 다 주석에 「기동 절차는 run.command 에 있다」고 적어 두었기 때문에,
  // 실제 호출을 통째로 딴것으로 바꿔도 그 글자에 걸려 통과했다. 오늘 `viewer_screen`
  // 에서 똑같은 것을 하나 고쳤는데 새로 쓰면서 또 같은 실수를 했다.
  check(/(^|\n)\s*exec\s+\.\/run\.command\b/.test(strip(read('start.command'))),
    'start.command 는 run.command 를 **정말로 부른다** — 기동 절차를 두 벌 적지 않았다')
  check(/(^|\n)\s*call\s+run\.cmd\b/.test(strip(read('start.bat'))),
    'start.bat 는 run.cmd 를 **정말로 부른다**')
}

// ── ⑤ 세우기가 포트만 보고 죽이지 않는가 ──────────────────
// 포트로 찾아 죽이면 **남의 프로세스를 죽인다.** 8808 이 우리 것이라도, 누가 먼저
// 물고 있을 때 그걸 끄는 것은 우리가 할 일이 아니다.
{
  const raw = read('stop.command')
  const sc = strip(raw)
  check(/(pgrep|pkill)\s+(-\w+\s+)*-f\s+["']uvicorn server\.app:app/.test(sc),
    '**우리 프로세스를 이름으로 고른다**(pgrep/pkill -f "uvicorn server.app:app")')
  // **여기가 부숴 보고 고친 자리다.** 예전에는 `uvicorn server.app:app` 이 파일 어딘가에
  // 있기만 하면 통과했다. 그래서 죽이는 줄만 `lsof -ti tcp:<포트>` 로 바꿔 놔도 —
  // 즉 **포트로 찾아 남의 프로세스를 죽이게 만들어도** — 뒤쪽 확인 루프에 남은 글자에
  // 걸려 그냥 통과했다. 이제는 **포트로 찾는 수법 자체가 있으면 떨어진다.**
  check(!/lsof\s+[^\n]*-t|fuser|netstat[^\n]*\|\s*[^\n]*kill/.test(sc),
    '**포트로 찾아 죽이지 않는다** — 8808 이 우리 것이라도 남이 물고 있으면 그건 남의 것이다')
  check(!new RegExp(`kill[^\\n]*${PORTS.backend}`).test(sc),
    '포트 번호를 죽이는 명령에 넘기지 않는다')
  check(/EVER-FOLIO|folio/i.test(raw),
    'EVER-FOLIO 는 건드리지 않는다고 적어 두었다 — 다른 데서 띄웠을 수 있다')
  check(!/(pgrep|pkill|kill)[^\n]*serve\.py/.test(sc),
    '**EVER-FOLIO 를 실제로 안 죽인다** — 적어 두기만 하고 죽이면 적어 둔 쪽이 거짓말이다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
