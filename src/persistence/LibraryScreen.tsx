import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { wantsSharedFromSearch } from '../teamlib/teamLibraryModel'
import {
  ApprovalApiError, DOC_STATE_LABEL, apiListApprovals, apiRequestApproval, apiRequestRevision,
  apiStatusMap, type Approval, type StatusChip,
} from '../approvals/approvalApi'
import { Plus, Search, Copy, Trash2, Pencil, ExternalLink, ChevronLeft, ChevronRight, BookOpen, Folder, FolderPlus, ChevronRight as Sep, Home, Send, Inbox, Users, Lock, PenLine } from 'lucide-react'
import { useProjects } from './projects'
import NewProjectDialog from './NewProjectDialog'
import Modal from '../ui/Modal'
import SearchRow from '../ui/SearchRow'
import type { ProjectMeta } from './projectApi'
import {
  apiCreateFolder, apiDeleteFolder, apiRenameFolder, FolderApiError,
} from './folderApi'
import {
  canCreateHere, childrenOf, collapsePath, countInSubtree, pageWindow, scopeLabel,
  scopedProjects, type Crumb, type FolderNode,
} from './folderNav'
import {
  LIB_COLS, LIB_PAGE_SIZE, LIB_SORT_DEFAULT, LIB_STATE_LABEL, nextSort, pageRows, sortFolders, sortRows, wantsTable,
  type LibSort,
} from './libTable'
import { FOLIO_URL, FOLIO_HOST, folioBookUrl } from '../ports'
// EVER-FOLIO 가 안 떠 있으면 빈 탭을 여는 대신 화면 아래 띠로 한 줄 말한다.
// **표·패널은 overflow 가 걸려 있어 말풍선이 잘린다** — 그래서 quiet.
import SiblingLink from '../siblingLink'

const PAGE_SIZE = LIB_PAGE_SIZE   // 폴더·자료 합쳐 10줄 — libTable 한 곳에서 정한다

