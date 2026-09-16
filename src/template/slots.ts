// 표준 템플릿 슬롯 정책 — 프런트 사본.
//
// 진실은 서버(`server/template_seed.py::SLOT_POLICY`)에 있다. 여기 있는 것은
// **버튼을 숨기고 편집을 막기 위한 화면용 사본**이다.
// 두 파일이 어긋나면 `server/test_slot_policy_sync.py` 가 실패한다.
//
// **서버가 무엇까지 거부하는지 정확히 적는다.** 오래 「우회해도 서버가 거부한다」고
// 적혀 있었지만 사실이 아니었다 — 저장 경로는 보내온 state 를 그대로 받아 적었고
// slot_allows() 는 테스트에서만 불렸다. 지금 서버가 실제로 거부하는 것은
// **세트가 깨지는 것**뿐이다(server/template_guard.py):
//
//     거부한다   SLOT-A/B/C 표가 없어지거나 둘이 되거나 열 수가 달라지면
//     거부 안 한다 그 밖의 편집 — 아래 목록은 여전히 **화면에서만** 막는다
//
// 화면에서만 막는 것을 「서버가 지킨다」고 적으면, 그 문장을 믿고 더 위험한 것을
// 화면에 맡기게 된다. 이 저장소에서 이미 두 번 그렇게 됐다.
//
// 사양: start_docs/화면설계/표준템플릿_정본_사양_v2.0.md §5

export type SlotOp = 'cell' | 'merge' | 'row' | 'col' | 'align' | 'cbg' | 'format' | 'today'

export interface SlotPolicy {
  /** **표를 다루는 동작만** 말한다. 글상자 문구는 아래 `text` 가 정한다. */
  edit: SlotOp[]
  /** 이름표(글상자)의 문구를 사람이 고칠 수 있는가.
   *  `edit: []` 는 표 동작이라 글상자에는 애초에 걸리지 않았다 —
   *  「머리글은 다 잠겼다」로 읽히던 것이 사실이 아니었던 이유다. */
  text?: 'open' | 'locked'
  /** 머리글이 **몇 행인가**. 색·굵기를 그 행에 입히고, 행 삭제를 막는다.
   *  글자를 고칠 수 있는지는 `headerEdit` 이 따로 정한다. */
  lockedRows?: number
  /** 머리글 행의 **글자**를 고칠 수 있는가.
   *
   *  예전에는 `lockedRows` 하나가 「몇 행인가」와 「고칠 수 있는가」를 겸했다.
   *  그래서 「진행 현황」이나 「사업그룹」을 자기 부서 말로 바꿀 방법이 없었다.
   *  열어도 취합은 안 깨진다 — 취합이 표를 잇는 근거는 **열 번호**지 열 이름이 아니다.
   *  열 **수**는 여전히 못 바꾸고(server/template_guard.py), 머리글 **행 자체를
   *  지우는 것**도 계속 막는다. */
  headerEdit?: boolean
  /** 셀 배경색으로 고를 수 있는 값. 임의 색을 막아야 취합에서 색의 의미가 유지된다. */
  cbgPalette?: string[]
  /** 열 index → 고를 수 있는 값(드롭다운). 자유 입력을 막아야 집계가 된다. */
  choices?: Record<string, string[]>
}

// 로드맵 머리글 색 (실물 실측)
export const HEADER_BG = '#FFFFCC'

// 진행 구간 색 5종 (사양 §3.3) — 실물에서 그대로 가져왔다.
// **색에 뜻을 지어 붙이지 않는다.** 무슨 단계인지는 셀 안의 글자에 적혀 있다.
// '완료/지연' 같은 뜻을 임의로 붙이면 임원이 쓰던 뜻과 어긋난 채 취합 통계가 나온다.
export const STAGE_COLORS = ['#FBE5D6', '#DEEBF7', '#E2F0D9', '#FFFF00', '#92D050'] as const

export const CBG_LABEL: Record<string, string> = {
  '#FBE5D6': '주황',
  '#DEEBF7': '파랑',
  '#E2F0D9': '연두',
  '#FFFF00': '노랑',
  '#92D050': '초록',
}

