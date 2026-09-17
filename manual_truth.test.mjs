// **매뉴얼이 하는 말과 코드가 하는 일이 같은가.**
//
// 2026-09-17 · 이 파일이 생긴 이유를 먼저 적는다.
//
// 9/16 에 이북 발행을 작성자에게 열었다. 9/17 에 카드 이름을 「트리 · 머메이드」에서
// 「머메이드 TB · LR」로 갈랐다. **둘 다 매뉴얼은 그대로 뒀다.** 그래서 작성자 매뉴얼이
// 「발행은 관리자만 합니다」와 「＋ 새 페이지 ▾ ▸ 트리 · 머메이드」라고 말하고 있었다 —
// 하나는 **할 수 있는 일을 못 한다고** 하고, 하나는 **없는 이름을 찾으라고** 한다.
//
// 아무도 안 깨졌다. 테스트도 다 통과했다. 매뉴얼은 글이라서, 코드가 아무리 바뀌어도
// 저 혼자 낡는다. 그걸 알아채는 길이 **사람이 우연히 다시 읽는 것**뿐이었다.
//
// 그래서 이 파일은 `manual_files.test.mjs` 와 다른 것을 잰다 —
//   · manual_files : 그림 파일이 **거기 있는가**(없으면 빈 네모가 뜬다)
//   · manual_truth : 글이 **맞는 말인가**(틀려도 화면은 멀쩡하다. 그래서 더 나쁘다)
//
// 재는 방법은 하나다. **매뉴얼을 고치는 게 아니라 코드를 읽어서 대조한다.**
// 문구를 그대로 박아 두면 매뉴얼을 고칠 때 이 파일도 같이 고치게 되고,
// 그러면 둘이 함께 틀린 채로 통과한다 — 가드가 아니라 메아리가 된다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs manual_truth.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const { canPublish } = await import('./src/auth/authApi.ts')
const { CARD_REGISTRY, cardByKey } = await import('./src/cards/registry.ts')
const dp = bare(read('./src/builder/DemoPlayer.tsx'))
const pick = bare(read('./src/builder/CardPicker.tsx'))
const py = read('./server/permissions.py')

// 매뉴얼이 사람에게 **보여 주는 글**만 모은다. 주석은 위에서 이미 걷었다.
const LINES = [...dp.matchAll(/line:\s*'([^']*)'/g)].map((m) => m[1])
const TITLES = [...dp.matchAll(/title:\s*'([^']*)'/g)].map((m) => m[1])
const TEXT = LINES.join('\n')
check(LINES.length === 12, '열두 편의 글을 다 읽었다', `${LINES.length}줄`)

// ── ① 발행 — 매뉴얼과 권한이 같은 말을 하는가 ─────────────
//
// **코드에서 답을 얻어 와서** 그 답에 맞는 말이 쓰여 있는지 본다.
// 「관리자만」이라고 쓰여 있는지 그냥 보는 게 아니다 — 그러면 권한이 반대로 바뀌어도
// 이 파일만 고치면 통과해 버린다.
{
  const writerCan = canPublish({ role: 'writer', status: 'active' })
  const viewerCan = canPublish({ role: 'viewer', status: 'active' })
  const serverOpen = !/_ADMIN_ONLY = \([^)]*PUBLISH/.test(py)
  check(writerCan === serverOpen,
    '화면 판정과 서버 판정이 같은 편이다 — 여기가 어긋나면 아래 판정이 통째로 무의미하다',
    `canPublish(작성자)=${writerCan} 서버개방=${serverOpen}`)

  // 발행을 **관리자만** 한다고 말하는 문장을 찾는다.
  const saysAdminOnly = LINES.filter((l) =>
    /발행/.test(l) && /(관리자만|Lv1 관리자가 합니다|관리자가 합니다)/.test(l))

  if (writerCan) {
    check(saysAdminOnly.length === 0,
      '**작성자가 발행할 수 있으니, 「발행은 관리자만」이라고 말하는 편이 없다**',
      saysAdminOnly.join(' / '))
    // 할 수 있다는 말이 **어딘가에는** 있어야 한다. 그냥 지우기만 하면
    // 작성자는 여전히 제가 발행할 수 있다는 걸 모른다 — 조용히 없는 기능이 된다.
    check(/발행[^\n]*작성자|작성자[^\n]*발행/.test(TEXT),
      '**할 수 있다는 말이 남아 있다** — 지우기만 하면 작성자는 끝내 모른다')
  } else {
    check(saysAdminOnly.length > 0,
      '발행이 관리자 전용으로 돌아갔다면 매뉴얼도 그렇게 말해야 한다')
  }

  // 열람자는 못 한다 — 이건 안 바뀌었다. 매뉴얼이 열람자에게 발행을 권하면 안 된다.
  check(viewerCan === false, '열람자는 여전히 발행할 수 없다(코드)')
  check(!/열람자[^\n]*발행할 수 있|발행[^\n]*열람자도/.test(TEXT),
    '매뉴얼이 열람자에게 발행을 권하지 않는다')
}

