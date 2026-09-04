// 모의 서버(`e2e/es_mock.mjs`)가 **실제로 뜨고, 화면이 읽는 모양으로 답하는지** 지킨다.
//
// 왜 이 파일이 있는가 — 2026-09-04(P8)에 e2e 를 처음 다시 돌려 보니
// **여섯 스위트 중 다섯이 죽어 있었다.** 원인은 전부 모의 서버였다:
//   · `comments` · `cmtSeq` · `lastShift` 선언이 P2(회차 제거)에 딸려 지워져
//     의견 요청마다 `ReferenceError` 로 **서버가 통째로 죽었다**
//   · P4~P7 에 생긴 엔드포인트(`/api/folders` 등)를 catch-all 이 `{ok:true}` 로
//     때워서, `folders` 가 undefined 로 화면까지 흘러가 **목록이 하얗게 떴다**
//
// 둘 다 **브라우저 없이 잡을 수 있는 고장**이었는데, e2e 는 브라우저가 있어야
// 돌아가서(장치 VM 에는 없다) 아무도 몰랐다. 그래서 브라우저가 필요 없는 검사만
// 떼어내 여기 둔다 — **모의 서버가 썩으면 여기서 먼저 걸린다.**
//
// 실행: node e2e_mock_contract.test.mjs

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

const PORT = 8700 + (process.pid % 200)
const BASE = `http://127.0.0.1:${PORT}`
const mockPath = new URL('./e2e/es_mock.mjs', import.meta.url).pathname

// 서버가 죽으면 그 사실을 **여기서** 말한다 — 테스트 안에서 헤매지 않게.
const stderr = []
const mock = spawn(process.execPath, [mockPath], {
  env: { ...process.env, PORT: String(PORT), COMMENTS: '1' },
  stdio: ['ignore', 'ignore', 'pipe'],
})
mock.stderr.on('data', (c) => stderr.push(String(c)))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const get = (p) => fetch(BASE + p).then((r) => r.json())
const post = (p, body) => fetch(BASE + p, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body || {}),
}).then((r) => r.json())

try {
  let up = false
  for (let i = 0; i < 40 && !up; i++) {
    await wait(100)
    try { up = (await fetch(`${BASE}/api/auth/me`)).ok } catch { /* 아직 */ }
  }
  check(up, '모의 서버가 뜬다', stderr.join('').slice(0, 200))
  if (!up) throw new Error('mock down')

  // ── 화면이 뜨자마자 부르는 것들 ──────────────────────
  // **여기 있는 것은 전부 「응답의 값을 실제로 읽는」 호출이다.**
  // catch-all 의 `{ok:true}` 로 때우면 화면이 undefined 를 만진다.
  const me = await get('/api/auth/me')
  check(!!me.user && typeof me.user.role === 'string', '/api/auth/me 가 { user } 를 준다')

  const projects = await get('/api/projects')
  check(Array.isArray(projects.projects) && projects.projects.length === 1,
    '/api/projects 가 { projects: [...] } 를 준다')

  const folders = await get('/api/folders')
  check(Array.isArray(folders.folders), '/api/folders 가 **배열**을 준다',
    JSON.stringify(folders).slice(0, 80))
  check(typeof folders.max_depth === 'number', '/api/folders 가 max_depth 를 준다')

  const chips = await get('/api/approvals/status-map')
  check(chips.status_map && typeof chips.status_map === 'object',
    '/api/approvals/status-map 이 { status_map } 을 준다')

  const box = await get('/api/approvals')
  check(Array.isArray(box.approvals), '/api/approvals 가 { approvals: [...] } 를 준다')

  const teamlib = await get('/api/team-library')
  check(Array.isArray(teamlib.teams), '/api/team-library 가 { teams: [...] } 를 준다')

  const project = await get('/api/projects/p_test')
  check(!!project.state && Array.isArray(project.state.pages),
    '/api/projects/{id} 가 문서를 준다')
  check(!!project.access && typeof project.access.can_write === 'boolean',
    '/api/projects/{id} 가 access 를 준다 — 화면이 잠금을 여기서 읽는다')

  // ── 검토 의견 — **P2 에서 죽었던 자리** ──────────────────────
  const cs = await get('/api/projects/p_test/comments')
  check(Array.isArray(cs.comments) && cs.comments.length === 1,
    'COMMENTS=1 이면 미해결 지적 하나로 시작한다',
    JSON.stringify(cs).slice(0, 120))
  check(cs.comments[0]?.cell === '3_5' && cs.comments[0]?.el_id === 100006,
    '그 지적이 표의 그 칸(3_5)을 가리킨다 — 스위트가 이 값을 짚는다')

  const made = await post('/api/projects/p_test/comments',
    { page_id: 1, el_id: 100006, cell: '2_2', body: '새 지적' })
  check(made.ok && made.comment?.id, '의견을 쓰면 만들어진 것을 돌려준다')
  const after = await get('/api/projects/p_test/comments')
  check(after.comments.length === 2, '쓴 의견이 목록에 늘어난다',
    `${cs.comments.length} → ${after.comments.length}`)

  // ── 앵커 이동 — **여기서도 서버가 죽고 있었다** ──────────────────────
  const shifted = await post('/api/projects/p_test/comments/shift',
    { page_id: 1, el_id: 100006, op: 'row_delete', index: 2, on_lost: 'keep' })
  check(shifted.ok === true, '앵커 이동 요청이 처리된다 (서버가 안 죽는다)',
    JSON.stringify(shifted).slice(0, 120))
  const last = await get('/__lastShift')
  check(last.op === 'row_delete', '무엇을 보냈는지 되읽을 수 있다 (`/__lastShift`)',
    JSON.stringify(last).slice(0, 120))

  // 서버는 **끝까지 살아 있어야** 한다 — 중간에 죽으면 뒤의 검사가 전부 거짓 통과한다.
  check((await fetch(`${BASE}/api/auth/me`)).ok, '검사가 끝날 때까지 서버가 살아 있다')
  check(stderr.join('').length === 0, '모의 서버가 아무 오류도 안 냈다',
    stderr.join('').slice(0, 200))
} finally {
  mock.kill()
}

// ── 선언 없이 쓰는 이름이 또 생기지 않게 ──────────────────────
// 위 검사는 **부른 길**만 지킨다. 안 불린 분기에 같은 사고가 숨어 있을 수 있다.
{
  const src = readFileSync(mockPath, 'utf8')
  const missing = []
  for (const name of ['comments', 'cmtSeq', 'lastShift', 'state', 'META', 'ME',
    'WRITERS', 'ACCESS', 'PEER_STAGE', 'DIST', 'PORT']) {
    const declared = new RegExp(`(let|const|var|function)\\s+${name}\\b`).test(src)
    if (!declared && new RegExp(`\\b${name}\\b`).test(src)) missing.push(name)
  }
  check(missing.length === 0,
    '모의 서버가 선언 없는 이름을 쓰지 않는다 (P2 에서 세 개가 지워졌다)',
    missing.join(', '))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
