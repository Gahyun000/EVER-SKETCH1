// **고르는 즉시 놓인다 — 그리고 포개지지 않는다.**
//
// 2026-09-18 · 글상자·표·글맵시도 같은 길로 들어왔다. 그래서 알림 이름을
// `ebook:insert-shape` → **`ebook:place`** 로 바꿨다 — 이름이 하는 일과 어긋나면
// 다음 사람이 「도형 말고 다른 걸 놓으려면 딴 길이 있겠지」 하고 길을 하나 더 판다.
//
// 2026-09-17 · 사용자 영상과 한 줄: 「현재는 슬라이드를 클릭해야 도형이 뜨는데?」
// 도형 갤러리에서 모양을 골라도 화면에는 아무 변화가 없었다. 팝업이 닫히고 커서가
// 십자로 바뀔 뿐이라, **한 번 더 눌러야 한다는 걸 모르는 사람에게는 고장으로 보였다.**
//
// 같은 판단을 이 저장소가 이미 한 번 내려 뒀다(`FreeLayer` 의 '삽입 → 이미지'):
//   「도구만 켜두면 "캔버스를 한 번 더 클릭해야 한다"는 걸 모르는 사람이 아무 반응 없다고 느낀다」
// 그림·이모지·아이콘은 벌써 곧바로 놓이고 **도형만 빠져 있었다.** 그 어긋남을 메운 것이다.
//
// **이 파일이 지키는 것 넷.**
//   ① 자리를 정하는 셈이 **정말로 맞는가** — 글로만 확인하지 않고 함수를 돌려서 본다.
//   ② 도구줄이 **무장하지 않는가** — setTool 이 돌아오면 「골랐는데 커서는 십자」가 되살아난다.
//   ③ 놓는 길이 **하나인가** — 도구줄이 직접 addEl 을 부르면 되돌리기도 가둠도 안 거친다.
//   ④ **찍어서 놓는 길이 살아 있는가** — 단축키로 든 도형은 자리를 정확히 잡을 수 있어야 한다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs insert_shape.test.mjs
import { readFileSync } from 'node:fs'
import { centerSpot, CASCADE } from './src/canvas/dropSpot.ts'

// **간격은 16 이라고 손으로 적는다.** 처음에는 `a.x + CASCADE` 로 재다가,
// CASCADE 를 0 으로 바꿔 보니 **가드가 그대로 통과했다** — 재는 자와 재이는 것이
// 같은 값이면 무엇을 넣어도 맞는다. 값이 바뀌어야 할 일이 생기면 여기도 같이 고친다.
const STEP = 16

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const W = 960, H = 540, w = 128, h = 64
/** 「이미 놓인 것」은 상자다 — 가운데를 재려면 크기가 있어야 한다. */
const box = (x, y, bw = w, bh = h) => ({ x, y, w: bw, h: bh })

