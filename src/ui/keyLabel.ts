import { create } from 'zustand'

/**
 * **단축키를 그 사람 키보드에 있는 글자로 적는다.**
 *
 * 2026-09-18 · 사용자: 「메뉴바 안에 커맨드 기호로 나와 있는 거 윈도우 버전으로도 알려
 * 줘야 하는 게 윈도우 사용자가 더 많음」. 맞는 말이었고, 게다가 **앱 안에서 표기가 이미
 * 두 가지로 갈려 있었다** — 메뉴바와 매뉴얼은 `⌘S` 처럼 맥 기호만, 도움말·툴팁은
 * `⌘/Ctrl + Z` 처럼 둘 다. `⇧`·`⌥`·`↵` 도 윈도우 키보드에는 없는 글자다.
 *
 * ── 판별이 틀리면 무슨 일이 나는가 ──────────────────────────
 * **기능은 안 깨진다.** 저장소에서 단축키를 받는 자리 일곱 곳이 전부
 * `e.metaKey || e.ctrlKey` 로 둘 다 받는다. 여기서 정하는 것은 **글자뿐**이다.
 * 틀리면 「표기가 틀린 것」이고, 그건 지금 윈도우 사용자 전원이 겪는 상태다.
 *
 * 그래도 **맥인데 윈도우로 잘못 보면** 맥 쓰는 사람이 `Ctrl` 을 보게 된다 — 지금은
 * 안 겪던 손해다. 그래서 **사람이 고를 수 있게** 해 둔다(자동 · 맥 · 윈도우).
 * 그 단추는 환경설정이 아니라 **도움말 창**에 있다 — 환경설정은 관리자만 열린다.
 *
 * ── 판별을 실제로 재 봤다(Chromium · 플랫폼 흉내 · 2026-09-18) ──
 * 맥 크롬 · 윈도우 크롬 · 윈도우 엣지 · 리눅스 · 아이패드, 그리고 그 다섯을
 * `userAgentData` 없이(사파리·파이어폭스 꼴), 또 `navigator.platform` 이 비었을 때
 * 넷, 둘이 어긋날 때 하나 — **모두 열다섯 가지 전부 맞혔다.**
 */
export type KeyStyle = 'auto' | 'mac' | 'win'
const STORE_KEY = 'shortcut-style'

/** 세 단으로 떨어진다. 두 번째(`navigator.platform`)는 폐기 예정이라 비는 날을 대비한다. */
export function detectMac(): boolean {
  const d = (navigator as { userAgentData?: { platform?: string } }).userAgentData
  if (d && typeof d.platform === 'string' && d.platform) return /mac/i.test(d.platform)
  if (navigator.platform) return /mac/i.test(navigator.platform)
  return /mac os x/i.test(navigator.userAgent)
}

function load(): KeyStyle {
  try { const v = localStorage.getItem(STORE_KEY); if (v === 'mac' || v === 'win' || v === 'auto') return v } catch { /* noop */ }
  return 'auto'
}

/** 고른 표기. **상태로 둔다** — 바꾸면 메뉴·도움말·툴팁이 그 자리에서 같이 바뀌어야 한다. */
export const useKeyStyle = create<{ style: KeyStyle; setStyle: (s: KeyStyle) => void }>((set) => ({
  style: load(),
  setStyle: (s) => { try { localStorage.setItem(STORE_KEY, s) } catch { /* noop */ } set({ style: s }) },
}))

export function macLabels(style: KeyStyle): boolean {
  return style === 'auto' ? detectMac() : style === 'mac'
}

const MAC: Record<string, string> = { mod: '⌘', shift: '⇧', alt: '⌥', enter: '↵', del: '⌫' }
const WIN: Record<string, string> = { mod: 'Ctrl', shift: 'Shift', alt: 'Alt', enter: 'Enter', del: 'Del' }

/**
 * **중립 표기를 그 사람 글자로 옮긴다.** `mod+shift+Z` → `⌘⇧Z` 또는 `Ctrl+Shift+Z`.
 *
 * 소스에는 중립으로만 적는다. 맥 글자와 윈도우 글자를 둘 다 적어 두면 **두 벌**이 되고,
 * 두 벌은 언젠가 한쪽만 고쳐진다.
 */
export function keyLabel(spec: string, mac: boolean): string {
  const tbl = mac ? MAC : WIN
  const parts = spec.split('+').map((p) => tbl[p.toLowerCase()] ?? p)
  // 맥은 기호를 붙여 쓰고(⌘⇧Z), 윈도우는 + 로 잇는다(Ctrl+Shift+Z). 각 동네의 관습이다.
  return mac ? parts.join('') : parts.join('+')
}

/** 화면에서 쓰는 손잡이. 표기를 바꾸면 이걸 쓰는 곳이 다시 그려진다. */
export function useKey(): (spec: string) => string {
  const style = useKeyStyle((s) => s.style)
  const mac = macLabels(style)
  return (spec: string) => keyLabel(spec, mac)
}
