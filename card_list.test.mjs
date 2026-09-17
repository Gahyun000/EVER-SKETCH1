// **고르는 목록에서 여섯 장을 치우고, 머메이드를 두 문으로 갈랐다.**
//
// 2026-09-17 · 사용자 지시: 「덱 섹션이랑 경영 보고 보강 4개는 빈 화면이나 다름없으니 없애고,
// 트리·머메이드는 머메이드로만 두고, 프로세스 자리에 머메이드 TB, 기존은 머메이드 LR」.
//
// **지우지 않고 감췄다.** 등록(registry.ts)에서 줄을 지우면 없어지는 것이 목록만이 아니다 —
// `PageView` 가 그 등록을 보고 본문을 그린다. 지우면 그 카드로 만들어 둔 쪽이 **제목만 남고
// 조용히 빈다.** 터지지도 않고 글이 없어지지도 않는데(값은 `page.fields` 에 그대로 있다)
// 화면에서만 비어서, 보는 사람은 「지워졌다」고 생각한다. 그래서 **새로 만드는 길만 막았다.**
//
// 그 결정 때문에 이 파일이 재야 할 것이 둘로 갈린다:
//   · **막혔나** — 고르는 화면·검색·메뉴 어디에도 없다. 만드는 길이 하나도 안 남았다.
//   · **살아 있나** — 등록에는 그대로 있어서 이미 만든 쪽은 계속 그려진다.
// 하나만 재면 「목록엔 없는데 어딘가로 만들어지는」 또는 「목록에서 뺐더니 옛 자료가 빈」
// 둘 중 하나를 놓친다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs card_list.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
// 주석 안의 글자가 가드를 통과시키면 안 된다 — 이 파일이 재는 것 대부분이
// 「그 말이 코드에 있나」라서, 주석을 안 걷으면 **설명만 적어 두고 통과**한다.
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const { CARD_REGISTRY, cardByKey } = await import('./src/cards/registry.ts')
const { analyzeCleanup } = await import('./src/import/cleanup.ts')
const pick = bare(read('./src/builder/CardPicker.tsx'))
const menu = bare(read('./src/builder/chrome/MenuBar.tsx'))
const pal = bare(read('./src/builder/Palette.tsx'))
const ai = bare(read('./src/builder/AiCleanup.tsx'))
const cleanSrc = bare(read('./src/import/cleanup.ts'))
const cat = read('./server/intent/card_catalog.py')

const HIDDEN = ['summary', 'kpi', 'roadmap', 'market', 'flow', 'dsection']
const SHOWN = ['cover', 'toc', 'note', 'closing', 'tree', 'mindmap', 'sticky', 'board']

// ── ① 감춘 여섯, 남은 여덟 ────────────────────────
{
  for (const k of HIDDEN) check(cardByKey(k)?.hidden === true, k + ' 은 감췄다')
  for (const k of SHOWN) check(!cardByKey(k)?.hidden, k + ' 은 그대로 보인다')
  check(CARD_REGISTRY.filter((c) => c.hidden).length === 6,
    '감춘 것은 정확히 여섯 — 하나 더 감추면 목록이 조용히 줄어든다')
  // 「경영 보고 보강」 묶음은 통째로 비었다. 빈 묶음이 이름만 남으면 안 된다.
  check(CARD_REGISTRY.filter((c) => c.group === 'extra' && !c.hidden).length === 0,
    '경영 보고 보강 묶음은 통째로 비었다')
  check(/if \(!tiles\.length\) return null/.test(pick),
    '**빈 묶음은 이름도 안 그린다** — 안 그러면 「경영 보고 보강」만 덩그러니 남는다')
}

// ── ② 감췄어도 **그리기는 살아 있다** ───────────────
// 이 파일에서 제일 중요한 대목이다. 여기가 깨지면 사용자의 저장된 쪽이 조용히 빈다.
{
  for (const k of HIDDEN) {
    const c = cardByKey(k)
    check(!!c, k + ' 은 등록에 **남아 있다** — 지우면 그 카드로 만든 쪽이 조용히 빈다')
    if (k !== 'flow' && k !== 'dsection') {
      check(!!c && c.fields.length > 0, k + ' 의 칸 정의가 남아 있다 — 본문을 이걸로 그린다')
    }
  }
  check(cardByKey('kpi')?.kpi === true, 'kpi 표시가 남아 있다 — PageView 가 이걸로 지표를 그린다')
  check(cardByKey('flow')?.viz === 'flow', 'flow 표시가 남아 있다 — PageView 가 이걸로 단계를 그린다')
  check(cardByKey('dsection')?.fields.length === 10, '덱 섹션 칸 열 개가 남아 있다')
  // 서버 쪽도 같다: 감춘 카드도 「뭐냐」고 물으면 대답해야 이미 만든 쪽을 AI 로 고칠 수 있다.
  check(/def is_card\(key: str\) -> bool:\s*\n\s*return key in CARDS_BY_KEY/.test(cat),
    '서버도 감춘 카드를 **모른다고 하지 않는다** — 예전 자료를 계속 고칠 수 있어야 한다')
}

