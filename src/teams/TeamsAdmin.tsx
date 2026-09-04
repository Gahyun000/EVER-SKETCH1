import { useEffect, useMemo, useState } from 'react'
import { ApiError, ROLE_LABEL, apiListUsers, type Me } from '../auth/authApi'
import {
  apiAddMember, apiCreateTeam, apiDeleteTeam, apiListTeams, apiRemoveMember, apiRenameTeam,
} from './teamsApi'
import {
  assignable, deleteBlockReason, moveMessage, teamOfUser, unassigned,
  type Team, type TeamUser,
} from './teamModel'

/**
 * 팀 편성 — L1 전용.
 *
 * 팀은 **가시성의 단위**다(D1). 여기서 넣고 빼는 것이 곧 "누가 누구 자료를 보는가"를
 * 정하는 일이라, 화면이 결과를 분명히 말해야 한다.
 *
 * 두 가지를 눈에 띄게 둔다.
 *   ① **아직 팀이 없는 사람**을 맨 위에 — 팀이 없는 L3 은 로그인해도 빈 화면을 본다.
 *   ② **옮긴 결과**를 문장으로 — 한 시점 한 팀이라 새 팀에 넣으면 이전 팀에서 빠진다.
 *      조용히 빠지면 L1 은 자기가 무엇을 했는지 모른 채 나중에 "왜 A팀에서 사라졌지"를 겪는다.
 *
 * 겉껍데기(es-auth / es-card)는 사용자 관리 창과 같은 것을 쓴다 — 관리 창이 저마다
 * 다르게 생기면 같은 제품처럼 보이지 않는다.
 */
