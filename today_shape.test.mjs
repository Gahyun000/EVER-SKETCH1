// **TODAY 를 손으로 옮긴다 — 자동을 잃지 않고.**
//
// 2026-09-16 · 사용자: 「Today는 도형형태로 만들어서 자유롭게 마우스나 키보드로 위치조정
// 가능하게」. 갈림길에서 **ㄱ** 을 골랐습니다 — *자동은 그대로 두고, 손으로 밀면 그 자리에 선다.*
//
// ㄴ(완전한 도형으로 바꾼다)을 안 고른 이유가 이 파일이 지키는 것입니다. 마커가 그냥
// 도형이 되면 **9월에 만든 자료를 11월에 열었을 때 마커가 9월에 서 있습니다.** 예전에
// 고쳐 둔 문제가 그대로 돌아옵니다(slots.ts 의 TODAY 마커 주석). 그래서
//
//   · 기본은 여전히 자동 — 열 때마다 실제 오늘 달을 따라간다
//   · 한 번 끌면 그 px 자리가 이긴다 — 밀었는데 도로 튕겨 가면 안 된다
//   · 「오늘」 단추가 px 자리를 **지워서** 자동으로 되돌린다
//
// 세 번째가 제일 깨지기 쉽습니다. px 를 안 지우면 단추를 눌러도 마커가 안 움직여
// 「단추가 죽었다」가 됩니다 — 화면에는 아무 오류도 안 뜨는 종류입니다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs today_shape.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const { todayPlace, todayColumn, TODAY_UNPLACED, ROADMAP_MONTH_COL0, clampTodayX, clampTodayY } = await import('./src/template/slots.ts')
const fl = read('./src/canvas/FreeLayer.tsx')
const flb = bare(fl)
const tb = bare(read('./src/builder/chrome/EditToolbar.tsx'))
const css = read('./src/template/template.css')

// 서울 2026-09-16. 로드맵이 2026년을 다루면 9월 열에 서야 한다.
const SEP = new Date('2026-09-16T03:00:00Z')
const NOV = new Date('2026-11-16T03:00:00Z')
const roadmap = (extra = {}) => ({ todayYear: 2026, ...extra })

// ── ① 자동은 그대로다 ──────────────────────────────
{
  const p = todayPlace(roadmap(), SEP)
  check(p && p.kind === 'col' && p.col === ROADMAP_MONTH_COL0 + 8, '아무것도 안 하면 9월 열에 선다',
    JSON.stringify(p))
  const q = todayPlace(roadmap(), NOV)
  check(q && q.kind === 'col' && q.col === ROADMAP_MONTH_COL0 + 10,
    '**같은 자료를 11월에 열면 11월로 옮겨간다** — ㄴ 을 안 고른 이유다', JSON.stringify(q))
  check(todayPlace({ todayYear: 2025 }, SEP) === null, '지난해 자료는 오늘을 주장하지 않는다')
}

// ── ② 손으로 놓으면 그 자리가 이긴다 ─────────────────
{
  const p = todayPlace(roadmap({ todayX: 137, todayY: 40 }), SEP)
  check(p && p.kind === 'px' && p.x === 137 && p.y === 40, '끌어다 놓은 px 자리에 선다', JSON.stringify(p))
  // 자동이든 고정이든 px 가 이긴다. 안 그러면 민 자리에서 **튕겨 돌아온다.**
  const q = todayPlace({ todayYear: 2026, todayMode: 'fixed', today: 3, todayX: 200 }, SEP)
  check(q && q.kind === 'px' && q.x === 200, '「이 칸에 고정」이 걸려 있어도 px 가 이긴다')
  const r = todayPlace(roadmap({ todayX: 90 }), NOV)
  check(r && r.kind === 'px' && r.x === 90, '달이 바뀌어도 손으로 놓은 자리는 안 움직인다')
  const y0 = todayPlace(roadmap({ todayX: 10 }), SEP)
  check(y0 && y0.y === 1, '높이를 안 정했으면 머리글 안(1px)에 앉는다')
}

