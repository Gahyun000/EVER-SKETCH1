// 예시영상 — 스토리보드 GIF 재생 모달. (기존 라이브 스크립트 데모를 대체)
import Modal from '../ui/Modal'

export default function DemoPlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  // **보기만 하는 창이라 「취소」가 없다** — 그래서 ✕ 다(`cancel="closeX"`).
  // 취소도 ✕ 도 없는 창은 만들 수 없다(ui/Modal 의 ModalCancel).
  return (
    <Modal title="▶ 예시영상 — EVER-SKETCH 스토리보드" onClose={onClose} size="lg"
      scrimClassName="demo-scrim" className="demo-modal" cancel="closeX">
      <img className="demo-gif" src="/demo-storyboard.gif" alt="EVER-SKETCH 예시 스토리보드" />
      <div className="demo-foot">EVER-SKETCH를 굿노트처럼 써서 5페이지 기획 스토리보드를 만드는 예시입니다.</div>
    </Modal>
  )
}
