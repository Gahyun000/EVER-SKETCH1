import { useState } from 'react'
import Modal from '../ui/Modal'

/**
 * 검토 의견 쓰기 창.
 *
 * 예전에는 브라우저 기본 입력창(`window.prompt`)이었다. 한 줄밖에 못 쓰고,
 * 열려 있는 동안 화면이 멈춰서 **방금 짚어 둔 칸을 다시 볼 수도 없었다.**
 * 의견은 "여기가 왜 이런지" 를 적는 글이라 대개 두세 줄이 된다.
 *
 * 그래서 이 창은 두 가지를 한다 —
 *   1) 무엇을 짚었는지 맨 위에 보여준다(쓰다가 확인할 수 있게)
 *   2) 여러 줄로 쓰게 한다
 */
export default function CommentComposer({
  where, onSubmit, onClose,
}: {
  /** 무엇을 짚었는지. 예: '표 4행 6열' */
  where: string
  onSubmit: (body: string) => Promise<void>
  onClose: () => void
}) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const send = async () => {
    const t = body.trim()
    if (!t || busy) return
    setBusy(true); setErr('')
    try {
      await onSubmit(t)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '의견을 달지 못했어요. 잠시 뒤 다시 눌러 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="검토 의견 달기" size="sm" busy={busy} error={err} onClose={() => { if (!busy) onClose() }}
      footer={<>
        <button className="ax-tbtn" onClick={onClose} disabled={busy}>취소</button>
        <button className="ax-tbtn imp cmt-compose-send" onClick={() => void send()} disabled={busy || !body.trim()}>
          {busy ? '보내는 중…' : '의견 달기'}
        </button>
      </>}>
      <p className="cmt-compose-where">
        <span className="cmt-compose-tag">여기에 답니다</span>
        <b>{where}</b>
      </p>
      <textarea className="cmt-compose-body" rows={5} value={body} disabled={busy}
        placeholder={'무엇이 왜 문제인지 적어 주세요.\n예) 3~5월 구간이 앞 장과 다릅니다. 어느 쪽이 맞는지 확인 부탁드립니다.'}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send() }} />
      <p className="cmt-compose-hint">⌘/Ctrl + Enter 로도 보낼 수 있어요.</p>
    </Modal>
  )
}
