import { useEffect, useRef } from 'react'

// 도움말 > 튜토리얼 — public/tutorial.html 시연을 전체 화면으로 재생한다.
// 시연은 iframe 안에서만 돌기 때문에 편집 중인 문서에는 아무 변화도 남지 않는다.
// 닫았다 다시 열면 컴포넌트가 새로 마운트되므로 시연도 처음부터 재생된다.
export default function TutorialPlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  /**
   * **Esc 로 닫기. 닫는 함수는 ref 로 잡는다 — 여기에 넣으면 Esc 가 안 먹는다.**
   *
   * 2026-09-17 · 재 보니 **✕ 는 되는데 Esc 가 안 됐다.** 오래된 결함이다(이전 빌드에서도
   * 그랬다). 까닭이 미묘하다:
   *   · `onClose` 는 Layout 이 그때그때 만드는 화살표라 **렌더마다 새 값**이다.
   *     그래서 deps 에 있으면 이 효과가 렌더마다 떼였다 다시 붙는다.
   *   · Esc 를 누르면 **다른 리스너**(캔버스·단축키)가 먼저 받아 setState 를 하고,
   *     키 이벤트는 discrete 라 React 18 이 **그 자리에서 곧바로** 다시 그린다.
   *   · 그 다시 그리기가 **이벤트가 아직 퍼지는 도중**에 이 리스너를 떼었다 붙인다.
   *     DOM 규칙상 **퍼지는 도중에 떼인 리스너는 안 불리고, 새로 붙은 것도 안 불린다.**
   *     그래서 리스너는 분명히 등록돼 있는데 한 번도 안 불리는 모양이 된다.
   *
   * 실제로 그렇게 확인했다: 이 리스너 **뒤에** 붙인 시험용 리스너는 불렸고,
   * 기록해 둔 이 핸들러를 손으로 부르면 창이 바로 닫혔다. 즉 핸들러는 멀쩡했고
   * **키가 닿지 못한 것**이었다.
   *
   * 고치는 법은 붙였다 떼지 않는 것이다 — deps 는 `open` 뿐이고, 닫는 함수는 ref 로 본다.
   */
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); closeRef.current() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open])

  if (!open) return null
  return (
    <div className="tutp">
      <div className="tutp-bar">
        <span className="tutp-t">자유 캔버스 튜토리얼</span>
        <span className="tutp-d">보기만 하셔도 됩니다 — 편집 중인 문서는 바뀌지 않습니다.</span>
        <button className="tutp-x" onClick={onClose}>✕ 닫기</button>
      </div>
      <iframe className="tutp-frame" src="/tutorial.html" title="자유 캔버스 튜토리얼" />
    </div>
  )
}