// **열(col) 추가·삭제가 어느 슬롯에도 없다.** 임원마다 열 구성이 달라지면
// 회차 취합에서 표를 자동 병합할 수 없다(설계사상 ④).
//
// SLOT-A 는 병합이 **필수**다 — 실물에서 진행 구간은 색칠이 아니라
// '가로로 병합한 칸 + 단계 이름' 이다. 병합을 막으면 로드맵을 그릴 수 없다.
export const SLOT_POLICY: Record<string, SlotPolicy> = {
  head: { edit: [], text: 'open' },
  foot: { edit: [], text: 'open' },
  'SLOT-A': {
    edit: ['cell', 'merge', 'row', 'align', 'cbg', 'format', 'today'],
    cbgPalette: [...STAGE_COLORS],
    lockedRows: 2,        // 연도 행 + 월 행
    text: 'open',
    headerEdit: true,
  },
  /**
   * **2026-09-16 · ②③ 에도 병합·칸 색·정렬을 연다.**
   *
   * 사용자: 「로드맵은 셀 병합이 가능한데 왜 진행현황·향후 계획, 이슈는 병합이 안 되는지」.
   * 고장이 아니라 처음에 그렇게 적어 둔 것이었다 — 로드맵은 진행 구간이 「가로 병합 +
   * 단계 이름」이라 병합이 **필수**였고, ②③ 는 그냥 목록이라 필요 없다고 본 것이다.
   *
   * 열어도 안 깨진다. **병합은 열 수를 바꾸지 않는다** — 서버가 거부하는 것은
   * 「표가 없어지거나 둘이 되거나 **열 수가 다르면**」이다(server/template_guard.py).
   * 표마다 되는 게 다른 편이 오히려 「왜 여기만 안 되지」를 만든다.
   *
   * 칸 색은 **팔레트를 두지 않는다** — 로드맵의 색은 상태를 가리키는 약속이지만
   * ②③ 의 색은 그냥 색이다(`cellColors` 가 자유 색을 내준다).
   */
  'SLOT-B': { edit: ['cell', 'merge', 'row', 'align', 'cbg', 'format'], lockedRows: 1, text: 'open', headerEdit: true },
  'SLOT-C': { edit: ['cell', 'merge', 'row', 'align', 'cbg', 'format'], lockedRows: 1, text: 'open', headerEdit: true },
}

/** 이 슬롯의 이름표 문구를 고칠 수 있는가.
 *  슬롯이 아닌 일반 요소는 당연히 고칠 수 있다. */
export function slotTextEditable(slot: string | undefined): boolean {
  if (!slot) return true
  return (SLOT_POLICY[slot]?.text ?? 'open') === 'open'
}

/** 이 슬롯에서 이 편집이 허용되는가. 모르는 슬롯은 거부(기본 거부). */
export function slotAllows(slot: string | undefined, op: SlotOp): boolean {
  if (!slot) return true          // 슬롯이 없는 일반 요소는 템플릿 제약을 받지 않는다
  const p = SLOT_POLICY[slot]
  if (!p) return false
  return p.edit.includes(op)
}

/** 템플릿 슬롯인가(= 제약을 받는 요소인가). */
export const isSlotEl = (slot: string | undefined): boolean => !!slot && slot in SLOT_POLICY

export function lockedRowCount(slot: string | undefined): number {
  if (!slot) return 0
  return SLOT_POLICY[slot]?.lockedRows ?? 0
}

/** 이 칸을 편집할 수 있는가. 헤더 행은 막는다.
 *  (v1.0 에 있던 '자동 채번 0열' 규칙은 없앴다 — 실물 양식에 번호 열이 없다.) */
export function headerEditable(slot: string | undefined): boolean {
  if (!slot) return true
  return SLOT_POLICY[slot]?.headerEdit === true
}

