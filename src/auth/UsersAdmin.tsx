import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { ApiError, apiApprove, apiListUsers, apiResetPassword, apiSetName, apiSetStatus, ROLE_LABEL, ROLE_ORDER, type Me, type Role } from './authApi'
import { useAuth } from './useAuth'
import { filterUsers } from './userSearch'
import Modal from '../ui/Modal'

type Tab = 'pending' | 'active' | 'all'

const TAB_LABEL: Record<Tab, string> = { pending: '승인 대기', active: '사용 중', all: '전체' }

/** L3 사용자 관리 — 가입 승인, 레벨 변경, 비활성화. */
/** `embedded` — **덮개가 아니라 화면으로** 그린다(셸, 2026-09-10).
 *  덮개일 때는 뒤를 어둡게 하고 가운데 카드를 띄웠다. 셸 안에서는 뒤에 가릴 것이 없다 —
 *  자기가 그 화면이다. 그래서 스크림도, 「닫기」도 없다. 닫을 데가 없으니까. */
export default function UsersAdmin({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const me = useAuth((s) => s.me)
  const [tab, setTab] = useState<Tab>('pending')
  const [users, setUsers] = useState<Me[]>([])
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

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const list = await apiListUsers(tab === 'all' ? undefined : tab)
      setUsers(list)
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

  useEffect(() => { void load() }, [tab])   // eslint-disable-line react-hooks/exhaustive-deps

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
  /** 화면에 뜨는 목록. **걸린 값(`q`)으로만** 거른다 — 치는 값으로 거르면
   *  「조회를 눌러야 걸린다」는 팀 관리와의 약속이 깨진다.
   *  거르는 셈 자체는 `userSearch.ts` 에 있다 — 여기 적어 두면 지킴이가 돌려 볼 수 없다. */
  const shown = filterUsers(users, q)

  return (
    <div className={embedded ? 'sh-page' : 'es-auth'} onClick={embedded ? undefined : onClose}>
      <div className="es-card wide" onClick={(e) => e.stopPropagation()}>
        {/* **팀 관리와 같은 머리줄**(2026-09-18 · 사용자 결정 「둘 다 가운데」).
            전에는 여기만 왼쪽 정렬이라, 두 화면을 번갈아 보면 제목이 좌우로 튀었다. */}
        <div className="adm-head">
          <div className="es-brand"><b>사용자 관리</b><span>관리자 전용</span></div>
          <p className="es-lede">
            가입 신청을 승인하고 권한을 정합니다. <b>승인해야 실제 권한이 부여됩니다.</b>
          </p>
          {!embedded && <button className="es-mini adm-right" onClick={onClose}>닫기</button>}
        </div>

        <div className="es-tabs">
          {(['pending', 'active', 'all'] as Tab[]).map((t) => (
            <button key={t} className={`es-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
              {TAB_LABEL[t]}{t === 'pending' && pendingCount > 0 && tab === 'pending' ? ` ${pendingCount}` : ''}
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

        {err && <div className="es-msg err">{err}</div>}

        <div className="adm-pager">
          <span>{loading ? ' ' : q
            ? <>조회 결과 <b>{shown.length}</b>명 · 전체 {users.length}명</>
            : <>전체 <b>{users.length}</b>명</>}</span>
        </div>

        {loading ? (
          <div className="es-empty">불러오는 중…</div>
        ) : shown.length === 0 ? (
          <div className="es-empty">
            {/* **찾다가 없는 것과 원래 없는 것은 다른 말이다.** 같은 말을 쓰면
                「승인 대기가 없구나」로 읽고 검색어를 지울 생각을 못 한다. */}
            {q ? '찾는 사람이 없습니다. 검색어를 지우면 전체가 나옵니다.'
              : tab === 'pending' ? '승인을 기다리는 신청이 없습니다.' : '표시할 사용자가 없습니다.'}
          </div>
        ) : (
          <table className="es-table">
            <thead>
              <tr>
                <th>아이디</th><th>이름 · 부서</th><th>상태</th><th>현재 권한</th>
                <th style={{ width: 150 }}>부여할 권한</th><th style={{ width: 170 }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => {
                const self = u.id === me?.id
                const busy = busyId === u.id
                return (
                  <tr key={u.id}>
                    <td><b>{u.login_id}</b>{self && <span style={{ color: '#98a1b2' }}> (나)</span>}</td>
                    <td>
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
                          {u.name}{u.dept ? ` · ${u.dept}` : ''}
                          {/* **고치는 자리를 이름 옆에 둔다.** 따로 단추 칸을 만들면
                              「무엇의 이름인지」가 한 칸 멀어진다. */}
                          <button className="es-rename-b" title="이름 바꾸기" disabled={busy}
                            onClick={() => setRenaming({ id: u.id, value: u.name || '' })}>✎</button>
                        </>
                      )}
                    </td>
                    <td><span className={`es-st ${u.status}`}>{
                      u.status === 'active' ? '사용 중' : u.status === 'pending' ? '대기' : '중지'
                    }</span></td>
                    <td>{u.role ? ROLE_LABEL[u.role] : <span style={{ color: '#98a1b2' }}>미부여</span>}
                      {u.status === 'pending' && (
                        <div style={{ fontSize: 11, color: '#98a1b2' }}>신청: {ROLE_LABEL[u.requested_role]}</div>
                      )}
                    </td>
                    <td>
                      <select value={grant[u.id] ?? u.requested_role ?? 'writer'} disabled={self || busy}
                        onChange={(e) => setGrant({ ...grant, [u.id]: e.target.value as Role })}>
                        {ROLE_ORDER.map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="es-mini primary" disabled={self || busy}
                        title={self ? '자기 자신의 권한은 바꿀 수 없습니다' : ''}
                        onClick={() => {
                          const r = grant[u.id] ?? u.requested_role ?? 'writer'
                          // 관리자 부여는 되돌리기 어려운 권한 상승이다 — 확인을 받는다.
                          if (r === 'admin') { setConfirm({ kind: 'grantAdmin', user: u }); return }
                          void act(() => apiApprove(u.id, r), u.id)
                        }}>
                        {u.status === 'pending' ? '승인' : '변경'}
                      </button>
                      {u.status === 'disabled' ? (
                        <button className="es-mini" disabled={self || busy}
                          onClick={() => void act(() => apiSetStatus(u.id, 'active'), u.id)}>재사용</button>
                      ) : (
                        <button className="es-mini danger" disabled={self || busy}
                          title={self ? '자기 자신은 중지할 수 없습니다' : ''}
                          onClick={() => setConfirm({ kind: 'disable', user: u })}>중지</button>
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
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

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

        <div className="es-msg info" style={{ marginTop: 18, marginBottom: 0 }}>
          권한을 바꾸거나 계정을 중지하면 <b>그 사람의 로그인이 즉시 끊깁니다.</b> 다시 로그인해야 새 권한이 적용됩니다.
          <br />관리자가 한 명도 남지 않으면 아무도 승인할 수 없게 되므로, 마지막 관리자는 중지할 수 없습니다.
        </div>
      </div>
    </div>
  )
}
