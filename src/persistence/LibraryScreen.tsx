import { useEffect, useMemo, useState } from 'react'
import UserBar from '../auth/UserBar'
import { useAuth } from '../auth/useAuth'
import ApprovalsPanel from '../approvals/ApprovalsPanel'
import {
  ApprovalApiError, STATUS_LABEL, apiRequestApproval, apiStatusMap, type StatusChip,
} from '../approvals/approvalApi'
import { Plus, Search, Copy, Trash2, Pencil, ExternalLink, ChevronLeft, ChevronRight, BookOpen, Folder, FolderPlus, ChevronRight as Sep, Home, Send, Inbox } from 'lucide-react'
import { useProjects } from './projects'
import NewProjectDialog from './NewProjectDialog'
import type { ProjectMeta } from './projectApi'
import {
  apiCreateFolder, apiDeleteFolder, apiListFolders, apiRenameFolder, FolderApiError,
  type Folder as FolderRow,
} from './folderApi'
import {
  canCreateHere, childrenOf, collapsePath, countInSubtree, pageWindow, scopeLabel,
  scopedProjects, type Crumb,
} from './folderNav'

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

  // ── 폴더 (P4) ──────────────────────────────
  // **화면이 들고 있는다.** 모듈 스토어에 두면 계정이 바뀌어도 안 지워진다(P1.5 의 교훈).
  // `App.tsx` 의 key={uid} 가 이 화면을 다시 마운트하므로 여기 있으면 함께 비워진다.
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [here, setHere] = useState<string | null>(null)
  const [path, setPath] = useState<Crumb[]>([])
  const [maxDepth, setMaxDepth] = useState(3)
  const [pathOpen, setPathOpen] = useState(false)
  const [fErr, setFErr] = useState('')
  const [mkOpen, setMkOpen] = useState(false)
  const [mkName, setMkName] = useState('')
  const [fEditing, setFEditing] = useState<{ id: string; value: string } | null>(null)
  const [fPendingDel, setFPendingDel] =
    useState<{ id: string; name: string; folder_count: number; project_count: number } | null>(null)

  // ── 결재 (P5) ──────────────────────────────
  // 상태 칩은 **한 번에** 받아 온다. 자료마다 되물으면 12건에 요청이 13번 나간다.
  const me = useAuth((s) => s.me)
  const [chips, setChips] = useState<Record<string, StatusChip>>({})
  const [inbox, setInbox] = useState(false)
  const [submitting, setSubmitting] = useState<ProjectMeta | null>(null)
  const [submitMsg, setSubmitMsg] = useState('')
  const [aErr, setAErr] = useState('')

  const loadChips = async () => {
    try { setChips(await apiStatusMap()) } catch { /* 칩은 부가 정보다 — 조용히 넘어간다 */ }
  }
  useEffect(() => { if (view === 'library') void loadChips() }, [view, list])   // eslint-disable-line react-hooks/exhaustive-deps

  // 열람자는 결재를 내지 않는다(D13 — 순수 개인 작업 공간).
  const canSubmit = me?.role === 'writer' || me?.role === 'admin'

  const loadFolders = async () => {
    setFErr('')
    try {
      // 트리 전체를 한 번에 받는다 — 검색 범위(D27)를 셈하려면 하위가 필요하고,
      // 한 단씩 물으면 검색할 때마다 요청이 줄줄이 나간다.
      const all = await apiListFolders(null)
      const every = await fetch('/api/folders?all=true', { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      setFolders((every?.folders as FolderRow[]) || all.folders)
      setMaxDepth(all.max_depth ?? 3)
    } catch (e) {
      setFErr(e instanceof FolderApiError ? e.message : '폴더를 불러오지 못했어요.')
    }
  }
  useEffect(() => { if (view === 'library') void loadFolders() }, [view])   // eslint-disable-line react-hooks/exhaustive-deps

  // 경로는 트리에서 만든다 — 폴더를 오갈 때마다 서버에 되묻지 않는다.
  useEffect(() => {
    const crumbs: Crumb[] = []
    const seen = new Set<string>()
    let cur = here
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const f = folders.find((x) => x.id === cur)
      if (!f) break
      crumbs.unshift({ id: f.id, name: f.name })
      cur = f.parent_id
    }
    setPath(crumbs)
    setPathOpen(false)
  }, [here, folders])

  const goFolder = (id: string | null) => { setHere(id); setPage(1); setEditing(null) }

  const fAct = async (fn: () => Promise<unknown>) => {
    setFErr('')
    try { await fn(); await loadFolders() } catch (e) {
      setFErr(e instanceof FolderApiError ? e.message : '처리하지 못했어요.')
    }
  }

  useEffect(() => { if (view === 'library') setPage(1) }, [view])

  // 목록은 **한 단계만**, 검색은 **하위 전부**를 본다(D27). 판정은 순수 함수가 한다.
  const filtered = useMemo(
    () => scopedProjects({ projects: list, folders, here, query: q, from, to }) as ProjectMeta[],
    [list, folders, here, q, from, to])

  const subFolders = useMemo(() => childrenOf(folders, here), [folders, here])
  const searching = !!q.trim() || !!from || !!to

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
          {canSubmit && (
            <button className="lib-btn" onClick={() => setInbox(true)}>
              <Inbox className="h-4 w-4" /> 결재함
            </button>
          )}
          <button className="lib-btn" disabled={!canCreateHere(path.length, maxDepth)}
            title={canCreateHere(path.length, maxDepth) ? '' : `폴더는 ${maxDepth}단까지만 만들 수 있어요`}
            onClick={() => { setMkOpen(true); setMkName('') }}>
            <FolderPlus className="h-4 w-4" /> 새 폴더
          </button>
          <button className="lib-new" onClick={() => setPicking(true)}><Plus className="h-4 w-4" /> 새 이북</button>
        </div>
      </div>

      {/* 경로 — 4칸까지 다 보이고, 넘치면 앞을 접되 「…」은 **눌리는 버튼**이다(D26).
          지나온 길은 없앨 수 없으므로, 접힌 자리에 무엇이 있었는지 물어볼 수 있어야 한다. */}
      <nav className="lib-crumb" aria-label="폴더 경로">
        <button className="lib-crumb-i" onClick={() => goFolder(null)}>
          <Home className="h-4 w-4" /> 내 자료
        </button>
        {(() => {
          const c = collapsePath(path)
          const parts: React.ReactNode[] = []
          if (c.collapsed && !pathOpen) {
            parts.push(
              <span key="dots" className="lib-crumb-g">
                <Sep className="h-3 w-3 lib-crumb-sep" />
                <button className="lib-crumb-i dots" title="접힌 경로 펼치기"
                  onClick={() => setPathOpen(true)}>…</button>
              </span>)
          }
          const list2 = c.collapsed && !pathOpen ? c.shown : path
          for (const p2 of list2) {
            parts.push(
              <span key={p2.id} className="lib-crumb-g">
                <Sep className="h-3 w-3 lib-crumb-sep" />
                <button className="lib-crumb-i" onClick={() => goFolder(p2.id)}>{p2.name}</button>
              </span>)
          }
          return parts
        })()}
      </nav>

      {fErr && <div className="lib-ferr">{fErr}</div>}

      {mkOpen && (
        <div className="lib-mk">
          <input autoFocus maxLength={40} value={mkName} placeholder="새 폴더 이름"
            aria-label="새 폴더 이름"
            onChange={(e) => setMkName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && mkName.trim()) {
                void fAct(async () => { await apiCreateFolder(mkName.trim(), here); setMkOpen(false) })
              }
              if (e.key === 'Escape') setMkOpen(false)
            }} />
          <button className="lib-btn dark" disabled={!mkName.trim()}
            onClick={() => void fAct(async () => {
              await apiCreateFolder(mkName.trim(), here); setMkOpen(false)
            })}>만들기</button>
          <button className="lib-btn" onClick={() => setMkOpen(false)}>취소</button>
        </div>
      )}

      {/* 폴더 — 한 줄 5개(확정값). **검색 중에는 감춘다** — 검색은 자료를 찾는 일이라
          폴더 칸이 결과 위에 얹히면 무엇이 걸린 건지 헷갈린다. */}
      {!searching && subFolders.length > 0 && (
        <div className="lib-folders">
          {subFolders.map((f) => (
            <div key={f.id} className="lib-folder">
              {fEditing?.id === f.id ? (
                <input className="lib-frename" autoFocus value={fEditing.value} maxLength={40}
                  onChange={(e) => setFEditing({ id: f.id, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && fEditing.value.trim()) {
                      void fAct(async () => {
                        await apiRenameFolder(f.id, fEditing.value.trim()); setFEditing(null)
                      })
                    }
                    if (e.key === 'Escape') setFEditing(null)
                  }}
                  onBlur={() => setFEditing(null)} />
              ) : (
                <>
                  <button className="lib-folder-hit" onClick={() => goFolder(f.id)}
                    title={`${f.name} 열기`}>
                    <Folder className="h-5 w-5" />
                    <span className="lib-folder-name">{f.name}</span>
                    <span className="lib-folder-sub">
                      {f.folder_count ? `폴더 ${f.folder_count} · ` : ''}
                      자료 {countInSubtree(list, folders, f.id)}
                    </span>
                  </button>
                  <div className="lib-folder-act">
                    <button className="lib-act" title="이름 바꾸기"
                      onClick={() => setFEditing({ id: f.id, value: f.name })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button className="lib-act danger" title="삭제"
                      onClick={() => setFPendingDel(f)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 검색/조회 (표준: 검색어·시작일·종료일·검색·초기화) */}
      <div className="lib-search">
        <input className="lib-date" type="date" value={fromIn} onChange={(e) => setFromIn(e.target.value)} aria-label="시작일" />
        <span className="lib-tilde">~</span>
        <input className="lib-date" type="date" value={toIn} onChange={(e) => setToIn(e.target.value)} aria-label="종료일" />
        <div className="lib-q"><Search className="h-4 w-4" /><input value={qIn} onChange={(e) => setQIn(e.target.value)} placeholder="이북 제목 또는 ID" onKeyDown={(e) => { if (e.key === 'Enter') applySearch() }} aria-label="검색어" /></div>
        <button className="lib-btn dark" onClick={applySearch}>검색</button>
        <button className="lib-btn" onClick={resetSearch}>초기화</button>
        {/* 범위를 **글자로** 말한다(D27). 「전체에서 / 이 폴더에서」 토글을 두지 않는다 —
            서 있는 자리가 곧 범위라 고를 것이 없고, 고르는 장치를 없애면 틀리게 고를 일도 없다. */}
        <span className="lib-scope">{scopeLabel(path)}</span>
      </div>

      {/* 개수 (표준: 전체개수·현재/총 페이지·페이지크기). 쪽 이동은 **목록 아래**에 둔다 —
          목록을 다 보고 나서 넘기는 것이 순서다. */}
      <div className="lib-pager">
        <span className="lib-count">
          {searching ? '조회 결과' : '전체'} {total}개 · {cur}/{pages} 페이지 · {PAGE_SIZE}개씩
        </span>
      </div>

      <div className="lib-list">
        {loading ? (
          <div className="lib-empty">불러오는 중…</div>
        ) : total === 0 ? (
          <div className="lib-empty">{searching
            ? `${scopeLabel(path)} 조건에 맞는 이북이 없어요.`
            : path.length
              ? '이 폴더에는 아직 이북이 없어요.\n＋ 새 이북으로 시작해 보세요.'
              : '아직 이북이 없어요.\n＋ 새 이북으로 시작해 보세요.'}</div>
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
                  <div className="lib-sub">
                    {fmtKst(p.updated_at)} · {p.page_count}페이지{p.published_id ? ' · 발행됨' : ''}
                    {chips[p.id] && (
                      <span className={'lib-chip ' + chips[p.id].status}>
                        {STATUS_LABEL[chips[p.id].status]}
                        {chips[p.id].round > 1 ? ` ${chips[p.id].round}회차` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </button>
              <div className="lib-actions">
                {p.published_id ? (
                  <a className="lib-act" title="발행본 보기(EVER-FOLIO)" href={`${FOLIO_URL}/ebooks/${p.published_id}/index.html`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><ExternalLink className="h-4 w-4" /></a>
                ) : null}
                {canSubmit && chips[p.id]?.status !== 'pending' && (
                  <button className="lib-act" title="결재 제출"
                    onClick={() => { setSubmitting(p); setSubmitMsg('') }}>
                    <Send className="h-4 w-4" />
                  </button>
                )}
                <button className="lib-act" title="이름 바꾸기" onClick={() => setEditing({ id: p.id, value: p.name || '' })}><Pencil className="h-4 w-4" /></button>
                <button className="lib-act" title="복제" onClick={() => void duplicateProject(p.id)}><Copy className="h-4 w-4" /></button>
                <button className="lib-act danger" title="삭제" onClick={() => setPendingDel(p)}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 쪽 번호 — **이어진 다섯 칸**(D25). 「1 … 7 8 9 … 20」을 쓰지 않는다:
          「…」은 눌러도 어디로 가는지 모르는 자리이고, 쪽이 늘수록 그 모르는 자리가
          화면 한가운데를 차지한다. 창을 고정하면 끊길 자리 자체가 없다. */}
      {pages > 1 && (
        <div className="lib-pagebar">
          <button className="lib-pg" disabled={cur <= 1} onClick={() => setPage(cur - 1)}
            aria-label="이전 페이지"><ChevronLeft className="h-4 w-4" /></button>
          {pageWindow(cur, pages).map((n) => (
            <button key={n} className={'lib-pg' + (n === cur ? ' on' : '')}
              aria-current={n === cur ? 'page' : undefined}
              onClick={() => setPage(n)}>{n}</button>
          ))}
          <button className="lib-pg" disabled={cur >= pages} onClick={() => setPage(cur + 1)}
            aria-label="다음 페이지"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}

      {/* 폴더 삭제 — **빈 폴더만**(D20). 서버가 막지만 화면이 먼저 말해 준다. */}
      {fPendingDel && (
        <div className="lib-confirm" onClick={() => setFPendingDel(null)}>
          <div className="lib-confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="lib-confirm-title">폴더 삭제</div>
            <div className="lib-confirm-msg">
              {fPendingDel.folder_count || fPendingDel.project_count ? (
                <>
                  <b>{fPendingDel.name}</b> 폴더가 비어 있지 않습니다.
                  <br /><br />
                  {[fPendingDel.folder_count ? `하위 폴더 ${fPendingDel.folder_count}개` : '',
                    fPendingDel.project_count ? `자료 ${fPendingDel.project_count}건` : '']
                    .filter(Boolean).join(' · ')}이 남아 있어요.
                  <b> 먼저 옮기거나 지워 주세요.</b>
                  <br /><br />
                  폴더째 지우면 안에 든 자료까지 함께 사라지므로, 그렇게 하지 않습니다.
                </>
              ) : (
                <><b>{fPendingDel.name}</b> 폴더를 지웁니다. 비어 있어 잃는 자료는 없습니다.</>
              )}
            </div>
            <div className="lib-confirm-actions">
              <button className="lib-btn" onClick={() => setFPendingDel(null)}>취소</button>
              {!fPendingDel.folder_count && !fPendingDel.project_count && (
                <button className="lib-btn danger" onClick={() => {
                  const f = fPendingDel
                  setFPendingDel(null)
                  void fAct(() => apiDeleteFolder(f.id))
                }}>지우기</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 새 이북은 **지금 보고 있는 폴더**에 만든다 —
          만들고 나서 옮기게 하면 사람은 매번 두 번 일한다(만들기 → 찾기 → 옮기기). */}
      {inbox && <ApprovalsPanel onClose={() => { setInbox(false); void loadChips() }} />}

      {/* 제출 — **낸 순간 문서가 얼어붙는다.** 뒤에 고쳐도 결재본은 안 바뀐다. */}
      {submitting && (
        <div className="lib-confirm" onClick={() => setSubmitting(null)}>
          <div className="lib-confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="lib-confirm-title">결재 제출</div>
            <div className="lib-confirm-msg">
              <b>{submitting.name || '제목 없음'}</b> 을(를) 관리자에게 제출합니다.
              <br /><br />
              <b>지금 이 문서가 그대로 얼어붙습니다.</b> 제출한 뒤에 고쳐도 결재본은 바뀌지 않습니다.
              <br />
              한 번이라도 제출하면 <b>이 자료는 지울 수 없습니다.</b>
              {aErr && <div style={{ color: '#b4232a', marginTop: 10 }}>{aErr}</div>}
              <input className="lib-mkin" value={submitMsg} placeholder="전달할 말 (선택)"
                onChange={(e) => setSubmitMsg(e.target.value)} />
            </div>
            <div className="lib-confirm-actions">
              <button className="lib-btn" onClick={() => setSubmitting(null)}>취소</button>
              <button className="lib-btn dark" onClick={() => {
                const target = submitting
                setAErr('')
                void (async () => {
                  try {
                    await apiRequestApproval(target.id, submitMsg.trim())
                    setSubmitting(null); await loadChips()
                  } catch (e) {
                    setAErr(e instanceof ApprovalApiError ? e.message : '제출하지 못했습니다.')
                  }
                })()
              }}>제출</button>
            </div>
          </div>
        </div>
      )}

      {picking && (
        <NewProjectDialog
          onClose={() => setPicking(false)}
          onBlank={() => newProject(here)}
          onTemplate={(ym) => newFromTemplate(ym, here)}
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
