import Modal from '../ui/Modal'

export interface ConfirmSaveRequest {
  title?: string
  message?: string
  onSaveAndContinue: () => void | Promise<void>
  onContinueWithoutSave: () => void
}

/**
 * 저장 확인창.
 *
 * 껍데기(스크림·Esc·포커스)는 `ui/Modal` 이 맡는다. 예전에는 이 파일이 직접
 * 스크림을 그렸고, 그래서 Esc 로 닫히지도 않고 포커스도 뒤에 남아 있었다.
 */
export default function ConfirmSaveModal({ req, onClose }: { req: ConfirmSaveRequest; onClose: () => void }) {
  return (
    <Modal
      size="sm"
      className="save-modal"
      scrimClassName="save-scrim"
      title={req.title || '현재 작업을 저장하고 계속할까요?'}
      onClose={onClose}
      footer={<>
        <button className="ax-tbtn" onClick={() => { req.onContinueWithoutSave(); onClose() }}>저장하지 않고 계속</button>
        <button className="ax-tbtn" onClick={onClose}>취소</button>
        <button className="ax-tbtn dark" onClick={async () => { await req.onSaveAndContinue(); onClose() }}>저장하고 계속</button>
      </>}>
      <p className="save-msg">{req.message || '계속하면 현재 작업 화면이 바뀔 수 있습니다.'}</p>
    </Modal>
  )
}
