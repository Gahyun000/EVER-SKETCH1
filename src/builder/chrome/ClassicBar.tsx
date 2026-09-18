import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import { useBuilder } from '../../state/store'
import { exportBook } from '../../export/exportBook'
import { exportPdf } from '../../export/exportFiles'
import { exportPptx } from '../../export/exportPptx'
import { pageSize } from '../../cards/sizing'
import { getActiveProjectId } from '../../persistence/session'
import { useProjects } from '../../persistence/projects'
import { parseHtml } from '../../import/htmlImport'
import type { ImportedDoc } from '../../import/htmlImport'
import { deckIrToPages } from '../../import/deckToPages'
import { paginate } from '../../import/paginate'
import DeckCards from './DeckPreview'
import type { Page, Orientation, SizePreset } from '../../state/store'

type Preview = {
  name: string; busy: boolean; ok?: boolean; error?: string; pages?: number
  pptx_url?: string; pdf_url?: string | null; thumbs?: string[]
  editableDoc?: ImportedDoc; ir?: { meta?: Record<string, unknown>; pages?: unknown[] }
  // (P4) IR→카드 모델. 미리보기·캔버스가 공유하는 '그 카드' — WYSIWYG.
  cards?: Page[]
  // 변환 결과가 요구하는 테마. 가져오기를 "확정"할 때만 실제 스토어에 반영한다(닫으면 원상 유지).
  irTheme?: 'dark' | 'light'
  // 실시간 진행(스트리밍): 진행률·현재 단계 문구·총 슬라이드 수·도착한 썸네일들
  pct?: number; stage?: string; total?: number; live?: string[]
}
type DeckEvent = {
  stage: string; pct?: number; msg?: string; total?: number; i?: number; pages?: number; thumb?: string; error?: string
  result?: { ok: boolean; pages: number; pptx_url: string; pdf_url: string | null; thumbs: string[]; ir?: unknown }
}
export type ClassicBarHandle = { openImport: () => void }

