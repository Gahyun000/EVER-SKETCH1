import { useEffect, useMemo, useState } from 'react'
import UserBar from '../auth/UserBar'
import { Plus, Search, Copy, Trash2, Pencil, ExternalLink, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'
import { useProjects } from './projects'
import NewProjectDialog from './NewProjectDialog'
import type { ProjectMeta } from './projectApi'

const PAGE_SIZE = 12
const FOLIO_URL = 'http://127.0.0.1:8811'

// KST 24시간 표기(표준: 한국 표준시·24h).
function fmtKst(ts?: number): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function LibraryScreen() {
  const view = useProjects((s) => s.view)
  const list = useProjects((s) => s.list)
  const loading = useProjects((s) => s.loading)
  const openProject = useProjects((s) => s.openProject)
  const newProject = useProjects((s) => s.newProject)
  const newFromTemplate = useProjects((s) => s.newFromTemplate)
  const renameProject = useProjects((s) => s.renameProject)
  const deleteProject = useProjects((s) => s.deleteProject)
  const duplicateProject = useProjects((s) => s.duplicateProject)

  const [qIn, setQIn] = useState(''); const [fromIn, setFromIn] = useState(''); const [toIn, setToIn] = useState('')
  const [q, setQ] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const [pendingDel, setPendingDel] = useState<ProjectMeta | null>(null)
  const [picking, setPicking] = useState(false)

  useEffect(() => { if (view === 'library') setPage(1) }, [view])

  const filtered = useMemo(() => {
    const term = q.trim()
    const fromTs = from ? new Date(from + 'T00:00:00').getTime() : -Infinity
    const toTs = to ? new Date(to + 'T23:59:59').getTime() : Infinity
    return list.filter((p) => {
      const u = p.updated_at || 0
      if (u < fromTs || u > toTs) return false
      if (!term) return true
      return (p.name || '').includes(term) || p.id.includes(term)
    })
  }, [list, q, from, to])

  const total = filtered.length
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const cur = Math.min(page, pages)
  const shown = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE)

  if (view !== 'library') return null

  const applySearch = () => { setQ(qIn); setFrom(fromIn); setTo(toIn); setPage(1) }
  const resetSearch = () => { setQIn(''); setFromIn(''); setToIn(''); setQ(''); setFrom(''); setTo(''); setPage(1) }
  const commitRename = async () => { if (editing && editing.value.trim()) await renameProject(editing.id, editing.value.trim()); setEditing(null) }
  const confirmDelete = async () => { if (pendingDel) await deleteProject(pendingDel.id); setPendingDel(null) }

  return (
    <div className="lib-screen">
      <div className="lib-head">
        <div className="lib-brand"><div className="logo" aria-label="EVER-SKETCH" /> 내 이북</div>
        {/* 신원 표시와 「새 이북」이 **같은 줄 안에서** 자리를 나눈다.
            예전에는 UserBar 가 화면 밖 오버레이로 떠서 이 버튼 위에 포개졌다. */}
        <div className="lib-head-right">
          <UserBar />
          <button className="lib-new" onClick={() => setPicking(true)}><Plus className="h-4 w-4" /> 새 이북</button>
        </div>
      </div>

      {/* 검색/조회 (표준: 검색어·시작일·종료일·검색·초기화) */}
      <div className="lib-search">
        <input className="lib-date" type="date" value={fromIn} onChange={(e) => setFromIn(e.target.value)} aria-label="시작일" />
        <span className="lib-tilde">~</span>
        <input className="lib-date" type="date" value={toIn} onChange={(e) => setToIn(e.target.value)} aria-label="종료일" />
        <div className="lib-q"><Search className="h-4 w-4" /><input value={qIn} onChange={(e) => setQIn(e.target.value)} placeholder="이북 제목 또는 ID" onKeyDown={(e) => { if (e.key === 'Enter') applySearch() }} aria-label="검색어" /></div>
        <button className="lib-btn dark" onClick={applySearch}>검색</button>
        <button className="lib-btn" onClick={resetSearch}>초기화</button>
      </div>

      {/* 개수/페이지 (표준: 전체개수·현재/총 페이지·페이지크기) */}
      <div className="lib-pager">
        <span className="lib-count">전체 {total}개 · {cur}/{pages} 페이지 · {PAGE_SIZE}개씩</span>
        <span className="lib-nav">
          <button disabled={cur <= 1} onClick={() => setPage(cur - 1)} aria-label="이전 페이지"><ChevronLeft className="h-4 w-4" /></button>
          <button disabled={cur >= pages} onClick={() => setPage(cur + 1)} aria-label="다음 페이지"><ChevronRight className="h-4 w-4" /></button>
        </span>
      </div>

      <div className="lib-list">
        {loading ? (
          <div className="lib-empty">불러오는 중…</div>
        ) : total === 0 ? (
          <div className="lib-empty">{q || from || to ? '조건에 맞는 이북이 없어요.' : '아직 이북이 없어요.\n＋ 새 이북으로 시작해 보세요.'}</div>
        ) : (
          shown.map((p) => (
            <div key={p.id} className="lib-card">
              <button className="lib-open-hit" title="이 이북 열기" onClick={() => void openProject(p.id)}>
                <div className="lib-ico"><BookOpen className="h-5 w-5" /></div>
                <div className="lib-meta">
                  {editing && editing.id === p.id ? (
                    <input className="lib-rename" autoFocus value={editing.value}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditing({ id: p.id, value: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void commitRename() } if (e.key === 'Escape') setEditing(null) }}
                      onBlur={() => void commitRename()} />
                  ) : (
                    <div className="lib-name">{p.name || '제목 없음'}</div>
                  )}
                  <div className="lib-sub">{fmtKst(p.updated_at)} · {p.page_count}페이지{p.published_id ? ' · 발행됨' : ''}</div>
                </div>
              </button>
              <div className="lib-actions">
                {p.published_id ? (
                  <a className="lib-act" title="발행본 보기(EVER-FOLIO)" href={`${FOLIO_URL}/ebooks/${p.published_id}/index.html`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><ExternalLink className="h-4 w-4" /></a>
                ) : null}
                <button className="lib-act" title="이름 바꾸기" onClick={() => setEditing({ id: p.id, value: p.name || '' })}><Pencil className="h-4 w-4" /></button>
                <button className="lib-act" title="복제" onClick={() => void duplicateProject(p.id)}><Copy className="h-4 w-4" /></button>
                <button className="lib-act danger" title="삭제" onClick={() => setPendingDel(p)}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {picking && (
        <NewProjectDialog
          onClose={() => setPicking(false)}
          onBlank={() => newProject()}
          onTemplate={(ym) => newFromTemplate(ym)}
        />
      )}

      {/* 프로젝트 자체 확인 다이얼로그(표준: 브라우저 confirm 금지) */}
      {pendingDel && (
        <div className="lib-confirm" onClick={() => setPendingDel(null)}>
          <div className="lib-confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="lib-confirm-title">이북 삭제</div>
            <div className="lib-confirm-msg">‘{pendingDel.name || '제목 없음'}’ 이북을 삭제할까요?<br />이 이북의 모든 슬라이드와 버전 기록이 함께 삭제되며 되돌릴 수 없어요.</div>
            <div className="lib-confirm-actions">
              <button className="lib-c-cancel" onClick={() => setPendingDel(null)}>취소</button>
              <button className="lib-c-ok danger" onClick={() => void confirmDelete()}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