export function cellEditable(slot: string | undefined, r: number, c: number): boolean {
  void c
  if (!isSlotEl(slot)) return true
  if (!slotAllows(slot, 'cell')) return false
  // 머리글 행은 **행 수**로만 표시되고, 고칠 수 있는지는 headerEdit 이 따로 정한다.
  if (r < lockedRowCount(slot)) return headerEditable(slot)
  return true
}

export function cellChoices(slot: string | undefined, c: number): string[] | undefined {
  if (!slot) return undefined
  return SLOT_POLICY[slot]?.choices?.[String(c)]
}

export function cbgPalette(slot: string | undefined): string[] | undefined {
  if (!slot) return undefined
  return SLOT_POLICY[slot]?.cbgPalette
}

/**
 * **양식이 없는 표에서 쓰는 칸 색.**
 *
 * 2026-09-16 · 사용자가 「표는 색상 채우기 기능이 따로 없는 것 같다」고 했고, 맞았다.
 * 기능이 없던 게 아니라 **가려져 있었다**: 칸 색(`cbg`)은 자료에도 있고 화면도 그리는데,
 * 색 목록을 `cbgPalette` 가 **슬롯에서만** 내주다 보니 슬롯이 없는 표에서는 그 칸이
 * 통째로 안 떴다. 요소를 눌러 뜨는 막대에서도 표는 채우기 대상이 아니다(`NO_FILL`) —
 * 표는 칸마다 색이 따로라서 그게 맞다. 그래서 **어디에도 길이 없었다.**
 *
 * 표준 양식의 「진행 표시」와는 **뜻이 다르다.** 거기 색들은 상태를 가리키는 약속이라
 * 이름이 붙어 있고(`CBG_LABEL`) 양식이 정한 것만 쓴다. 여기 색은 그냥 색이다 —
 * 그래서 이름을 안 붙이고, 자료 목록·결재함이 쓰는 옅은 바탕색과 같은 계열로 고른다.
 * 글자는 늘 진한 잉크색이므로 **옅은 색만** 둔다(대비를 지키려고).
 */
export const CBG_FREE: string[] = [
  '#FFFFFF', '#F1F3F6', '#EAF0FF', '#E9F5EF', '#FFF4E3', '#FDF0F0', '#EEF2FA', '#F6F0FF',
]

/**
 * 이 표에서 쓸 수 있는 칸 색. **한 군데서 정한다** — 화면이 「슬롯이면 이것, 아니면
 * 저것」을 제 손으로 갈라 두면 나중에 한쪽만 고쳐진다.
 *
 * 슬롯 표는 양식 색을 **그대로 두고**, 그 뒤에 자유 색을 덧붙인다: 진행 표시의 뜻을
 * 안 깨면서 「그냥 옅게 칠하고 싶다」도 되게 하려는 것이다.
 */
export function cellColors(slot: string | undefined): string[] {
  const p = cbgPalette(slot)
  if (!p) return CBG_FREE
  return [...p, ...CBG_FREE.filter((c) => !p.includes(c))]
}

/** 표 본문 기본 글자색(index.css 와 같은 값). */
const INK = '#1c2433'

