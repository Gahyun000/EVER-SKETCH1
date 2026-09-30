import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { ApiError, ROLE_LABEL, apiListUsers, type Me } from '../auth/authApi'
import {
  apiAddMember, apiCreateTeam, apiDeleteTeam, apiListTeams, apiRemoveMember, apiRenameTeam,
} from './teamsApi'
import {
  PAGE_SIZE, SEL_ALL, SEL_NONE, addCandidates, highlight, moveMessage, normalizeQuery, sideList, teamView,
  type SideItem, type Team, type TeamSel, type TeamUser,
} from './teamModel'
import { clampMaster } from '../ui/masterSplit'
import { masterWidth, rememberMasterWidth } from '../persistence/prefs'
import Modal from '../ui/Modal'

/**
 * 팀 편성 — L1 전용. 화면 설계 **SCR-TEAM-01**.
 *
 * **마스터·디테일로 바꿨다**(2026-09-21, 시안 `docs/화면시안_팀관리_마스터디테일_v1.0.html`).
 * 예전(시안 v2.3, 2026-09-04)에는 한 표에 팀 줄과 사람 줄을 섞어 그렸다. 두 가지가 걸렸다 —
 *   ① 「＋ 새 팀」이 머리 왼쪽 구석의 흰 단추라 잘 안 띄었고, 입력은 표 **밖** 위에서 하는데
 *      만든 팀은 표 **안** 어딘가에 생겨 눈이 두 자리를 오갔다.
 *   ② 팀 줄의 인원 배지가 권한 칸에 걸쳐 앉아 열이 어긋났다.
 * 이제 왼쪽이 **팀 목록**(맨 위에 늘 열린 새 팀 입력칸), 오른쪽이 **고른 팀의 팀원 표**다.
 * 표에는 사람 줄만 있고, 팀 일(이름 변경·삭제·팀원 넣기)은 오른쪽 머리로 올라갔다.
 * 뼈대는 결재함·팀 공유와 같은 것(`md-screen`·`ap-body`·`md-grip`)을 쓴다 — 목록 폭도
 * 같은 규칙으로 끌어 맞추고 브라우저가 기억한다.
 *
 * 그대로 이어지는 규칙
 *   · **날짜 칸 없음** — 표준 267행은 「행 클릭으로 상세 진입」 조회 화면을 말한다.
 *     261행의 검색조건 · 조회 · 페이지 이동 · 로딩 · 빈값 · 오류는 전부 갖췄다.
 *   · **미배정을 먼저 본다** — 「전체」에서 미배정이 맨 위고, 왼쪽 「팀 미배정」은 1명
 *     이상이면 주황 배지로 알린다. 팀이 없는 L3 은 빈 화면을 보고, L2 는 공유가 안 된다.
 *   · **조작 두 칸** — A칸 팀 고르기, B칸 넣기/옮기기/빼기. 세로줄이 안 어긋난다.
 *   · **색만으로 말하지 않는다** — 글자가 먼저, 색은 거든다.
 */
