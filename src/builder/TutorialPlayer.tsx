import { useEffect } from 'react'

// 도움말 > 튜토리얼 — public/tutorial.html 시연을 전체 화면으로 재생한다.
// 시연은 iframe 안에서만 돌기 때문에 편집 중인 문서에는 아무 변화도 남지 않는다.
// 닫았다 다시 열면 컴포넌트가 새로 마운트되므로 시연도 처음부터 재생된다.
export default function TutorialPlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

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
