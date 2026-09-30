import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { ApiError, apiApprove, apiListUsers, apiResetPassword, apiSetName, apiSetStatus, ROLE_LABEL, ROLE_ORDER, type Me, type Role } from './authApi'
import { useAuth } from './useAuth'
import { filterUsers } from './userSearch'
import Modal from '../ui/Modal'
import { apiListTeams } from '../teams/teamsApi'
import { teamOfUser, type Team } from '../teams/teamModel'
import { clampMaster, keepOrFirst } from '../ui/masterSplit'
import { masterWidth, rememberMasterWidth } from '../persistence/prefs'

type Tab = 'pending' | 'active' | 'disabled' | 'all'

const TAB_LABEL: Record<Tab, string> = { pending: '승인 대기', active: '사용 중', disabled: '중지', all: '전체' }
const ST_LABEL: Record<Me['status'], string> = { active: '사용 중', pending: '대기', disabled: '중지' }

/** 시각(밀리초) → 「2026. 09. 21. 14:18」. 없으면 null — 화면이 「—」로 적는다. */
function fmtTime(ms: number | null | undefined): string | null {
  if (!ms) return null
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())}. ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** L3 사용자 관리 — 가입 승인, 레벨 변경, 비활성화.
 *
 *  **마스터·디테일로 바꿨다**(2026-09-21 · 시안 `docs/화면시안_사용자관리_마스터디테일_v1.0.html` 안 ㄴ).
 *  예전에는 여섯 칸 표 한 줄 끝에 단추 셋(승인/변경 · 중지/재사용 · 비밀번호 초기화)이 붙어
 *  칸이 좁았고, 「신청: 작성자」는 권한 칸 밑에 작게 끼어 있었다. 이 화면은 **한 사람에게 여러
 *  일**을 하는 곳이라, 왼쪽에서 사람을 고르고 오른쪽 넓은 자리에서 「권한」·「계정」 두 덩어리로
 *  일을 한다. 뼈대는 결재함·팀 공유·팀 관리와 같다(md-screen · ap-body · md-grip · ap-item). */
/** `embedded` — **덮개가 아니라 화면으로** 그린다(셸, 2026-09-10).
 *  덮개일 때는 뒤를 어둡게 하고 가운데 카드를 띄웠다. 셸 안에서는 뒤에 가릴 것이 없다 —
 *  자기가 그 화면이다. 그래서 스크림도, 「닫기」도 없다. 닫을 데가 없으니까. */
