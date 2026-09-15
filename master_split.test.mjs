// 마스터-디테일이 **한 벌인가**, 그리고 무엇을 골라 두는가.
//
// 2026-09-15 · 결재함(P5)·팀 공유(P6)는 1180px 카드 안에 목록과 상세를 넣고 있었다.
// 1512px 창에서 332px 이 놀고, 남은 1180 을 또 300 + 860 으로 나누니 **상세가 주인공인
// 화면에서 주인공이 제일 좁았다.** 카드를 걷고 화면이 곧 마스터-디테일이 됐다.
//
// 사용자 결정: ①ㄱ 상세가 주인공(마스터 320 고정) · ②ㄱ 둘 다 줄 모양 유지 ·
//              ③ㄴ 첫 줄 자동 선택 · ④ㄴ 끌어서 조절 + 기억.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs master_split.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')

const { clampMaster, keepOrFirst } = await import('./src/ui/masterSplit.ts')
const { MASTER_MIN, MASTER_MAX, MASTER_DEFAULT, masterWidth, rememberMasterWidth } =
  await import('./src/persistence/prefs.ts')

// ── 폭의 벽 ────────────────────────────────────────
check(MASTER_MIN === 240 && MASTER_MAX === 560 && MASTER_DEFAULT === 320,
  '최소 240 · 최대 560 · 기본 320')
check(MASTER_MIN < MASTER_DEFAULT && MASTER_DEFAULT < MASTER_MAX,
  '기본값이 벽 사이에 있다 (밖에 있으면 첫 화면부터 밀려난다)')
check(clampMaster(320) === 320, '범위 안은 그대로')
check(clampMaster(10) === MASTER_MIN, '너무 좁게 끌면 최소에서 멈춘다')
check(clampMaster(9999) === MASTER_MAX, '너무 넓게 끌면 최대에서 멈춘다')
check(clampMaster(MASTER_MIN) === MASTER_MIN && clampMaster(MASTER_MAX) === MASTER_MAX,
  '벽 위의 값은 벽 그대로 (경계를 한 칸 밀지 않는다)')
check(clampMaster(320.4) === 320 && clampMaster(320.6) === 321, '반 픽셀은 반올림한다')
check(clampMaster(NaN) === MASTER_DEFAULT,
  '숫자가 아니면 기본값으로 — 그냥 두면 width:NaNpx 라 칸이 통째로 사라진다')
check(clampMaster(Infinity) === MASTER_MAX && clampMaster(-Infinity) === MASTER_MIN,
  '무한은 그쪽 벽으로 (어느 쪽으로 무한인지가 곧 어느 벽인지다)')
// **접히지 않는다.** 사이드바는 끝까지 좁히면 접혔지만 여기 목록은 접을 데가 없다 —
// 목록이 사라지면 고를 방법이 없다.
check(clampMaster(-500) === MASTER_MIN, '음수로 끌어도 0 이 되지 않는다 (목록은 접히지 않는다)')

// ── 무엇을 골라 두는가 (③ㄴ) ───────────────────────
check(keepOrFirst(['a', 'b', 'c'], null) === 'a', '아무것도 안 골랐으면 첫 줄')
check(keepOrFirst(['a', 'b', 'c'], 'b') === 'b', '고르던 것이 남아 있으면 안 건드린다')
check(keepOrFirst(['a', 'b', 'c'], 'z') === 'a', '고르던 것이 사라졌으면 첫 줄로')
check(keepOrFirst([], 'b') === null, '빈 목록에서는 아무것도 안 고른다')
check(keepOrFirst([], null) === null, '빈 목록 + 안 고름 = 그대로 안 고름')
// 결정을 내리면 목록을 다시 받는다. 그때마다 맨 위로 튕기면 **방금 처리한 건을 잃는다** —
// 「승인」 누르고 눈을 떼는 사이 다른 자료가 열려 있는 셈이 된다.
check(keepOrFirst(['x', 'y', 'z'], 'z') === 'z', '목록을 다시 받아도 보던 자리를 지킨다')
check(keepOrFirst(['a'], 'a') === 'a', '한 줄뿐이어도 같은 규칙')

// ── 기억 (④ㄴ) ────────────────────────────────────
// 두 화면을 **따로** 기억한다. 한 값으로 묶으면 한쪽에서 맞춘 폭이 다른 쪽에 덮인다.
{
  const box = new Map()
  globalThis.localStorage = {
    getItem: (k) => (box.has(k) ? box.get(k) : null),
    setItem: (k, v) => box.set(k, String(v)),
  }
  check(masterWidth('ap') === MASTER_DEFAULT && masterWidth('tl') === MASTER_DEFAULT,
    '적어 둔 것이 없으면 기본 320')

  rememberMasterWidth('ap', 420)
  check(masterWidth('ap') === 420, '끌어 맞춘 폭을 기억한다')
  check(masterWidth('tl') === MASTER_DEFAULT,
    '**결재함에서 맞춘 폭이 팀 공유로 새지 않는다**')

  rememberMasterWidth('tl', 260)
  check(masterWidth('ap') === 420 && masterWidth('tl') === 260, '둘이 각자 산다')
  check([...box.keys()].sort().join(',') === 'es_ap_master,es_tl_master',
    '열쇠가 화면마다 하나씩, 둘뿐이다')

  rememberMasterWidth('ap', 9999)
  check(masterWidth('ap') === MASTER_MAX, '적을 때도 벽을 넘지 않는다')
  rememberMasterWidth('ap', -1)
  check(masterWidth('ap') === MASTER_MIN, '적을 때도 아래 벽을 지킨다')

  // 예전 판이 남긴 값·손으로 고친 값은 **버린다.** 안 버리면 사람이 못 고치는 폭에 갇힌다.
  box.set('es_ap_master', '10')
  check(masterWidth('ap') === MASTER_DEFAULT, '범위 밖의 헌 값은 버리고 기본으로')
  box.set('es_ap_master', '숫자아님')
  check(masterWidth('ap') === MASTER_DEFAULT, '숫자가 아니면 버리고 기본으로')
  box.set('es_ap_master', '')
  check(masterWidth('ap') === MASTER_DEFAULT,
    '빈 글자는 버린다 (Number("") 는 0 이라 그냥 두면 0 이 아니라 기본이어야 한다)')

  // 저장이 막힌 브라우저에서도 화면은 뜬다.
  globalThis.localStorage = {
    getItem: () => { throw new Error('막힘') },
    setItem: () => { throw new Error('막힘') },
  }
  check(masterWidth('ap') === MASTER_DEFAULT, '읽기가 막혀도 기본값으로 뜬다')
  let threw = false
  try { rememberMasterWidth('ap', 300) } catch { threw = true }
  check(!threw, '쓰기가 막혀도 터지지 않는다')
  delete globalThis.localStorage
}

