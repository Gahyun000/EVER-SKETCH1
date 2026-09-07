// 숫자 칸 — **치는 도중에 값을 깎지 않는다.**
//
// ── 무엇이 잘못돼 있었나 ──────────────────────────────
// 예전 칸들은 전부 이런 모양이었다.
//
//     <input type="number" value={el.fs}
//       onChange={(e) => patch({ fs: Math.max(6, Number(e.target.value) || 6) })} />
//
// **한 글자 칠 때마다** 6~120 으로 깎는다. 그래서 60 을 50 으로 고치려고 지우고 5 를
// 치면 그 순간 6 으로 깎여 칸에 박히고, 0 을 칠 자리가 사라진다. 칸을 비우면
// `Number("") || 6` 이라 다시 6 이다 — **칸을 비울 수가 없으니 새 숫자를 처음부터
// 칠 방법이 없다.** 그렇게 6(최솟값)에 갇히면 아래 화살표는 할 일이 없어서,
// 사용자에게는 「위 버튼만 동작한다」로 보인다. 신고된 증상 셋이 전부 이 하나였다.
//
// ── 규칙 ─────────────────────────────────────────
// 치는 동안은 **글자를 그대로 둔다.** 범위 안에 들어오는 순간에만 값으로 받아들이고,
// 칸을 떠날 때(또는 Enter) 한 번 범위를 맞춘다. 못 읽는 글자면 원래 값으로 되돌린다.
//
// 이러면 화살표(스피너)도 그대로 산다 — 스피너가 만드는 값은 늘 범위 안이라
// 누르는 즉시 반영된다.
import { useRef, useState } from 'react'
import { commitValue, liveValue } from './numText'

interface Props {
  value: number
  onCommit: (n: number) => void
  min?: number
  max?: number
  className?: string
  title?: string
  ariaLabel?: string
}

export default function NumInput({ value, onCommit, min = -9999, max = 9999,
                                   className, title, ariaLabel }: Props) {
  // null = 지금 안 만지는 중 → 바깥 값을 그대로 보여준다.
  // 만지는 중에는 사람이 친 글자를 보여준다. 둘을 한 상태로 합치면
  // 「바깥 값이 바뀔 때 덮어쓸까 말까」를 매번 따져야 하고, 그러다 커서가 튄다.
  const [typed, setTyped] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const shown = typed ?? String(Math.round(value))

  function commit() {
    const n = commitValue(typed ?? '', min, max)
    if (n != null && n !== value) onCommit(n)
    setTyped(null)                       // 못 읽었으면 그대로 바깥 값으로 되돌아간다
  }

  return (
    <input
      ref={ref}
      type="number"
      className={className}
      title={title}
      aria-label={ariaLabel}
      value={shown}
      onFocus={() => setTyped(String(Math.round(value)))}
      onChange={(e) => {
        const raw = e.target.value
        setTyped(raw)
        const n = liveValue(raw, min, max)
        if (n != null && n !== value) onCommit(n)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); ref.current?.blur() }
        // Esc 는 되돌린다 — 잘못 친 걸 무르는 가장 싼 길.
        if (e.key === 'Escape') { e.preventDefault(); setTyped(null); ref.current?.blur() }
      }}
    />
  )
}