export default function TeamsAdmin({ onClose }: { onClose: () => void }) {
  const [teams, setTeams] = useState<Team[]>([])
  const [users, setUsers] = useState<Me[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Team | null>(null)
  // 「어느 팀에 넣을까」 선택. 사람마다 따로 들고 있어야 목록이 다시 그려져도 안 섞인다.
  const [pick, setPick] = useState<Record<string, string>>({})

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const [t, u] = await Promise.all([apiListTeams(), apiListUsers()])
      setTeams(t)
      setUsers(u)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '팀 목록을 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('')
    try {
      await fn()
      await load()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '처리하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  const pool = useMemo(() => assignable(users as unknown as TeamUser[]), [users])
  const left = useMemo(() => unassigned(users as unknown as TeamUser[], teams), [users, teams])
  const where = useMemo(() => teamOfUser(teams), [teams])

  const addTo = (u: TeamUser, tid: string) => {
    const team = teams.find((t) => t.id === tid)
    if (!team) return
    void act(async () => {
      const moved = await apiAddMember(tid, u.id)
      setNote(moveMessage(u.name, team.name, moved))
    })
  }

  const memberSelect = (u: TeamUser) => (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <select value={pick[u.id] || ''} disabled={busy}
        onChange={(e) => setPick({ ...pick, [u.id]: e.target.value })}>
        <option value="">팀 선택…</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id} disabled={where[u.id]?.id === t.id}>{t.name}</option>
        ))}
      </select>
      <button className="es-mini primary" disabled={busy || !pick[u.id]}
        onClick={() => addTo(u, pick[u.id])}>
        {where[u.id] ? '옮기기' : '넣기'}
      </button>
    </span>
  )

  return (
    <div className="es-auth" onClick={onClose}>
      <div className="es-card wide" onClick={(e) => e.stopPropagation()}>
        <div className="es-admin-head">
          <div>
            <div className="es-brand"><b>팀 관리</b><span>관리자 전용</span></div>
            <p className="es-lede" style={{ margin: '4px 0 0' }}>
              팀이 곧 <b>공유 범위</b>입니다. 승인된 자료는 같은 팀에게만 보입니다.
            </p>
          </div>
          <button className="es-mini" onClick={onClose}>닫기</button>
        </div>

        {err && <div className="es-msg err">{err}</div>}
        {note && !err && <div className="es-msg">{note}</div>}

        {/* ── 팀 만들기 ── */}
        <div style={{ display: 'flex', gap: 6, margin: '10px 0' }}>
          <input value={newName} placeholder="새 팀 이름" disabled={busy}
            style={{ flex: '0 0 220px' }}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) {
                void act(async () => { await apiCreateTeam(newName.trim()); setNewName(''); setNote('') })
              }
            }} />
          <button className="es-mini primary" disabled={busy || !newName.trim()}
            onClick={() => void act(async () => {
              await apiCreateTeam(newName.trim()); setNewName(''); setNote('')
            })}>팀 만들기</button>
        </div>

        {loading ? (
          <div className="es-empty">불러오는 중…</div>
        ) : (
          <>
            {/* ── 아직 팀이 없는 사람 ── */}
            <h4 style={{ margin: '14px 0 6px' }}>
              아직 팀이 없는 사람 {left.length > 0 && <span className="es-badge">{left.length}</span>}
            </h4>
            {left.length === 0 ? (
              <div className="es-empty" style={{ padding: 10 }}>모두 팀에 들어가 있습니다.</div>
            ) : (
              <>
                <p className="es-lede" style={{ margin: '0 0 6px' }}>
                  팀이 없으면 열람자는 <b>로그인해도 빈 화면</b>을 보고, 작성자는 승인받아도
                  아무에게도 공유되지 않습니다.
                </p>
                <table className="es-table">
                  <tbody>
                    {left.map((u) => (
                      <tr key={u.id}>
                        <td style={{ width: 200 }}><b>{u.name}</b>{u.dept ? ` · ${u.dept}` : ''}</td>
                        <td style={{ width: 120 }}>{ROLE_LABEL[u.role]}</td>
                        <td>{memberSelect(u)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* ── 팀별 ── */}
            <h4 style={{ margin: '18px 0 6px' }}>팀 {teams.length > 0 && `(${teams.length})`}</h4>
            {teams.length === 0 ? (
              <div className="es-empty" style={{ padding: 10 }}>
                아직 팀이 없습니다. 위에서 먼저 팀을 만들어 주세요.
              </div>
            ) : teams.map((t) => (
              <div key={t.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {renaming?.id === t.id ? (
                    <>
                      <input value={renaming.name} disabled={busy} style={{ flex: '0 0 200px' }}
                        onChange={(e) => setRenaming({ id: t.id, name: e.target.value })} />
                      <button className="es-mini primary" disabled={busy || !renaming.name.trim()}
                        onClick={() => void act(async () => {
                          await apiRenameTeam(t.id, renaming.name.trim()); setRenaming(null)
                        })}>저장</button>
                      <button className="es-mini" onClick={() => setRenaming(null)}>취소</button>
                    </>
                  ) : (
                    <>
                      <b style={{ fontSize: 15 }}>{t.name}</b>
                      <span style={{ color: '#98a1b2', fontSize: 12 }}>{t.members.length}명</span>
                      <span style={{ flex: 1 }} />
                      <button className="es-mini" disabled={busy}
                        onClick={() => setRenaming({ id: t.id, name: t.name })}>이름 변경</button>
                      <button className="es-mini danger" disabled={busy || !!deleteBlockReason(t)}
                        title={deleteBlockReason(t) || ''}
                        onClick={() => setConfirmDelete(t)}>팀 삭제</button>
                    </>
                  )}
                </div>
                {t.members.length === 0 ? (
                  <div style={{ color: '#98a1b2', fontSize: 13 }}>팀원이 없습니다.</div>
                ) : (
                  <table className="es-table">
                    <tbody>
                      {t.members.map((m) => (
                        <tr key={m.id}>
                          <td style={{ width: 200 }}><b>{m.name}</b>{m.dept ? ` · ${m.dept}` : ''}</td>
                          <td style={{ width: 120 }}>{ROLE_LABEL[m.role]}</td>
                          <td>{memberSelect(m)}</td>
                          <td style={{ width: 80 }}>
                            <button className="es-mini danger" disabled={busy}
                              onClick={() => void act(async () => {
                                await apiRemoveMember(t.id, m.id)
                                setNote(`${m.name} 님을 ${t.name}에서 뺐습니다.`)
                              })}>빼기</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}

            {pool.length === 0 && (
              <p className="es-lede" style={{ marginTop: 10 }}>
                편성할 수 있는 사람이 없습니다. 「사용자 관리」에서 가입을 먼저 승인해 주세요.
              </p>
            )}
          </>
        )}

        {/* 팀 삭제는 되돌릴 수 없다 — 한 번 더 묻는다. 껍데기는 사용자 관리 창과 같은 것을 쓴다. */}
        {confirmDelete && (
          <div className="es-confirm" onClick={() => setConfirmDelete(null)}>
            <div className="es-confirm-box" onClick={(e) => e.stopPropagation()}>
              <div className="es-confirm-title">팀 삭제</div>
              <div className="es-confirm-msg">
                <b>{confirmDelete.name}</b> 팀을 지웁니다.
                <br /><br />
                이 팀 이름으로 공유됐던 자료는 <b>지난 팀 자료로 남습니다.</b> 되돌릴 수 없습니다.
              </div>
              <div className="es-confirm-actions">
                <button className="es-mini" onClick={() => setConfirmDelete(null)}>취소</button>
                <button className="es-mini danger" disabled={busy}
                  onClick={() => {
                    const t = confirmDelete
                    setConfirmDelete(null)
                    void act(async () => { await apiDeleteTeam(t.id); setNote(`${t.name} 팀을 지웠습니다.`) })
                  }}>지우기</button>
              </div>
            </div>
          </div>
        )}

        <div className="es-msg info" style={{ marginTop: 18, marginBottom: 0 }}>
          팀을 바꿔도 <b>로그인은 끊기지 않습니다</b> — 다음 요청부터 바로 새 팀이 적용됩니다.
          (권한 변경과 다릅니다.)
          <br />한 사람은 <b>한 팀</b>에만 속합니다. 다른 팀에 넣으면 이전 팀에서 빠집니다.
        </div>
      </div>
    </div>
  )
}
