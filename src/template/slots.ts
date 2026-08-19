// 표준 템플릿 슬롯 정책 — 프런트 사본.
//
// 진실은 서버(`server/template_seed.py::SLOT_POLICY`)에 있다. 여기 있는 것은
// **버튼을 숨기고 편집을 막기 위한 화면용 사본**이다. 우회해도 서버가 거부한다.
// 두 파일이 어긋나면 `server/test_slot_policy_sync.py` 가 실패한다.
//
// 사양: start_docs/화면설계/표준템플릿_정본_사양_v1.0.md §5

export type SlotOp = 'cell' | 'merge' | 'row' | 'col' | 'align' | 'cbg' | 'format'

export interface SlotPolicy {
  edit: SlotOp[]
  /** 위에서부터 이 행 수만큼은 L2가 못 건드린다(헤더). */
  lockedRows?: number
  /** 셀 배경색으로 고를 수 있는 값. 임의 색을 막아야 취합에서 색의 의미가 유지된다. */
  cbgPalette?: string[]
  /** 열 index → 고를 수 있는 값(드롭다운). 자유 입력을 막아야 집계가 된다. */
  choices?: Record<string, string[]>
}

// 진행 셀 색 (사양 §3.3)
export const CBG = {
  done: '#2462EB',   // 완료 구간
  plan: '#EAF1FE',   // 계획 구간
  risk: '#D98A2A',   // 지연·리스크
  hold: '#EEF0F4',   // 보류
} as const

export const CBG_LABEL: Record<string, string> = {
  '#2462EB': '완료',
  '#EAF1FE': '계획',
  '#D98A2A': '지연',
  '#EEF0F4': '보류',
}

const PALETTE = [CBG.done, CBG.plan, CBG.risk, CBG.hold]

// **열(col) 추가·삭제가 어느 슬롯에도 없다.** 임원마다 열 구성이 달라지면
// 회차 취합에서 표를 자동 병합할 수 없다(설계사상 ④).
export const SLOT_POLICY: Record<string, SlotPolicy> = {
  head: { edit: [] },
  foot: { edit: [] },
  'SLOT-A': {
    edit: ['cell', 'merge', 'row', 'align', 'cbg', 'format'],
    cbgPalette: PALETTE,
    lockedRows: 2,        // 연도 행 + 월 행
  },
  'SLOT-B': { edit: ['cell', 'row', 'format'], lockedRows: 1, choices: { '2': ['완료', '진행', '지연', '보류'] } },
  'SLOT-C': { edit: ['cell', 'row', 'format'], lockedRows: 1 },
  'SLOT-D': { edit: ['cell', 'row', 'format'], lockedRows: 1, choices: { '2': ['높음', '중간', '낮음'] } },
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

/** 이 칸을 편집할 수 있는가. 헤더 행과 자동 채번 열은 막는다. */
export function cellEditable(slot: string | undefined, r: number, c: number): boolean {
  if (!isSlotEl(slot)) return true
  if (!slotAllows(slot, 'cell')) return false
  if (r < lockedRowCount(slot)) return false
  // 목록 표의 0열은 자동 채번이다 — 사람이 고치면 번호가 어긋난다.
  if (c === 0 && (slot === 'SLOT-B' || slot === 'SLOT-C' || slot === 'SLOT-D')) return false
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

/** 보류(hold)는 단색이 아니라 사선 해칭으로 그린다 — 색맹에게도 '비어 있음'이 구분된다. */
export function cellBackground(bg: string | undefined): string | undefined {
  if (!bg) return undefined
  if (bg === CBG.hold) {
    return 'repeating-linear-gradient(45deg,#e9edf3,#e9edf3 3px,#f6f8fc 3px,#f6f8fc 6px)'
  }
  return bg
}