// ── ① 자리를 **돌려서** 확인한다 ─────────────────────────
// 여기는 글자 맞추기가 아니라 진짜 계산이다. 셈이 틀리면 이 칸이 먼저 운다.
{
  const mid = { x: Math.round(W / 2 - w / 2), y: Math.round(H / 2 - h / 2) }
  const a = centerSpot([], w, h, W, H)
  check(a.x === mid.x && a.y === mid.y, '빈 종이에서는 **한가운데**에 놓인다', JSON.stringify(a))

  // 사용자가 고른 것이 바로 이 대목이다(ㄴ). 한가운데 고정이면 둘째가 첫째에
  // 정확히 포개져서, 놓고도 「안 생겼나?」 싶다 — 증상이 모양만 바꿔 돌아온다.
  const b = centerSpot([box(a.x, a.y)], w, h, W, H)
  check(b.x === a.x + STEP && b.y === a.y + STEP,
    '그 자리가 차 있으면 **16px 비껴 놓는다** — 연달아 놓아도 뒤엣것이 안 숨는다', JSON.stringify(b))
  const c = centerSpot([box(a.x, a.y), box(b.x, b.y)], w, h, W, H)
  check(c.x === a.x + STEP * 2, '셋째는 또 한 칸 더 비껴난다', JSON.stringify(c))
  check(CASCADE === STEP, '(대조) 코드가 말하는 간격도 16 이다', String(CASCADE))

  // 비껴남은 **포개짐**을 피하는 것이지 겹침을 피하는 게 아니다. 표준 양식이 종이를
  // 거의 다 덮고 있어서, 겹침을 피하려 들면 밀다가 종이 밖으로 나간다.
  const d = centerSpot([box(mid.x - 40, mid.y - 20)], w, h, W, H)
  check(d.x === mid.x && d.y === mid.y,
    '**겹치기만 하는 요소는 비켜 가지 않는다** — 그랬다간 표준 양식 위에 놓을 자리가 없다')

  // **여기가 처음에 틀렸던 자리다.** 왼쪽 위 모서리로 재면 네모(120×56)와
  // 동그라미(96×96)는 「안 겹쳤다」고 나오는데, 가운데가 같아서 뒤엣것이 앞엣것을
  // 통째로 덮는다. 시험 서버에서 실제로 그렇게 놓였다.
  const ell = centerSpot([], 96, 96, W, H)
  const sq = centerSpot([box(ell.x, ell.y, 96, 96)], 120, 56, W, H)
  const plain = centerSpot([], 120, 56, W, H)
  check(sq.x === plain.x + STEP && sq.y === plain.y + STEP,
    '**크기가 달라도 가운데가 같으면 비껴난다** — 모서리로 재면 여기가 조용히 포개진다',
    JSON.stringify({ ell, sq, plain }))

  // 종이 밖은 아무에게도 안 보인다. 작성자는 결재에 올린 뒤에야 안다.
  //
  // **처음 쓴 시험은 이걸 못 잡았다.** 960×540 짜리 종이에서는 열두 번을 다 밀어도
  // 가장자리에 못 닿아서, 막이를 통째로 지워도 아무 일이 없었다. **낮은 종이**로 재야
  // 막이가 실제로 일을 한다 — 여기서는 여덟 번째가 이미 밖이다.
  const LOW = 300
  const my = Math.max(0, Math.round(LOW / 2 - h / 2))
  const chain = []
  // 크기를 빠뜨리면 가운데를 못 재서 아무것도 막지 못한다 — 그 바람에 이 칸이 한 번 헛돌았다.
  for (let i = 0; i < 8; i++) chain.push(box(mid.x + i * STEP, my + i * STEP))
  const e = centerSpot(chain, w, h, W, LOW)
  check(e.x + w <= W && e.y + h <= LOW,
    '**아무리 밀려도 종이 안이다** — 밖으로 나간 요소는 결재에 올린 뒤에야 안 보인 걸 안다',
    JSON.stringify(e) + ` (아래끝 ${e.y + h} / ${LOW})`)
}