/** `embedded` — 셸 안의 화면으로 그린다(2026-09-10). 아니면 덮개 + 「닫기」. */
export default function TeamsAdmin({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const [teams, setTeams] = useState<Team[]>([])
  const [users, setUsers] = useState<Me[]>([])
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  // 왼쪽에서 고른 것 — 처음엔 「전체」(미배정이 맨 위에 보인다).
  const [sel, setSel] = useState<TeamSel>(SEL_ALL)
  const [fresh, setFresh] = useState('')

  // 조회 — **「조회」를 눌러야** 걸린다(표준). 「내 자료」 화면과 손놀림을 맞춘다.
  const [qIn, setQIn] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  const [mkName, setMkName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null)
  const [pick, setPick] = useState<Record<string, string>>({})

  // 목록 칸 폭 — 결재함·팀 공유와 같은 손잡이, 같은 기억 방식(키만 다르다).
  const [mw, setMw] = useState(() => masterWidth('tm'))
  const [dragging, setDragging] = useState(false)
  const gripRef = useRef(0)
  const onGrip = (e: React.PointerEvent) => {
    e.preventDefault()
    setDragging(true)
    const startX = e.clientX, startW = mw
    gripRef.current = startW
    const move = (ev: PointerEvent) => { const w = clampMaster(startW + (ev.clientX - startX)); gripRef.current = w; setMw(w) }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setDragging(false); rememberMasterWidth('tm', gripRef.current)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const load = async () => {
    setErr('')
    try {
      const [t, u] = await Promise.all([apiListTeams(), apiListUsers()])
      setTeams(t); setUsers(u); setPhase('ready')
      // 고르던 팀이 사라졌으면(지웠다 · 다른 창에서 지웠다) 「전체」로 — 없는 팀을 고른 척하지 않는다.
      // **받아 온 목록으로** 판단한다. 화면 상태로 판단하면 방금 만든 팀을 고른 순간
      // (아직 목록을 다시 받기 전) 「없는 팀」으로 보고 「전체」로 튕긴다(2026-09-21 스모크에서 잡힘).
      setSel((s) => (s === SEL_ALL || s === SEL_NONE || t.some((x) => x.id === s) ? s : SEL_ALL))
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '팀 목록을 불러오지 못했습니다.')
      setPhase('error')
    }
  }
  useEffect(() => { void load() }, [])

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('')
    try { await fn(); await load() } catch (e) {
      setErr(e instanceof ApiError ? e.message : '처리하지 못했습니다.')
    } finally { setBusy(false) }
  }

  const tu = users as unknown as TeamUser[]
  const side = useMemo(() => sideList(tu, teams), [tu, teams])
  const selTeam = teams.find((t) => t.id === sel) || null
  const isTeam = !!selTeam

  const view = useMemo(() => teamView(tu, teams, sel, q, page, PAGE_SIZE), [tu, teams, sel, q, page])
  const candidates = useMemo(() => (isTeam ? addCandidates(tu, teams, sel) : []), [tu, teams, sel, isTeam])

  const choose = (k: TeamSel) => {
    if (k === sel) return
    setSel(k); setPage(1); setQIn(''); setQ(''); setRenaming(null); setPick({}); setNote('')
  }
  const applySearch = () => { setQ(normalizeQuery(qIn)); setPage(1); setNote('') }
  const resetSearch = () => { setQIn(''); setQ(''); setPage(1); setNote('') }

  const mkDup = teams.some((t) => t.name === mkName.trim())
  const create = () => {
    const name = mkName.trim()
    if (!name || mkDup || busy) return
    void act(async () => {
      const t = await apiCreateTeam(name)
      setMkName(''); setSel(t.id); setFresh(t.id); setPage(1); setQIn(''); setQ('')
      setNote(`${name} 팀을 만들었습니다. 오른쪽 위 「＋ 팀원 넣기」로 사람을 넣으세요.`)
    })
  }
  const saveRename = () => {
    if (!selTeam || !renaming) return
    const name = renaming.trim()
    if (!name || name === selTeam.name) { setRenaming(null); return }
    void act(async () => { await apiRenameTeam(selTeam.id, name); setRenaming(null) })
  }

  /** 걸린 글자만 노랗게 — 왜 이 줄이 걸렸는지 글자로 알려준다. */
  const mark = (text: string) => {
    const h = highlight(text, q)
    if (!h) return text
    return <>{h.before}<span className="tm-mark">{h.match}</span>{h.after}</>
  }

  /** 팀에서 빼기 — 드롭다운의 한 줄로 둔다. 버튼을 하나 더 두면 두 칸 구조가 깨진다. */
  const OUT = '__out__'

  const apply = (u: TeamUser, cur: { id: string; name: string } | null, target: string) => {
    if (target === OUT) {
      if (!cur) return
      void act(async () => {
        await apiRemoveMember(cur.id, u.id)
        setNote(`${u.name} 님을 ${cur.name}에서 뺐습니다. 「팀 미배정」으로 갑니다.`)
        setPick((p) => ({ ...p, [u.id]: '' }))
      })
      return
    }
    const team = teams.find((t) => t.id === target)
    if (!team) return
    void act(async () => {
      const moved = await apiAddMember(target, u.id)
      setNote(moveMessage(u.name, team.name, moved))
      setPick((p) => ({ ...p, [u.id]: '' }))
    })
  }

  /** 조작 두 칸 — A칸에 팀 고르기, B칸에 넣기/옮기기/빼기. */
  const assign = (u: TeamUser, cur: { id: string; name: string } | null) => {
    const sel2 = pick[u.id] || ''
    // 버튼 글자는 **고른 것**을 따라간다 — 무슨 일이 벌어질지 누르기 전에 말해준다.
    const label = sel2 === OUT ? '빼기' : cur ? '옮기기' : '넣기'
    return (
      <span className="tm-assign">
        <span className="tm-a">
          <select value={sel2} disabled={busy} aria-label={`${u.name} 팀 배정`}
            onChange={(e) => setPick({ ...pick, [u.id]: e.target.value })}>
            {/* 「전체」에서는 이 사람이 **지금 어느 팀인지**가 첫 줄이다 — 따로 칸을 두지 않는다. */}
            <option value="">{sel === SEL_ALL ? (cur ? cur.name : '미배정') : '팀 선택'}</option>
            {side.teams.map((t) => (
              <option key={t.key} value={t.key} disabled={cur?.id === t.key}>{t.name}</option>
            ))}
            {cur && <option value={OUT}>팀에서 빼기</option>}
          </select>
        </span>
        <span className="tm-b">
          <button className={'es-mini' + (sel2 ? (sel2 === OUT ? ' danger' : ' primary') : '')}
            disabled={busy || !sel2} onClick={() => apply(u, cur, sel2)}>{label}</button>
        </span>
      </span>
    )
  }

  const item = (s: SideItem, cls = '') => (
    <button key={s.key} className={'ap-item tm-item ' + cls + (sel === s.key ? ' on' : '') + (fresh === s.key ? ' tm-fresh' : '')}
      onClick={() => choose(s.key)} onAnimationEnd={() => setFresh('')} aria-current={sel === s.key ? 'true' : undefined}>
      <span className="ap-item-top">
        <span className="ap-item-name">{s.name}</span>
        <span className={'es-badge tm-n' + (s.key === SEL_NONE && s.count > 0 ? ' warn' : '')}>{s.count}</span>
      </span>
    </button>
  )

  const title = sel === SEL_ALL ? '전체' : sel === SEL_NONE ? '팀 미배정' : selTeam?.name || ''

  const body = () => {
    if (phase === 'loading') return <div className="es-empty"><span className="tm-spin" />불러오는 중…</div>
    if (phase === 'error') return (
      <div className="es-empty">
        <b style={{ color: '#b4232a' }}>{err || '팀 목록을 불러오지 못했습니다.'}</b><br />
        <button className="es-mini" style={{ marginTop: 10 }} onClick={() => { setPhase('loading'); void load() }}>
          다시 시도
        </button>
      </div>
    )
    if (!view.rows.length) {
      // 없는 까닭을 갈라 말한다 — 같은 문구면 무엇을 해야 할지 모른다.
      if (q) return (
        <div className="es-empty">
          「{q}」 로 찾는 결과가 없습니다.<br />
          <button className="es-mini" style={{ marginTop: 10 }} onClick={resetSearch}>조건 초기화</button>
        </div>
      )
      if (isTeam) return (
        <div className="es-empty tm-empty-team">
          <b>아직 팀원이 없습니다.</b><br />
          오른쪽 위 <b>「＋ 팀원 넣기」</b>로 사람을 골라 넣으세요. 다른 팀에 있던 사람은 이 팀으로 옮겨집니다.
        </div>
      )
      if (sel === SEL_NONE) return <div className="es-empty">팀에 속하지 않은 사람이 없습니다.</div>
      return (
        <div className="es-empty">
          아직 팀도 편성할 사람도 없습니다.<br />
          <span style={{ fontSize: 12 }}>「사용자 관리」에서 가입을 먼저 승인해 주세요.</span>
        </div>
      )
    }
    return (
      <table className="tm-table">
        <colgroup>
          <col style={{ width: '36%' }} /><col style={{ width: '20%' }} /><col style={{ width: '44%' }} />
        </colgroup>
        <thead><tr><th>이름 · 부서</th><th>권한</th><th>팀 배정</th></tr></thead>
        <tbody>
          {view.rows.map(({ user: u, team }) => (
            <tr key={u.id}>
              <td><span className="tm-who">{mark(u.name)}</span>
                {u.dept && <span className="tm-dept">{mark(u.dept)}</span>}</td>
              <td className="tm-lv">{ROLE_LABEL[u.role]}</td>
              <td>{assign(u, team)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  const screen = (
    <div className={(embedded ? 'sh-page' : 'es-card wide tm-card') + ' tm md-screen' + (dragging ? ' md-drag' : '')}
      onClick={embedded ? undefined : (e) => e.stopPropagation()}>
      <div className="md-top">
        <div className="adm-head">
          <div className="es-brand"><b>팀 관리</b><span>관리자 전용</span></div>
          <p className="es-lede">
            팀이 곧 <b>공유 범위</b>입니다. 승인된 자료는 같은 팀에게만 보입니다.
          </p>
          {!embedded && <button className="es-mini adm-right" onClick={onClose}>닫기</button>}
        </div>
        {err && phase === 'ready' && <div className="es-msg err">{err}</div>}
        {note && !err && <div className="es-msg">{note}</div>}
      </div>

      <div className="ap-body md-body" style={{ gridTemplateColumns: mw + 'px auto 1fr' }}>
        {/* ── 왼쪽: 팀 목록. 맨 위에 새 팀 입력칸이 **늘 열려** 있다 — 단추를 찾을 일이 없다. ── */}
        <div className="ap-list tm-side">
          <div className="tm-side-h">팀 <span>{teams.length}개</span></div>
          <div className="tm-add">
            <Plus className="h-4 w-4" />
            <input value={mkName} maxLength={30} placeholder="새 팀 이름 — 치고 Enter" aria-label="새 팀 이름"
              disabled={phase !== 'ready'}
              onChange={(e) => setMkName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') create()
                if (e.key === 'Escape') setMkName('')
              }} />
            <button className="es-mini primary" disabled={busy || !mkName.trim() || mkDup} onClick={create}>만들기</button>
          </div>
          <div className="tm-mkerr" role="status">{mkDup ? '이미 있는 팀 이름입니다.' : ''}</div>

          {phase === 'ready' && <>
            {item(side.all, 'tm-sys')}
            <div className="tm-sep" />
            {side.teams.map((s) => item(s))}
            {side.teams.length > 0 && <div className="tm-sep" />}
            {item(side.none, 'tm-sys')}
          </>}
        </div>

        <div className="md-grip" onPointerDown={onGrip}
          title="끌어서 목록 칸 폭을 바꿉니다" aria-hidden="true" />

        {/* ── 오른쪽: 고른 팀 ── */}
        <div className="ap-detail tm-detail">
          <div className="tm-d-head">
            {isTeam && renaming !== null ? (
              <input className="tm-rename" value={renaming} autoFocus maxLength={30} disabled={busy}
                aria-label="팀 이름"
                onChange={(e) => setRenaming(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(null) }} />
            ) : <b className="tm-d-name">{title}</b>}
            <span className="tm-d-meta">{sel === SEL_ALL ? '편성 대상' : '팀원'} {view.count}명</span>
            {isTeam && selTeam && (
              <span className="tm-d-act">
                <select className="tm-addm" value="" disabled={busy || !candidates.length} aria-label="팀원 넣기"
                  onChange={(e) => {
                    const u = candidates.find((c) => c.user.id === e.target.value)
                    if (u) apply(u.user, u.team, selTeam.id)
                  }}>
                  <option value="">＋ 팀원 넣기</option>
                  {candidates.map(({ user: u, team }) => (
                    <option key={u.id} value={u.id}>{u.name} · {team ? team.name : '미배정'}</option>
                  ))}
                </select>
                {renaming !== null ? <>
                  <button className="es-mini primary" disabled={busy || !renaming.trim()} onClick={saveRename}>저장</button>
                  <button className="es-mini" onClick={() => setRenaming(null)}>취소</button>
                </> : (
                  <button className="es-mini" disabled={busy} onClick={() => setRenaming(selTeam.name)}>이름 변경</button>
                )}
                <button className="es-mini danger" disabled={busy || view.count > 0}
                  title={view.count > 0 ? `팀원 ${view.count}명이 남아 있습니다. 먼저 팀원을 옮겨 주세요.` : ''}
                  onClick={() => setConfirmDelete({ id: selTeam.id, name: selTeam.name })}>팀 삭제</button>
              </span>
            )}
          </div>

          <div className="adm-srch">
            <span className="adm-qbox">
              <Search className="h-4 w-4" />
              <input value={qIn} placeholder={sel === SEL_ALL ? '이름 · 부서 · 팀 이름' : '이름 · 부서'} aria-label="검색어"
                onChange={(e) => setQIn(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applySearch() }} />
            </span>
            <button className="adm-sbtn dark" disabled={phase !== 'ready'} onClick={applySearch}>조회</button>
            <button className="adm-sbtn" disabled={phase !== 'ready'} onClick={resetSearch}>초기화</button>
          </div>

          <div className="adm-pager">
            <span>
              {phase !== 'ready' ? ' ' : q
                ? <>조회 결과 <b>{view.total}</b>명 · {view.page}/{view.totalPages} 페이지 · {PAGE_SIZE}명씩</>
                : <>전체 <b>{view.total}</b>명 · {view.page}/{view.totalPages} 페이지 · {PAGE_SIZE}명씩</>}
            </span>
            <span className="adm-pg">
              <button aria-label="이전 쪽" disabled={view.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
              <button aria-label="다음 쪽" disabled={view.page >= view.totalPages}
                onClick={() => setPage((p) => p + 1)}>›</button>
            </span>
          </div>

          {body()}

          <div className="es-msg info" style={{ marginTop: 16, marginBottom: 0 }}>
            팀을 바꿔도 <b>로그인은 끊기지 않습니다</b> — 다음 요청부터 바로 새 팀이 적용됩니다.
            (권한 변경과 다릅니다.)
            <br />한 사람은 <b>한 팀</b>에만 속합니다. 다른 팀에 넣으면 이전 팀에서 빠집니다.
          </div>
        </div>
      </div>

      {/* 팀 삭제는 되돌릴 수 없다 — 브라우저 기본 창을 쓰지 않고 자체 확인창으로 묻는다(표준). */}
      {confirmDelete && (
        <Modal title="팀 삭제" onClose={() => setConfirmDelete(null)} size="sm" busy={busy}
          scrimClassName="es-confirm" className="es-confirm-box"
          footClassName="es-confirm-actions"
          cancel={{ label: '취소', onClick: () => setConfirmDelete(null) }}
          footer={<>
            <button className="es-mini danger" disabled={busy}
              onClick={() => {
                const g = confirmDelete
                setConfirmDelete(null)
                void act(async () => { await apiDeleteTeam(g.id); setSel(SEL_ALL); setNote(`${g.name} 팀을 지웠습니다.`) })
              }}>지우기</button>
          </>}>
          <b>{confirmDelete.name}</b> 팀을 지웁니다.
          <br /><br />
          이 팀 이름으로 공유됐던 자료는 <b>지난 팀 자료로 남습니다.</b> 되돌릴 수 없습니다.
        </Modal>
      )}
    </div>
  )

  return embedded ? screen : <div className="es-auth tm" onClick={onClose}>{screen}</div>
}