// ── ② 카드 이름 — 없는 이름을 가리키지 않는가 ──────────────
//
// 2편이 딱 이 문제였다. 「트리 · 머메이드」를 찾으라는데 그 이름이 없어졌다.
// 이름 하나를 박아 막는 게 아니라, **등록과 대조해서** 사라진 이름 전부를 잡는다.
{
  // 감춘 카드는 고르는 화면에 없다. 매뉴얼이 그걸 가리키면 못 찾는다.
  for (const c of CARD_REGISTRY.filter((x) => x.hidden)) {
    check(!TEXT.includes(c.label),
      `감춘 카드 「${c.label}」를 매뉴얼이 가리키지 않는다`)
  }
  // 옛 이름. 등록에서 사라진 문자열이라 대조로는 안 잡히므로 여기 남긴다 —
  // **왜 남기는지**를 적어 두지 않으면 다음 사람이 「이건 왜 있지」 하고 지운다.
  check(!TEXT.includes('트리 · 머메이드'),
    '옛 이름 「트리 · 머메이드」가 안 남았다 — 2026-09-17 에 갈린 이름이다')

  // 매뉴얼이 **말하는** 이름은 실제로 고르는 화면에 있어야 한다.
  // 없는 이름을 지우는 것만으로는 부족하다 — 새로 쓴 이름이 진짜인지도 봐야 한다.
  //
  // **여기 구멍이 있었다**(2026-09-17, 부수기 G 로 잡았다). 처음엔 `머메이드 (TB|LR)` 로
  // 찾았는데, 그러면 매뉴얼이 「머메이드 XY」라고 잘못 써도 **아예 안 걸린다** —
  // 찾는 목록에 없으니 없는 것으로 치고 넘어간다. 「맞는 것만 세는 자」였던 셈이다.
  // 그래서 **방향처럼 생긴 것은 다 걷어다가** 하나씩 실재를 확인한다.
  const named = [...TEXT.matchAll(/머메이드\s+([A-Z]{2,3})/g)].map((m) => m[0])
  check(named.length > 0, '매뉴얼이 새 이름을 가리킨다')
  for (const nm of new Set(named)) {
    check(pick.includes(`label: '${nm}'`),
      `「${nm}」이 실제로 고르는 화면에 있다 — CardPicker 의 MM_DOORS 와 대조`)
  }
  // 그 둘이 가는 카드가 등록에 살아 있는가.
  check(!!cardByKey('tree') && !cardByKey('tree').hidden,
    '두 문이 가는 카드가 등록에 있고 감춰지지 않았다')
}

// ── ③ 등급 이름 ────────────────────────────────────────
// 사용자가 지금 「시스템 관리자」를 「관리자」로 바꾸는 중이다. 매뉴얼만 옛 말로 남으면
// 화면과 글이 다른 말을 한다.
{
  check(!/시스템 관리자/.test(TEXT), '매뉴얼에 옛 표기 「시스템 관리자」가 없다')
  for (const w of ['관리자', '작성자', '열람자']) {
    check(TEXT.includes(w), `등급 이름 「${w}」를 쓴다`)
  }
}

// ── ④ 편마다 글이 제구실을 하는가 ─────────────────────────
{
  check(TITLES.length >= 12, '편마다 제목이 있다')
  check(LINES.every((l) => l.length >= 15),
    '설명이 한 줄값은 한다', LINES.filter((l) => l.length < 15).join(' / '))
  check(new Set(LINES).size === LINES.length,
    '같은 설명이 두 편에 겹치지 않는다 — 복사해 놓고 안 고친 자리다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
