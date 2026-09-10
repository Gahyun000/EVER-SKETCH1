import { Fragment, useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { ApiError, ROLE_LABEL, apiListUsers, type Me } from '../auth/authApi'
import {
  apiAddMember, apiCreateTeam, apiDeleteTeam, apiListTeams, apiRemoveMember, apiRenameTeam,
} from './teamsApi'
import {
  PAGE_SIZE, buildGroups, highlight, moveMessage, normalizeQuery,
  type Group, type Team, type TeamUser,
} from './teamModel'
import Modal from '../ui/Modal'

/**
 * 팀 편성 — L1 전용. 화면 설계 **SCR-TEAM-01**
 * (시안: `docs/화면시안_팀관리_최종_v2.3_20260904.html`, 2026-09-04 승인).
 *
 * 팀은 **가시성의 단위**다(계획서 D1). 여기서 넣고 빼는 것이 곧 "누가 누구 자료를 보는가"를
 * 정하는 일이라, 화면이 결과를 분명히 말해야 한다.
 *
 * 확정된 설계
 *   · **미배정이 맨 위** — 팀이 없는 L3 은 로그인해도 빈 화면을 보고, 팀이 없는 L2 는
 *     승인받아도 아무에게도 공유되지 않는다. 둘 다 본인이 말하기 전에는 아무도 모른다.
 *     0명이면 그 묶음은 사라진다 — 할 일이 없는데 자리를 차지하면 다음에 진짜 생겼을 때 안 띈다.
 *   · **날짜 칸 없음** — 표준 267행(시작일·종료일)은 「행 클릭으로 상세 화면에 진입」하는
 *     조회 화면을 통째로 설명하는 문장이다. 이 화면은 상세가 없고 그 자리에서 고친다.
 *     적용되는 것은 261행 「목록 화면은 **필요한** 검색조건, 조회, 페이지 이동,
 *     로딩·빈값·오류 상태를 갖춘다」 — 그 다섯은 전부 갖췄다.
 *   · **조작 두 칸** — 사람 줄과 팀 줄이 똑같은 A·B 칸을 쓴다. 안에 든 것이 무엇이든
 *     칸 폭에 꽉 채우므로 글자 수가 달라도 세로줄이 안 어긋난다.
 *   · **색만으로 말하지 않는다** — 묶음은 글자가 먼저 무엇인지 말하고 색은 거든다.
 */
/** `embedded` — **덮개가 아니라 화면으로** 그린다(셸, 2026-09-10).
 *  덮개일 때는 뒤를 어둡게 하고 가운데 카드를 띄웠다. 셸 안에서는 뒤에 가릴 것이 없다 —
 *  자기가 그 화면이다. 그래서 스크림도, 「닫기」도 없다. 닫을 데가 없으니까. */
export default function TeamsAdmin({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const [teams, setTeams] = useState<Team[]>([])
  const [users, setUsers] = useState<Me[]>([])
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  // 조회 — **「조회」를 눌러야** 걸린다(표준). 「내 이북」 화면과 손놀림을 맞춘다.
  const [qIn, setQIn] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  const [mkOpen, setMkOpen] = useState(false)
  const [mkName, setMkName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Group | null>(null)
  const [pick, setPick] = useState<Record<string, string>>({})

  const load = async () => {
    setErr('')
    try {
      const [t, u] = await Promise.all([apiListTeams(), apiListUsers()])
      setTeams(t); setUsers(u); setPhase('ready')
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

  const result = useMemo(
    () => buildGroups(users as unknown as TeamUser[], teams, q, page, PAGE_SIZE),
    [users, teams, q, page])

  const applySearch = () => { setQ(normalizeQuery(qIn)); setPage(1); setNote('') }
  const resetSearch = () => { setQIn(''); setQ(''); setPage(1); setNote('') }

  const mkDup = teams.some((t) => t.name === mkName.trim())
  const closeMk = () => { setMkOpen(false); setMkName('') }

  /** 걸린 글자만 노랗게 — 왜 이 줄이 걸렸는지 글자로 알려준다. */
  const mark = (text: string) => {
    const h = highlight(text, q)
    if (!h) return text
    return <>{h.before}<span className="tm-mark">{h.match}</span>{h.after}</>
  }

  /** 팀에서 빼기 — 드롭다운의 한 줄로 둔다. 버튼을 하나 더 두면 두 칸 구조가 깨진다. */
  const OUT = '__out__'

  const apply = (u: TeamUser, cur: Group | null, target: string) => {
    if (target === OUT) {
      if (!cur || cur.kind !== 'team') return
      void act(async () => {
        await apiRemoveMember(cur.id, u.id)
        setNote(`${u.name} 님을 ${cur.name}에서 뺐습니다. 「아직 팀이 없는 사람」으로 올라갑니다.`)
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

  /** 조작 두 칸 — 사람 줄. A칸에 팀 고르기, B칸에 넣기/옮기기/빼기. */
  const assign = (u: TeamUser, cur: Group | null) => {
    const inTeam = !!cur && cur.kind === 'team'
    const sel = pick[u.id] || ''
    // 버튼 글자는 **고른 것**을 따라간다 — 무슨 일이 벌어질지 누르기 전에 말해준다.
    const label = sel === OUT ? '빼기' : inTeam ? '옮기기' : '넣기'
    return (
      <span className="tm-assign">
        <span className="tm-a">
          <select value={sel} disabled={busy} aria-label={`${u.name} 팀 배정`}
            onChange={(e) => setPick({ ...pick, [u.id]: e.target.value })}>
            <option value="">팀 선택</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id} disabled={cur?.id === t.id}>{t.name}</option>
            ))}
            {inTeam && <option value={OUT}>팀에서 빼기</option>}
          </select>
        </span>
        <span className="tm-b">
          <button className={'es-mini' + (sel ? (sel === OUT ? ' danger' : ' primary') : '')}
            disabled={busy || !sel} onClick={() => apply(u, cur, sel)}>{label}</button>
        </span>
      </span>
    )
  }

  const personRow = (u: TeamUser, g: Group) => (
    <tr key={u.id}>
      <td><span className="tm-who">{mark(u.name)}</span>
        {u.dept && <span className="tm-dept">{mark(u.dept)}</span>}</td>
      <td className="tm-lv">{ROLE_LABEL[u.role]}</td>
      <td>{assign(u, g)}</td>
    </tr>
  )

  const body = () => {
    if (phase === 'loading') return (
      <tr><td colSpan={3} className="tm-state"><span className="tm-spin" />불러오는 중…</td></tr>
    )
    if (phase === 'error') return (
      <tr><td colSpan={3} className="tm-state">
        <b style={{ color: '#b4232a' }}>{err || '팀 목록을 불러오지 못했습니다.'}</b><br />
        <button className="es-mini" style={{ marginTop: 10 }} onClick={() => { setPhase('loading'); void load() }}>
          다시 시도
        </button>
      </td></tr>
    )
    if (!result.groups.length) {
      // 검색 0건과 진짜 빈 데이터를 구분해서 말한다 — 같은 문구면 무엇을 해야 할지 모른다.
      return q ? (
        <tr><td colSpan={3} className="tm-state">
          「{q}」 로 찾는 결과가 없습니다.<br />
          <button className="es-mini" style={{ marginTop: 10 }} onClick={resetSearch}>조건 초기화</button>
        </td></tr>
      ) : (
        <tr><td colSpan={3} className="tm-state">
          아직 팀도 편성할 사람도 없습니다.<br />
          <span style={{ fontSize: 12 }}>「사용자 관리」에서 가입을 먼저 승인해 주세요.</span>
        </td></tr>
      )
    }
    return result.groups.map((g) => (
      <Fragment key={g.kind + g.id}>
        <tr className={'tm-grp' + (g.kind === 'unassigned' ? ' tm-none' : '')}>
          <td className="tm-namecell">
            {renaming?.id === g.id ? (
              <input value={renaming.name} autoFocus disabled={busy} aria-label="팀 이름"
                style={{ width: '100%', height: 30, textAlign: 'center', fontFamily: 'inherit',
                  border: '1px solid #c9d8f2', borderRadius: 6, fontSize: 13 }}
                onChange={(e) => setRenaming({ id: g.id, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renaming.name.trim()) {
                    void act(async () => { await apiRenameTeam(g.id, renaming.name.trim()); setRenaming(null) })
                  }
                  if (e.key === 'Escape') setRenaming(null)
                }} />
            ) : (
              <>
                <span className="tm-grpname">{mark(g.name)}</span>
                <span className="es-badge tm-cnt">{g.total}</span>
              </>
            )}
          </td>
          <td />
          <td>
            {g.kind === 'team' && (
              <span className="tm-assign">
                <span className="tm-a">
                  {renaming?.id === g.id ? (
                    <button className="es-mini primary" disabled={busy || !renaming.name.trim()}
                      onClick={() => void act(async () => {
                        await apiRenameTeam(g.id, renaming.name.trim()); setRenaming(null)
                      })}>저장</button>
                  ) : (
                    <button className="es-mini" disabled={busy}
                      onClick={() => setRenaming({ id: g.id, name: g.name })}>이름 변경</button>
                  )}
                </span>
                <span className="tm-b">
                  {renaming?.id === g.id ? (
                    <button className="es-mini" onClick={() => setRenaming(null)}>취소</button>
                  ) : (
                    <button className="es-mini danger" disabled={busy || g.total > 0}
                      title={g.total > 0 ? `팀원 ${g.total}명이 남아 있습니다. 먼저 팀원을 옮겨 주세요.` : ''}
                      onClick={() => setConfirmDelete(g)}>팀 삭제</button>
                  )}
                </span>
              </span>
            )}
          </td>
        </tr>
        {g.members.length
          ? g.members.map((u) => personRow(u, g))
          // 「팀원이 없습니다」는 **권한 칸**에 넣어 열을 맞춘다.
          : (
            <tr>
              <td />
              <td><span className="tm-empty">팀원이 없습니다</span></td>
              <td />
            </tr>
          )}
      </Fragment>
    ))
  }

  return (
    <div className={embedded ? 'sh-page tm' : 'es-auth tm'} onClick={embedded ? undefined : onClose}>
      <div className="es-card wide" onClick={(e) => e.stopPropagation()}>
        <div className="tm-head">
          <button className="es-mini tm-new" disabled={busy}
            onClick={() => { const o = !mkOpen; setMkOpen(o); if (!o) setMkName('') }}>
            <Plus className="h-4 w-4" /> 새 팀
          </button>
          <div className="es-brand"><b>팀 관리</b><span>관리자 전용</span></div>
          <p className="es-lede">
            팀이 곧 <b>공유 범위</b>입니다. 승인된 자료는 같은 팀에게만 보입니다.
          </p>
          {!embedded && <button className="es-mini tm-close" onClick={onClose}>닫기</button>}
        </div>

        {err && phase === 'ready' && <div className="es-msg err">{err}</div>}
        {note && !err && <div className="es-msg">{note}</div>}

        {mkOpen && (
          <div className="tm-mk">
            <input value={mkName} autoFocus maxLength={30} placeholder="새 팀 이름 (예: 영업1팀)"
              aria-label="새 팀 이름"
              onChange={(e) => setMkName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && mkName.trim() && !mkDup) {
                  void act(async () => { await apiCreateTeam(mkName.trim()); closeMk() })
                }
                if (e.key === 'Escape') closeMk()
              }} />
            <button className="es-mini primary" disabled={busy || !mkName.trim() || mkDup}
              onClick={() => void act(async () => { await apiCreateTeam(mkName.trim()); closeMk() })}>
              만들기
            </button>
            <button className="es-mini" onClick={closeMk}>취소</button>
            {mkDup && <span className="tm-mkerr">이미 있는 팀 이름입니다.</span>}
          </div>
        )}

        <div className="tm-srch">
          <span className="tm-qbox">
            <Search className="h-4 w-4" />
            <input value={qIn} placeholder="이름 · 부서 · 팀 이름" aria-label="검색어"
              onChange={(e) => setQIn(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applySearch() }} />
          </span>
          <button className="tm-sbtn dark" disabled={phase !== 'ready'} onClick={applySearch}>조회</button>
          <button className="tm-sbtn" disabled={phase !== 'ready'} onClick={resetSearch}>초기화</button>
        </div>

        <div className="tm-pager">
          <span>
            {phase !== 'ready' ? ' ' : q
              ? <>조회 결과 <b>{result.totalPeople}</b>명 · {result.page}/{result.totalPages} 페이지 · {PAGE_SIZE}명씩</>
              : <>전체 <b>{result.totalPeople}</b>명 · {result.page}/{result.totalPages} 페이지 · {PAGE_SIZE}명씩</>}
          </span>
          <span className="tm-pg">
            <button aria-label="이전 쪽" disabled={result.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
            <button aria-label="다음 쪽" disabled={result.page >= result.totalPages}
              onClick={() => setPage((p) => p + 1)}>›</button>
          </span>
        </div>

        <table className="tm-table">
          <colgroup>
            <col style={{ width: '36%' }} /><col style={{ width: '20%' }} /><col style={{ width: '44%' }} />
          </colgroup>
          <thead><tr><th>이름 · 부서</th><th>권한</th><th>팀 배정</th></tr></thead>
          <tbody>{body()}</tbody>
        </table>

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
                  void act(async () => { await apiDeleteTeam(g.id); setNote(`${g.name} 팀을 지웠습니다.`) })
                }}>지우기</button>
            </>}>
            <b>{confirmDelete.name}</b> 팀을 지웁니다.
            <br /><br />
            이 팀 이름으로 공유됐던 자료는 <b>지난 팀 자료로 남습니다.</b> 되돌릴 수 없습니다.
          </Modal>
        )}

        <div className="es-msg info" style={{ marginTop: 16, marginBottom: 0 }}>
          팀을 바꿔도 <b>로그인은 끊기지 않습니다</b> — 다음 요청부터 바로 새 팀이 적용됩니다.
          (권한 변경과 다릅니다.)
          <br />한 사람은 <b>한 팀</b>에만 속합니다. 다른 팀에 넣으면 이전 팀에서 빠집니다.
        </div>
      </div>
    </div>
  )
}
