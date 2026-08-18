import type { CSSProperties } from 'react'
import { useBuilder } from '../../state/store'
import { useProjects } from '../../persistence/projects'

// EVER-FOLIO(uniever_ebook 이북 라이브러리) — 형제 앱. run.command 가 8811 로 같이 띄운다.
const FOLIO_URL = 'http://127.0.0.1:8811'
const folioChip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flex: '0 0 auto',
  border: '1.4px solid rgba(36,98,235,.45)', background: 'rgba(36,98,235,.10)', color: '#2462EB',
  borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 800, textDecoration: 'none',
}

export default function TitleBar({ onPresent }: { onPresent: () => void }) {
  const title = useBuilder((s) => s.title)
  const setTitle = useBuilder((s) => s.setTitle)
  const newProject = useProjects((s) => s.newProject)
  // 한글은 폭이 약 1em, 라틴/숫자는 약 0.58em — 내용에 맞춰 입력 폭 산정(잘림 방지)
  const units = [...(title || '')].reduce((n, c) => n + (/[ -ÿ]/.test(c) ? 0.58 : 1.02), 0)
  const w = Math.min(Math.max(units + 1.4, 6), 40)
  return (
    <div className="ax-title">
      <div className="logo" aria-label="EVER-SKETCH" />
      <input className="ttl" style={{ width: w + 'em' }} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="문서 제목" />
      <span className="sp" />
      {/* 다른 앱(EVER-FOLIO 이북 라이브러리)으로 가는 이동 버튼 */}
      <a className="folio-chip" style={folioChip} href={FOLIO_URL} target="_blank" rel="noreferrer"
         title="EVER-FOLIO(이북 라이브러리) 열기 — 127.0.0.1:8811">↗ EVER-FOLIO</a>
      <button className="rbtn" onClick={onPresent} title="구글 슬라이드식 슬라이드쇼">▷ 슬라이드쇼</button>
      <button className="rbtn pri" onClick={() => void newProject()} title="새 이북 시작">＋ 새 이북</button>
      <div className="av">가</div>
    </div>
  )
}
