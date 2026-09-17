// **놓는 도구를 든 손을 막지 않는다.**
//
// 2026-09-17 · 사용자 지적: 「텍스트 상자랑 맞물리면 도형이 생성이 안 돼.
// 그게 사용자 입장에선 왜 안 되지? 라고 생각이 될 수 있잖아.」
//
// 재현했다(시험 서버 · Chromium):
//   도형 고름 → 커서 crosshair ✔
//   **빈 곳** 클릭 → 요소 10 → 11 ✔
//   **글상자 위** 클릭 → 11 → 11 ✘ **아무 일도 안 일어남**
//   그때 커서는 여전히 crosshair 이고, 엉뚱하게 그 글상자가 골라져 있다. 아무 말도 없다.
//
// 까닭은 두 줄이 맞물린 것이었다.
//   · `onLayerDown` 이 「바닥을 **직접** 눌렀을 때만」 만든다(e.target !== e.currentTarget)
//   · `onElDown` 이 요소 위 클릭을 **먼저 잡아채고 stopPropagation** 한다
// `onElDown` 은 도구를 거의 안 봤다 — connect·pen·형광펜·지우개만 따로 처리하고
// **놓는 도구는 아예 고려에 없었다.**
//
// **막을 까닭이 없어서 되게 고쳤다.** 파워포인트도 키노트도 도형 도구를 든 채로는
// 기존 개체 위에 그냥 그려진다. 겹쳐 놓는 것이 잘못이 아니기 때문이다.
//
// **이 파일이 지키는 것은 「세 자리가 같은 규칙을 본다」다.**
// 한 곳만 고치면 「글상자 위에는 되는데 표 위에는 안 되는」 식으로 갈라지고,
// 그 갈라짐은 **아무 오류도 안 내고** 눌러 본 사람만 안다 — 원래 증상 그대로다.
//
// 고친 뒤 다시 재 봤다: 빈 곳 ✔ · 글상자 위 ✔ · 표 위 ✔ ·
// 고르기 도구는 그대로 ✔ · 빈 곳 드래그가 도형을 만들지 않는다 ✔
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs shape_over.test.mjs
import { readFileSync } from 'node:fs'

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

const raw = read('./src/canvas/FreeLayer.tsx')
const fl = strip(raw)

// ── ① 규칙이 한 곳에 있다 ──────────────────────────────
// 세 자리가 각자 `ADDABLE.indexOf(tool) >= 0` 을 적으면 언젠가 하나가 빠진다.
{
  check(/const adding = ADDABLE\.indexOf\(tool\) >= 0/.test(fl),
    '**「놓는 중인가」를 한 곳에서 정한다**(adding) — 세 자리가 각자 적으면 하나가 빠진다')
  const uses = (fl.match(/\badding\b/g) || []).length
  check(uses >= 4, '그 값을 여러 자리가 같이 본다', `${uses}번 쓰임`)
  // 연결선·펜은 요소 위 클릭이 **뜻이 있다**. 같이 흘려보내면 선을 못 잇는다.
  check(/ADDABLE = \[/.test(fl) && !/ADDABLE = \[[^\]]*'connect'/.test(fl),
    '연결선은 놓는 도구가 아니다 — 요소 위 클릭이 뜻이 있어서 그대로 둔다')
  check(/tool === 'pen' \|\| tool === 'highlighter' \|\| tool === 'eraser'/.test(fl),
    '펜·형광펜·지우개도 그대로 둔다')
}

// ── ② 레이어가 요소 위 클릭도 받는다 ─────────────────────
{
  const i = fl.indexOf('function onLayerDown')
  const head = i < 0 ? '' : fl.slice(i, i + 420)
  check(i > 0, 'onLayerDown 이 있다')
  check(/e\.target !== e\.currentTarget && !adding/.test(head),
    '**놓는 중에는 「바닥을 직접 눌렀나」를 안 따진다** — 이 줄이 도형을 막고 있었다')
  // 그 검사가 통째로 사라지면 **요소를 끌 때 마퀴 선택이 같이 시작된다.**
  // 없애는 게 아니라 조건을 붙이는 것이 맞다.
  check(/e\.target !== e\.currentTarget/.test(head),
    '검사 자체는 남아 있다 — 없애면 요소를 끌 때 마퀴가 같이 시작된다')
}

// ── ③ 요소가 잡아채지 않는다 ────────────────────────────
{
  const i = fl.indexOf('function onElDown')
  const body = i < 0 ? '' : fl.slice(i, i + 1400)
  check(i > 0, 'onElDown 이 있다')
  check(/if \(adding\) return/.test(body),
    '**놓는 중이면 손대지 않고 위로 흘려보낸다** — 여기서 잡으면 레이어가 못 받는다')
  // 순서가 뜻이다. stopPropagation 보다 **앞에** 있어야 한다.
  //
  // **어느 stopPropagation 인지 짚어야 한다.** 처음엔 파일에서 처음 나오는 것을
  // 찾았는데, 그건 **연결선 갈래**의 것이라 언제나 `adding` 보다 앞이었다 —
  // 제대로 고쳐 놓고도 떨어졌다. 기준을 펜 갈래 뒤로 옮겨 그다음 것을 본다.
  const pen = body.indexOf("tool === 'pen' || tool === 'highlighter'")
  const tail = pen < 0 ? '' : body.slice(pen)
  const a = tail.indexOf('if (adding) return')
  const st = tail.indexOf('e.preventDefault(); e.stopPropagation()')
  check(a > 0 && st > 0 && a < st,
    '**흘려보내는 줄이 그다음 stopPropagation 보다 먼저다** — 뒤에 있으면 아무 소용이 없다',
    `adding@${a} stop@${st}`)
}

// ── ④ 표 칸도 같다 ──────────────────────────────────────
// 여기가 이 파일에서 제일 빠뜨리기 쉬운 자리다. 글상자로만 확인하면 표는 안 보인다.
{
  const i = fl.indexOf('if (editingThis) { e.stopPropagation(); return }')
  const around = i < 0 ? '' : fl.slice(Math.max(0, i - 220), i + 60)
  check(i > 0, '표 칸의 onPointerDown 이 있다')
  check(/if \(adding\) return/.test(around),
    '**표 칸도 흘려보낸다** — 여기만 빼면 「글상자 위엔 되는데 표 위엔 안 되는」 반쪽이 된다')
}

// ── ⑤ 놓고 나면 손이 놓인다 ─────────────────────────────
// 놓은 뒤에도 도구가 남아 있으면 다음 클릭마다 도형이 또 생긴다.
{
  // **그 줄에서만 본다.** 처음엔 파일 어디든 `setTool('select')` 가 있으면 통과였는데,
  // 연결선 갈래에도 같은 줄이 있어서 **놓는 자리에서 빼도 안 잡혔다**(부숴 보고 알았다).
  // 오늘만 다섯 번째로 밟은 구멍이다 — 「어딘가에 있으면 통과」는 가드가 아니다.
  const i = fl.indexOf('if (adding) {')
  const line = i > 0 ? fl.slice(i, i + 420)
    : (() => { const j = fl.indexOf('ADDABLE.indexOf(tool) >= 0) { e.stopPropagation()')
               return j > 0 ? fl.slice(j, j + 420) : '' })()
  check(/mkFreeEl\(tool/.test(line), '도형을 만드는 줄을 찾았다')
  check(/setTool\('select'\)/.test(line),
    '**그 줄에서** 고르기로 돌아온다 — 안 그러면 누를 때마다 또 생긴다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