// KST 24시간 표기(표준: 한국 표준시·24h).
function fmtKst(ts?: number): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function LibraryScreen() {
  const view = useProjects((s) => s.view)
  const list = useProjects((s) => s.list)
  const loading = useProjects((s) => s.loading)
  const listError = useProjects((s) => s.listError)
  const openError = useProjects((s) => s.openError)
  const openErrorId = useProjects((s) => s.openErrorId)
  const loadList = useProjects((s) => s.loadList)
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
  /** 삭제가 거절당한 이유. 모달 안에 그대로 띄운다 — 창을 닫아 버리면 이유를 읽을 새가 없다. */
  const [delErr, setDelErr] = useState('')
  /**
   * **고른 줄**. 상세를 연 것(`sel`)과 다르다 — 제목을 한 번 누르면 여기만 바뀐다.
   * 한 번에 상세까지 열면, 두 번 누르려고 멈춘 사람에게 패널이 깜빡였다 열렸다 한다.
   */
  const [pick, setPick] = useState<string | null>(null)
  /** 잠겨서 못 연 자료. 더블클릭으로 들어가려다 막힌 것만 여기 온다. */
  const [lockInfo, setLockInfo] = useState<ProjectMeta | null>(null)
  /**
   * 모달을 닫은 뒤 **다음에 누를 곳**을 잠깐 가리킨다(시안 v1.0 ㉠ 테두리 링).
   * 까닭만 말하고 끝내면 「그래서 어디를 누르라고」가 남는다 — 그 자리를 짚어 준다.
   * 승인된 자료만 그 단추가 줄에 있다. 결재 중은 줄에 없으므로 모달이 결재함으로 데려간다.
   */
  const [pointAt, setPointAt] = useState<string | null>(null)
  useEffect(() => {
    if (!pointAt) return
    // **사람이 알아채면 그만둔다.** 이미 봤는데 계속 반짝이면 그때부터는 방해다.
    const off = () => setPointAt(null)
    const t = window.setTimeout(off, 4200)
    window.addEventListener('pointerdown', off, true)
    return () => { window.clearTimeout(t); window.removeEventListener('pointerdown', off, true) }
  }, [pointAt])
  const [picking, setPicking] = useState(false)

  // ── 상세 칸 (②③④) ────────────────────────
  //
  // **안 골랐으면 칸이 아예 없다**(사용자 결정 ②, 노션식). 늘 붙어 있는 칸으로 두면
  // 들어올 때마다 빈 칸을 한 번 보고, 넓게 훑고 싶을 때 되찾을 방법이 없다.
  // 고르면 오른쪽에서 밀고 나오고 닫으면 목록이 폭을 되찾는다.
  const [sel, setSel] = useState<ProjectMeta | null>(null)
  /** 고른 자료의 결재 이력. 회차가 여럿이면 여럿이다. */
  const [selRows, setSelRows] = useState<Approval[]>([])

  // ── 표 (⑤) ────────────────────────────────
  const [sort, setSort] = useState<LibSort>(LIB_SORT_DEFAULT)
  /** 목록 칸의 **실제** 폭. 창 크기만으로는 못 센다 — 사이드바를 접었는지, 폴더 칸을
   *  뺐는지에 따라 남는 자리가 달라진다. 그래서 그리는 자리를 직접 잰다. */
  const listRef = useRef<HTMLDivElement | null>(null)
  const [listW, setListW] = useState(0)
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    // **그리기 전에 한 번 잰다.** 0 에서 시작해 관찰자가 알려 주길 기다리면
    // 들어올 때마다 줄 목록이 한 번 깜빡였다가 표로 바뀐다.
    setListW(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((es) => { for (const e of es) setListW(e.contentRect.width) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── 폴더 (P4 · 2026-09-15 스토어로 옮김) ──────────────
  //
  // 예전에는 여기 `useState` 였다. 계정이 바뀌면 지워지게 하려는 것이었고
  // (`App.tsx` 의 `key={uid}` 가 이 화면을 다시 마운트한다), 그 목적 자체는 옳았다.
  // 그런데 **편집에 들어갔다 나올 때도 같이 지워졌다** — 이 화면이 통째로 내려갔다
  // 다시 태어나면서 `here` 가 `null` 이 되어 늘 「전체」에 떨어졌다.
  // 계정이 바뀔 때 비우는 일은 이제 `boot()` 이 한다(사용자 결정 ⑦ㄱ).
  const folders = useProjects((s) => s.folders)
  const here = useProjects((s) => s.here)
  const maxDepth = useProjects((s) => s.maxDepth)
  const setHere = useProjects((s) => s.setHere)
  const loadFoldersInto = useProjects((s) => s.loadFolders)
  const [path, setPath] = useState<Crumb[]>([])
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
  /** 셸의 화면으로 옮긴다. 덮개를 띄우던 자리가 이제 여기로 온다. */
  const setView = useProjects((s2) => s2.setView)
  const go = (v: 'inbox' | 'team', replace = false) => {
    setView(v)
    try {
      const to = v === 'inbox' ? '/inbox' : '/team'
      if (window.location.pathname + window.location.search === to) return
      // **`?shared=1` 로 들어온 길은 밀어 넣지 않고 갈아 끼운다.**
      // 밀어 넣으면 뒤로 가기가 `/?shared=1` 로 돌아가고, 그 주소는 팀 공유를 **또** 연다 —
      // 닫아도 새로 고칠 때마다 다시 열리는 그 증상이 뒤로 가기로 되살아난다.
      if (replace) window.history.replaceState({ v }, '', to)
      else window.history.pushState({ v }, '', to)
    } catch { /* 주소를 못 써도 화면은 바뀐다 */ }
  }
  // **주소가 「팀 공유를 열어 달라」고 하면 거기로 시작한다**(뷰어의 「팀 공유 열기」).
  // 뷰어에서 돌아온 사람이 방금 보던 것은 팀 자료다 — 그냥 자료 목록에 내리면
  // 제 자료가 없는 열람자에게는 빈 화면이 먼저 뜬다.
  // 덮개였을 때는 여기서 열었고, 지금은 **팀 공유 화면으로 보낸다.**
  useEffect(() => {
    if (wantsSharedFromSearch(window.location.search)) go('team', true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [submitting, setSubmitting] = useState<ProjectMeta | null>(null)
  // 수정 요청 — **제출과 다른 창이다.** 되는 일이 달라서다: 제출은 문서를 얼리고,
  // 수정 요청은 아무것도 안 얼린다(허락을 청할 뿐이다).
  const [revising, setRevising] = useState<ProjectMeta | null>(null)
  const [reviseMsg, setReviseMsg] = useState('')
  const [submitMsg, setSubmitMsg] = useState('')
  const [aErr, setAErr] = useState('')

  /** 서버에 보내는 중 — **확인 버튼을 잠근다.**
   *
   *  이게 없으면 「제출」을 두 번 누를 수 있고, 요청이 두 번 나간다.
   *  서버는 두 번째를 `이미 결재 대기 중입니다` 로 막으니 자료가 두 번 제출되지는 않는다.
   *  문제는 **사람에게 보이는 것**이다: 첫 번째가 성공해 창이 닫히고,
   *  뒤늦게 온 거절이 `aErr` 에 남아 **다음에 연 확인창에 그대로 뜬다.**
   *  아직 내지도 않은 자료를 열었는데 「이미 결재 대기 중입니다」가 붉게 적혀 있다 —
   *  낸 사람은 무슨 일이 일어났는지 알 길이 없다.
   *
   *  구멍은 **응답을 기다리는 그 사이**에만 열린다. 빠른 회선에서는 잘 안 걸리고,
   *  회의 직전 느린 날에 걸린다. e2e/double_submit_smoke.mjs 가 그 사이를 만들어 본다. */
  const [busy, setBusy] = useState(false)

  // 읽었으면 주소에서 지운다. 남겨 두면 창을 닫은 뒤에도 새로 고칠 때마다 다시 열려서
  // **주소가 화면과 다른 말을 하게 된다.** 기록을 쌓지 않으려고 replaceState 를 쓴다 —
  // push 면 뒤로가기가 「같은 화면」을 한 번 더 거친다.
  useEffect(() => {
    if (!wantsSharedFromSearch(window.location.search)) return
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  // 고른 자료가 바뀌면 그 자료의 이력만 받아 온다. **미리 다 받아 두지 않는다** —
  // 12건짜리 목록에 12번 요청이 나가고, 그중 열어 보는 것은 대개 하나다.
  useEffect(() => {
    if (!sel) { setSelRows([]); return }
    let live = true
    apiListApprovals('', sel.id)
      .then((r) => { if (live) setSelRows(r.approvals || []) })
      .catch(() => { if (live) setSelRows([]) })   // 이력은 부가 정보다 — 조용히 넘어간다
    return () => { live = false }
  }, [sel])

  // **목록이 바뀌면 고른 것도 따라간다.** 지우거나 폴더를 옮기면 없는 자료의 상세가
  // 남아서, 「열기」를 눌러 404 를 받는다.
  useEffect(() => {
    if (!sel) return
    const now = list.find((p) => p.id === sel.id)
    if (!now) setSel(null)
    else if (now !== sel) setSel(now)
  }, [list])   // eslint-disable-line react-hooks/exhaustive-deps

  const loadChips = async () => {
    try { setChips(await apiStatusMap()) } catch { /* 칩은 부가 정보다 — 조용히 넘어간다 */ }
  }
  useEffect(() => { if (view === 'library') void loadChips() }, [view, list])   // eslint-disable-line react-hooks/exhaustive-deps

  // 열람자는 결재를 내지 않는다(D13 — 순수 개인 작업 공간).
  const canSubmit = me?.role === 'writer' || me?.role === 'admin'

  // **팀 공유는 등급으로 가리지 않는다** (P6). 열람자도 팀에 배정되면 그 팀의 승인본을
  // 보고, 그게 열람자가 이 도구를 쓰는 주된 이유다. 무엇이 보이는지는 서버가 건마다
  // 정하므로(`can_see_approval`) 화면이 미리 거르면 규칙이 두 벌이 된다.
  // 볼 게 없는 사람에게는 오류가 아니라 **이유가 적힌 빈 화면**이 뜬다.

  /** 받아 오는 일은 스토어가 하고, **무슨 말을 할지는 화면이 정한다.**
   *  같은 실패라도 목록 화면에서는 빨간 줄이지만 사이드바에서는 조용히 지나간다. */
  const loadFolders = async () => {
    setFErr('')
    try { await loadFoldersInto() } catch (e) {
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

  /** 폴더 작업. **성공했는지 돌려준다** — 삼키면 부르는 쪽이 실패해도 창을 닫는다. */
  const fAct = async (fn: () => Promise<unknown>) => {
    setFErr('')
    try { await fn(); await loadFolders(); return true } catch (e) {
      setFErr(e instanceof FolderApiError ? e.message : '처리하지 못했어요.')
      return false
    }
  }

  useEffect(() => { if (view === 'library') setPage(1) }, [view])

  // 목록은 **한 단계만**, 검색은 **하위 전부**를 본다(D27). 판정은 순수 함수가 한다.
  const filtered = useMemo(
    () => scopedProjects({ projects: list, folders, here, query: q, from, to }) as ProjectMeta[],
    [list, folders, here, q, from, to])

  const subFolders = useMemo(() => childrenOf(folders, here), [folders, here])
  const searching = !!q.trim() || !!from || !!to

  const docTotal = filtered.length
  // **줄 세운 뒤에 쪽을 나눈다.** 거꾸로 하면 1쪽 안에서만 줄이 서서,
  // 「제목순」으로 세워도 2쪽 첫 줄이 1쪽 마지막 줄보다 앞에 온다.
  const ordered = useMemo(() => sortRows(filtered, chips, sort), [filtered, chips, sort])
  // **폴더·자료를 한 줄로 세운 뒤 자른다**(libTable.pageRows). 폴더는 늘 앞, 검색 중엔 빠진다.
  const folderOrder = useMemo(() => sortFolders(subFolders, sort), [subFolders, sort])
  const pg = useMemo(() => pageRows(folderOrder, ordered, searching, page, PAGE_SIZE),
    [folderOrder, ordered, searching, page])
  const { total, pages, cur } = pg
  const shown = pg.docs
  const fRows = pg.folders
  /** 표를 그릴 만한가. 아직 안 쟀으면(0) 표로 본다 — 깜빡임을 피하려고 낙관한다. */
  const asTable = listW === 0 || wantsTable(listW)

  if (view !== 'library') return null

  /**
   * **제목을 두 번 누르면 들어간다**(2026-09-17 · 시안 v1.0).
   *
   * 예전에는 제목 한 번 → 상세 → 「열기」 세 걸음이었다. 폴더는 한 번에 들어가는데
   * 자료만 오른쪽 끝까지 마우스를 옮겨야 했다 — 같은 표 안에서 규칙이 둘이었다.
   *
   * **판정은 「열기」 단추와 같은 것을 쓴다**(`chips[id].locked`). 두 벌로 두면
   * 언젠가 갈라져서, 단추로는 막히는데 더블클릭으로는 열리는 일이 생긴다.
   */
  const openOrExplain = (p: ProjectMeta) => {
    if (chips[p.id]?.locked) { setLockInfo(p); return }
    void openProject(p.id)
  }

  /** 줄 오른쪽 도구. **표와 줄 목록이 같은 것을 쓴다** — 두 벌로 두면 한쪽만 고쳐진다. */
  const actionsFor = (p: ProjectMeta) => (
    <div className="lib-actions">
      {p.published_id ? (
        <SiblingLink className="lib-act" quiet
          url={folioBookUrl(p.published_id)} probeUrl={FOLIO_URL}
          name="EVER-FOLIO" host={FOLIO_HOST}><ExternalLink className="h-4 w-4" /></SiblingLink>
      ) : null}
      {/* **한 자리에 한 가지 일만 놓는다.** 승인된 자료에 「제출」을 띄워 두면
          눌러 보고 400 을 받는다 — 그 자리에 오는 것은 「수정 요청」이다. */}
      {canSubmit && chips[p.id]?.state === 'approved' && (
        <button className={'lib-act' + (pointAt === p.id ? ' lib-point' : '')} title="수정 요청"
          onClick={() => { setPointAt(null); setRevising(p); setReviseMsg(''); setAErr('') }}>
          <PenLine className="h-4 w-4" />
        </button>
      )}
      {canSubmit && !chips[p.id]?.locked && chips[p.id]?.state !== 'approved' && (
        <button className="lib-act" title="결재 제출"
          onClick={() => { setSubmitting(p); setSubmitMsg(''); setAErr('') }}>
          <Send className="h-4 w-4" />
        </button>
      )}
      <button className="lib-act" title="이름 바꾸기" onClick={() => setEditing({ id: p.id, value: p.name || '' })}><Pencil className="h-4 w-4" /></button>
      <button className="lib-act" title="복제" onClick={() => void duplicateProject(p.id)}><Copy className="h-4 w-4" /></button>
      <button className="lib-act danger" title="삭제" onClick={() => { setDelErr(''); setPendingDel(p) }}><Trash2 className="h-4 w-4" /></button>
    </div>
  )

  /** 이름 칸 — 고치는 중이면 입력칸이 된다. 표와 줄 목록이 같이 쓴다. */
  const nameCell = (p: ProjectMeta) =>
    editing && editing.id === p.id ? (
      <input className="lib-rename" autoFocus value={editing.value}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setEditing({ id: p.id, value: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void commitRename() } if (e.key === 'Escape') setEditing(null) }}
        onBlur={() => void commitRename()} />
    ) : (p.name || '제목 없음')

  /** 값이 없는 칸은 **빈 칸이 아니라 「—」**다. 비워 두면 못 받아 온 것처럼 보인다. */
  const dim = <span className="lib-tdim">—</span>

  const applySearch = () => { setQ(qIn); setFrom(fromIn); setTo(toIn); setPage(1) }
  const resetSearch = () => { setQIn(''); setFromIn(''); setToIn(''); setQ(''); setFrom(''); setTo(''); setPage(1) }
  const commitRename = async () => { if (editing && editing.value.trim()) await renameProject(editing.id, editing.value.trim()); setEditing(null) }
  // 삭제도 응답을 기다리는 사이 창이 열려 있다 — 두 번 눌리면 두 번 간다.
  // 두 번째는 404 로 떨어지고, **이미 지워졌는데 「지우지 못했습니다」로 보인다.**
  //
  // **거절당하면 이유를 말한다**(2026-09-17, 사용자 지적: 「안 되는 거면 모달이 떠야지 안 되는
  // 이유랑」). 여기에는 `catch` 가 없었다. 그래서 결재에 낸 자료를 지우려 하면 서버가
  // 403 으로 이유까지 돌려주는데도 **창만 열린 채 아무 일도 안 일어났다** — 콘솔에만 찍혔다.
  // 사용자 눈에는 「단추가 죽었다」로 보인다. 이 화면의 다른 자리들(fAct · 제출 · 수정 요청)은
  // 이미 이렇게 하고 있었고, 여기만 빠져 있었다.
  const confirmDelete = async () => {
    if (!pendingDel || busy) return
    setDelErr(''); setBusy(true)
    try {
      await deleteProject(pendingDel.id)
      setPendingDel(null)
    } catch (e) {
      // 서버가 준 말을 **그대로** 옮긴다 — 「실패했습니다」보다 「한 번이라도 결재에 낸
      // 자료는 지울 수 없습니다」가 훨씬 쓸모 있다. 못 알아들을 때만 우리가 지어낸다.
      //
      // `projectApi.j()` 는 **클래스가 아니라** `status` 를 붙인 평범한 Error 를 던진다
      // (403 이면 서버가 준 detail 이 그대로 message 에 들어 있다). 그래서 `instanceof`
      // 로 특정 클래스를 찾으면 안 된다 — 늘 빗나가서 「지우지 못했어요.」만 뜬다.
      setDelErr(e instanceof Error && e.message ? e.message : '지우지 못했어요.')
    } finally { setBusy(false) }
  }

  /** 목록 맨 위에 붙는 폴더 줄(①ㄴ). 규칙은 libTable 이 정한다 —
   *  표 모양과 줄 모양이 **같은 답**을 써야 한다. */

  /** 폴더 이름 칸 — 고치는 중이면 입력칸이 된다. 자료의 `nameCell` 과 짝이다. */
  const fNameCell = (f: FolderNode) =>
    fEditing && fEditing.id === f.id ? (
      <input className="lib-frename" autoFocus value={fEditing.value} maxLength={40}
        aria-label="폴더 이름"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setFEditing({ id: f.id, value: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && fEditing.value.trim()) {
            e.preventDefault()
            void fAct(async () => { await apiRenameFolder(f.id, fEditing.value.trim()); setFEditing(null) })
          }
          if (e.key === 'Escape') setFEditing(null)
        }}
        onBlur={() => setFEditing(null)} />
    ) : f.name

  /** 폴더 줄의 도구. **자리는 자료와 같다** — 줄 끝 오른쪽. 다만 폴더에는
   *  제출도 복제도 없다: 결재에 내는 것도, 베끼는 것도 자료지 폴더가 아니다. */
  const folderActs = (f: FolderNode) => (
    <div className="lib-actions">
      <button className="lib-act" title="이름 바꾸기"
        onClick={() => setFEditing({ id: f.id, value: f.name })}><Pencil className="h-4 w-4" /></button>
      <button className="lib-act danger" title="삭제"
        onClick={() => { setFPendingDel(f); setFErr('') }}><Trash2 className="h-4 w-4" /></button>
    </div>
  )

  /** 빈 화면 글귀 — **한 군데서 정한다.** 폴더만 있고 자료가 없을 때도 같은 말을
   *  써야 하는데, 그때는 표 안에 한 줄로 들어간다(목록이 통째로 비지는 않는다). */
  const emptyMsg = searching
    ? `${scopeLabel(path)} 조건에 맞는 이북이 없어요.`
    : path.length
      ? '이 폴더에는 아직 이북이 없어요.\n＋ 새 이북으로 시작해 보세요.'
      : canSubmit
        ? '아직 이북이 없어요.\n＋ 새 이북으로 시작해 보세요.'
        : '아직 만든 것이 없어요.\n여기에 만든 것은 나만 봅니다.\n팀에 올라온 자료는 「팀 공유」에서 봅니다.'

  const selChip = sel ? chips[sel.id] : undefined

  /** **그 자료가 든 폴더**의 경로. 지금 서 있는 자리가 아니다 — 검색은 하위까지 훑으므로
   *  (D27) 「전체에서」 찾은 결과 안에는 다른 폴더의 자료가 섞여 있다. */
  const folderPathOf = (fid?: string | null): string => {
    if (!fid) return '전체'
    const names: string[] = []
    const seen = new Set<string>()
    let cur: string | null = fid
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const f = folders.find((x) => x.id === cur)
      if (!f) break
      names.unshift(f.name)
      cur = f.parent_id
    }
    return names.length ? names.join(' › ') : '전체'
  }

  /** 결재 이력을 **일어난 일 단위**로 편다. 한 회차에 제출과 결정이 둘 다 들어 있어서,
   *  줄 단위로 그리면 「제출」이 사라지고 결정만 남는다 — 누가 냈는지가 안 보인다. */
  const histEvents = selRows.flatMap((a2) => {
    const rev = a2.kind === 'revision'
    const ev: { t: number; who: string; what: string; round: number }[] = [{
      t: a2.created_at, who: a2.requester_name || '작성자',
      what: rev ? '수정 요청' : '제출', round: a2.round,
    }]
    if (a2.decided_at) {
      ev.push({
        t: a2.decided_at, who: a2.approver_name || '관리자',
        what: a2.status === 'approved' ? (rev ? '허락' : '승인')
          : a2.status === 'rejected' ? (rev ? '거절' : '반려')
          : a2.status === 'withdrawn' ? '회수' : '처리',
        round: a2.round,
      })
    }
    return ev
  }).sort((x, y) => y.t - x.t)

  return (
    <div className="lib-wrap">
    <div className="lib-screen">
      <div className="lib-head">
        {/* 2026-09-07: 화면 이름을 **제품 이름 하나로** 통일했다(사용자 결정).
            예전에는 작성자에게 「내 이북」, 열람자에게 「개인 스케치」였다. 열람자용 이름은
            D13 의 뜻을 담고 있었다 — 여기 만든 것은 결재에 안 가고 팀에도 안 뜬다.

            그 뜻이 사라진 것은 아니다. **말해야 하는 자리에 그대로 남아 있다:**
              · NewProjectDialog — 「개인 스케치는 나만 봅니다 — 결재에 내지 않고, 팀에도 뜨지 않습니다」
              · 이 화면의 빈 상태 — 「여기에 만든 것은 나만 봅니다」
            둘 다 **만들기 직전과 빈 화면**, 그러니까 오해가 생기는 바로 그 순간에 뜬다.
            머리줄 제목은 매일 보느라 오히려 안 읽히는 자리였다. */}
        {/* **브랜드·신원·갈 곳은 셸이 갖는다**(2026-09-10).
            셸이 들어오기 전에는 이 줄이 그 넷을 다 들고 있었다 — 로고, 이름표,
            「팀 공유」, 「결재함」. 셸에 같은 것이 생기면서 **화면에 두 번씩** 나왔다.
            여기 남는 것은 **이 화면에서 하는 일**뿐이다: 새 폴더 · 새 이북.
            (「팀 공유」·「결재함」으로 가는 길은 왼쪽 메뉴에 있다 —
             `go()` 는 남겨 둔다: 뷰어에서 `?shared=1` 로 돌아오는 길이 쓴다.) */}
        {/* **세 화면이 같은 줄을 쓴다**(2026-09-15). 전에는 화면마다 크기도 말도 달랐다 —
            여기는 글자 14px·「검색」, 팀 공유는 12.5px·「조회」, 결재함은 아예 없었다.
            차례는 기간이 먼저(①ㄴ), 말은 「검색」·「초기화」(②ㄱ).
            **범위 표시(「내 자료 전체에서」)는 뺐다**(⑤ㄱ) — 경로 줄과 사이드바에 켜진
            폴더가 「어디에 있는지」를 이미 말한다. */}
        <SearchRow q={qIn} onQ={setQIn} from={fromIn} to={toIn} onFrom={setFromIn} onTo={setToIn}
          placeholder="이북 제목 또는 ID" dateLabel="수정일"
          onSearch={applySearch} onReset={resetSearch}>
          {/* **이 화면에서만 하는 일**이다. 팀 공유·결재함은 보는 화면이라 만들 것이 없다. */}
          <button className="lib-btn" disabled={!canCreateHere(path.length, maxDepth)}
            title={canCreateHere(path.length, maxDepth) ? '' : `폴더는 ${maxDepth}단까지만 만들 수 있어요`}
            onClick={() => { setMkOpen(true); setMkName('') }}>
            <FolderPlus className="h-4 w-4" /> 새 폴더
          </button>
          <button className="lib-new" onClick={() => setPicking(true)}><Plus className="h-4 w-4" /> 새 이북</button>
        </SearchRow>
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

      {/* **폴더 카드를 걷었다**(2026-09-15 ①ㄴ). 여기 있던 5열 카드는 사이드바 나무와
          하는 일이 똑같았다 — 폴더로 들어가기. 같은 것이 한 화면에 두 번 있으면 둘 다
          덜 믿게 된다. 이제 폴더는 **목록의 첫 줄들**로 내려가 자료와 한 목록이 된다
          (아래 `fRows`). 카드에만 있던 이름 바꾸기·삭제는 줄 끝 그 자리로 따라갔다. */}

      {/* 개수 줄은 **목록 위, 원래 자리**(2026-09-21 · 시안 개수줄 ㄴ). 한때 아래 쪽 막대로 내렸다가
          되돌렸다 — 팀 관리·사용자 관리가 모두 개수를 표 위에 두고 「페이지」라고 쓰는데 이 화면만
          아래에 「쪽」이라고 적으니 화면마다 찾는 자리와 말이 갈렸다. 튀던 것은 쪽 번호였고,
          그것은 번호만 바닥에 붙여 풀었다. */}
      <div className="lib-pager">
        <span className="lib-count">
          {searching
            ? <>조회 결과 <b>{total}</b>개</>
            : <>{subFolders.length ? `폴더 ${subFolders.length}개 · ` : ''}자료 {docTotal}개 · 전체 <b>{total}</b>개</>}
          {` · ${cur}/${pages} 페이지 · ${PAGE_SIZE}개씩`}
        </span>
      </div>

      <div className="lib-list" ref={listRef}>
        {loading ? (
          <div className="lib-empty">불러오는 중…</div>
        ) : openError ? (
          /* **여는 데 실패한 것은 목록 실패와 다르다**(2026-09-16). 서버가 멈췄을 때
             여기 「불러오는 중…」이 **영영** 서 있었다 — 여는 길에만 시간 제한이 없어서다.
             이제 그만두고 **무슨 일이 났는지** 적는다. 「다시」는 목록이 아니라
             **그 자료를** 다시 연다 — 사람이 하려던 일은 그것이었다. */
          <div className="lib-empty">
            {openError}
            <div style={{ marginTop: 12 }}>
              <button className="lib-btn dark"
                onClick={() => { if (openErrorId) void openProject(openErrorId) }}>다시</button>
            </div>
          </div>
        ) : listError ? (
          /* **「0개」와 「못 받아 왔다」를 갈라 말한다.** 실패를 빈 목록으로 그리면
             사람은 자료가 사라진 줄 알고, 다시 시도할 방법도 모른 채 새로고침만 한다.

             **다음 길도 `listError` 안에 함께 온다**(2026-09-16). 여기 「잠깐 끊겼을
             수 있어요」가 글자로 박혀 있었는데, 그건 못 닿았을 때나 맞는 말이라
             서버가 500 을 준 경우에도 그렇게 적혔다 — 화면이 거짓말을 한 셈이다.
             칸은 `white-space: pre-line` 이라 두 줄이 그대로 선다. */
          <div className="lib-empty">
            {listError}
            <div style={{ marginTop: 12 }}>
              <button className="lib-btn dark" onClick={() => void loadList()}>다시 시도</button>
            </div>
          </div>
        ) : total === 0 ? (
          <div className="lib-empty">{emptyMsg}</div>
        ) : asTable ? (
          /* ── 표 (⑤) ── 열 머리를 눌러 줄을 세운다. 서버는 안 건드린다 —
             목록은 이미 통째로 내려와 있고 쪽 나누기도 화면이 한다. */
          <table className="lib-tbl">
            <thead>
              <tr>
                {LIB_COLS.map((c) => (
                  <th key={c.key} className={sort.key === c.key ? 'sorted' : undefined}
                    style={c.key === 'name' ? undefined : { width: c.w }}
                    aria-sort={sort.key !== c.key ? 'none' : sort.dir === 'asc' ? 'ascending' : 'descending'}>
                    <button onClick={() => setSort(nextSort(sort, c.key))}
                      title={`${c.label}로 줄 세우기`}>
                      {c.label}
                      {sort.key === c.key ? <span className="dir">{sort.dir === 'asc' ? '▲' : '▼'}</span> : null}
                    </button>
                  </th>
                ))}
                <th style={{ width: 132 }} aria-label="도구" />
              </tr>
            </thead>
            <tbody>
              {/* **폴더가 먼저다.** 줄 세우기(`sort`)는 자료에만 건다 — 폴더에는
                  상태도 결재자도 낸 날도 없어서, 같이 세우면 무엇을 눌러도 폴더가
                  통째로 위나 아래로 몰린다. 그러면 「세웠다」가 아니라 「폴더가
                  왔다 갔다 한다」가 된다. 파인더도 탐색기도 폴더를 따로 둔다. */}
              {fRows.map((f) => (
                <tr key={'f:' + f.id} className="lib-frow">
                  <td>
                    <button className="lib-tname" title={`${f.name} 열기`}
                      onClick={() => goFolder(f.id)}>
                      <span className="lib-tico fol"><Folder className="h-4 w-4" /></span>
                      <span className="t">{fNameCell(f)}</span>
                      <span className="lib-fcount">
                        {f.folder_count ? `폴더 ${f.folder_count} · ` : ''}
                        자료 {countInSubtree(list, folders, f.id)}
                      </span>
                    </button>
                  </td>
                  <td><span className="lib-chip folder" style={{ marginLeft: 0 }}>폴더</span></td>
                  <td>{dim}</td>
                  <td>{dim}</td>
                  <td>{dim}</td>
                  <td>{dim}</td>
                  <td className="acts">{folderActs(f)}</td>
                </tr>
              ))}
              {shown.map((p) => {
                const c = chips[p.id]
                return (
                  <tr key={p.id} className={sel?.id === p.id || pick === p.id ? 'on' : undefined}>
                    <td>
                      {/* 2026-09-17 · 여기 주석이 「한 번 누르면 고른다 … 편집기로는 상세의
                          「열기」가 간다」였다. **그 세 걸음이 이번에 줄었다** — 제목을 두 번
                          누르면 바로 들어간다. 폴더는 한 번에 들어가는데 자료만 오른쪽 끝까지
                          마우스를 옮겨야 했고, 같은 표에서 규칙이 둘이면 손이 걸린다.
                          사이드바 나무에서 이름을 누르면 여전히 바로 열린다(거기는 「가는 길」). */}
                      {/* **아이콘과 제목이 하는 일이 다르다**(시안 v1.0):
                          📖 는 상세(결재 이력·의견), 제목 두 번은 들어가기.
                          단추 안에 단추는 못 넣으므로 바깥을 div 로 둔다. */}
                      <div className="lib-tname">
                        <button className="lib-tico" title="이 자료 살펴보기 (결재 이력 · 의견)"
                          onClick={(e) => { e.stopPropagation(); setPick(p.id); setSel(p) }}><BookOpen className="h-4 w-4" /></button>
                        {/* **한 번은 고르기, 두 번은 들어가기.** 한 번에 상세까지 열면
                            두 번 누르려고 멈춘 사람에게 패널이 깜빡인다. */}
                        <button className="lib-tname-hit" title="두 번 눌러 열기"
                          onClick={() => setPick(p.id)}
                          onDoubleClick={() => { if (editing?.id !== p.id) openOrExplain(p) }}>
                          <span className="t">{nameCell(p)}</span>
                        </button>
                        {/* 잠긴 자료는 **왜 안 고쳐지는지** 목록에서 바로 보인다. */}
                        {c?.locked ? (
                          <span className="lib-lock" title="결재 중이거나 승인된 자료라 잠겨 있어요">
                            <Lock className="h-3 w-3" />
                          </span>
                        ) : null}
                      </div>
                    </td>
                    {/* **파생 상태를 그린다**(P7). 상태를 짜맞추는 일은 서버가 한다.
                        칩이 아예 없으면 **결재 이력이 하나도 없다**는 뜻이고, 그건
                        「자료가 없다(—)」가 아니라 **초안**이다. 여기서만 「—」로 두면
                        새로 만든 자료가 전부 「모름」처럼 보인다. */}
                    <td>{c ? (
                      <span className={'lib-chip ' + c.state} style={{ marginLeft: 0 }}>
                        {LIB_STATE_LABEL[c.state]}{c.round > 1 ? ` ${c.round}회차` : ''}
                      </span>
                    ) : (
                      <span className="lib-chip draft" style={{ marginLeft: 0 }}>{LIB_STATE_LABEL.draft}</span>
                    )}</td>
                    <td title={c?.approver_name || ''}>{c?.approver_name || dim}</td>
                    <td>{c?.created_at ? fmtKst(c.created_at) : dim}</td>
                    <td>{fmtKst(p.updated_at)}</td>
                    <td>{p.published_id
                      ? <span className="lib-chip approved" style={{ marginLeft: 0 }}>발행됨</span>
                      : dim}</td>
                    <td className="acts">{actionsFor(p)}</td>
                  </tr>
                )
              })}
              {/* 폴더는 있는데 자료가 없을 때. 목록이 통째로 비는 것이 아니므로
                  큰 빈 화면 대신 **줄 하나**로 말한다. */}
              {docTotal === 0 && cur === pages && (
                <tr className="lib-trempty">
                  <td colSpan={LIB_COLS.length + 1}>{emptyMsg}</td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          /* 칸이 좁으면 줄 목록으로 내려간다 — 여섯 열을 우겨 넣으면 제목이 두 글자만 남는다.
             **여기서도 폴더가 먼저다.** 표와 줄 목록이 차례가 다르면 창 크기를 바꿨을 뿐인데
             목록이 뒤바뀐 것처럼 보인다. */
          <>
          {fRows.map((f) => (
            <div key={'f:' + f.id} className="lib-card lib-fline">
              <button className="lib-open-hit" title={`${f.name} 열기`} onClick={() => goFolder(f.id)}>
                <div className="lib-ico fol"><Folder className="h-5 w-5" /></div>
                <div className="lib-meta">
                  <div className="lib-name">{fNameCell(f)}</div>
                  <div className="lib-sub">
                    폴더
                    {f.folder_count ? ` · 폴더 ${f.folder_count}` : ''}
                    {' · 자료 '}{countInSubtree(list, folders, f.id)}
                  </div>
                </div>
              </button>
              {folderActs(f)}
            </div>
          ))}
          {shown.map((p) => (
            <div key={p.id} className={'lib-card' + (sel?.id === p.id || pick === p.id ? ' on' : '')}>
              {/* **표와 같은 규칙이다**(시안 v1.0). 창이 822px 아래로 내려가면 표가
                  이 카드로 바뀌는데, 여기만 빼 두면 **창을 좁힌 순간 더블클릭이 사라진다** —
                  쓰는 사람은 「아까는 됐는데」가 되고 까닭을 못 찾는다. */}
              <button className="lib-ico-hit" title="이 자료 살펴보기 (결재 이력 · 의견)"
                onClick={(e) => { e.stopPropagation(); setPick(p.id); setSel(p) }}>
                <div className="lib-ico"><BookOpen className="h-5 w-5" /></div>
              </button>
              <button className="lib-open-hit" title="두 번 눌러 열기"
                onClick={() => setPick(p.id)}
                onDoubleClick={() => { if (editing?.id !== p.id) openOrExplain(p) }}>
                <div className="lib-meta">
                  <div className="lib-name">{nameCell(p)}</div>
                  <div className="lib-sub">
                    {fmtKst(p.updated_at)} · {p.page_count}페이지{p.published_id ? ' · 발행됨' : ''}
                    {chips[p.id] && DOC_STATE_LABEL[chips[p.id].state] && (
                      <span className={'lib-chip ' + chips[p.id].state}>
                        {DOC_STATE_LABEL[chips[p.id].state]}
                        {chips[p.id].round > 1 ? ` ${chips[p.id].round}회차` : ''}
                      </span>
                    )}
                    {chips[p.id]?.locked && (
                      <span className="lib-lock" title="결재 중이거나 승인된 자료라 잠겨 있어요">
                        <Lock className="h-3 w-3" /> 잠김
                      </span>
                    )}
                  </div>
                </div>
              </button>
              {actionsFor(p)}
            </div>
          ))}
          {docTotal === 0 && cur === pages && <div className="lib-empty">{emptyMsg}</div>}
          </>
        )}
      </div>

      {/* 쪽 막대 — **늘 화면 맨 아래, 늘 같은 자리**(2026-09-21 · ②ㄱ ③ㄱ).
          전에는 목록 바로 밑에 흘러가며 놓여서 쪽마다 높이가 달랐고(1쪽 13줄 → 2쪽 1줄이면
          번호가 360px 위로 튀었다), 1쪽뿐이면 아예 사라졌다. 이제 목록 칸이 남은 높이를 채우고
          막대는 그 아래 바닥에 붙는다(.lib-list flex · .lib-pagebar sticky). 1쪽뿐이어도 「1」과
          흐린 ‹ › 가 남는다 — 자리가 변하지 않는 것이 이 막대의 일이다. 막대에는 **번호만** 있다 —
          개수는 목록 위 개수 줄이 말한다(개수줄 ㄴ).

          쪽 번호는 **이어진 다섯 칸**(D25). 「1 … 7 8 9 … 20」을 쓰지 않는다:
          「…」은 눌러도 어디로 가는지 모르는 자리다. */}
      <div className="lib-pagebar">
        <span className="lib-pages">
          <button className="lib-pg" disabled={cur <= 1} onClick={() => setPage(cur - 1)}
            aria-label="이전 페이지"><ChevronLeft className="h-4 w-4" /></button>
          {pageWindow(cur, pages).map((n) => (
            <button key={n} className={'lib-pg' + (n === cur ? ' on' : '')}
              aria-current={n === cur ? 'page' : undefined}
              onClick={() => setPage(n)}>{n}</button>
          ))}
          <button className="lib-pg" disabled={cur >= pages} onClick={() => setPage(cur + 1)}
            aria-label="다음 페이지"><ChevronRight className="h-4 w-4" /></button>
        </span>
      </div>

      {/* 폴더 삭제 — **빈 폴더만**(D20). 서버가 막지만 화면이 먼저 말해 준다. */}
      {fPendingDel && (
        <Modal title="폴더 삭제" onClose={() => setFPendingDel(null)} size="sm" busy={busy}
          scrimClassName="lib-confirm" className="lib-confirm-box"
          footClassName="lib-confirm-actions"
          cancel={{ label: '취소', onClick: () => setFPendingDel(null) }}
          footer={<>
            {/* **여기만 반대였다.** 응답 전에 창을 먼저 닫아서 두 번 눌릴 일은 없었지만,
                그래서 실패하면 창이 사라진 뒤에 저 위 목록 옆에서 이유가 떴다 —
                방금 누른 자리가 아닌 곳에서. 나머지 셋과 같은 모양으로 맞췄다. */}
            {!fPendingDel.folder_count && !fPendingDel.project_count && (
              <button className="lib-btn danger" disabled={busy} onClick={() => {
                if (busy) return
                const f = fPendingDel
                setBusy(true)
                void (async () => {
                  try { if (await fAct(() => apiDeleteFolder(f.id))) setFPendingDel(null) }
                  finally { setBusy(false) }
                })()
              }}>{busy ? '지우는 중…' : '지우기'}</button>
            )}
          </>}>
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
            <><b>{fPendingDel.name}</b> 폴더를 지웁니다. 비어 있어 잃는 자료는 없지만,
              <b> 되돌릴 수 없습니다.</b></>
          )}
          {fErr && <div style={{ color: '#b4232a', marginTop: 10 }}>{fErr}</div>}
        </Modal>
      )}

      {/* 새 이북은 **지금 보고 있는 폴더**에 만든다 —
          만들고 나서 옮기게 하면 사람은 매번 두 번 일한다(만들기 → 찾기 → 옮기기). */}
      {/* **덮개가 아니라 화면이 됐다**(셸, 2026-09-10). 여기서 띄우던 결재함·팀 공유는
          이제 왼쪽 메뉴에 자기 자리가 있다 — 편집 중에도 갈 수 있고, 주소도 남는다.
          뷰어에서 「팀 공유 열기」로 돌아오는 길(?shared=1)은 위에서 그 화면으로 보낸다. */}

      {/* **왜 못 여는지 말하고, 다음에 누를 곳까지 짚는다**(2026-09-17 · 시안 v1.0).
          까닭만 말하고 끝내면 「그래서 어디를 누르라고」가 남는다.

          **두 경우의 다음 길이 다르다.** 코드를 확인하다 알았다 —
          `doc_state.can_request_revision` 은 **승인됨일 때만** 참이다. 결재 중에는
          수정 요청을 낼 수 없고 줄에 그 단추도 없다. 그런데 상세 패널은 결재 중일 때도
          「수정 요청을 내세요」라고 말하고 있었다(같이 고쳤다). 결재 중에 고치는 길은
          **결재함에서 회수**다. 줄에 짚을 것이 없으므로 여기서 데려다준다. */}
      {lockInfo && (
        <Modal title="열 수 없는 자료입니다" onClose={() => setLockInfo(null)} size="sm"
          cancel={{
            label: '알겠어요',
            onClick: () => {
              const id = lockInfo.id
              const pending = chips[id]?.state === 'pending'
              setLockInfo(null)
              if (!pending) setPointAt(id)   // 결재 중은 줄에 짚을 것이 없다
            },
          }}
          footer={chips[lockInfo.id]?.state === 'pending' ? (
            <button className="lib-btn dark"
              onClick={() => { setLockInfo(null); go('inbox') }}>결재함으로 가기</button>
          ) : undefined}>
          {chips[lockInfo.id]?.state === 'pending' ? (
            <>🔒 <b>결재 중이라 잠겨 있어요.</b><br />
              고치려면 <b>결재함</b>에서 먼저 <b>회수</b>하세요 — 결재 중에는 수정 요청을 낼 수 없습니다.</>
          ) : (
            <>🔒 <b>승인된 자료라 잠겨 있어요.</b><br />
              고치려면 「수정 요청」을 내세요 — 닫으면 그 자리를 가리켜 드릴게요.</>
          )}
        </Modal>
      )}

      {/* 제출 — **낸 순간 문서가 얼어붙는다.** 뒤에 고쳐도 결재본은 안 바뀐다. */}
      {submitting && (
        <Modal title="결재 제출" onClose={() => setSubmitting(null)} size="sm" busy={busy}
          scrimClassName="lib-confirm" className="lib-confirm-box"
          footClassName="lib-confirm-actions"
          cancel={{ label: '취소', onClick: () => setSubmitting(null) }}
          footer={<>
            <button className="lib-btn dark" disabled={busy} onClick={() => {
              if (busy) return
              const target = submitting
              setAErr(''); setBusy(true)
              void (async () => {
                try {
                  await apiRequestApproval(target.id, submitMsg.trim())
                  setSubmitting(null); await loadChips()
                } catch (e) {
                  setAErr(e instanceof ApprovalApiError ? e.message : '제출하지 못했습니다.')
                } finally { setBusy(false) }
              })()
            }}>{busy ? '제출 중…' : '제출'}</button>
          </>}>
          <b>{submitting.name || '제목 없음'}</b> 을(를) 관리자에게 제출합니다.
          <br /><br />
          <b>지금 이 문서가 그대로 얼어붙습니다.</b> 제출한 뒤에 고쳐도 결재본은 바뀌지 않습니다.
          <br />
          한 번이라도 제출하면 <b>이 자료는 지울 수 없습니다.</b>
          {aErr && <div style={{ color: '#b4232a', marginTop: 10 }}>{aErr}</div>}
          <input className="lib-mkin" value={submitMsg} placeholder="전달할 말 (선택)"
            onChange={(e) => setSubmitMsg(e.target.value)} />
        </Modal>
      )}

      {/* 수정 요청 — **아무것도 안 얼린다.** 제출과 헷갈리지 않게 그렇게 말한다. */}
      {revising && (
        <Modal title="수정 요청" onClose={() => setRevising(null)} size="sm" busy={busy}
          scrimClassName="lib-confirm" className="lib-confirm-box"
          footClassName="lib-confirm-actions"
          cancel={{ label: '취소', onClick: () => setRevising(null) }}
          footer={<>
            <button className="lib-btn dark" disabled={busy} onClick={() => {
              if (busy) return
              const target = revising
              setAErr(''); setBusy(true)
              void (async () => {
                try {
                  await apiRequestRevision(target.id, reviseMsg.trim())
                  setRevising(null); await loadChips()
                } catch (e) {
                  setAErr(e instanceof ApprovalApiError ? e.message : '요청하지 못했습니다.')
                } finally { setBusy(false) }
              })()
            }}>{busy ? '요청 중…' : '요청'}</button>
          </>}>
          <b>{revising.name || '제목 없음'}</b> 을(를) 고칠 수 있게 해 달라고 요청합니다.
          <br /><br />
          <b>팀이 보는 화면은 지금 그대로입니다.</b> 허락이 나도 승인본은 안 바뀌고,
          고쳐서 <b>다시 승인을 받아야</b> 교체됩니다.
          <br />
          허락이 날 때까지는 아직 고칠 수 없습니다.
          {aErr && <div style={{ color: '#b4232a', marginTop: 10 }}>{aErr}</div>}
          <input className="lib-mkin" value={reviseMsg} placeholder="무엇을 고칠지 (선택)"
            onChange={(e) => setReviseMsg(e.target.value)} />
        </Modal>
      )}

      {picking && (
        <NewProjectDialog
          onClose={() => setPicking(false)}
          onBlank={() => newProject(here)}
          onTemplate={(ym) => newFromTemplate(ym, here)}
          canTemplate={canSubmit}
        />
      )}

      {/* 이북 삭제 — **되돌릴 수 없다.** 그 말을 색이 아니라 글로 적는다. */}
      {pendingDel && (
        <Modal title="이북 삭제" onClose={() => { setPendingDel(null); setDelErr('') }} size="sm" busy={busy}
          scrimClassName="lib-confirm" className="lib-confirm-box"
          footClassName="lib-confirm-actions"
          cancel={{ label: '취소', onClick: () => { setPendingDel(null); setDelErr('') } }}
          footer={<>
            <button className="lib-c-ok danger" disabled={busy}
              onClick={() => void confirmDelete()}>{busy ? '삭제 중…' : '삭제'}</button>
          </>}>
          ‘{pendingDel.name || '제목 없음'}’ 이북을 삭제할까요?<br />
          이 이북의 모든 슬라이드와 버전 기록이 함께 삭제되며 <b>되돌릴 수 없어요.</b>
          {delErr && <div className="lib-delerr">{delErr}</div>}
        </Modal>
      )}
    </div>

      {/* ── 상세 칸 (②③④) ─────────────────────────────────────────
          고른 자료를 **읽는** 자리다. 고치는 자리가 아니다 — 결재 때문에 제출 시점에
          얼어붙은 사본이 따로 있어서, 보는 것과 고치는 것이 같은 칸이면 안 된다.
          첫 장 미리보기는 뺐고(③), 그래서 편집기로 가는 길은 **「열기」 단추**다(④). */}
      {sel && (
        <aside className="lib-detail" aria-label="고른 자료">
          <div className="lib-d-head">
            <span className="nm" title={sel.name || '제목 없음'}>{sel.name || '제목 없음'}</span>
            <button className="lib-d-x" onClick={() => setSel(null)} aria-label="닫기" title="닫기">✕</button>
          </div>
          <div className="lib-d-body">
            <div className="lib-d-sec">
              <div className="lib-d-h">속성</div>
              <dl className="lib-d-props">
                <dt>상태</dt>
                <dd><span className={'lib-chip ' + (selChip?.state || 'draft')} style={{ marginLeft: 0 }}>
                  {LIB_STATE_LABEL[selChip?.state || 'draft']}
                  {selChip && selChip.round > 1 ? ` ${selChip.round}회차` : ''}
                </span></dd>
                <dt>폴더</dt><dd title={folderPathOf(sel.folder_id)}>{folderPathOf(sel.folder_id)}</dd>
                <dt>결재자</dt><dd>{selChip?.approver_name || dim}</dd>
                <dt>낸 날</dt><dd>{selChip?.created_at ? fmtKst(selChip.created_at) : dim}</dd>
                <dt>수정</dt><dd>{fmtKst(sel.updated_at)}</dd>
                <dt>쪽수</dt><dd>{sel.page_count}쪽</dd>
                <dt>발행</dt><dd>{sel.published_id
                  ? <SiblingLink quiet url={folioBookUrl(sel.published_id)} probeUrl={FOLIO_URL}
                      name="EVER-FOLIO" host={FOLIO_HOST}>발행본 보기 ↗</SiblingLink>
                  : dim}</dd>
              </dl>
            </div>

            {/* **최근 3줄만**(③). 회차가 쌓이면 이력만으로 칸이 찬다 —
                전부 보는 곳은 결재함이고, 그 길은 아래 한 줄이 맡는다. */}
            {histEvents.length > 0 && (
              <div className="lib-d-sec">
                <div className="lib-d-h">결재 이력</div>
                <div className="lib-d-hist">
                  {histEvents.slice(0, 3).map((e, i) => (
                    <div key={i}>
                      <span className="w">{fmtKst(e.t)}</span>
                      <span>{e.who} {e.what}{e.round > 1 ? ` (${e.round}회차)` : ''}</span>
                    </div>
                  ))}
                </div>
                {histEvents.length > 3 && (
                  <div className="lib-d-more">그 앞으로 {histEvents.length - 3}건 더 있어요</div>
                )}
              </div>
            )}

            {/* **의견은 숫자 한 줄이다**(③). 결재함에는 쪽별 의견까지 갈려 있고
                「관리자와 낸 사람만 본다」는 규칙이 붙어 있다. 여기 입력칸을 또 두면
                같은 대화가 두 곳에 생기고 규칙도 두 벌이 된다. */}
            {selRows.length > 0 && (
              <button className="lib-d-cmt" onClick={() => go('inbox')}>
                <span>의견 {selRows.reduce((n, a2) => n + (a2.comment_count || 0), 0)}</span>
                <span className="go">결재함에서 보기 →</span>
              </button>
            )}

            <div className="lib-d-acts">
              {/* 잠긴 자료는 **왜 안 열리는지** 그 자리에서 말한다. 「열기」가 유일한
                  길이므로, 눌러 보고 알게 두면 고장으로 읽힌다. */}
              <button className="lib-btn dark" disabled={!!selChip?.locked}
                onClick={() => { if (!selChip?.locked) void openProject(sel.id) }}>열기</button>
              {actionsFor(sel)}
              {selChip?.locked && (
                <div className="lib-d-lock">
                  {/* **결재 중에는 수정 요청을 못 낸다**(2026-09-17 발견).
                      `doc_state.can_request_revision` 은 승인됨일 때만 참인데, 여기는
                      두 경우에 같은 말을 하고 있었다 — 시킨 대로 하려 해도 **누를 것이 없다.** */}
                  {selChip.state === 'pending'
                    ? <>🔒 결재 중이라 잠겨 있어요 — 고치려면 결재함에서 <b>회수</b>하세요.</>
                    : <>🔒 승인된 자료라 잠겨 있어요 — 고치려면 「수정 요청」을 내세요.</>}
                </div>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}
