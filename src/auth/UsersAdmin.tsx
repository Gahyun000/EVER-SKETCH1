import { useEffect, useState } from 'react'
import { ApiError, apiApprove, apiListUsers, apiSetStatus, LEVEL_LABEL, type Me } from './authApi'
import { useAuth } from './useAuth'

type Tab = 'pending' | 'active' | 'all'

const TAB_LABEL: Record<Tab, string> = { pending: '승인 대기', active: '사용 중', all: '전체' }

/** L3 사용자 관리 — 가입 승인, 레벨 변경, 비활성화. */
export default function UsersAdmin({ onClose }: { onClose: () => void }) {
  const me = useAuth((s) => s.me)
  const [tab, setTab] = useState<Tab>('pending')
  const [users, setUsers] = useState<Me[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busyId, setBusyId] = useState('')
  // 승인 시 부여할 레벨. 기본값은 본인이 신청한 레벨이지만 관리자가 낮출 수 있다.
  const [grant, setGrant] = useState<Record<string, 1 | 2 | 3>>({})

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const list = await apiListUsers(tab === 'all' ? undefined : tab)
      setUsers(list)
      setGrant((g) => {
        const next = { ...g }
        for (const u of list) if (!next[u.id]) next[u.id] = u.requested_level
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

  const pendingCount = users.filter((u) => u.status === 'pending').length

  return (
    <div className="es-auth" onClick={onClose}>
      <div className="es-card wide" onClick={(e) => e.stopPropagation()}>
        <div className="es-admin-head">
          <div>
            <div className="es-brand"><b>사용자 관리</b><span>L3 관리자 전용</span></div>
            <p className="es-lede" style={{ margin: '4px 0 0' }}>
              가입 신청을 승인하고 권한 레벨을 정합니다. <b>승인해야 실제 권한이 부여됩니다.</b>
            </p>
          </div>
          <button className="es-mini" onClick={onClose}>닫기</button>
        </div>

        <div className="es-tabs">
          {(['pending', 'active', 'all'] as Tab[]).map((t) => (
            <button key={t} className={`es-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
              {TAB_LABEL[t]}{t === 'pending' && pendingCount > 0 && tab === 'pending' ? ` ${pendingCount}` : ''}
            </button>
          ))}
        </div>

        {err && <div className="es-msg err">{err}</div>}

        {loading ? (
          <div className="es-empty">불러오는 중…</div>
        ) : users.length === 0 ? (
          <div className="es-empty">
            {tab === 'pending' ? '승인을 기다리는 신청이 없습니다.' : '표시할 사용자가 없습니다.'}
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
              {users.map((u) => {
                const self = u.id === me?.id
                const busy = busyId === u.id
                return (
                  <tr key={u.id}>
                    <td><b>{u.login_id}</b>{self && <span style={{ color: '#98a1b2' }}> (나)</span>}</td>
                    <td>{u.name}{u.dept ? ` · ${u.dept}` : ''}</td>
                    <td><span className={`es-st ${u.status}`}>{
                      u.status === 'active' ? '사용 중' : u.status === 'pending' ? '대기' : '중지'
                    }</span></td>
                    <td>{u.level ? LEVEL_LABEL[u.level] : <span style={{ color: '#98a1b2' }}>미부여</span>}
                      {u.status === 'pending' && (
                        <div style={{ fontSize: 11, color: '#98a1b2' }}>신청: {LEVEL_LABEL[u.requested_level]}</div>
                      )}
                    </td>
                    <td>
                      <select value={grant[u.id] ?? u.requested_level} disabled={self || busy}
                        onChange={(e) => setGrant({ ...grant, [u.id]: Number(e.target.value) as 1 | 2 | 3 })}>
                        <option value={1}>L1 열람자</option>
                        <option value={2}>L2 작성자</option>
                        <option value={3}>L3 관리자</option>
                      </select>
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="es-mini primary" disabled={self || busy}
                        title={self ? '자기 자신의 권한은 바꿀 수 없습니다' : ''}
                        onClick={() => void act(() => apiApprove(u.id, grant[u.id] ?? u.requested_level), u.id)}>
                        {u.status === 'pending' ? '승인' : '변경'}
                      </button>
                      {u.status === 'disabled' ? (
                        <button className="es-mini" disabled={self || busy}
                          onClick={() => void act(() => apiSetStatus(u.id, 'active'), u.id)}>재사용</button>
                      ) : (
                        <button className="es-mini danger" disabled={self || busy}
                          title={self ? '자기 자신은 중지할 수 없습니다' : ''}
                          onClick={() => void act(() => apiSetStatus(u.id, 'disabled'), u.id)}>중지</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <div className="es-msg info" style={{ marginTop: 18, marginBottom: 0 }}>
          권한을 바꾸거나 계정을 중지하면 <b>그 사람의 로그인이 즉시 끊깁니다.</b> 다시 로그인해야 새 권한이 적용됩니다.
          <br />관리자가 한 명도 남지 않으면 아무도 승인할 수 없게 되므로, 마지막 관리자는 중지할 수 없습니다.
        </div>
      </div>
    </div>
  )
}
