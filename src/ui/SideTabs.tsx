import { create } from 'zustand'

/**
 * **곁패널의 두 칸 — 챗봇 · 메모.**
 *
 * 2026-09-18 · 시안 ㄷ(docs/화면시안_메모_챗봇_한패널_v1.0.html)에서 고른 모양이다.
 * 전에는 **왼쪽 아래에 메모 단추, 오른쪽 아래에 챗봇 단추**가 따로 떠 있었다.
 * 「너무 과한 것 같아서」 — 사용자 말 그대로다. 둘은 애초에 쌍둥이였다:
 * 머리 짜임이 같고(제목 · S M L · 닫기), 늘 닫힌 채로 시작하는 규칙도 같고,
 * `notes.css` 첫 줄에는 아예 「챗봇식 왼쪽 슬라이드 패널」이라고 적혀 있었다.
 *
 * ── 왜 알약(ㄱ)이 아니라 탭(ㄷ)인가 ────────────────────────
 * 머리에 전환 알약을 넣는 안이 더 가벼워 보였는데, **실제 폭으로 재 보니 안 됐다.**
 * 챗봇 머리가 줄어들지 않았을 때 필요한 폭이 404px(제목 193 + 오른쪽 단추 183 + 여백 28)인데
 * 쓸 수 있는 자리는 S 338 · M 458 이다. 곧 **S 는 지금도 66px 모자란다.**
 * 알약을 얹으면 S 에서 140px, M 에서 20px 만큼 **제목을 더 밀어낸다** —
 * 그런데 알약 안에서 「지금 메모인가 챗봇인가」를 말해 주는 것이 바로 그 제목이었다.
 * 탭은 제 줄을 써서 폭과 다투지 않고, 어디에 서 있는지도 탭이 말한다.
 * 대가는 세로 한 줄(약 35px)이다.
 */
export type SideMode = 'chat' | 'notes'

/**
 * **적어 둔 메모가 있다**는 신호.
 *
 * 없애 버린 왼쪽 아래 단추가 하던 일이다(`np-fab-dot`). 그 단추가 사라지면서
 * 이 신호도 같이 사라질 뻔했다 — 챗봇을 보고 있는 사람에게 「메모에 뭔가 있다」를
 * 말해 줄 것이 없어진다. 그래서 수만 따로 들고 다닌다.
 *
 * 메모장은 닫혀 있어도 목록을 불러 두므로(자료를 열 때 한 번), 챗봇 쪽에서도 값이 맞다.
 */
export const useNoteCount = create<{ n: number; setN: (n: number) => void }>((set) => ({
  n: 0,
  setN: (n) => set({ n }),
}))

export default function SideTabs({ mode, onChat, onNotes }: {
  mode: SideMode
  onChat: () => void
  onNotes: () => void
}) {
  const n = useNoteCount((s) => s.n)
  return (
    <div className="side-tabs" role="tablist">
      <button role="tab" aria-selected={mode === 'chat'} className={mode === 'chat' ? 'on' : ''}
        onClick={onChat}>💬 챗봇</button>
      <button role="tab" aria-selected={mode === 'notes'} className={mode === 'notes' ? 'on' : ''}
        onClick={onNotes}>🗒 메모{n > 0 && mode !== 'notes' ? <span className="side-dot" /> : null}</button>
    </div>
  )
}