// 툴바2: 기존 이북/문서 기능(유지) — 가져오기·미리보기·이북 만들기.
const ClassicBar = forwardRef<ClassicBarHandle, {
  onSettings: () => void; onDemo: () => void; onAiCleanup: () => void; onAdminManual: () => void
}>(
  function ClassicBar({ onSettings, onDemo, onAiCleanup, onAdminManual }, ref) {
    const orientation = useBuilder((s) => s.orientation)
    const setOrientation = useBuilder((s) => s.setOrientation)
    const theme = useBuilder((s) => s.theme)
    const setTheme = useBuilder((s) => s.setTheme)
    const size = useBuilder((s) => s.size)
    const font = useBuilder((s) => s.font)
    const summarizeNotes = useBuilder((s) => s.summarizeNotes)
    const title = useBuilder((s) => s.title)
    const pages = useBuilder((s) => s.pages)
    const importDoc = useBuilder((s) => s.importDoc)
    const importDeckSlides = useBuilder((s) => s.importDeckSlides)
    const importPages = useBuilder((s) => s.importPages)
    const [status, setStatus] = useState('')
    const [url, setUrl] = useState<string | undefined>(undefined)
    const fileRef = useRef<HTMLInputElement>(null)
    const [deckTheme, setDeckTheme] = useState<'light' | 'dark'>('light')
    const [preview, setPreview] = useState<Preview | null>(null)

    useImperativeHandle(ref, () => ({ openImport: () => fileRef.current?.click() }))

    // (P4) 변환 완료 → IR을 자유 요소 페이지로 만들어 미리보기에 싣는다. 미리보기가 곧 캔버스(WYSIWYG).
    type DeckResult = { ok?: boolean; pages?: number; pptx_url?: string; pdf_url?: string | null; thumbs?: string[]; ir?: unknown }
    function finishPreview(name: string, r: DeckResult, editableDoc?: ImportedDoc) {
      const ir = (r.ir as Preview['ir']) || undefined
      let cards: Page[] | undefined
      let irTheme: 'dark' | 'light' | undefined
      if (ir && ir.pages && ir.pages.length) {
        // 여기서 setOrientation/setTheme 을 부르면 미리보기를 "닫아도" 현재 이북의 방향·테마가
        // 이미 바뀌어 있고 자동저장까지 된다. 실제 반영은 사용자가 가져오기를 확정할 때만 한다.
        const th = (ir.meta as { theme?: string } | undefined)?.theme
        if (th === 'dark' || th === 'light') irTheme = th
        cards = deckIrToPages(ir as never, 'portrait')
      }
      setPreview({ name, busy: false, ok: true, pages: r.pages, pptx_url: r.pptx_url, pdf_url: r.pdf_url, thumbs: r.thumbs || [], editableDoc, ir, cards, irTheme })
    }

    async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      const text = await file.text()
      const editableDoc = (() => { try { return parseHtml(text) } catch { return undefined } })()
      const mkFd = () => { const fd = new FormData(); fd.append('file', file); fd.append('theme', deckTheme); return fd }
      setUrl(undefined)
      setPreview({ name: file.name, busy: true, pct: 0, stage: '변환 준비 중', live: [] })
      // 1) 스트리밍 경로 — 단계·슬라이드별 렌더를 실시간 반영.
      try {
        const res = await fetch('/api/deck/stream', { method: 'POST', body: mkFd() })
        if (!res.ok || !res.body) throw new Error('stream unavailable')
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        let final: DeckEvent['result'] | null = null
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          let nl: number
          while ((nl = buf.indexOf('\n\n')) >= 0) {
            const rawEv = buf.slice(0, nl); buf = buf.slice(nl + 2)
            const dl = rawEv.split('\n').find((l) => l.startsWith('data:'))
            if (!dl) continue
            let ev: DeckEvent
            try { ev = JSON.parse(dl.slice(5).trim()) } catch { continue }
            if (ev.stage === 'error') { setPreview({ name: file.name, busy: false, ok: false, error: ev.error, editableDoc }); return }
            if (ev.stage === 'done') { final = ev.result || null; continue }
            setPreview((prev) => prev ? {
              ...prev, busy: true,
              pct: ev.pct ?? prev.pct,
              stage: ev.msg ?? prev.stage,
              total: ev.total ?? ev.pages ?? prev.total,
              live: ev.thumb ? [...(prev.live || []), ev.thumb] : (prev.live || []),
            } : prev)
          }
        }
        if (final) {
          finishPreview(file.name, final, editableDoc)
          return
        }
        throw new Error('stream ended without result')
      } catch {
        // 2) 폴백 — 기존 비스트리밍 /api/deck (스트림 미지원·중단 시).
        try {
          const res = await fetch('/api/deck', { method: 'POST', body: mkFd() }).then((r) => r.json())
          if (res.ok) finishPreview(file.name, res, editableDoc)
          else setPreview({ name: file.name, busy: false, ok: false, error: res.error, editableDoc })
        } catch (err) {
          setPreview({ name: file.name, busy: false, ok: false, error: err instanceof Error ? err.message : String(err), editableDoc })
        }
      }
    }

    function goToCanvas() {
      if (!preview) return
      // (P4) 미리보기에서 이미 만든 '그 카드'를 그대로 얹는다 — 미리보기=캔버스, 재변환 없음.
      if (preview.cards && preview.cards.length) {
        setOrientation('portrait')
        importPages(preview.cards, preview.name)
      } else if (preview.ir && preview.ir.pages && preview.ir.pages.length) {
        setOrientation('portrait')
        const th = (preview.ir.meta as { theme?: string } | undefined)?.theme
        if (th === 'dark' || th === 'light') setTheme(th)
        importPages(deckIrToPages(preview.ir as never, 'portrait'), preview.name)
      } else if (preview.editableDoc && preview.editableDoc.sections && preview.editableDoc.sections.length) {
        setOrientation('portrait')
        importDoc(paginate(preview.editableDoc, 'portrait', size, font))   // IR 없을 때만 카드 폴백
      } else if (preview.thumbs && preview.thumbs.length) {
        importDeckSlides(preview.thumbs, preview.name)
      } else if (preview.editableDoc) {
        importDoc(preview.editableDoc)
      }
      // 테마는 여기서 — 즉 사용자가 가져오기를 확정한 뒤에만 바꾼다.
      // (방향은 위 각 분기에서 이미 portrait 으로 맞춘다)
      if (preview.irTheme) setTheme(preview.irTheme)
      setStatus('가져옴: ' + preview.name)
      setPreview(null)
      // 가져온 HTML은 '새 이북'으로 라이브러리에 추가(현재 이북 덮어쓰지 않음).
      useProjects.getState().adoptCurrentAsNewProject().catch((e) => {
        setStatus('라이브러리 추가 실패: ' + (e instanceof Error ? e.message : String(e)))
      })
    }

    async function make() {
      if (!pages.length) { setStatus('카드를 먼저 추가하세요'); return }
      setStatus('이북 만드는 중...'); setUrl(undefined)
      try {
        const data = await exportBook(pages, { title, orientation, theme }, getActiveProjectId() || undefined)
        if (data.ok) { setStatus('완료!'); setUrl(data.url); void useProjects.getState().loadList() } else setStatus('실패: ' + (data.error || ''))
      } catch (e) { setStatus('오류: ' + (e instanceof Error ? e.message : String(e))) }
    }
    async function onSummarize() {
      setStatus('AI 요약 중… (LLM 게이트웨이 호출)')
      const r = await summarizeNotes()
      setStatus(r.ok ? `AI 요약 완료 (${r.count}장)` : '요약 실패: ' + (r.error || ''))
    }

    async function doExportPdf() {
      if (!pages.length) { setStatus('카드를 먼저 추가하세요'); return }
      setStatus('PDF 만드는 중…')
      try { const r = await exportPdf(pages, title); setStatus(r === 'canceled' ? '취소됨' : 'PDF 저장 완료') }
      catch (e) { setStatus('PDF 오류: ' + (e instanceof Error ? e.message : String(e))) }
    }
    async function doExportPptx() {
      if (!pages.length) { setStatus('카드를 먼저 추가하세요'); return }
      setStatus('PPT 만드는 중…')
      try { const { W, H } = pageSize(orientation); const r = await exportPptx(pages, { title, W, H }); setStatus(r === 'canceled' ? '취소됨' : 'PPT 저장 완료') }
      catch (e) { setStatus('PPT 오류: ' + (e instanceof Error ? e.message : String(e))) }
    }
    const makeRef = useRef(make); makeRef.current = make
    const pdfRef = useRef(doExportPdf); pdfRef.current = doExportPdf
    const pptxRef = useRef(doExportPptx); pptxRef.current = doExportPptx
    useEffect(() => {
      const h = () => { void makeRef.current() }
      const hp = () => { void pdfRef.current() }
      const hx = () => { void pptxRef.current() }
      window.addEventListener('ebook:build', h)
      window.addEventListener('ebook:export-pdf', hp)
      window.addEventListener('ebook:export-pptx', hx)
      return () => { window.removeEventListener('ebook:build', h); window.removeEventListener('ebook:export-pdf', hp); window.removeEventListener('ebook:export-pptx', hx) }
    }, [])
    const auxRef = useRef({ onAiCleanup, onDemo, onSummarize, onAdminManual })
    auxRef.current = { onAiCleanup, onDemo, onSummarize, onAdminManual }
    useEffect(() => {
      const c = () => auxRef.current.onAiCleanup()
      const su = () => { void auxRef.current.onSummarize() }
      const d = () => auxRef.current.onDemo()
      // **관리자 매뉴얼도 같은 길로 온다**(2026-09-18). 메뉴가 이미 등급을 걸러 주므로
      // 여기서 또 보지 않는다 — 두 곳에서 보면 한쪽만 바뀌는 날이 온다.
      const am = () => auxRef.current.onAdminManual()
      window.addEventListener('ebook:ai-cleanup', c)
      window.addEventListener('ebook:ai-summary', su)
      window.addEventListener('ebook:demo', d)
      window.addEventListener('ebook:admin-manual', am)
      return () => {
        window.removeEventListener('ebook:ai-cleanup', c)
        window.removeEventListener('ebook:ai-summary', su)
        window.removeEventListener('ebook:demo', d)
        window.removeEventListener('ebook:admin-manual', am)
      }
    }, [])

    return (
      <>
        <input ref={fileRef} type="file" accept=".html,.htm,text/html" style={{ display: 'none' }} onChange={onImportFile} />
        {preview && <PreviewModal preview={preview} docTitle={title} orientation={orientation} size={size} font={font} onClose={() => setPreview(null)} onGo={goToCanvas} />}
        {(status || url) && (
          <div className="build-toast">
            <span className="bt-msg">{status || '완료!'}</span>
            {url && <a className="bt-open" href={url} target="_blank" rel="noreferrer">▶ 이북 열기</a>}
            <button className="bt-x" onClick={() => { setStatus(''); setUrl(undefined) }}>✕</button>
          </div>
        )}
      </>
    )
  }
)
export default ClassicBar

