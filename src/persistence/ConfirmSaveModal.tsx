import { useState } from 'react'

export interface ConfirmSaveRequest {
  title?: string
  message?: string
  /** 저장 후 계속. 저장이 실패하면 false 를 돌려준다 — 그때는 모달을 닫지 않고 진행도 하지 않는다. */
  onSaveAndContinue: () => boolean | Promise<boolean>
  onContinueWithoutSave: () => void
}

export default function ConfirmSaveModal({ req, onClose }: { req: ConfirmSaveRequest; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function saveAndContinue() {
    setBusy(true); setErr(null)
    try {
      const ok = await req.onSaveAndContinue()
      if (ok) { onClose(); return }
      setErr('저장하지 못했습니다. 연결을 확인한 뒤 다시 시도하거나, 저장하지 않고 계속하세요.')
    } catch (e) {
      setErr('저장하지 못했습니다: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scrim on save-scrim">
      <div className="save-modal">
        <h2>{req.title || '현재 작업을 저장하고 계속할까요?'}</h2>
        <p>{req.message || '계속하면 현재 작업 화면이 바뀔 수 있습니다.'}</p>
        {err ? <p className="save-err">{err}</p> : null}
        <div className="save-actions">
          <button className="ax-tbtn" disabled={busy} onClick={() => { req.onContinueWithoutSave(); onClose() }}>저장하지 않고 계속</button>
          <button className="ax-tbtn" disabled={busy} onClick={onClose}>취소</button>
          <button className="ax-tbtn dark" disabled={busy} onClick={() => { void saveAndContinue() }}>
            {busy ? '저장 중…' : '저장하고 계속'}
          </button>
        </div>
      </div>
    </div>
  )
}
