// 사람이 마지막으로 고른 화면 설정. **이 브라우저에만** 남는다.
//
// 왜 필요한가
//   새 이북은 늘 세로로 시작했다 — `emptySnapshot()` 에 'portrait' 가 박혀 있었다.
//   오른쪽 패널에서 가로로 바꿀 수는 있지만 다음에 새로 만들면 또 세로다.
//   임원진 요청: 「가로 세로 변경 기능 추가. 한번 선택을 하면 이후 부터는 그 설정으로
//   계속 생성이 되어야 함」 — 앞의 절반은 이미 있었고, 뒤의 절반이 없었다.
//
// 왜 서버가 아니라 브라우저인가
//   이건 문서의 성질이 아니라 **그 사람의 손버릇**이다. 서버에 두면 계정 설정이 되고,
//   그러면 「관리자가 남의 기본값을 바꿀 수 있나」 같은 질문이 따라온다.
//   못 읽어도 잃을 게 없는 값이라 브라우저면 충분하다.
//
// 저장이 막힌 브라우저(시크릿 창, 사이트 데이터 차단)에서는 읽기도 쓰기도 **던진다.**
// 그래서 전부 try/catch 로 감싼다 — 기본값 하나 못 읽었다고 화면이 안 뜨면 안 된다.
type Orientation = 'portrait' | 'landscape'

const ORI_KEY = 'es_last_orientation'

/** 마지막에 고른 방향. 모르면 세로(지금까지의 기본값). */
export function lastOrientation(): Orientation {
  try {
    return localStorage.getItem(ORI_KEY) === 'landscape' ? 'landscape' : 'portrait'
  } catch {
    return 'portrait'
  }
}

export function rememberOrientation(o: Orientation): void {
  try {
    localStorage.setItem(ORI_KEY, o === 'landscape' ? 'landscape' : 'portrait')
  } catch { /* 저장이 막힌 브라우저 — 이번 판만 기억 못 할 뿐이다 */ }
}

// ── 오른쪽 패널에서 펴 둔 묶음 ────────────────────────
//
// 탭을 접이식으로 바꾸면서 「접고 편 상태를 기억한다」가 시안의 약속이었다(C-2).
// 안 기억하면 **고를 때마다 처음으로 돌아간다** — 표를 고칠 때마다 「크기·자리」를
// 다시 펴야 하고, 그건 탭을 다시 누르는 것과 같은 손품이다. 접이식으로 바꾼 이유가 반쯤 사라진다.
//
// 방향과 같은 부류다: **문서의 성질이 아니라 그 사람의 손버릇**이라 브라우저에 둔다.
// 못 읽어도 잃을 게 없다 — 기본값으로 열린다.

const SEC_KEY = 'es_panel_open'

/** 모르는 이름은 버린다. 예전 판이 남긴 키가 화면에 안 보이는 묶음을 열어 둔 채로
 *  숫자만 늘리는 일을 막는다. */
export function openSections<K extends string>(
  known: readonly K[], fallback: Record<K, boolean>,
): Record<K, boolean> {
  let saved: unknown = null
  try { saved = JSON.parse(localStorage.getItem(SEC_KEY) || 'null') } catch { saved = null }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { ...fallback }
  const src = saved as Record<string, unknown>
  const out = { ...fallback }
  for (const k of known) if (typeof src[k] === 'boolean') out[k] = src[k] as boolean
  return out
}

export function rememberOpenSections(v: Record<string, boolean>): void {
  try { localStorage.setItem(SEC_KEY, JSON.stringify(v)) } catch { /* 저장이 막힌 브라우저 */ }
}

// ── 셸 사이드바를 접어 뒀는가 ──────────────────────
//
// 방향·묶음과 같은 부류다 — **그 사람의 손버릇**이라 브라우저에 둔다.
// 편집 화면에서는 이 값과 무관하게 접힌다(자리가 좁아서). 그건 화면이 정하는 것이고,
// 여기 적히는 것은 **사람이 정한 것**뿐이다. 둘을 섞으면 편집에 한 번 들어갔다 온
// 사람의 「펴 둠」이 조용히 사라진다.

const FOLD_KEY = 'es_shell_folded'
const WIDTH_KEY = 'es_shell_width'

/** 펼친 사이드바 폭. 사람이 경계선을 끌어 맞춘 값이다.
 *  **접힘과 따로 둔다** — 접었다 펴면 맞춰 둔 폭으로 돌아와야 한다.
 *  터무니없는 값은 버린다(예전 판이 남긴 것, 손으로 고친 것). */
export const SIDE_MIN = 150, SIDE_MAX = 360, SIDE_DEFAULT = 214

export function shellWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY))
    if (Number.isFinite(n) && n >= SIDE_MIN && n <= SIDE_MAX) return Math.round(n)
  } catch { /* 저장이 막힌 브라우저 */ }
  return SIDE_DEFAULT
}

export function rememberShellWidth(px: number): void {
  const n = Math.round(Math.min(SIDE_MAX, Math.max(SIDE_MIN, px)))
  try { localStorage.setItem(WIDTH_KEY, String(n)) } catch { /* 저장이 막힌 브라우저 */ }
}


export function shellFolded(): boolean {
  try { return localStorage.getItem(FOLD_KEY) === '1' } catch { return false }
}

export function rememberShellFolded(v: boolean): void {
  try { localStorage.setItem(FOLD_KEY, v ? '1' : '0') } catch { /* 저장이 막힌 브라우저 */ }
}
