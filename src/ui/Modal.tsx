import { useEffect, useRef, type ReactNode } from 'react'
import './modal.css'

/**
 * 대화상자 껍데기 — **하나만 있다.**
 *
 * 이 파일이 생기기 전에는 저장 확인·배부·회수가 각자 스크림과 상자를 그렸고,
 * 폭도 모서리도 조금씩 달랐다. 그리고 셋 다 하지 않는 것이 있었다 —
 * Esc 로 닫기, 열릴 때 안으로 포커스 옮기기, 닫을 때 원래 자리로 돌려놓기.
 * 그런 건 새 창을 만들 때마다 잊어버린다. 그래서 한 곳에 둔다.
 *
 * ── 왜 브라우저 기본 창(`window.prompt`/`alert`)을 안 쓰는가 ──
 * 1) 우리 화면이 아니다. 임원회의 자료를 다루는 도구에서 회색 시스템 창이 뜨면
 *    만들다 만 물건으로 보인다.
 * 2) `prompt` 는 한 줄이다. 검토 의견은 대개 두세 줄이다.
 * 3) 화면 전체가 멈춘다. 짚어 둔 칸을 다시 보려고 뒤를 볼 수도 없다 —
 *    정작 필요한 순간에 문서를 가린다.
 */
export type ModalSize = 'sm' | 'md' | 'lg'

export default function Modal({
  title, onClose, children, footer, size = 'md', busy = false, error,
  className = '', scrimClassName = '', footClassName = '', labelId,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: ModalSize
  /** 처리 중에는 닫지 않는다 — 절반만 저장된 상태로 창이 사라지면 무엇이 참인지 알 수 없다. */
  busy?: boolean
  error?: string
  /** 기존 화면이 쓰던 선택자를 유지하기 위한 덧붙임(.cy-modal 등). */
  className?: string
  scrimClassName?: string
  footClassName?: string
  labelId?: string
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(busy)
  busyRef.current = busy

  // 열릴 때 안으로, 닫을 때 원래 자리로.
  // 돌려놓지 않으면 창을 닫은 뒤 Tab 이 화면 맨 위부터 다시 시작한다 —
  // 키보드로 쓰는 사람은 매번 눌렀던 버튼을 다시 찾아가야 한다.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const first = boxRef.current?.querySelector<HTMLElement>(
      'textarea, input:not([type="hidden"]), button, select, [tabindex]:not([tabindex="-1"])')
    ;(first || boxRef.current)?.focus()
    const body = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = body
      if (prev && document.contains(prev)) prev.focus()
    }
  }, [])

  // Esc.
  // **capture 로 잡고 전파를 끊는다.** 캔버스가 window 에서 Escape 를 듣고 있어서
  // (FreeLayer) 그냥 두면 창은 닫히면서 골라 둔 칸까지 함께 풀린다 —
  // 의견을 쓰려고 짚어 둔 자리가 취소 한 번에 사라진다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      if (!busyRef.current) onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Tab 이 창 밖으로 나가지 않게 한다.
  const onKeyDown = (e: React.KeyboardEvent) => {
    // 캔버스 단축키(Delete 로 요소 삭제 등)가 타자 중에 발동하지 않도록 여기서 끊는다.
    e.stopPropagation()
    if (e.key !== 'Tab' || !boxRef.current) return
    const f = Array.from(boxRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    if (f.length === 0) return
    const first = f[0], last = f[f.length - 1]
    if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  }

  const tid = labelId || 'ui-modal-title'
  return (
    <div className={'ui-scrim ' + scrimClassName} role="dialog" aria-modal="true" aria-labelledby={tid}
      onKeyDown={onKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className={'ui-modal ' + size + ' ' + className} ref={boxRef} tabIndex={-1}>
        <div className="ui-modal-head">
          <h3 id={tid}>{title}</h3>
          <button className="ui-modal-x" onClick={onClose} disabled={busy} aria-label="닫기">✕</button>
        </div>
        {error ? <div className="ui-modal-err" role="alert">{error}</div> : null}
        <div className="ui-modal-body">{children}</div>
        {footer ? <div className={'ui-modal-foot ' + footClassName}>{footer}</div> : null}
      </div>
    </div>
  )
}
