import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer } from 'lucide-react'
import Modal from '../ui/Modal'
import { ADMIN_CHAPTERS, ADMIN_DIR, ADMIN_STEP_COUNT } from './manualAdmin'

/**
 * **관리자 매뉴얼** — 보기 메뉴에서 연다(2026-09-18 · 사용자 결정 ㄷ).
 *
 * **왜 작성자 매뉴얼에 탭을 더하지 않았나.** 그쪽 창 이름이 「작성자 매뉴얼」이라
 * 관리 탭이 들어가면 이름이 거짓말이 되고, **탭마다 등급을 거는 장치가 없다** —
 * 지금 그 창은 Lv1·Lv2·Lv3 이 똑같이 본다. 메뉴 항목은 이미 등급을 거르므로
 * (`admin` · `publish`) 창을 따로 두는 쪽이 새로 만들 것이 적다.
 *
 * **뼈대는 작성자 매뉴얼과 같게 맞췄다**(사용자 지시 「다음 버튼 작성자 매뉴얼처럼
 * 일관되게」). 같은 `.man-*` 옷을 입는다 — 목록·무대·바닥 붙박이 이동줄,
 * 「알아두면」·「주의」 딱지, 탭 줄 오른쪽 끝의 인쇄 단추까지.
 * 옷을 새로 지으면 두 창이 조금씩 어긋나고, 어긋난 것은 늘 한쪽만 고쳐진다.
 */

/** 장을 가로질러 **한 줄로 편** 걸음 목록. 「‹ 앞 · 다음 ›」이 장 경계를 모르고 넘어간다. */
const FLAT = ADMIN_CHAPTERS.flatMap((c) => c.steps.map((s) => ({ ...s, ch: c })))

/**
 * 인쇄용 한 벌. **본문과 따로 그린다.**
 *
 * 화면에는 한 걸음만 떠 있으므로 그대로 인쇄하면 한 장만 나온다. 그래서 모든 걸음을
 * 펼친 판을 따로 만들어 평소엔 숨겨 둔다(`.man-print`). **body 바로 밑에 꽂아야** 한다 —
 * 인쇄 규칙이 `body > *:not(.man-print){display:none}` 이라, 창 안에 있으면 창과 함께 숨는다.
 */
function PrintSheet() {
  return createPortal(
    <div className="man-print" aria-hidden="true">
      <h1>EVER-SKETCH 관리자 매뉴얼</h1>
      <p className="mp-sub">가입 승인 · 팀 편성 · 결재 처리 · {ADMIN_STEP_COUNT}걸음</p>
      {ADMIN_CHAPTERS.map((c) => (
        <section key={c.no} className="mp-ch">
          <h2>{c.no}장 · {c.title}</h2>
          <p className="mp-lead" dangerouslySetInnerHTML={{ __html: c.lead }} />
          {c.steps.map((st) => (
            <article key={st.n} className="mp-step">
              <h3><span className="mp-no">{st.n}</span>{st.t}</h3>
              <div className="mp-body">
                <div className="mp-txt">
                  <p dangerouslySetInnerHTML={{ __html: st.body }} />
                  {st.tip && <p className="mp-tip"><b>알아두면</b> <span dangerouslySetInnerHTML={{ __html: st.tip }} /></p>}
                  {st.warn && <p className="mp-warn"><b>주의</b> <span dangerouslySetInnerHTML={{ __html: st.warn }} /></p>}
                </div>
                <img src={ADMIN_DIR + st.img} alt="" />
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>,
    document.body,
  )
}

export default function AdminManual({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mi, setMi] = useState(0)
  /** 걸음을 넘기면 맨 위부터 보여 준다 — 안 그러면 새 걸음이 제목도 없이 한복판부터 뜬다. */
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0 }, [mi])
  // 다시 열면 처음부터. 지난번 자리가 남아 있으면 「왜 여기서 시작하지」가 된다.
  useEffect(() => { if (open) setMi(0) }, [open])
  // ← → 로 넘긴다.
  useEffect(() => {
    if (!open) return
    const on = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setMi((v) => Math.min(FLAT.length - 1, v + 1))
      if (e.key === 'ArrowLeft') setMi((v) => Math.max(0, v - 1))
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open])
  if (!open) return null

  const st = FLAT[mi]
  return (
    // 보기만 하는 창이라 「취소」가 없다 — 그래서 ✕ 다(ui/Modal 의 ModalCancel).
    <Modal title="관리자 매뉴얼" onClose={onClose} size="lg"
      scrimClassName="demo-scrim" className="demo-modal" cancel="closeX">
      {/* 갈래가 하나뿐이라 고를 것이 없다. 그래도 **줄은 남긴다** —
          인쇄 단추가 작성자 매뉴얼과 같은 자리에 서야 손이 헤매지 않는다. */}
      <div className="man-tabs">
        <button className="man-tab on" aria-current="true" disabled>
          ① 운영 <span className="man-tc">{ADMIN_STEP_COUNT}걸음</span>
        </button>
        <button className="man-print-btn" onClick={() => window.print()}
          title="브라우저 인쇄로 내보냅니다 — 저장할 곳에서 「PDF로 저장」을 고르세요">
          <Printer className="h-4 w-4" /> 인쇄 · PDF
        </button>
      </div>

      <div className="man-wrap">
        {/* 목록은 **장으로 묶어** 보여 준다. 고르는 건 걸음이고, 장은 이름표일 뿐이다. */}
        <ol className="man-list">
          {ADMIN_CHAPTERS.map((c) => (
            <li key={c.no} className="man-grp">
              <div className="man-gh">{c.no}장 · {c.title}</div>
              <ol className="man-sub">
                {c.steps.map((x) => {
                  const k = FLAT.findIndex((f) => f.n === x.n)
                  return (
                    <li key={x.n}>
                      <button className={'man-item' + (k === mi ? ' on' : '')} onClick={() => setMi(k)}>
                        <span className="man-no">{x.n}</span>
                        <span className="man-t">{x.t}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </li>
          ))}
        </ol>
        <div className="man-stage">
          <div className="man-scroll" ref={scrollRef}>
            <div className="man-sh"><span className="man-sn">{st.n}</span>{st.t}</div>
            <img className="man-gif" src={ADMIN_DIR + st.img} alt={`${st.n} ${st.t}`} />
            <p className="man-line" dangerouslySetInnerHTML={{ __html: st.body }} />
            {st.tip && <p className="man-tip"><b>알아두면</b> <span dangerouslySetInnerHTML={{ __html: st.tip }} /></p>}
            {st.warn && <p className="man-tip warn"><b>주의</b> <span dangerouslySetInnerHTML={{ __html: st.warn }} /></p>}
          </div>
          {/* 작성자 매뉴얼과 **같은 줄**이다 — 「‹ 앞 · 지금/전체 · 다음 ›」, 바닥 붙박이. */}
          <div className="man-nav">
            <button className="man-btn" disabled={mi === 0} onClick={() => setMi(mi - 1)}>‹ 앞</button>
            <span className="man-cnt">{mi + 1} / {FLAT.length}</span>
            <button className="man-btn" disabled={mi === FLAT.length - 1} onClick={() => setMi(mi + 1)}>다음 ›</button>
          </div>
        </div>
      </div>
      <PrintSheet />
    </Modal>
  )
}
