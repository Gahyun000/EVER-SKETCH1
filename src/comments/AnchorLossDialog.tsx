import { useState } from 'react'
import Modal from '../ui/Modal'
import type { FreeEl } from '../state/store'
import { tableAnchorLabel } from './anchorLabel'
import type { Thread } from './commentsApi'

/**
 * 짚어 둔 칸이 사라질 때 묻는 창.
 *
 * **삭제 계열에서만 뜬다.** 행·열을 추가할 때는 묻지 않고 앵커를 조용히 밀어 준다.
 * 모달이 자주 뜨면 사람들은 읽지 않고 누르게 되고, 그러면 정작 지워질 때의
 * 경고까지 함께 흘려보낸다.
 *
 * 선택지를 셋으로 둔 이유 — 검토 이력이 조용히 사라지는 것이 제일 나쁘다.
 * 그래서 **기본은 「의견은 남기고 바꾸기」** 다. 남긴 지적은 목록에
 * 「가리키던 칸이 없어짐」으로 표시되고, 문서 위에 핀은 그리지 않는다.
 */
export default function AnchorLossDialog({
  el, lost, what, onCancel, onGo,
}: {
  el: FreeEl | undefined
  /** 가리킬 곳을 잃게 되는 지적들 */
  lost: Thread[]
  /** 무엇을 지우려는지 — 「3행」 · 「5열」 */
  what: string
  onCancel: () => void
  onGo: (keepComments: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const go = (keep: boolean) => { setBusy(true); onGo(keep) }

  return (
    <Modal size="md" className="cy-modal" scrimClassName="cy-scrim" footClassName="cy-modal-btns"
      busy={busy} onClose={onCancel}
      title={`이 표에 달린 의견 ${lost.length}건이 가리키는 칸이 사라집니다`}
      cancel={{ label: '그대로 두기', onClick: onCancel }}
      footer={<>
        <button className="cy-btn danger-solid" disabled={busy} onClick={() => go(false)}>
          의견도 함께 지우고 바꾸기
        </button>
        <button className="cy-btn primary" disabled={busy} onClick={() => go(true)}>
          의견은 남기고 바꾸기
        </button>
      </>}>
      <p className="cy-rv-lead">
        <b>{what}</b>을(를) 지우면 아래 지적이 어디를 가리키는지 알 수 없게 됩니다.
      </p>
      <ul className="cmt-loss">
        {lost.slice(0, 8).map((t) => (
          <li key={t.id}>
            <span className="cmt-loss-at">{tableAnchorLabel(el, t.cell)}</span>
            <span className="cmt-loss-body">{t.body}</span>
          </li>
        ))}
        {lost.length > 8 ? <li className="cy-dim">…그 밖 {lost.length - 8}건</li> : null}
      </ul>
      <p className="cy-hint">
        남기면 목록에 <b>「가리키던 칸이 없어짐」</b>으로 표시됩니다. 지적 자체는 사라지지 않습니다.
      </p>
    </Modal>
  )
}