// ── ③ 새로 만드는 길이 **하나도** 안 남았다 ──────────
// 감추기의 값은 여기에 있다. 한 군데라도 남으면 「목록엔 없는데 생기는」 카드가 된다.
{
  check(/CARD_REGISTRY\.filter\(\(c\) => c\.group === g\.key && !c\.hidden\)/.test(pick),
    '카드 고르기가 감춘 것을 거른다')
  check(!/c\.key !== 'dsection'/.test(pick),
    '덱 섹션만 빼던 옛 특례는 없어졌다 — 규칙이 두 벌이면 한쪽만 는다')
  check(/CARD_REGISTRY\.filter\(\(c\) => c\.group === g\.key && !c\.hidden\)/.test(pal),
    'Palette 도 같은 필터를 쓴다 — 지금 안 그려지는 것 같아도 되살아날 때가 있다')
  check(!/pick\('dsection'\)/.test(pick), '「＋ 덱 섹션」 빠른 단추가 없어졌다')
  check(!/addCard\('dsection'\)/.test(menu), '메뉴바의 「＋ 덱 섹션 카드」 두 곳이 없어졌다')
  // 검색으로도 못 꺼내야 한다 — 거르기를 목록에만 걸고 검색에 안 걸면 쳐서 찾을 수 있다.
  const gi = pick.indexOf('const items = CARD_REGISTRY.filter')
  const gseg = pick.slice(gi, pick.indexOf('return (', gi))
  check(gi > 0 && /\.filter\(\(t\) => match\(t\.label, t\.id\)\)/.test(gseg),
    '검색은 **거르고 난 뒤**에 건다 — 순서가 반대면 감춘 카드가 검색으로 나온다')
  // 전체를 훑어 마지막 구멍을 막는다. 위 넷을 다 통과해도 새 호출이 생기면 여기서 걸린다.
  for (const k of HIDDEN) {
    check(!new RegExp("addCard\\('" + k + "'\\)").test(pick + menu + pal),
      k + ' 을 새로 만드는 호출이 화면 어디에도 없다')
  }
}

// ── ④ 머메이드 — 카드는 하나, 문은 둘 ───────────────
{
  check(cardByKey('tree')?.label === '머메이드', '이름에서 「트리 ·」가 빠졌다')
  check(!CARD_REGISTRY.some((c) => c.key === 'treeTB' || c.key === 'treeLR'),
    '**카드를 쪼개지 않았다** — 쪼개면 등록·서버 사본·저장된 cardKey 가 두 벌이 된다')
  check(/graph TB/.test(pick) && /graph LR/.test(pick), '두 방향 표본이 다 있다')
  check(!/graph TD/.test(pick),
    '**TD 가 아니라 TB 로 쓴다** — 파서가 TB 를 그대로 읽고, 되돌려 쓰는 곳이 없어 바뀌지 않는다')
  // 두 문이 **같은 카드로** 간다. 다른 데로 가면 저장된 cardKey 가 갈라진다.
  const di = pick.indexOf('const MM_DOORS')
  const dseg = pick.slice(di, pick.indexOf(']', pick.indexOf('dir: \'LR\'', di)))
  check(di > 0 && !/id: 'tree(TB|LR)'/.test(dseg) && /dir: 'TB'/.test(dseg) && /dir: 'LR'/.test(dseg),
    '문 둘이 방향만 다르다')
  check(/addCard\('tree', undefined, mm\)/.test(pick), '어느 문으로 들어와도 **같은 카드키**로 간다')
  // 몸통은 한 벌이어야 한다 — 두 벌이면 한쪽만 고쳐져서 문마다 다른 표본이 나온다.
  check(/const BODY = `/.test(pick) && (pick.match(/A\[기획\] --> B\[설계\]/g) || []).length === 1,
    '표본 몸통은 한 벌이고 첫 줄만 갈아 끼운다')
  check(/function pickMermaid/.test(pick) && /setMm\(d\.src\)/.test(pick),
    '**문을 고를 때마다 표본을 새로 채운다** — 안 그러면 TB 를 눌렀는데 아까 LR 글이 남는다')
  check(/\{door\.label\}/.test(pick), '대화상자가 어느 문으로 들어왔는지 말한다')
  check(/mmTB:/.test(pick) && /mmLR:/.test(pick), '방향이 보이는 그림이 둘 다 있다')
}

// ── ⑤ AI 가 KPI 를 안 권한다 ───────────────────────
// 사람이 못 고르는 카드를 기계가 권하면 목록에 없는 것이 만들어진다.
{
  check(!/'kpi'/.test(ai), '「AI로 정리」에 KPI 전환 제안이 없다')
  check(!/setCard/.test(ai), '그 제안이 쓰던 setCard 도 안 남았다 — 안 쓰는 배선은 되살아난다')
  check(!/KpiSuggestion/.test(cleanSrc), '후보를 계산하던 자리도 없어졌다')
  // **빈 상자를 막는다.** 항목만 지우고 「없어요」 판정을 그대로 두면, 후보가 있는 자료에서
  // 「없어요」도 안 뜨고 보일 것도 없는 상자가 된다 — 지우는 것보다 나쁘다.
  check(/const nothing = plan\.polishCount === 0$/m.test(ai),
    '「제안 없음」 판정도 같이 고쳤다 — 안 그러면 빈 상자가 뜬다')
  const plan = analyzeCleanup([{ id: 1, cardKey: 'note', fields: {}, blocks: [
    { type: 'h1', text: '기대 성과' },
    { type: 'text', text: '불량률: -30%' },
    { type: 'text', text: '검사시간: -40%' },
  ] }])
  check(plan.kpi === undefined, '**실제로 돌려 봐도** KPI 후보가 안 나온다')
  check(plan.polishCount === 0 && Object.keys(plan).length === 1,
    '문구 다듬기는 그대로 남았다 — 같이 없애 버리면 AI 정리가 빈 껍데기가 된다')
  check(/catalog_for_prompt/.test(cat) && /if c\.hidden:\s*\n\s*continue/.test(cat),
    '서버도 감춘 카드를 AI 에게 안 권한다 — 화면과 같은 규칙이다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