// ── ③ 「숨기기」는 무엇보다 먼저다 ────────────────────
{
  check(todayPlace({ todayYear: 2026, todayMode: 'off', todayX: 50 }, SEP) === null,
    '숨기라고 했으면 손으로 놓았어도 안 그린다')
}

// ── ④ 망가진 값에 안 넘어간다 ──────────────────────
// 옛 자료·저장 사고로 NaN 이 들어오면 left:NaNpx 가 되어 마커가 **사라진다.**
{
  const p = todayPlace(roadmap({ todayX: NaN }), SEP)
  check(p && p.kind === 'col', 'todayX 가 NaN 이면 못 본 척하고 열로 돌아간다', JSON.stringify(p))
  const q = todayPlace(roadmap({ todayX: Infinity }), SEP)
  check(q && q.kind === 'col', 'Infinity 도 마찬가지다')
  const r = todayPlace(roadmap({ todayX: 60, todayY: NaN }), SEP)
  check(r && r.kind === 'px' && r.y === 1, 'todayY 만 망가지면 높이만 기본값으로 돌아간다')
}

// ── ⑤ 옛 길(todayColumn)은 그대로 있다 ──────────────
// 도구줄의 「9월」 안내가 이걸 읽는다. 지우면 안내가 빈칸이 된다.
{
  check(todayColumn(roadmap(), SEP) === ROADMAP_MONTH_COL0 + 8, 'todayColumn 은 예전대로 답한다')
}