/** WCAG 상대 휘도. 단순 평균이 아니라 감마 보정을 거쳐야 실제 대비와 맞는다. */
function relLuminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)))
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * 배경색 위에 올릴 글자색.
 *
 * 처음에는 명도 임계값 하나로 흰색/검정을 갈랐는데, 앰버(#D98A2A) 위에 흰 글씨가
 * 얹혀 **대비가 2.8:1** 밖에 안 나왔다(WCAG AA 기준 4.5). 임원 화면에서 글자가 흐리게 보인다.
 *
 * 그래서 임계값 대신 **흰색과 본문색 중 대비가 큰 쪽을 실제로 계산해 고른다.**
 * 팔레트에 색을 추가해도 따로 손볼 필요가 없고, 잘못 고르는 일도 없다.
 * (검증: slots.render.test.mjs — 팔레트 전 색이 4.5:1 이상인지 확인)
 */
export function cellTextColor(bg: string | undefined): string | undefined {
  if (!bg || bg.length !== 7 || bg[0] !== '#') return undefined
  const onWhite = contrast(bg, '#ffffff')
  const onInk = contrast(bg, INK)
  // 본문색이 더 잘 읽히면 굳이 색을 지정하지 않는다(기본값 그대로).
  return onWhite > onInk ? '#ffffff' : undefined
}

/** 셀 배경 — 실물 색을 그대로 쓴다.
 *
 *  v1.0 에서는 '보류' 색을 사선 해칭으로 바꿔 그렸다. 색맹 배려였지만,
 *  실물에는 보류라는 개념 자체가 없다. 실물과 다르게 그리면
 *  임원이 자기 자료를 못 알아본다 — 그게 더 큰 접근성 문제다.
 *  구분은 색이 아니라 **셀 안의 단계 이름**이 한다. */
export function cellBackground(bg: string | undefined): string | undefined {
  return bg || undefined
}

// ── TODAY 마커 ────────────────────────────────────────
//
// 예전에는 만들 때의 달을 열 번호로 박아 두고 끝이었다. 그런데 이 자료는
// 한 달 쓰고 버리는 물건이 아니다 — 9월에 만든 로드맵을 11월에 다시 열면
// 마커는 여전히 9월에 서 있고, 보는 사람은 그게 오늘이라고 믿는다.
// 눈으로는 잡히지 않는 종류의 오류다.
//
// 그래서 기본은 **자동**이다. 열 때마다 실제 오늘을 따라간다.
// 발표용으로 특정 시점을 고정해야 할 때만 사람이 도구로 붙잡는다.

/** 로드맵 표에서 1월이 놓이는 열 index.
 *  서버 `template_seed.COL_MONTH_FIRST` 와 같아야 한다
 *  (`server/test_slot_policy_sync.py` 가 검사한다).
 *  SLOT-A 는 열 추가·삭제가 금지라 이 값은 문서마다 달라지지 않는다. */
export const ROADMAP_MONTH_COL0 = 2

/** auto = 실제 오늘 · fixed = 사람이 정한 열 · off = 그리지 않음 */
export type TodayMode = 'auto' | 'fixed' | 'off'

export interface TodayMarker {
  /** 고정 열 index. fixed 모드에서 쓰고, 연도를 못 알아낼 때의 폴백이기도 하다. */
  today?: number
  todayMode?: TodayMode
  /** 이 로드맵이 다루는 해. 자동 모드는 이 해에만 마커를 그린다. */
  todayYear?: number
  /** 손으로 놓은 자리(표 왼쪽에서 잰 px). 있으면 열보다 **이쪽이 이긴다**. */
  todayX?: number
  /** 알약이 앉는 높이(표 위에서 잰 px). */
  todayY?: number
  /** 머리글에서 연도를 읽기 위해서만 쓴다(옛 문서 대비). */
  cells?: string[][]
}

/** 이 로드맵이 다루는 해.
 *
 *  `todayYear` 가 없는 자료는 이 기능이 생기기 전에 만들어진 것이다. 그때도
 *  머리글 0행에는 '2026년' 이 적혀 있었으므로 거기서 읽는다 — 이게 없으면
 *  옛 자료에서 「오늘」 버튼을 눌러도 아무 일이 일어나지 않는다(자동으로 바뀌었는데
 *  판정할 연도가 없어 폴백으로 되돌아간다). 버튼이 죽은 것처럼 보이는 종류의 버그다. */
function roadmapYear(el: TodayMarker): number | null {
  if (typeof el.todayYear === 'number') return el.todayYear
  const head = el.cells?.[0]?.[ROADMAP_MONTH_COL0]
  const m = typeof head === 'string' ? head.match(/(\d{4})/) : null
  return m ? Number(m[1]) : null
}

/** 지금 서울이 몇 년 몇 월인가. UTC 로 재면 새해 첫날 아침에 아직 작년이 된다. */
function kstYearMonth(now: Date): { year: number; month: number } {
  const [y, m] = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).split('-')
  return { year: Number(y), month: Number(m) }
}

