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
const PORT = process.env.PORT || '8899'

const SUITES = [
  { name: '로그인 · 비밀번호 보기', file: 'login_password_smoke.mjs', env: { ANON: '1' } },
  { name: '표 셀 드래그 · 병합', file: 'table_merge_smoke.mjs', env: {} },
  { name: '배부 창구 · 미리보기', file: 'distribute_smoke.mjs', env: { ADMIN: '1', DECK: '1', EMPTY: '1' } },
  { name: '배부 회수', file: 'revoke_smoke.mjs', env: { ADMIN: '1' } },
]

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function runOne(suite) {
  const mock = spawn(process.execPath, [join(dir, 'es_mock.mjs')], {
    env: { ...process.env, ...suite.env, PORT },
    stdio: 'ignore',
  })
  await wait(1500)
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
