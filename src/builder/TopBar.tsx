import { useState, useEffect, useRef } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import { useBuilder } from '../state/store'
import { exportBook } from '../export/exportBook'
import { exportPdf } from '../export/exportFiles'
import { exportPptx } from '../export/exportPptx'
import { pageSize } from '../cards/sizing'
import { getActiveProjectId } from '../persistence/session'
import { useProjects } from '../persistence/projects'
import { parseHtml } from '../import/htmlImport'
import type { ImportedDoc } from '../import/htmlImport'
import { deckIrToPages } from '../import/deckToPages'
import { paginate } from '../import/paginate'

// EVER-FOLIO(uniever_ebook 이북 라이브러리) — 형제 앱. run.command 가 8811 로 같이 띄운다.
const FOLIO_URL = 'http://127.0.0.1:8811'
const switchChip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
  border: '1.4px solid #cfe0ff', background: '#eef4ff', color: '#2462EB',
  borderRadius: 9999, padding: '7px 13px', fontWeight: 800, fontSize: 13, textDecoration: 'none',
}

type Preview = {
  name: string
  busy: boolean
  ok?: boolean
  error?: string
  pages?: number
  pptx_url?: string
  pdf_url?: string | null
  thumbs?: string[]
  editableDoc?: ImportedDoc
  ir?: { meta?: Record<string, unknown>; pages?: unknown[] }
}

export default function TopBar({ onHelp, onPresent, onSettings, onDemo, onAiCleanup }: { onHelp: () => void; onPresent: () => void; onSettings: () => void; onDemo: () => void; onAiCleanup: () => void }) {
  const title = useBuilder((s) => s.title)
  const setTitle = useBuilder((s) => s.setTitle)
  const orientation = useBuilder((s) => s.orientation)
  const setOrientation = useBuilder((s) => s.setOrientation)
  const theme = useBuilder((s) => s.theme)
  const setTheme = useBuilder((s) => s.setTheme)
  const size = useBuilder((s) => s.size)
  const font = useBuilder((s) => s.font)
  const summarizeNotes = useBuilder((s) => s.summarizeNotes)
  const pages = useBuilder((s) => s.pages)
  const importDoc = useBuilder((s) => s.importDoc)
  const importDeckSlides = useBuilder((s) => s.importDeckSlides)
  const importPages = useBuilder((s) => s.importPages)
  const [status, setStatus] = useState('')
  const [url, setUrl] = useState<string | undefined>(undefined)
  const fileRef = useRef<HTMLInputElement>(null)
  const [deckTheme, setDeckTheme] = useState<'light' | 'dark'>('light')
  const [preview, setPreview] = useState<Preview | null>(null)

  // 가져오기 → 변환 → 미리보기(모달). 캔버스 반영은 모달의 "메인 캔버스로 가기"에서만.
  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 허용
    if (!file) return
    const text = await file.text()
    setUrl(undefined)
    setPreview({ name: file.name, busy: true })
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('theme', deckTheme)
      const res = await fetch('/api/deck', { method: 'POST', body: fd }).then((r) => r.json())
      const editableDoc = (() => { try { return parseHtml(text) } catch { return undefined } })()
      if (res.ok) {
        setPreview({ name: file.name, busy: false, ok: true, pages: res.pages, pptx_url: res.pptx_url, pdf_url: res.pdf_url, thumbs: res.thumbs || [], editableDoc, ir: res.ir })
      } else {
        setPreview({ name: file.name, busy: false, ok: false, error: res.error, editableDoc })
      }
    } catch (err) {
      const editableDoc = (() => { try { return parseHtml(text) } catch { return undefined } })()
      setPreview({ name: file.name, busy: false, ok: false, error: err instanceof Error ? err.message : String(err), editableDoc })
    }
  }

  // 미리보기 확인 후에만 캔버스에 반영(HITL).
  // 기본: 덱 IR을 편집 가능한 요소로 재현(구글 슬라이드식). IR 없으면 이미지/편집페이지로 폴백.
  function goToCanvas() {
    if (!preview) return
    if (preview.ir && preview.ir.pages && preview.ir.pages.length) {
      setOrientation('portrait')  // 덱은 3:4
      const th = (preview.ir.meta as { theme?: string } | undefined)?.theme
      if (th === 'dark' || th === 'light') setTheme(th)
      importPages(deckIrToPages(preview.ir as never, 'portrait'), preview.name)
    } else if (preview.editableDoc && preview.editableDoc.sections && preview.editableDoc.sections.length) {
      setOrientation('portrait')
      importDoc(paginate(preview.editableDoc, 'portrait', size, font))
    } else if (preview.thumbs && preview.thumbs.length) {
      importDeckSlides(preview.thumbs, preview.name)
    } else if (preview.editableDoc) {
      importDoc(preview.editableDoc)
    }
    setStatus('가져옴: ' + preview.name)
    setPreview(null)
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

  const makeRef = useRef(make)
  makeRef.current = make
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

  return (<div className="top">
    <div className="brand">EVER-SKETCH<small>경영진용</small></div>
    <a className="switch-chip" style={switchChip} href={FOLIO_URL} target="_blank" rel="noreferrer"
       title="EVER-FOLIO(이북 라이브러리) 열기 — 127.0.0.1:8811">↗ EVER-FOLIO</a>
    <input className="title-in" value={title} onChange={(e) => setTitle(e.target.value)} />
    <div className="spacer" />
    <div className="seg">
      <button className={orientation === 'portrait' ? 'on' : ''} onClick={() => setOrientation('portrait')}>세로 이북</button>
      <button className={orientation === 'landscape' ? 'on' : ''} onClick={() => setOrientation('landscape')}>가로 덱</button>
    </div>
    <div className="seg" title="이북 테마 — EVER-PEAK 라이트/다크" style={{ marginRight: 2 }}>
      <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>☀ 라이트</button>
      <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>🌙 다크</button>
    </div>
    <div className="seg" title="가져올 덱 테마" style={{ marginRight: 2 }}>
      <button className={deckTheme === 'light' ? 'on' : ''} onClick={() => setDeckTheme('light')}>라이트</button>
      <button className={deckTheme === 'dark' ? 'on' : ''} onClick={() => setDeckTheme('dark')}>다크</button>
    </div>
    <button className="help-btn" onClick={() => fileRef.current?.click()} title="HTML을 깔끔한 덱으로 변환 → 미리보기 후 캔버스로">📄 HTML 가져오기</button>
    <input ref={fileRef} type="file" accept=".html,.htm,text/html" style={{ display: 'none' }} onChange={onImportFile} />
    <button className="help-btn" onClick={onAiCleanup} title="가져온 결과를 규칙으로 다듬기(제안→수락)">✨ AI로 정리</button>
    <button className="help-btn" onClick={onSummarize} title="본문을 EVER-PEAK식으로 LLM 요약(⚙ 환경설정 필요)">✨ AI 요약</button>
    <button className="help-btn" onClick={onDemo} title="예시영상 — 만드는 법 보기">▶ 예시영상</button>
    <button className="present-btn" onClick={onPresent} title="구글 슬라이드식 슬라이드쇼">▷ 슬라이드쇼</button>
    <button className="help-btn" onClick={onSettings} title="환경설정(LLM)">⚙ 환경설정</button>
    <button className="help-btn" onClick={onHelp}>도움말</button>
    <button className="make" onClick={make}>이북 만들기 →</button>
    {status && <span className="tb-status">{url ? <a href={url} target="_blank" rel="noreferrer">▶ 열기</a> : status}</span>}
    {preview && <PreviewModal preview={preview} onClose={() => setPreview(null)} onGo={goToCanvas} />}
  </div>)
}

