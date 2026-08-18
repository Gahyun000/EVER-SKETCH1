// 예시영상 — 스토리보드 GIF 재생 모달. (기존 라이브 스크립트 데모를 대체)
export default function DemoPlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="demo-scrim" onClick={onClose}>
      <div className="demo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="demo-head">
          <span className="demo-ttl">▶ 예시영상 — EVER-SKETCH 스토리보드</span>
          <button className="demo-x" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <img className="demo-gif" src="/demo-storyboard.gif" alt="EVER-SKETCH 예시 스토리보드" />
        <div className="demo-foot">EVER-SKETCH를 굿노트처럼 써서 5페이지 기획 스토리보드를 만드는 예시입니다.</div>
      </div>
    </div>
  )
}