// ── 화면이 정말 그렇게 쓰는가 ──────────────────────
// 순수 함수만 지키면 의미가 없다 — 화면이 안 부르면 규칙은 종이 위에만 있다.
const ap = read('./src/approvals/ApprovalsPanel.tsx')
const tl = read('./src/teamlib/TeamLibraryPanel.tsx')
const css = read('./src/auth/auth.css')
const flat = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '')

for (const [name, src, key] of [['결재함', ap, 'ap'], ['팀 공유', tl, 'tl']]) {
  check(src.includes('keepOrFirst'), `${name}: 첫 줄 자동 선택을 쓴다`)
  check(src.includes('clampMaster'), `${name}: 끌 때 벽을 지킨다`)
  check(src.includes(`masterWidth('${key}')`) && src.includes(`rememberMasterWidth('${key}'`),
    `${name}: 제 열쇠('${key}')로 읽고 적는다`)
  check(/gridTemplateColumns:\s*mw \+ 'px auto 1fr'/.test(src),
    `${name}: 맞춘 폭이 첫 칸에 가고 **칸이 셋**이다 (둘로 주면 상세가 목록 밑으로 떨어진다)`)
  check(/onPointerDown=\{onGrip\}/.test(src), `${name}: 손잡이가 끌린다`)
  // **주석은 빼고 본다.** 전에 이 파일들의 설명 글이 제 검사에 걸린 적이 두 번 있다.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  check(/export default function \w+\(\) \{/.test(code) && !code.includes("'es-auth"),
    `${name}: 덮개로 띄우는 죽은 갈래가 없다 (인자 없는 화면 컴포넌트다)`)
}

// **끄는 동안 매번 적지 않는다.** 손을 한 번 움직이면 pointermove 가 수십 번 온다 —
// 그때마다 localStorage 에 쓰면 끄는 손이 뻑뻑해진다. 놓을 때 한 번만 적는다.
for (const [name, src] of [['결재함', ap], ['팀 공유', tl]]) {
  const grip = src.slice(src.indexOf('const onGrip'), src.indexOf('const onGrip') + 900)
  const move = grip.slice(grip.indexOf('const move'), grip.indexOf('const up'))
  check(!move.includes('rememberMasterWidth'), `${name}: 끄는 동안에는 안 적는다`)
  check(grip.slice(grip.indexOf('const up')).includes('rememberMasterWidth'),
    `${name}: 놓을 때 적는다`)
}

// 팀 공유의 줄은 작성자·월로 묶여 있다. **묶음 줄은 고를 수 있는 것이 아니다** —
// 안 거르면 작성자 이름을 고른 척하고 오른쪽이 영원히 빈다.
check(/r\.kind === 'item'/.test(tl.slice(tl.indexOf('const pickable'), tl.indexOf('useEffect(() => { setOpenId'))),
  '팀 공유: 자료 줄만 고를 수 있다 (작성자·월 묶음 줄은 건너뛴다)')

// ② 둘 다 줄 모양을 지킨다 — 표로 바꾸지 않았다.
check(ap.includes('ap-item') && tl.includes('ap-item') && !/<table/.test(ap) && !/<table/.test(tl),
  '두 화면 모두 줄 모양 그대로다(②ㄱ)')

// 빈 상세가 「안 골랐다」고 거짓말하지 않는다 — 첫 줄이 저절로 골라지므로
// 비어 있다면 받아 오는 중이거나 정말 없는 것이다.
check(!/왼쪽에서 결재 건을 골라 주세요/.test(ap) && !/왼쪽에서 자료를 골라 주세요/.test(tl),
  '「왼쪽에서 골라 주세요」가 남아 있지 않다 (저절로 골라지는데 고르라고 하면 거짓말이다)')
check(/불러오는 중/.test(ap.slice(ap.indexOf('ap-detail'))) &&
      /불러오는 중/.test(tl.slice(tl.indexOf('ap-detail'))),
  '받아 오는 중임을 상세가 말한다')

// 손잡이는 읽는 사람에게 읽히면 안 된다 — 보이는 글자가 없는 띠다.
check(/aria-hidden="true"/.test(ap.slice(ap.indexOf('md-grip'), ap.indexOf('md-grip') + 220)),
  '손잡이는 화면 낭독기에서 빠진다 (읽을 것이 없다)')
check(/\.md-grip\{[^}]*touch-action:none/.test(flat),
  '끄는 동안 화면이 같이 굴러가지 않는다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