/**
 * TODAY 마커가 설 열. 그리지 않아야 하면 null.
 *
 * 해가 바뀌면 자동 모드는 마커를 지운다. 2027년이 되면 2027 로드맵을 새로 만들지,
 * 지난해 표에 오늘을 표시하지 않는다 — 지난해 자료가 오늘을 주장하면 안 된다.
 *
 * 기준 연도는 `todayYear`, 없으면 머리글에서 읽는다. 둘 다 없으면 저장된 자리에
 * 그대로 둔다 — 갑자기 마커가 사라지면 사용자는 자기가 지운 줄 안다.
 */
export function todayColumn(el: TodayMarker, now: Date = new Date()): number | null {
  const fixedCol = typeof el.today === 'number' && el.today >= 0 ? el.today : null
  const mode: TodayMode = el.todayMode ?? 'auto'
  if (mode === 'off') return null
  if (mode === 'fixed') return fixedCol
  const base = roadmapYear(el)
  if (base == null) return fixedCol
  const { year, month } = kstYearMonth(now)
  if (year !== base) return null
  return ROADMAP_MONTH_COL0 + (month - 1)
}

/** 마커가 설 자리. 손으로 놓았으면 px, 아니면 열, 안 그리면 null.
 *
 *  **두 군데서 따로 판단하지 않는다.** 예전에 「그릴까」는 FreeLayer 가, 「지금 어디냐」는
 *  도구줄이 각자 재다가, 한쪽만 고치면 화면과 안내 글자가 어긋났다. 한 함수가 답한다.
 *
 *  px 가 열보다 이긴다 — 손으로 민 자리를 자동이 도로 끌어가면 「밀었는데 튕겨 돌아온다」가
 *  된다. 대신 「오늘」 단추가 px 를 지워서 자동으로 되돌린다(도구줄).
 *  `off` 는 무엇보다 먼저다: 숨기라고 했으면 손으로 놓았든 말든 안 그린다. */
export type TodayPlace =
  | { kind: 'px'; x: number; y: number }
  | { kind: 'col'; col: number }
  | null

export function todayPlace(el: TodayMarker, now: Date = new Date()): TodayPlace {
  if ((el.todayMode ?? 'auto') === 'off') return null
  if (typeof el.todayX === 'number' && isFinite(el.todayX)) {
    return { kind: 'px', x: el.todayX, y: typeof el.todayY === 'number' && isFinite(el.todayY) ? el.todayY : 1 }
  }
  const col = todayColumn(el, now)
  return col == null ? null : { kind: 'col', col }
}

/** 표 안에 붙잡아 둔다.
 *
 *  `.fel` 이 overflow:hidden 이라 밖으로 밀면 **마커가 사라진다** — 사용자는 자기가
 *  지운 줄 안다. 알약 높이만큼(12px) 아래를 남겨 두어, 맨 밑으로 밀어도 딱지가
 *  반쯤은 보이게 한다.
 *
 *  **왜 여기 있나.** 처음에는 FreeLayer 안의 짧은 클로저였다. 그런데 검사가
 *  `clampX` 라는 **이름만** 있는지 봐서, 일부러 `const clampX = (v) => v` 로 바꿔도
 *  33개 전부 통과했다(2026-09-16 파괴 검사 G). 이름이 아니라 **하는 일**을 재려면
 *  불러 볼 수 있는 자리에 있어야 한다. */
export function clampTodayX(v: number, w: number): number {
  return Math.max(0, Math.min(Math.max(0, w), v))
}
export function clampTodayY(v: number, h: number): number {
  return Math.max(0, Math.min(Math.max(0, h - 12), v))
}

/** 손으로 놓은 자리를 지우는 패치. 「오늘」·「이 칸에 고정」이 함께 쓴다 —
 *  한쪽만 지우면 단추를 눌러도 마커가 안 움직여 「단추가 죽었다」가 된다. */
export const TODAY_UNPLACED = { todayX: undefined, todayY: undefined } as const