// 변환 진행 동적 표시 — 실제 진행률로 바가 차오르고, 렌더된 슬라이드가 스켈레톤을 하나씩 대체한다.
function BusyView({ name, pct = 0, stage, total, live = [] }: { name: string; pct?: number; stage?: string; total?: number; live?: string[] }) {
  const slots = Math.max(total || 8, live.length, 4)
  const msg = stage || 'HTML을 분석하고 있어요'
  // 퍼센트/바를 이벤트 목표(pct)로 부드럽게 따라가게 — 정체 중에도 살살 오르고(≤90), 목표가 오면 빠르게 catch-up.
  // (SSE 이벤트가 띄엄띄엄이라 값 그대로 쓰면 '멈췄다 훅 점프'로 보임 → 매 프레임 1%씩 세는 느낌으로.)
  const [shown, setShown] = useState(0)
  const targetRef = useRef(pct)
  targetRef.current = pct
  useEffect(() => {
    const id = setInterval(() => {
      setShown((s) => {
        const t = targetRef.current
        if (t >= 100) return Math.min(100, s + Math.max(1, (100 - s) * 0.25))   // 완료: 100까지 마무리
        if (s < t) return Math.min(t, s + Math.max(0.8, (t - s) * 0.14))        // 실제 목표까지 빠르게
        return Math.min(90, s + Math.max(0.15, (90 - s) * 0.01))                // 정체: 90까지 살살(멈춰 보이지 않게)
      })
    }, 60)
    return () => clearInterval(id)
  }, [])
  const width = Math.max(2, Math.min(100, shown))
  const label = Math.round(width)
  return (
    <div style={{ padding: '20px 8px 8px' }}>
      <style>{`
        @keyframes printReveal{0%{clip-path:inset(0 0 100% 0);opacity:.45}60%{opacity:1}100%{clip-path:inset(0 0 0 0);opacity:1}}
        @keyframes printPulse{0%,100%{opacity:.5}50%{opacity:.9}}
        @keyframes dotBlink{0%{opacity:.35}100%{opacity:1}}
        .dk-card{border:1px solid #e6ebf3;border-radius:10px;aspect-ratio:3/4;overflow:hidden;background:#f6f8fb}
        .dk-card.now{animation:printPulse 1.3s ease-in-out infinite}
        .dk-line{height:7px;border-radius:4px;background:#e6ebf3;margin:9px 12px}
        .dk-real{border:1px solid #e5e4dd;border-radius:10px;overflow:hidden;aspect-ratio:3/4;background:#f7f7f4}
        .dk-real img{display:block;width:100%;height:100%;object-fit:contain;animation:printReveal .6s ease both}
      `}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {Array.from({ length: slots }).map((_, k) => live[k] ? (
          <div key={k} className="dk-real">
            <img src={live[k]} alt={`${k + 1}쪽`} />
          </div>
        ) : (
          // 지금 찍히는 칸(다음 순번)만 은은하게 숨쉬고, 나머지는 정적 — 물결 없음.
          <div key={k} className={k === live.length ? 'dk-card now' : 'dk-card'}>
            <div className="dk-line" style={{ width: '52%', height: 9, marginTop: 14, background: '#d7deea' }} />
            <div className="dk-line" style={{ width: '82%' }} />
            <div className="dk-line" style={{ width: '68%' }} />
            <div className="dk-line" style={{ width: '46%' }} />
          </div>
        ))}
      </div>
      <div style={{ position: 'relative', height: 5, borderRadius: 4, background: '#eef1f6', overflow: 'hidden', margin: '20px 12px 10px' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 4, background: '#2462EB', width: `${width}%`, transition: 'width .12s linear' }} />
      </div>
      <div style={{ textAlign: 'center', color: '#2462EB', fontWeight: 700, fontSize: 13.5 }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#2462EB', marginRight: 7, verticalAlign: 'middle', animation: 'dotBlink .8s ease-in-out infinite alternate' }} />
        {msg}<span style={{ color: '#9aa4b5', fontWeight: 500 }}> · {label}%{name ? ` · ${name}` : ''}</span>
      </div>
    </div>
  )
}

function PreviewModal({ preview, docTitle, orientation, size, font, onClose, onGo }: {
  preview: Preview; docTitle: string; orientation: Orientation; size: SizePreset; font: string
  onClose: () => void; onGo: () => void
}) {
  const scrim: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(11,11,11,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
  const modal: CSSProperties = { background: '#fff', borderRadius: 16, width: 'min(940px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px -20px rgba(0,0,0,.4)' }
  const hasCards = !!(preview.cards && preview.cards.length)
  const hasSlides = !!(preview.thumbs && preview.thumbs.length)
  const count = preview.cards?.length || preview.pages
  return (
    <div style={scrim} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modal}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <b style={{ fontSize: 15 }}>덱 미리보기 — {preview.name}</b>
          {count ? <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#888' }}>{count}장</span> : null}
          {hasCards ? <span style={{ fontSize: 11, color: '#2462EB', fontWeight: 700 }}>편집·목차 그대로</span> : null}
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 0, background: 'none', fontSize: 18, cursor: 'pointer', color: '#888' }}>✕</button>
        </div>
        <div style={{ padding: 20, overflow: 'auto', flex: 1 }}>
          {preview.busy ? (
            <BusyView name={preview.name} pct={preview.pct} stage={preview.stage} total={preview.total} live={preview.live} />
          ) : preview.error ? (
            <div style={{ padding: 24, color: '#c0362c' }}>변환 실패: {preview.error}<br /><span style={{ color: '#888', fontSize: 12 }}>아래 "메인 캔버스로 가기"를 누르면 편집 페이지로 가져옵니다.</span></div>
          ) : hasCards ? (
            // (P4) 실제 카드 컴포넌트를 축소 렌더 — 미리보기=캔버스. 한 장씩 차오른다.
            <DeckCards cards={preview.cards!} docTitle={docTitle} orientation={orientation} size={size} font={font} />
          ) : hasSlides ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {preview.thumbs!.map((t, i) => (
                <div key={i} style={{ border: '1px solid #e5e4dd', borderRadius: 10, overflow: 'hidden', aspectRatio: '3 / 4', background: '#f7f7f4' }}>
                  <img src={t} alt={`${i + 1}쪽`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: 24, color: '#666' }}>PPTX가 생성되었습니다. 슬라이드 미리보기는 LibreOffice(soffice) 설치 시 표시됩니다.<br /><span style={{ color: '#888', fontSize: 12 }}>지금은 "메인 캔버스로 가기"를 누르면 편집 페이지로 가져옵니다.</span></div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid #eee' }}>
          {preview.pptx_url && <a className="ax-tbtn" href={preview.pptx_url} download>PPTX 다운로드</a>}
          {preview.pdf_url && <a className="ax-tbtn" href={preview.pdf_url} download>PDF 다운로드</a>}
          <span style={{ flex: 1 }} />
          <button className="ax-tbtn" onClick={onClose}>닫기</button>
          <button className="ax-tbtn dark" onClick={onGo} disabled={preview.busy}>메인 캔버스로 가기 →</button>
        </div>
      </div>
    </div>
  )
}
