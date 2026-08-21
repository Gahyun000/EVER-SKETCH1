import { useCallback, useEffect, useState } from 'react'
import { ApiError, apiListUsers, isAdmin, type Me } from '../auth/authApi'
import { useAuth } from '../auth/useAuth'
import { useProjects } from '../persistence/projects'
import DistributeDialog from './DistributeDialog'
import RevokeDialog from './RevokeDialog'
import {
  apiCreateCycle, apiDistribute, apiGetCycle, apiListCycles, apiSetCycleStatus,
  apiSetSubmitStatus, CYCLE_STATUS_LABEL, defaultPeriod, fmtKst, NEXT_STATUS,
  periodLabel, SUBMIT_LABEL,
  type Cycle, type CycleDetail,
} from './cyclesApi'
import './cycles.css'

/**
 * 회차 화면.
 *
 * 관리자 — 회차 개설 · 배부 · 진행 현황(누가 아직 안 냈는지)
 * 작성자 — 내 배부본 열기 · 제출
 * 열람자 — 발행된 회차만
 */
export default function CyclesScreen({ onClose }: { onClose: () => void }) {
  const me = useAuth((s) => s.me)
  const admin = isAdmin(me)
  const openProject = useProjects((s) => s.openProject)

  const [cycles, setCycles] = useState<Cycle[]>([])
  const [sel, setSel] = useState<CycleDetail | null>(null)
  const [users, setUsers] = useState<Me[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [creating, setCreating] = useState(false)
  const [period, setPeriod] = useState(defaultPeriod())
  const [due, setDue] = useState('')
  // 회수 확인창 — null 이면 닫힘. { projectId } 가 있으면 개인별, 없으면 회차 전체.
  const [revoking, setRevoking] = useState<
    { projectId: string; ownerId: string } | 'all' | null>(null)
  const [distributing, setDistributing] = useState(false)

  const load = useCallback(async (keepId?: string) => {
    setLoading(true); setErr('')
    try {
      const list = await apiListCycles()
      setCycles(list)
      const pick = keepId || sel?.cycle.id || list[0]?.id
      setSel(pick ? await apiGetCycle(pick) : null)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '회차를 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [sel?.cycle.id])

  useEffect(() => { void load() }, [])          // eslint-disable-line react-hooks/exhaustive-deps

  // 배부 대상(작성자) 명단 — 관리자만.
  useEffect(() => {
    if (!admin) return
    void (async () => {
      try { setUsers((await apiListUsers('active')).filter((u) => u.role === 'writer')) }
      catch { /* 배지 정보라 조용히 무시 */ }
    })()
  }, [admin])

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key); setErr(''); setMsg('')
    try {
      await fn()
      if (ok) setMsg(ok)
      await load(sel?.cycle.id)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '처리하지 못했어요.')
    } finally {
      setBusy('')
    }
  }

  const create = async () => {
    setBusy('create'); setErr(''); setMsg('')
    try {
      const c = await apiCreateCycle({
        period_ym: period,
        due_at: due ? new Date(due + 'T18:00:00').getTime() : null,
      })
      setCreating(false)
      await load(c.id)
      setMsg(`${periodLabel(c.period_ym)} 회차를 열었습니다. 이제 배부하세요.`)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '회차를 만들지 못했어요.')
    } finally {
      setBusy('')
    }
  }

  const cyc = sel?.cycle
  const prog = sel?.progress
  const mine = sel?.projects || []
  const notYet = prog ? prog.total - prog.submitted : 0

  return (
    <div className="cy-screen">
      <div className="cy-head">
        <div>
          <h2>회차 관리</h2>
          <p>{admin
            ? '회차를 열고 임원별로 표준 양식을 배부합니다.'
            : '배부받은 회차 자료입니다. 작성 후 제출해 주세요. 같은 회차 동료의 자료도 볼 수 있습니다.'}</p>
        </div>
        <div className="cy-headbtns">
          {admin && !creating && (
            <button className="cy-btn primary" onClick={() => { setCreating(true); setErr(''); setMsg('') }}>
              + 회차 열기
            </button>
          )}
          <button className="cy-btn" onClick={onClose}>내 이북으로</button>
        </div>
      </div>

      {err && <div className="cy-msg err">{err}</div>}
      {msg && <div className="cy-msg ok">{msg}</div>}

      {creating && (
        <div className="cy-create">
          <div className="cy-field">
            <label htmlFor="cy-period">회차 (년-월)</label>
            <input id="cy-period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div className="cy-field">
            <label htmlFor="cy-due">제출기한 <span>(선택)</span></label>
            <input id="cy-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="cy-field grow">
            <span className="cy-hint">
              로드맵의 연도 헤더와 <b>이번 달 표시</b>가 이 회차 기준으로 자동 계산됩니다.
              같은 달에 회차를 두 번 열 수는 없습니다.
            </span>
          </div>
          <button className="cy-btn primary" disabled={!period || busy === 'create'} onClick={() => void create()}>
            {busy === 'create' ? '만드는 중…' : '회차 만들기'}
          </button>
          <button className="cy-btn" onClick={() => setCreating(false)}>취소</button>
        </div>
      )}

      {loading ? (
        <div className="cy-empty">불러오는 중…</div>
      ) : cycles.length === 0 ? (
        <div className="cy-empty">
          {admin
            ? '아직 회차가 없습니다.\n‘+ 회차 열기’로 시작하세요.'
            : '배부받은 회차가 없습니다.\n관리자가 회차를 열면 여기에 나타납니다.'}
        </div>
      ) : (
        <div className="cy-body">
          <div className="cy-list">
            {cycles.map((c) => (
              <button key={c.id}
                className={'cy-item' + (cyc?.id === c.id ? ' on' : '')}
                onClick={() => void run('sel', async () => { setSel(await apiGetCycle(c.id)) })}>
                <div className="cy-item-t">{periodLabel(c.period_ym)}</div>
                <div className="cy-item-s">
                  <span className={'cy-st s-' + c.status}>{CYCLE_STATUS_LABEL[c.status]}</span>
                  {c.due_at ? <span className="cy-due">~{fmtKst(c.due_at).slice(0, 8)}</span> : null}
                </div>
              </button>
            ))}
          </div>

          <div className="cy-detail">
            {!cyc ? <div className="cy-empty">회차를 고르세요.</div> : (<>
              <div className="cy-dhead">
                <div>
                  <h3>{cyc.title}</h3>
                  <div className="cy-dsub">
                    <span className={'cy-st s-' + cyc.status}>{CYCLE_STATUS_LABEL[cyc.status]}</span>
                    {cyc.due_at ? <> · 제출기한 {fmtKst(cyc.due_at)}</> : null}
                  </div>
                </div>
                {admin && (
                  <div className="cy-dbtns">
                    {/* 배부 창구는 하나다. 예전엔 '표준 양식 배부'(파란 버튼)와
                        'PPT 올리기'(아래 패널)가 따로 있어서, 실물 PPT 를 배부하려던
                        사람이 눈에 먼저 띄는 파란 버튼을 눌러 빈 양식을 배부했다. */}
                    <button className="cy-btn primary" disabled={!!busy || cyc.status === 'closed'}
                      title="실물 PPT 또는 표준 양식 중에 고릅니다"
                      onClick={() => setDistributing(true)}>배부하기</button>
                    {mine.length > 0 && cyc.status !== 'closed' && (
                      <button className="cy-btn danger" disabled={!!busy}
                        title="이 회차에 나간 배부본을 모두 지웁니다"
                        onClick={() => setRevoking('all')}>배부 취소</button>
                    )}
                    {NEXT_STATUS[cyc.status].map((s) => (
                      <button key={s} className={'cy-btn' + (s === 'closed' ? ' danger' : '')}
                        disabled={!!busy}
                        onClick={() => void run('st' + s, () => apiSetCycleStatus(cyc.id, s),
                          `회차를 '${CYCLE_STATUS_LABEL[s]}' 상태로 바꿨습니다.`)}>
                        {CYCLE_STATUS_LABEL[s]}로
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {prog && (
                <div className="cy-prog">
                  <div className="cy-prog-bar">
                    <div className="cy-prog-fill"
                      style={{ width: prog.total ? `${(prog.submitted / prog.total) * 100}%` : '0%' }} />
                  </div>
                  <div className="cy-prog-txt">
                    제출 <b>{prog.submitted}</b> / {prog.total}
                    {notYet > 0 ? <span className="cy-warn"> · 미제출 {notYet}명</span> : <span className="cy-done"> · 전원 제출</span>}
                  </div>
                </div>
              )}

              {mine.length === 0 ? (
                <div className="cy-empty">
                  {admin ? '아직 배부하지 않았습니다.\n실물 PPT 를 올려 슬라이드별로 배부하거나, ‘표준 양식 배부’를 누르세요.'
                         : '이 회차에서 배부받은 자료가 없습니다.'}
                </div>
              ) : (
                <table className="cy-table">
                  <thead>
                    <tr>
                      {admin && <th style={{ width: 130 }}>작성자</th>}
                      <th>자료</th>
                      <th style={{ width: 92 }}>{admin ? '상태' : '내 것'}</th>
                      <th style={{ width: 78 }} title="아직 해결되지 않은 검토 의견">의견</th>
                      <th style={{ width: 128 }}>최종 수정</th>
                      <th style={{ width: 170 }}>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mine.map((p) => {
                      const who = users.find((u) => u.id === p.owner_id)
                      const isMine = p.owner_id === me?.id
                      // 동료 행에는 제출 상태가 오지 않는다(서버가 지운다).
                      // 대신 '내 것 / 동료' 를 보여준다 — 무엇을 열려는 것인지가 먼저다.
                      const st = p.submit_status
                      return (
                        <tr key={p.id} className={st === 'submitted' || st === 'approved' ? 'sent' : ''}>
                          {admin && <td>{who ? `${who.name}${who.dept ? ` · ${who.dept}` : ''}` : '—'}</td>}
                          <td><b>{p.name}</b></td>
                          <td>
                            {st
                              ? <span className={'cy-sub b-' + st}>{SUBMIT_LABEL[st]}</span>
                              : <span className="cy-peer" title="같은 회차 동료의 자료 — 보기만 됩니다">동료</span>}
                          </td>
                          <td>
                            {p.unresolved ? (
                              <span className="cy-unres" title="미해결 검토 의견">미해결 {p.unresolved}</span>
                            ) : <span className="cy-dim">—</span>}
                          </td>
                          <td className="cy-dim">{fmtKst(p.updated_at)}</td>
                          <td className="cy-acts">
                            <button className="cy-mini" onClick={() => void openProject(p.id)}>
                              {isMine ? '열기' : '보기'}
                            </button>
                            {isMine && st !== 'approved' && (
                              st === 'submitted'
                                ? <button className="cy-mini" disabled={!!busy}
                                    onClick={() => void run('sub' + p.id, () => apiSetSubmitStatus(p.id, 'draft'), '제출을 취소했습니다.')}>
                                    제출 취소
                                  </button>
                                : <button className="cy-mini primary" disabled={!!busy}
                                    onClick={() => void run('sub' + p.id, () => apiSetSubmitStatus(p.id, 'submitted'), '제출했습니다.')}>
                                    제출
                                  </button>
                            )}
                            {admin && cyc.status !== 'closed' && (
                              <button className="cy-mini danger" disabled={!!busy}
                                title="이 사람의 배부본을 지웁니다"
                                onClick={() => setRevoking({ projectId: p.id, ownerId: p.owner_id })}>
                                회수
                              </button>
                            )}
                            {admin && !isMine && st === 'submitted' && (<>
                              <button className="cy-mini" disabled={!!busy}
                                onClick={() => void run('ap' + p.id, () => apiSetSubmitStatus(p.id, 'approved'), '승인했습니다.')}>승인</button>
                              <button className="cy-mini danger" disabled={!!busy}
                                onClick={() => void run('rt' + p.id, () => apiSetSubmitStatus(p.id, 'returned'), '반려했습니다.')}>반려</button>
                            </>)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}

              {admin && distributing && (
                <DistributeDialog
                  cycleId={cyc.id}
                  writers={users}
                  distributedCount={mine.length}
                  onClose={() => setDistributing(false)}
                  onDone={(m) => { setDistributing(false); setMsg(m); setErr(''); void load(cyc.id) }}
                />
              )}

              {admin && revoking && (
                <RevokeDialog
                  cycleId={cyc.id}
                  only={revoking === 'all' ? null : revoking}
                  users={users}
                  onClose={() => setRevoking(null)}
                  onDone={(m) => { setRevoking(null); setMsg(m); setErr(''); void load(cyc.id) }}
                />
              )}

              {admin && cyc.status !== 'closed' && (
                <p className="cy-foot">
                  배부는 <b>여러 번 눌러도 안전</b>합니다 — 이미 받은 사람에게 두 장이 가지 않습니다.
                  나중에 승인된 작성자가 늘어나면 다시 눌러 추가 배부하세요.
                </p>
              )}
            </>)}
          </div>
        </div>
      )}
    </div>
  )
}