// ── ⑥ 알약은 **진짜 요소**다 ───────────────────────
// 가상 요소(::after)는 이벤트도 ref 도 못 붙인다 — 끌 수가 없다.
{
  check(!/\.fel-today::after/.test(css), '::after 로 그리던 딱지를 떼어냈다')
  check(/\.fel-today-pill\s*\{[\s\S]{0,400}pointer-events:\s*auto/.test(css), '알약만 잡힌다')
  check(/\.fel-today\s*\{[\s\S]{0,200}pointer-events:\s*none/.test(css),
    '**선은 여전히 안 잡힌다** — 잡히면 밑의 칸을 고를 수가 없다')
  check(/\.fel-today\.free\s*\{[\s\S]{0,200}position:\s*absolute/.test(css), '손으로 놓은 자리는 절대 좌표다')
  // **:focus-visible 하나로는 안 된다.** 끌어 옮긴 직후에는 마우스로 포커스가 간 것이라
  // 크롬이 `:focus-visible` 을 안 준다 — 화살표 키는 먹는데 테두리가 안 보인다.
  // 실제 화면 사진을 보고서야 알았다(2026-09-16). 그래서 클래스로도 표시한다.
  check(/\.fel-today-pill\.picked/.test(css), '골랐을 때 티가 난다')
  check(/picked \? ' picked' : ''/.test(fl) && /onFocus=\{\(\) => setPicked\(true\)\}/.test(fl)
    && /onBlur=\{\(\) => setPicked\(false\)\}/.test(fl),
    '**마우스로 골라도** 티가 난다 — :focus-visible 은 그때 안 켜진다')
  check(/<button type="button" className=\{'fel-today-pill'/.test(fl), 'FreeLayer 가 button 으로 그린다')
}

// ── ⑦ 컴포넌트는 **모듈 바깥**에 있다 ────────────────
// 안에서 만들면 렌더마다 새 타입이 되어 떼었다 붙는다 — 끌던 손이 떨어진다(Acc 와 같은 결함).
{
  const iDef = flb.indexOf('function TodayMark')
  const iFL = flb.indexOf('export default function FreeLayer')
  check(iDef > 0 && iFL > 0 && iDef < iFL, 'TodayMark 가 FreeLayer 보다 **앞**에 있다',
    'TodayMark@' + iDef + ' FreeLayer@' + iFL)
}

// ── ⑧ 끌기·키보드 ─────────────────────────────────
{
  const i = flb.indexOf('function TodayMark')
  const blk = flb.slice(i, flb.indexOf('function snapOf'))
  check(/onPointerDown=\{onDown\}/.test(blk) && /onKeyDown=\{onKey\}/.test(blk), '마우스와 키보드 둘 다 받는다')
  // 끌기가 밑으로 새면 **표가 통째로 끌려간다.**
  const down = blk.slice(blk.indexOf('const onDown'), blk.indexOf('const onKey'))
  check(/e\.stopPropagation\(\)/.test(down), '끌기가 밑의 표로 새지 않는다')
  check(/if \(!did\) \{ snap\(\); did = true \}/.test(down), '되돌릴 자리는 한 번 끄는 동안 **한 번만** 찍는다')
  check(/setPointerCapture/.test(down), '표 밖으로 나가도 끌기가 안 끊긴다')
  // 키보드가 새면 Hotkeys 가 같은 화살표로 **고른 요소를 옮긴다.**
  const key = blk.slice(blk.indexOf('const onKey'), blk.indexOf('const free ='))
  check(/e\.stopPropagation\(\)/.test(key) && /e\.preventDefault\(\)/.test(key),
    '화살표 키가 window 로 새지 않는다 — 새면 TODAY 대신 **표가 움직인다**')
  check(/e\.shiftKey \? 10 : 1/.test(key), 'Shift 는 10px 씩 (시안대로)')
  check(/ArrowUp/.test(key) && /ArrowDown/.test(key) && /ArrowLeft/.test(key) && /ArrowRight/.test(key),
    '네 방향 다 움직인다')
  check(/clampTodayX\(v, el\.w\)/.test(blk) && /clampTodayY\(v, el\.h\)/.test(blk),
    '표 밖으로 못 나가게 막는 규칙을 쓴다')
}

// ── ⑧-2 표 밖으로 못 나간다 — **이름이 아니라 하는 일을 잰다** ──
//
// 처음 쓴 지킴이는 `clampX` 라는 **이름만** 있는지 봤다. 그래서 일부러
// `const clampX = (v) => v` 로 바꿔 봤더니 **33개가 전부 통과했다**(파괴 검사 G).
// 이름은 지켜지고 하는 일은 사라진 것이다. 규칙을 slots 로 옮겨 직접 불러 잰다.
{
  check(clampTodayX(-50, 400) === 0, '왼쪽 밖으로는 안 나간다')
  check(clampTodayX(9999, 400) === 400, '오른쪽 밖으로도 안 나간다')
  check(clampTodayX(137, 400) === 137, '안쪽은 그대로 둔다')
  check(clampTodayY(-9, 100) === 0, '위로도 안 나간다')
  check(clampTodayY(9999, 100) === 88, '맨 밑에서도 알약(12px)이 남는다', String(clampTodayY(9999, 100)))
  check(clampTodayY(5, 6) === 0, '표가 알약보다 납작해도 음수가 안 나온다', String(clampTodayY(5, 6)))
}

// ── ⑨ 「오늘」 단추가 자동으로 되돌린다 ────────────────
// 이 파일에서 제일 중요한 자리다. px 를 안 지우면 단추가 죽은 것처럼 보인다.
{
  const auto = tb.slice(tb.indexOf("todayMode: 'auto'"), tb.indexOf('>오늘</button>'))
  check(/TODAY_UNPLACED/.test(auto), '「오늘」이 손으로 놓은 자리를 **지운다**')
  const fix = tb.slice(tb.indexOf("todayMode: 'fixed', today: pickedCol"), tb.indexOf('>이 칸에 고정</button>'))
  check(/TODAY_UNPLACED/.test(fix), '「이 칸에 고정」도 지운다')
  check(TODAY_UNPLACED.todayX === undefined && TODAY_UNPLACED.todayY === undefined,
    'TODAY_UNPLACED 는 둘 다 지운다')
  check(Object.keys(TODAY_UNPLACED).length === 2, '지우는 건 그 둘뿐이다 — 모드까지 건드리지 않는다')
  check(/todayFree\s*=\s*todayMode !== 'off' && typeof table\.todayX === 'number'/.test(tb),
    '지금 손으로 놓은 상태인지 도구줄이 안다')
  check(/todayFree \? '손으로 놓음'/.test(tb),
    '그때는 **「9월」이라고 말하지 않는다** — 열에 서 있지 않으니 거짓말이 된다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
