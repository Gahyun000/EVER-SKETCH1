// 브라우저 회귀 테스트 전체 실행.
//
// 각 스위트는 서로 다른 초기 상태를 필요로 한다(로그아웃 / 작성자 / 관리자 /
// 배부 전 / 배부 후). 모의 서버를 그 상태로 띄웠다가 끄는 걸 여기서 한다 —
// 사람이 환경변수를 외워서 손으로 맞추게 두면, 결국 한두 개는 안 돌린다.
//
// 실행: node e2e/run_all.mjs
import { spawn } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const dir = dirname(fileURLToPath(import.meta.url))
// 기본 포트(8899)를 쓰면 앞선 실행이 남아 있을 때 새 모의 서버가 조용히 죽고,
// 테스트는 **엉뚱한 설정의 서버**에 붙어 이상한 곳에서 실패한다. 실행마다 포트를 바꾼다.
const PORT = process.env.PORT || String(8900 + (process.pid % 900))

const SUITES = [
  { name: '로그인 · 비밀번호 보기', file: 'login_password_smoke.mjs', env: { ANON: '1' } },
  { name: '표 셀 드래그 · 병합', file: 'table_merge_smoke.mjs', env: {} },
  { name: '배부 창구 · 미리보기', file: 'distribute_smoke.mjs', env: { ADMIN: '1', DECK: '1', EMPTY: '1' } },
  { name: '배부 회수', file: 'revoke_smoke.mjs', env: { ADMIN: '1' } },
  { name: '앵커 메모(검토 의견)', file: 'comments_smoke.mjs', env: { COMMENTS: '1' } },
  { name: '의견 쓰기 창(모달)', file: 'comment_modal_smoke.mjs', env: { COMMENTS: '1' } },
  { name: '대화상자 공용 껍데기', file: 'modal_shell_smoke.mjs', env: {} },
]

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function runOne(suite) {
  const mock = spawn(process.execPath, [join(dir, 'es_mock.mjs')], {
    env: { ...process.env, ...suite.env, PORT },
    stdio: 'ignore',
  })
  // 뜰 때까지 기다린다 — 안 뜨면 그 사실을 여기서 말한다(테스트 안에서 헤매지 않게).
  let up = false
  for (let i = 0; i < 40 && !up; i++) {
    await wait(150)
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/auth/me`)
      up = r.ok
    } catch { /* 아직 안 떴다 */ }
  }
  if (!up) {
    console.log(`  ✗ 모의 서버가 뜨지 않았습니다 (포트 ${PORT})`)
    mock.kill()
    return 1
  }
  const code = await new Promise((resolve) => {
    const t = spawn(process.execPath, [join(dir, suite.file)], {
      env: { ...process.env, URL: `http://127.0.0.1:${PORT}/` },
      stdio: 'inherit',
    })
    t.on('exit', resolve)
  })
  mock.kill()
  await wait(300)
  return code || 0
}

let failed = 0
for (const s of SUITES) {
  console.log(`\n━━ ${s.name}  (${s.file})`)
  const code = await runOne(s)
  if (code !== 0) failed++
}

console.log(failed ? `\n=== ${failed}개 스위트 실패 ===` : '\n=== 브라우저 테스트 전체 통과 ===')
process.exit(failed ? 1 : 0)