export default function UsersAdmin({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const me = useAuth((s) => s.me)
  const [tab, setTab] = useState<Tab>('pending')
  const [users, setUsers] = useState<Me[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [note, setNote] = useState('')
  // 목록 칸 폭 — 결재함·팀 공유·팀 관리와 같은 손잡이, 같은 기억 방식(키만 다르다).
  const [mw, setMw] = useState(() => masterWidth('um'))
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
      setDragging(false); rememberMasterWidth('um', gripRef.current)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busyId, setBusyId] = useState('')
  // 중요 작업(관리자 권한 부여 · 계정 중지)은 한 번 더 확인받는다.
  // 클릭 한 번으로 임원 계정이 끊기거나 관리자가 늘어나면 사고가 조용히 지나간다.
  const [confirm, setConfirm] = useState<
    { kind: 'grantAdmin' | 'disable' | 'resetPw'; user: Me } | null
  >(null)
  // 발급된 임시 비밀번호. **화면에만 있다** — 감사로그에도, 목록에도 남지 않는다.
  // 창을 닫으면 사라지므로 관리자가 당사자에게 전달할 때까지만 떠 있다.
  const [issued, setIssued] = useState<{ user: Me; password: string } | null>(null)
  const [copied, setCopied] = useState(false)
  /** 이름을 고치는 중인 줄. **이 화면에 길이 아예 없었다**(2026-09-16) — 처음 만들어진
   *  관리자 이름이 「시스템 관리자」였는데 서버에도 화면에도 관리 도구에도 바꿀 길이
   *  없어서 DB 를 직접 여는 수밖에 없었다. */
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  // 승인 시 부여할 역할. 기본값은 본인이 신청한 역할이지만 관리자가 낮출 수 있다.
  const [grant, setGrant] = useState<Record<string, Role>>({})
  /**
   * **검색**(2026-09-18 · 사용자 지시 「사용자도 검색 기능 넣고」).
   *
   * 팀 관리와 **같은 손놀림**이다 — 치기만 해서는 안 걸리고 <b>「조회」를 눌러야</b> 걸린다.
   * 한 화면은 치는 대로 걸리고 다른 화면은 눌러야 걸리면, 손이 매번 다시 배운다.
   * 그래서 치는 값(`qIn`)과 걸린 값(`q`)을 따로 둔다.
   *
   * **서버에 묻지 않고 받아 둔 목록에서 거른다.** 이 화면은 탭 하나에 전부를 받아 온다 —
   * 굳이 다시 물으면 같은 것을 두 번 받고, 받는 사이에 목록이 비어 깜빡인다.
   */
  const [qIn, setQIn] = useState('')
  const [q, setQ] = useState('')

  // **전부 한 번에 받는다**(마스터·디테일). 왼쪽 칩마다 숫자를 적으려면 상태별로 따로 물으면
  // 네 번 묻게 된다. 걸러 보이는 일은 화면이 한다. 소속 팀은 팀 목록에서 찾아 붙인다 —
  // 못 받아도 사용자 관리는 돌아야 하므로 실패는 조용히 넘긴다(팀 칸만 「—」).
  const load = async () => {
    setLoading(true); setErr('')
    try {
      const [list, tl] = await Promise.all([apiListUsers(), apiListTeams().catch(() => [] as Team[])])
      setUsers(list); setTeams(tl)
      setGrant((g) => {
        const next = { ...g }
        for (const u of list) if (!next[u.id]) next[u.id] = u.requested_role || 'writer' 
        return next
      })
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '목록을 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown>, uid: string) => {
    setBusyId(uid); setErr('')
    try {
      await fn()
      await load()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '처리하지 못했어요.')
    } finally {
      setBusyId('')
    }
  }

  /** 비밀번호 초기화 — **남의 것만.** 본인은 「비밀번호 변경」을 쓴다(아래 단추 주석 참고). */
  const resetPw = async (u: Me) => {
    setBusyId(u.id); setErr('')
    try {
      const password = await apiResetPassword(u.id)
      setIssued({ user: u, password }); setCopied(false)
      await load()          // 상태(중지→사용 중)가 바뀔 수 있어 목록을 다시 받는다
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '초기화하지 못했어요.')
    } finally {
      setBusyId('')
    }
  }

  const pendingCount = users.filter((u) => u.status === 'pending').length
  const countOf = (t: Tab) => (t === 'all' ? users.length : users.filter((u) => u.status === t).length)
  const inTab = useMemo(() => (tab === 'all' ? users : users.filter((u) => u.status === tab)), [users, tab])
  const teamOf = useMemo(() => teamOfUser(teams), [teams])
  /** 화면에 뜨는 목록. **걸린 값(`q`)으로만** 거른다 — 치는 값으로 거르면
   *  「조회를 눌러야 걸린다」는 팀 관리와의 약속이 깨진다.
   *  거르는 셈 자체는 `userSearch.ts` 에 있다 — 여기 적어 두면 지킴이가 돌려 볼 수 없다. */
  const shown = filterUsers(inTab, q)
  // **고른 사람이 목록에서 빠지면 맨 위로**(결재함과 같은 규칙 · keepOrFirst). 승인 대기에서
  // 한 사람을 승인하면 그 사람이 빠지고 **다음 대기자가 저절로 골라진다** — 손이 그 자리에 머문다.
  const cur = keepOrFirst(shown.map((u) => u.id), sel)
  const u = shown.find((x) => x.id === cur) || null

  const self = !!u && u.id === me?.id
  const busy = !!u && busyId === u.id
  const pickTab = (t: Tab) => { setTab(t); setSel(null); setRenaming(null); setNote('') }

  const screen = (
    <div className={(embedded ? 'sh-page' : 'es-card wide um-card') + ' um md-screen' + (dragging ? ' md-drag' : '')}
      onClick={embedded ? undefined : (e) => e.stopPropagation()}>
      <div className="md-top">
        {/* **팀 관리와 같은 머리줄**(2026-09-18 · 사용자 결정 「둘 다 가운데」). */}
        <div className="adm-head">
          <div className="es-brand"><b>사용자 관리</b><span>관리자 전용</span></div>
          <p className="es-lede">
            가입 신청을 승인하고 권한을 정합니다. <b>승인해야 실제 권한이 부여됩니다.</b>
          </p>
          {!embedded && <button className="es-mini adm-right" onClick={onClose}>닫기</button>}
        </div>
        {err && <div className="es-msg err">{err}</div>}
        {note && !err && <div className="es-msg">{note}</div>}
      </div>

      <div className="ap-body md-body" style={{ gridTemplateColumns: mw + 'px auto 1fr' }}>
        {/* ── 왼쪽: 사람 목록. 위에 상태 칩 · 검색 ── */}
        <div className="ap-list um-side">
          <div className="um-chips">
            {(['pending', 'active', 'disabled', 'all'] as Tab[]).map((t) => (
              <button key={t} className={'um-chip' + (tab === t ? ' on' : '') + (t === 'pending' && pendingCount > 0 ? ' hot' : '')}
                onClick={() => pickTab(t)}>
                {TAB_LABEL[t]}<span className="n">{countOf(t)}</span>
              </button>
            ))}
          </div>

          {/* 팀 관리와 **같은 줄, 같은 클래스**다 — 두 화면이 한 벌로 읽혀야 한다. */}
          <div className="adm-srch">
            <span className="adm-qbox">
              <Search className="h-4 w-4" />
              <input value={qIn} placeholder="아이디 · 이름 · 부서" aria-label="검색어"
                onChange={(e) => setQIn(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setQ(qIn) }} />
            </span>
            <button className="adm-sbtn dark" disabled={loading} onClick={() => setQ(qIn)}>조회</button>
            <button className="adm-sbtn" disabled={loading}
              onClick={() => { setQIn(''); setQ('') }}>초기화</button>
          </div>

          <div className="adm-pager">
            <span>{loading ? ' ' : q
              ? <>조회 결과 <b>{shown.length}</b>명 · {TAB_LABEL[tab]} {inTab.length}명</>
              : <>{TAB_LABEL[tab]} <b>{inTab.length}</b>명</>}</span>
          </div>

          {loading ? (
            <div className="es-empty">불러오는 중…</div>
          ) : shown.length === 0 ? (
            <div className="es-empty">
              {/* **찾다가 없는 것과 원래 없는 것은 다른 말이다.** */}
              {q ? '찾는 사람이 없습니다. 검색어를 지우면 전체가 나옵니다.'
                : tab === 'pending' ? '승인을 기다리는 신청이 없습니다.' : '표시할 사용자가 없습니다.'}
            </div>
          ) : shown.map((x) => (
            <button key={x.id} className={'ap-item um-item' + (x.id === cur ? ' on' : '')}
              onClick={() => { setSel(x.id); setRenaming(null) }}>
              <span className="ap-item-top">
                <span className="ap-item-name">{x.name}{x.id === me?.id && <span className="um-me"> (나)</span>}</span>
                <span className={`es-st ${x.status}`}>{ST_LABEL[x.status]}</span>
              </span>
              <span className="ap-item-sub">
                {x.login_id}{x.dept ? ` · ${x.dept}` : ''} · {x.status === 'pending'
                  ? `신청 ${ROLE_LABEL[x.requested_role]}` : (x.role ? ROLE_LABEL[x.role] : '미부여')}
              </span>
            </button>
          ))}
        </div>

        <div className="md-grip" onPointerDown={onGrip}
          title="끌어서 목록 칸 폭을 바꿉니다" aria-hidden="true" />

        {/* ── 오른쪽: 고른 한 사람 ── */}
        <div className="ap-detail um-detail">
          {!u ? (
            <div className="es-empty">{loading ? '불러오는 중…' : '볼 사람이 없습니다.'}</div>
          ) : (
            <div className="um-card-in">
              <div className="um-d-head">
                {renaming && renaming.id === u.id ? (
                  <input className="es-rename" autoFocus value={renaming.value} maxLength={40}
                    aria-label="이름" disabled={busy}
                    onChange={(e) => setRenaming({ id: u.id, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && renaming.value.trim()) {
                        void act(() => apiSetName(u.id, renaming.value.trim()), u.id)
                        setRenaming(null)
                      }
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                    onBlur={() => setRenaming(null)} />
                ) : (
                  <>
                    <b className="um-d-name">{u.name}</b>
                    {/* **고치는 자리를 이름 옆에 둔다.** */}
                    <button className="es-rename-b" title="이름 바꾸기" disabled={busy}
                      onClick={() => setRenaming({ id: u.id, value: u.name || '' })}>✎</button>
                  </>
                )}
                <span className="um-d-id">{u.login_id}{self && ' (나)'}</span>
                <span className={`es-st ${u.status}`}>{ST_LABEL[u.status]}</span>
              </div>

              <dl className="um-dl">
                <dt>부서</dt><dd>{u.dept || <span className="um-dim">—</span>}</dd>
                <dt>현재 권한</dt><dd>{u.role ? ROLE_LABEL[u.role] : <span className="um-dim">미부여</span>}</dd>
                {u.status === 'pending' && <><dt>신청한 권한</dt><dd>{ROLE_LABEL[u.requested_role]}</dd></>}
                <dt>소속 팀</dt>
                <dd>{teamOf[u.id]?.name || <span className="um-dim">없음</span>}
                  <span className="um-dim um-small"> · 팀 관리에서 바꿉니다</span></dd>
                <dt>가입 신청</dt><dd>{fmtTime(u.created_at) || <span className="um-dim">—</span>}</dd>
                {u.approved_at ? <><dt>승인</dt><dd>{fmtTime(u.approved_at)}</dd></> : null}
                <dt>마지막 로그인</dt><dd>{fmtTime(u.last_login_at) || <span className="um-dim">아직 없음</span>}</dd>
              </dl>

              <div className="um-sec">
                <h4>권한</h4>
                <div className="um-row">
                  <select value={grant[u.id] ?? u.requested_role ?? 'writer'} disabled={self || busy}
                    aria-label="부여할 권한"
                    onChange={(e) => setGrant({ ...grant, [u.id]: e.target.value as Role })}>
                    {ROLE_ORDER.map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                  <button className="es-mini primary" disabled={self || busy}
                    title={self ? '자기 자신의 권한은 바꿀 수 없습니다' : ''}
                    onClick={() => {
                      const r = grant[u.id] ?? u.requested_role ?? 'writer'
                      // 관리자 부여는 되돌리기 어려운 권한 상승이다 — 확인을 받는다.
                      if (r === 'admin') { setConfirm({ kind: 'grantAdmin', user: u }); return }
                      const was = u.status
                      void act(async () => {
                        await apiApprove(u.id, r)
                        setNote(`${u.name} 님을 ${was === 'pending' ? '승인했습니다' : '변경했습니다'} — ${ROLE_LABEL[r]}.`)
                      }, u.id)
                    }}>
                    {u.status === 'pending' ? '승인' : '변경'}
                  </button>
                </div>
                <p className="um-hint">{u.status === 'pending'
                  ? '승인해야 실제 권한이 부여됩니다. 신청한 권한보다 낮춰 승인할 수 있습니다.'
                  : '바꾸면 그 사람의 로그인이 즉시 끊기고, 다시 로그인하면 새 권한이 적용됩니다.'}</p>
              </div>

              <div className="um-sec">
                <h4>계정</h4>
                <div className="um-row">
                  {u.status === 'disabled' ? (
                    <button className="es-mini" disabled={self || busy}
                      onClick={() => void act(() => apiSetStatus(u.id, 'active'), u.id)}>재사용</button>
                  ) : (
                    <button className="es-mini danger" disabled={self || busy}
                      title={self ? '자기 자신은 중지할 수 없습니다' : ''}
                      onClick={() => setConfirm({ kind: 'disable', user: u })}>계정 중지</button>
                  )}
                  {/* 이 제품에는 비밀번호 찾기가 없다 — 잊으면 관리자만 풀어줄 수 있다.
                      **본인은 제외한다.** 2026-09-18 에 한 번 열었다가 같은 날 닫았다:
                      열어 보니 같은 자리를 푸는 길이 둘이 됐고, 사용자가 골랐다
                      (「2번보다 3만 있으면 되겠다」). 본인은 「비밀번호 변경」을 쓴다 —
                      잊었으면 그 창의 「지금 비밀번호가 기억나지 않습니다」로
                      **새 값을 직접 정한다.** 초기화보다 걸음이 하나 짧고 놓칠 글자도 없다. */}
                  <button className="es-mini" disabled={self || busy || u.status === 'pending'}
                    title={self ? '본인은 「비밀번호 변경」을 쓰세요 — 잊었다면 그 창의 「지금 비밀번호가 기억나지 않습니다」'
                      : u.status === 'pending' ? '가입을 먼저 승인해 주세요' : ''}
                    onClick={() => setConfirm({ kind: 'resetPw', user: u })}>비밀번호 초기화</button>
                </div>
              </div>

              <div className="es-msg info" style={{ marginTop: 18, marginBottom: 0 }}>
                권한을 바꾸거나 계정을 중지하면 <b>그 사람의 로그인이 즉시 끊깁니다.</b> 다시 로그인해야 새 권한이 적용됩니다.
                <br />관리자가 한 명도 남지 않으면 아무도 승인할 수 없게 되므로, 마지막 관리자는 중지할 수 없습니다.
              </div>
            </div>
          )}
        </div>
      </div>

        {confirm && (
          <Modal
            title={confirm.kind === 'grantAdmin' ? '관리자 권한 부여'
              : confirm.kind === 'resetPw' ? '비밀번호 초기화' : '계정 사용 중지'}
            onClose={() => setConfirm(null)} size="sm" busy={busyId === confirm.user.id}
            scrimClassName="es-confirm" className="es-confirm-box"
            footClassName="es-confirm-actions"
            cancel={{ label: '취소', onClick: () => setConfirm(null) }}
            footer={<>
              <button className={`es-mini ${confirm.kind === 'disable' ? 'danger' : 'primary'}`}
                onClick={() => {
                  const c = confirm
                  setConfirm(null)
                  if (c.kind === 'grantAdmin') void act(() => apiApprove(c.user.id, 'admin'), c.user.id)
                  else if (c.kind === 'resetPw') void resetPw(c.user)
                  else void act(() => apiSetStatus(c.user.id, 'disabled'), c.user.id)
                }}>
                {confirm.kind === 'grantAdmin' ? '관리자로 지정'
                  : confirm.kind === 'resetPw' ? '초기화' : '중지'}
              </button>
            </>}>
            {confirm.kind === 'resetPw' ? (
              <>
                <b>{confirm.user.name}({confirm.user.login_id})</b> 님의 비밀번호를 초기화합니다.
                <br /><br />
                <b>임시 비밀번호를 이 화면에 한 번만 보여드립니다.</b> 당사자에게 전달해 주세요.
                그 사람은 <b>다음 로그인에서 반드시 새 비밀번호로 바꿔야</b> 합니다.
                <br /><br />
                지금 접속 중이라면 <b>즉시 로그아웃</b>되고, 예전 비밀번호는 더 이상 쓸 수 없습니다.
              </>
            ) : confirm.kind === 'grantAdmin' ? (
              <>
                <b>{confirm.user.name}({confirm.user.login_id})</b> 님에게 <b>Lv1 관리자</b> 권한을 부여합니다.
                <br /><br />
                관리자는 <b>모든 임원의 자료를 열람·수정·삭제</b>할 수 있고, 다른 사람의 가입을 승인하고
                팀을 편성할 수 있습니다.
              </>
            ) : (
              <>
                <b>{confirm.user.name}({confirm.user.login_id})</b> 님의 계정을 중지합니다.
                <br /><br />
                지금 접속 중이라면 <b>즉시 로그아웃</b>되고 다시 로그인할 수 없습니다.
                작성 중이던 내용이 저장되지 않을 수 있습니다.
              </>
            )}
          </Modal>
        )}

        {/* 임시 비밀번호는 **여기에만** 있다 — 감사로그에도 목록에도 남지 않는다.
            닫으면 사라지므로 닫기 전에 전달하라고 분명히 말하고,
            **Esc·바깥 누르기로는 닫히지 않게 한다**(`dismissible={false}`).
            실수로 한 번 누르면 되돌릴 길이 「한 번 더 초기화」밖에 없고,
            그건 당사자를 또 로그아웃시킨다. */}
        {issued && (
          <Modal title="임시 비밀번호" onClose={() => setIssued(null)} size="sm"
            scrimClassName="es-confirm" className="es-confirm-box"
            footClassName="es-confirm-actions"
            dismissible={false}
            cancel={{ label: '닫기', onClick: () => setIssued(null) }}
            footer={
              <button className="es-mini primary"
                onClick={() => {
                  void navigator.clipboard?.writeText(issued.password)
                    .then(() => setCopied(true)).catch(() => setCopied(false))
                }}>{copied ? '복사했습니다' : '복사'}</button>
            }>
            <b>{issued.user.name}({issued.user.login_id})</b> 님에게 아래 비밀번호를 전달해 주세요.
            <br />
            <b>이 창을 닫으면 다시 볼 수 없습니다.</b> 다시 필요하면 한 번 더 초기화해야 합니다.
            <div style={{
              marginTop: 12, padding: '11px 13px', background: '#f6f8fc',
              border: '1px solid #e6e8ee', borderRadius: 7,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 15, fontWeight: 700, color: '#0F1B3D',
              userSelect: 'all', wordBreak: 'break-all',
            }}>{issued.password}</div>
          </Modal>
        )}
    </div>
  )

  return embedded ? screen : <div className="es-auth um" onClick={onClose}>{screen}</div>
}
