// 편집 중인 칸은 **React 의 잎**이어야 한다 — 자식이 하나뿐이어야 한다.
//
// 왜 이게 규칙인가
//   contentEditable 은 브라우저가 DOM 을 직접 고치는 곳이다. React 도 같은 자리를
//   관리하려 들면 둘이 한 자리를 놓고 다툰다. 다투는 방식이 자식 수에 따라 갈린다.
//
//     자식이 하나(문자열)  → React 는 textContent 로 통째로 갈아 끼운다. 안전하다.
//     자식이 둘 이상        → React 는 마디를 하나씩 맞춰 넣는다. 이때
//                            React 가 빈 값('')으로 만들어 둔 글자 마디가 남은 채
//                            브라우저가 타자용 마디를 새로 만들어 **마디가 둘**이 된다.
//                            커밋한 값이 되돌아오면 React 는 자기 마디만 채우므로
//                            같은 글자가 두 번 찍힌다.
//
//   2026-09-07 에 실제로 이걸 겪었다. 빈 칸에 처음 글을 쓸 때만 두 번 찍혔고,
//   저장된 값은 멀쩡해서 「화면만 이상하다」로 보였다. 원인은 칸 안에 있던 의견 핀이었다 —
//   핀 하나 때문에 자식이 둘이 된 것이다.
//
//   핀은 두 번째 사고도 냈다. 커밋은 `n.textContent` 를 읽는데 핀은 **자기 개수를 글자로**
//   그린다(1, 2...). 의견이 하나 달린 칸에 '가' 를 쓰면 '가1' 이 저장됐다.
//   화면에는 안 보이고 저장에만 남는 종류의 오염이다.
//
// 그래서 핀은 칸 **밖**, 같은 격자 자리에 겹친 별도 칸에 그린다.
// 타입 검사도 서버 테스트도 이걸 못 잡는다 — 둘 다 문법상 멀쩡하기 때문이다.
//
// 실행: node table_cell_leaf.test.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const tsx = read('./src/canvas/FreeLayer.tsx')
const css = read('./src/comments/comments.css')

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

// ── 칸의 자식은 하나다 ────────────────────────────────
const CELL_OPEN = "className={'feltd'"
const CELL_CLOSE = '>{val}</div>'
const oi = tsx.indexOf(CELL_OPEN)
const ci = tsx.indexOf(CELL_CLOSE)

check(oi >= 0, '표 칸을 찾았다 (className={\'feltd\'})')
check(ci > oi, '표 칸의 자식은 {val} 하나이고 그 자리에서 닫힌다',
  '`>{val}</div>` 를 못 찾았다 — 칸에 자식이 더 붙었는지 확인하세요')

// 칸이 열린 곳부터 **첫 </div>** 까지가 칸의 안쪽이다.
// 위 검사(`>{val}</div>`)가 깨졌을 때 여기까지 덩달아 통과하면 안 되므로,
// 위 결과에 기대지 않고 따로 잘라 낸다.
const endi = oi >= 0 ? tsx.indexOf('</div>', oi) : -1
const inside = endi > oi ? tsx.slice(oi, endi) : tsx
check(!/<[A-Z][A-Za-z]*[\s/>]/.test(inside), '칸 안에 다른 컴포넌트가 없다',
  (inside.match(/<[A-Z][A-Za-z]*/) || [''])[0] + ' 가 칸 안에 있다')
check(!inside.includes('<Pin'), '의견 핀이 칸 **안**에 없다')

// ── 핀은 칸 밖, 같은 격자 자리에 있다 ──────────────────
const pi = tsx.indexOf('className="feltd-pin"')
check(pi > ci, '핀은 칸이 닫힌 **뒤**에 그려진다')
const pinBlock = pi >= 0 ? tsx.slice(pi, pi + 500) : ''
check(pinBlock.includes('<Pin'), '핀 자리에 실제로 Pin 이 들어 있다')
check(/data-r=\{r\}/.test(pinBlock) && /data-c=\{c\}/.test(pinBlock),
  '핀 자리는 자기가 **어느 칸**을 가리키는지 밝힌다 (data-r / data-c)',
  '칸 밖으로 나왔으므로 이게 없으면 어느 칸의 핀인지 알 길이 없다')
check(pinBlock.includes('gridColumn') && pinBlock.includes('gridRow'),
  '핀 자리는 칸과 **같은 격자 행·열**을 차지한다',
  '격자 자리를 안 주면 핀이 표 왼쪽 위로 몰린다')

// key 는 Fragment 가 받는다 — 칸과 핀이 형제가 되었으므로.
check(/import \{[^}]*\bFragment\b/.test(tsx), 'Fragment 를 들여왔다')
check(tsx.includes('<Fragment key={k}>'), '칸과 핀을 Fragment 하나로 묶고 거기에 key 를 준다')

// ── 핀 자리의 CSS ────────────────────────────────────
const rule = (css.match(/\.feltd-pin\s*\{[^}]*\}/) || [''])[0]
check(!!rule, 'comments.css 에 .feltd-pin 이 정의돼 있다')
check(/position:\s*relative/.test(rule), '.feltd-pin 은 position:relative 다',
  '핀은 absolute 라서 기준이 없으면 종이 왼쪽 위로 날아간다')
check(/pointer-events:\s*none/.test(rule), '.feltd-pin 은 클릭을 통과시킨다',
  '칸 위에 겹쳐 있으므로 막으면 그 칸을 못 고른다')
check(/\.feltd-pin\s*>\s*\.cmt-pin\s*\{[^}]*pointer-events:\s*auto/.test(css),
  '핀 자체는 다시 클릭을 받는다', '아니면 의견을 열 수 없다')

// ── 커밋이 textContent 를 읽는 한, 이 규칙은 계속 필요하다 ──
check(tsx.includes('cells[r][c] = n.textContent'),
  '칸 커밋은 여전히 textContent 를 읽는다',
  '읽는 방식이 바뀌었다면 이 파일의 전제를 다시 쓰세요')

// ── 글상자도 같은 규칙을 지킨다 ────────────────────────
check(tsx.includes('>{el.text}</div>'), '편집 중인 글상자도 자식이 {el.text} 하나다')

console.log('\n' + pass + ' 통과, ' + fail + ' 실패')
if (fail) process.exit(1)