// ── ② 도구줄은 무장하지 않고 **말만 한다** ────────────────
{
  const tb = strip(read('./src/builder/chrome/EditToolbar.tsx'))
  const i = tb.indexOf("className={'shp-cell'")
  const cell = i < 0 ? '' : tb.slice(i, i + 700)
  check(i > 0, '도형 갤러리의 칸이 있다')
  check(/ebook:place[\s\S]{0,120}type: sh\.t/.test(cell),
    '**고른 모양을 캔버스에 알린다**(ebook:place)')
  check(!/setTool\(/.test(cell),
    '**무장하지 않는다** — setTool 이 돌아오면 「골랐는데 커서만 십자」인 옛 동작이 되살아난다')
  // ③ 놓는 규칙은 캔버스 한 곳에만. 도구줄이 직접 만들면 snap 도 penIn 도 안 거친다.
  check(!/addEl\(/.test(cell), '도구줄이 **직접 만들지 않는다** — 되돌리기·가둠을 건너뛰는 샛길이 생긴다')
}

// ── ③ 캔버스가 받아서 **한 규칙으로** 놓는다 ───────────────
{
  const raw = read('./src/canvas/FreeLayer.tsx')
  const fl = strip(raw)
  const i = fl.indexOf("'ebook:place'")
  check(i > 0, '캔버스가 그 말을 듣는다')
  const j = fl.indexOf('const onPlace')
  const body = j < 0 ? '' : fl.slice(j, j + 900)
  check(/centerSpot\(page\.els/.test(body), '자리는 **centerSpot 한 곳**이 정한다')
  check(/ADDABLE\.indexOf\(type\) < 0\) return/.test(body),
    '**모르는 이름은 되돌려 보낸다** — mkFreeEl 은 모르는 갈래를 조용히 네모로 바꾼다')
  check(/\bsnap\(\)/.test(body), '되돌리기에 남는다 — 실수로 놓았을 때 ⌘Z 가 들어야 한다')
  check(/setSel\(el\.id\)/.test(body), '놓자마자 골라 준다 — 바로 색·크기를 만질 수 있다')
  check(/setTool\('select'\)/.test(body), '놓고 나면 손을 놓는다')
  // 하나 놓을 때 하나만 생겨야 한다. 안 그러면 쪽마다 하나씩 생긴다.
  check(/if \(!interactive\) return/.test(body.slice(0, 200)) || /if \(!interactive\) return[\s\S]{0,200}const onPlace/.test(fl),
    '편집 중인 쪽에서만 받는다 — 아니면 쪽 수만큼 생긴다')
}

// ── ③-2 글상자·표·글맵시도 **같은 길**로 (2026-09-18) ──────
//
// 도형이 바뀐 뒤로 도구줄 한 줄에서 **옆 단추끼리 동작이 달랐다** — 도형은 놓이고
// 그 왼쪽 T 는 커서만 십자로 바뀌었다. 재 보니 글상자는 **세 걸음**이었다:
// 고르기 → 캔버스 찍기 → **두 번 눌러** 편집. 그러고도 상자에는 「텍스트」만 적혀 있었다.
{
  const tb = strip(read('./src/builder/chrome/EditToolbar.tsx'))
  const menu = strip(read('./src/builder/chrome/MenuBar.tsx'))
  const fl = strip(read('./src/canvas/FreeLayer.tsx'))

  check(/const PLACE_TOOLS: Tool\[\] = \['text', 'table', 'wordart'\]/.test(tb),
    '**놓는 것 셋을 한 곳에 적는다** — 단추마다 따로 적으면 하나가 빠진다')
  check(/PLACE_TOOLS\.indexOf\(g\.t\) >= 0[\s\S]{0,140}ebook:place/.test(tb),
    '도구줄의 그 셋이 같은 길로 간다')
  // 고르기·연결선까지 놓아 버리면 **고를 수가 없어진다.**
  check(!/PLACE_TOOLS[^\n]*'select'/.test(tb) && !/PLACE_TOOLS[^\n]*'connect'/.test(tb),
    '고르기·연결선은 그대로 도구다 — 누를 자리가 뜻이 있다')
  const placed = (menu.match(/run: \(\) => place\('/g) || []).length
  check(placed === 3, '삽입 메뉴의 셋도 같은 길이다(글상자·표·글맵시)', `${placed}개`)
  check(/const place = \(t: Tool\) => window\.dispatchEvent/.test(menu),
    '메뉴가 직접 만들지 않고 캔버스에 알린다')
  check(/run: \(\) => tool\('pen'\)/.test(menu), '「선」은 그대로 도구다 — 그어야 생긴다')

  // **커서까지 넣어 준다.** 이게 빠지면 「텍스트」라고 적힌 빈 상자만 늘어난다.
  check(/if \(type === 'text' \|\| type === 'wordart'\) startEditing\(el\.id\)/.test(fl),
    '**글을 담는 것은 놓자마자 커서가 들어간다** — 빠지면 두 번 더 눌러야 써진다')
  // 좌표를 주면 그 자리에 커서만 놓인다. 안 주어야 기본 글자가 **통째로** 골라져
  // 그냥 치면 덮어써진다(키노트·파워포인트와 같은 손놀림).
  check(/startEditing\(el\.id\)\n/.test(fl) || /startEditing\(el\.id\)$/m.test(fl),
    '좌표 없이 부른다 — 그래야 기본 글자가 통째로 골라진다')
  // 표는 넣지 않는다. 칸이 여럿이라 「어느 칸」을 정할 수 없다.
  check(!/type === 'table'\) startEditing/.test(fl), '표는 커서를 안 넣는다 — 어느 칸일지 정할 수 없다')
}

// ── ④ **찍어서 놓는 길은 그대로다** ────────────────────────
// 단축키(r·o·d)로 도형을 든 사람은 여전히 원하는 자리를 찍는다. 이 길까지 없애면
// 「정확히 저기에」 놓고 싶은 사람이 갈 데가 없어진다.
{
  const fl = strip(read('./src/canvas/FreeLayer.tsx'))
  check(/if \(ADDABLE\.indexOf\(tool\) >= 0\) \{ e\.stopPropagation\(\); snap\(\)/.test(fl),
    '클릭해서 놓는 길이 살아 있다 — 자리를 정확히 잡고 싶을 때의 길')
  const hk = read('./src/builder/Hotkeys.tsx')
  check(/r: 'box'/.test(hk), '(근거) 단축키 r 이 아직 네모를 든다')
}

// ── ⑤ 매뉴얼이 **같은 말을 하는가** ────────────────────────
// 여기가 제일 조용히 틀어지는 자리다. 동작만 고치고 글을 두면, 글이 고장을 가르친다.
{
  const m = read('./src/builder/manualMake.ts')
  const i = m.indexOf('"7-1"')
  const step = i < 0 ? '' : m.slice(i, i + 700)
  check(i > 0, '매뉴얼 7-1 이 있다')
  check(/한가운데에 곧바로 놓입니다/.test(step), '**고르면 바로 놓인다고 적혀 있다**')
  check(!/끌면 그 크기로/.test(step),
    '「끌면 그 크기로」가 없다 — 애초에 사실이 아니었다(정해진 크기로 놓인다)')
  check(!/빈 자리에 놓고/.test(step),
    '**「빈 자리에 놓으세요」가 없다** — 결함을 고치는 대신 매뉴얼에 적어 뒀던 자리다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