function PreviewModal({ preview, onClose, onGo }: { preview: Preview; onClose: () => void; onGo: () => void }) {
  const scrim: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(11,11,11,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
  const modal: CSSProperties = { background: '#fff', borderRadius: 16, width: 'min(940px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px -20px rgba(0,0,0,.4)' }
  const hasSlides = !!(preview.thumbs && preview.thumbs.length)
  return (
    <div style={scrim} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modal}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <b style={{ fontSize: 15 }}>덱 미리보기 — {preview.name}</b>
          {preview.pages ? <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#888' }}>{preview.pages}장</span> : null}
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 0, background: 'none', fontSize: 18, cursor: 'pointer', color: '#888' }}>✕</button>
        </div>
        <div style={{ padding: 20, overflow: 'auto', flex: 1 }}>
          {preview.busy ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>깔끔한 덱으로 변환 중…</div>
          ) : preview.error ? (
            <div style={{ padding: 24, color: '#c0362c' }}>변환 실패: {preview.error}<br /><span style={{ color: '#888', fontSize: 12 }}>아래 "메인 캔버스로 가기"를 누르면 편집 페이지로 가져옵니다.</span></div>
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
          {preview.pptx_url && <a className="help-btn" href={preview.pptx_url} download>PPTX 다운로드</a>}
          {preview.pdf_url && <a className="help-btn" href={preview.pdf_url} download>PDF 다운로드</a>}
          <span style={{ flex: 1 }} />
          <button className="help-btn" onClick={onClose}>닫기</button>
          <button className="make" onClick={onGo} disabled={preview.busy}>메인 캔버스로 가기 →</button>
        </div>
      </div>
    </div>
  )
}
