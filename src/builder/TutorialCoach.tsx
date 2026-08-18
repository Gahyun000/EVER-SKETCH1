import { useEffect, useRef, useState } from 'react'
import { useBuilder } from '../state/store'

interface Ctx { els: number; conns: number; strokes: number; base: { els: number; conns: number; strokes: number } }
interface Step { key: string; title: string; instr: string; target: string; done: (c: Ctx) => boolean }

const STEPS: Step[] = [
  { key: 'add1', title: '① 네모 놓기', instr: '반짝이는 네모(▭) 버튼을 누른 뒤, 가운데 캔버스를 한 번 클릭하면 네모가 생깁니다.', target: '[data-tut="tool-box"]', done: (c) => c.els > c.base.els },
  { key: 'add2', title: '② 도형 하나 더', instr: '반짝이는 원(◯) 버튼을 누르고, 캔버스의 다른 자리를 클릭해 하나 더 놓아보세요.', target: '[data-tut="tool-ellipse"]', done: (c) => c.els > c.base.els + 1 },
  { key: 'connect', title: '③ 화살표로 잇기', instr: '반짝이는 ⤳ 버튼을 누르세요. 도형 하나를 클릭 → 이어줄 다른 도형을 클릭하면 화살표가 생깁니다.', target: '[data-tut="tool-connect"]', done: (c) => c.conns > c.base.conns },
  { key: 'pen', title: '④ 펜으로 그리기', instr: '반짝이는 ✎(펜) 버튼을 누른 뒤, 캔버스에 손으로 선을 그어보세요.', target: '[data-tut="tool-pen"]', done: (c) => c.strokes > c.base.strokes },
]

export default function TutorialCoach({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pages = useBuilder((s) => s.pages)
  const selId = useBuilder((s) => s.selectedPageId)
  const page = pages.find((p) => p.id === selId)
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const base = useRef({ els: 0, conns: 0, strokes: 0 })

  useEffect(() => {
    if (open) { setStep(0); setDone(false); base.current = { els: page ? page.els.length : 0, conns: page ? page.conns.length : 0, strokes: page ? page.strokes.length : 0 } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const ctx: Ctx = { els: page ? page.els.length : 0, conns: page ? page.conns.length : 0, strokes: page ? page.strokes.length : 0, base: base.current }

  useEffect(() => {
    if (!open || done) return
    if (step < STEPS.length && STEPS[step].done(ctx)) {
      if (step === STEPS.length - 1) { setDone(true) }
      else { const t = setTimeout(() => setStep((s) => s + 1), 550); return () => clearTimeout(t) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, done, step, ctx.els, ctx.conns, ctx.strokes])

  useEffect(() => {
    if (!open || done) { setRect(null); return }
    const sel = STEPS[step] ? STEPS[step].target : ''
    function upd() {
      const el = sel ? document.querySelector(sel) : null
      if (el) { const r = el.getBoundingClientRect(); setRect({ left: r.left, top: r.top, width: r.width, height: r.height }) } else setRect(null)
    }
    upd()
    const iv = window.setInterval(upd, 400)
    window.addEventListener('resize', upd)
    return () => { window.clearInterval(iv); window.removeEventListener('resize', upd) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, done, step])

  if (!open) return null
  if (!page) {
    return (<div className="coach"><button className="coach-x" onClick={onClose}>✕</button>
      <div className="coach-title">먼저 카드를 추가하세요</div>
      <div className="coach-instr">왼쪽에서 카드를 하나 고른 뒤 다시 튜토리얼을 시작해 주세요.</div>
    </div>)
  }
  return (
    <>
      {rect && !done ? <div className="tut-ring" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} /> : null}
      <div className="coach">
        <button className="coach-x" onClick={onClose}>✕</button>
        {done ? (
          <>
            <div className="coach-badge">완료!</div>
            <div className="coach-title">자유 캔버스, 이제 다루실 수 있어요</div>
            <div className="coach-instr">도형·화살표·펜을 모두 써보셨어요. 상단 "▷ 발표"로 결과도 확인해보세요.</div>
            <div className="coach-actions"><button className="coach-primary" onClick={onClose}>튜토리얼 끝내기</button></div>
          </>
        ) : (
          <>
            <div className="coach-step">STEP {step + 1} / {STEPS.length} · 파란 링이 있는 곳을 누르세요</div>
            <div className="coach-title">{STEPS[step].title}</div>
            <div className="coach-instr">{STEPS[step].instr}</div>
            <div className="coach-checks">
              {STEPS.map((s, i) => { const okv = i < step || (i === step && s.done(ctx)); return <span key={s.key} className={'ck' + (okv ? ' on' : '')}>{okv ? '✓' : '○'} {s.title}</span> })}
            </div>
            <div className="coach-actions">
              <button onClick={onClose}>건너뛰기</button>
              {step > 0 && <button onClick={() => setStep((s) => Math.max(0, s - 1))}>이전</button>}
              <button className="coach-primary" onClick={() => { if (step < STEPS.length - 1) setStep((s) => s + 1); else setDone(true) }}>다음 ›</button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
