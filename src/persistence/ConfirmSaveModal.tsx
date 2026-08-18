export interface ConfirmSaveRequest {
  title?: string
  message?: string
  onSaveAndContinue: () => void | Promise<void>
  onContinueWithoutSave: () => void
}

export default function ConfirmSaveModal({ req, onClose }: { req: ConfirmSaveRequest; onClose: () => void }) {
  return (
    <div className="scrim on save-scrim">
      <div className="save-modal">
        <h2>{req.title || '현재 작업을 저장하고 계속할까요?'}</h2>
        <p>{req.message || '계속하면 현재 작업 화면이 바뀔 수 있습니다.'}</p>
        <div className="save-actions">
          <button className="ax-tbtn" onClick={() => { req.onContinueWithoutSave(); onClose() }}>저장하지 않고 계속</button>
          <button className="ax-tbtn" onClick={onClose}>취소</button>
          <button className="ax-tbtn dark" onClick={async () => { await req.onSaveAndContinue(); onClose() }}>저장하고 계속</button>
        </div>
      </div>
    </div>
  )
}
