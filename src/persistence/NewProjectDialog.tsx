import { useState } from 'react'
import { LayoutTemplate, Square } from 'lucide-react'
import Modal from '../ui/Modal'

/**
 * 새 자료를 **무엇으로 시작할지** 고르는 창.
 *
 * 예전에는 「새 이북」이 곧장 빈 슬라이드였고, 표준 양식은 관리자가 회차를 열어
 * 배부해야만 손에 들어왔다. 회차를 걷어내면서 그 통로가 사라지므로,
 * 고르는 자리를 여기로 옮긴다 — 만드는 사람이 직접 고른다.
 *
 * 기본값을 표준 양식으로 두는 이유: 이 도구로 만드는 것의 대부분이 임원보고다.
 * 빈 슬라이드가 필요한 사람은 알고 찾아오지만, 양식이 있는 줄 모르는 사람은
 * 빈 화면을 받고 그냥 쓴다.
 *
 * **열람자에게는 고르는 자리가 없다** (D13 · P6). 열람자의 개인 스케치는 제출되지
 * 않으므로 회사 서식이 나갈 데가 없고, 서버도 `TEMPLATE_USE` 로 막는다.
 * 고를 수 없는 칸을 흐리게 띄워 두면 「왜 안 눌리지」를 남길 뿐이라
 * **아예 감추고 한 줄로 말한다** — 감춘 사실 자체는 감추지 않는다.
 */
type Kind = 'template' | 'blank'

/** 이번 달(KST). 표준 양식의 기본 기간. */
function thisMonthKst(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7)
}

export default function NewProjectDialog({
  onClose, onBlank, onTemplate, canTemplate = true,
}: {
  onClose: () => void
  onBlank: () => Promise<void>
  onTemplate: (periodYm: string) => Promise<void>
  /** 회사 서식을 쓸 수 있는가(`TEMPLATE_USE`). 열람자는 못 쓴다. */
  canTemplate?: boolean
}) {
  const [kind, setKind] = useState<Kind>(canTemplate ? 'template' : 'blank')
  const [ym, setYm] = useState(thisMonthKst())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const create = async () => {
    setBusy(true)
    setErr('')
    try {
      if (kind === 'template') await onTemplate(ym)
      else await onBlank()
      // 성공하면 편집 화면으로 넘어가면서 이 창이 통째로 사라진다.
    } catch (e) {
      // 실패하면 **창을 닫지 않는다.** 닫아버리면 무엇이 잘못됐는지 알 길이 없고,
      // 사용자는 버튼이 안 먹는다고 생각한다.
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      title="새 자료 만들기"
      onClose={onClose}
      busy={busy}
      error={err}
      size="sm"
      className="np-modal"
      cancel={{ label: '취소', onClick: onClose }}
      footer={
        <>
          <button className="lib-btn dark" onClick={() => void create()} disabled={busy}>
            {busy ? '만드는 중…' : '만들기'}
          </button>
        </>
      }
    >
      {!canTemplate ? (
        <p className="np-solo">
          <Square className="h-5 w-5" />
          <b>빈 슬라이드</b>
          <span>
            아무것도 없는 한 장에서 시작합니다.<br />
            개인 스케치는 <b>나만 봅니다</b> — 결재에 내지 않고, 팀에도 뜨지 않습니다.
          </span>
        </p>
      ) : (
      <div className="np-picks" role="radiogroup" aria-label="시작 방식">
        <button
          className={'np-pick' + (kind === 'template' ? ' on' : '')}
          role="radio" aria-checked={kind === 'template'} disabled={busy}
          onClick={() => setKind('template')}
        >
          <LayoutTemplate className="h-5 w-5" />
          <span className="np-pick-t">표준 양식</span>
          <span className="np-pick-d">로드맵 · 진행현황 · 이슈 세 구획이 놓인 정본 1장</span>
        </button>

        <button
          className={'np-pick' + (kind === 'blank' ? ' on' : '')}
          role="radio" aria-checked={kind === 'blank'} disabled={busy}
          onClick={() => setKind('blank')}
        >
          <Square className="h-5 w-5" />
          <span className="np-pick-t">빈 슬라이드</span>
          <span className="np-pick-d">아무것도 없는 한 장에서 자유롭게 시작</span>
        </button>
      </div>
      )}

      {kind === 'template' ? (
        <label className="np-period">
          <span>기간</span>
          <input type="month" value={ym} disabled={busy}
            onChange={(e) => setYm(e.target.value)} aria-label="기간(연-월)" />
        </label>
      ) : null}
    </Modal>
  )
}
