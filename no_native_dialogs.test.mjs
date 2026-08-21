// 브라우저 기본 창(window.alert / prompt / confirm)을 쓰지 않는다 — 소스 전체 검사.
//
// 왜 이 검사가 따로 있는가:
// 이건 화면을 열어봐야 아는 종류의 문제가 아니라, **한 줄만 슬쩍 들어가도 생기는**
// 문제다. 급할 때 `window.alert('실패')` 한 줄이 제일 빠르고, 그 한 줄이 남으면
//   - 회색 시스템 창이 우리 화면 위에 뜨고(만들다 만 물건으로 보인다)
//   - 확인을 누를 때까지 화면 전체가 멈추고
//   - `prompt` 는 한 줄밖에 못 받는다
// 게다가 자동화 테스트에서는 창이 뜬 채로 멈춰 **엉뚱한 곳에서 시간 초과**가 난다.
// 그래서 사람이 매번 눈으로 찾는 대신 여기서 막는다. 대신 src/ui/Modal.tsx 를 쓴다.
//
// 실행: node no_native_dialogs.test.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('./src/', import.meta.url).pathname
// 주석 안에서 이름을 언급하는 건 괜찮다(왜 안 쓰는지 적어 두는 주석이 실제로 있다).
// **부르는 것**만 잡는다 — 여는 괄호가 붙은 형태.
const BAD = /(?:^|[^.\w])(?:window\.)?(alert|confirm|prompt)\s*\(/

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(name)) files.push(p)
  }
}
walk(ROOT)

const hits = []
for (const f of files) {
  const lines = readFileSync(f, 'utf-8').split('\n')
  lines.forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return  // 주석은 넘어간다
    if (BAD.test(line)) hits.push(`${f.replace(ROOT, 'src/')}:${i + 1}  ${t.slice(0, 90)}`)
  })
}

console.log(`검사한 파일 ${files.length}개`)
if (hits.length) {
  console.log('✗ 브라우저 기본 창을 부르는 곳이 있습니다:')
  hits.forEach((h) => console.log('   ' + h))
  console.log('\n  → src/ui/Modal.tsx 를 쓰세요. 오류는 창 안에 표시하고,')
  console.log('     무엇을 하려다 실패했는지 함께 적습니다.')
  process.exit(1)
}
console.log('✓ 브라우저 기본 창을 쓰는 곳이 없습니다')
