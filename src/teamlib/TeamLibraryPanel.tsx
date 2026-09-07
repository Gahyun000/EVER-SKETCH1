import { useEffect, useMemo, useState } from 'react'
import { Search, History, Users, X, ExternalLink } from 'lucide-react'
import SlideViewer from '../approvals/SlideViewer'
import { STATUS_LABEL, type Approval } from '../approvals/approvalApi'
import {
  TeamLibraryError, apiTeamApproval, apiTeamHistory, apiTeamLibrary,
  type LibItem, type LibTeam,
} from './teamLibraryApi'
import {
  PAGE_SIZE, RELATION_HINT, RELATION_LABEL, flatten, pageOf, pickTeam,
} from './teamLibraryModel'
import { pageWindow } from '../persistence/folderNav'

const fmt = (ts?: number | null) =>
  ts ? new Date(ts).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', hour12: false,
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : '-'

/**
 * 팀 공유 — 같은 팀의 **승인본**을 보는 곳 (P6).
 *
 * **여기 보이는 것은 작업본이 아니다.** 작성자가 지금 그 자료를 고치고 있어도
 * 이 화면의 그림은 안 흔들린다 — 승인은 *그때 그 문서*에 대한 승인이고,
 * 팀이 읽는 것은 제출 순간에 얼어붙은 사본이다(전환계획 §3.1).
 *
 * 누가 무엇을 보는가는 **서버가 정하고 화면은 그대로 그린다** —
 * 관리자 전부 / 내가 낸 건 / 지금 내 팀의 승인본(`permissions.can_see_approval`).
 * 화면이 다시 거르면 규칙이 두 벌이 되고, 두 벌은 언젠가 어긋난다.
 *
 * 「현재」·「이전」은 **글자로 붙는다**(D19) — 색으로만 상태를 구분하지 않는다(표준).
 */
export default function TeamLibraryPanel({ onClose }: { onClose: () => void }) {
  const [teams, setTeams] = useState<LibTeam[]>([])
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [err, setErr] = useState('')

  const [teamId, setTeamId] = useState<string | null>(null)
  const [qIn, setQIn] = useState('')     // 입력칸
  const [q, setQ] = useState('')         // **조회를 눌러야** 걸린다(표준: 조회 버튼)
  const [page, setPage] = useState(1)

  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<LibItem | null>(null)
  const [idx, setIdx] = useState(0)
  const [hist, setHist] = useState<Approval[] | null>(null)

  const load = async () => {
    setErr('')
    try {
      setTeams(await apiTeamLibrary())
      setPhase('ready')
    } catch (e) {
      setErr(e instanceof TeamLibraryError ? e.message : '팀 공유를 불러오지 못했습니다.')
      setPhase('error')
    }
  }
  useEffect(() => { void load() }, [])

  const team = useMemo(() => pickTeam(teams, teamId), [teams, teamId])
  const flat = useMemo(() => flatten(team), [team])
  const paged = useMemo(() => pageOf(flat, q, page), [flat, q, page])

  useEffect(() => {
    if (!openId) { setDetail(null); setHist(null); return }
    let alive = true
    void (async () => {
      try {
        const a = await apiTeamApproval(openId)
        if (alive) { setDetail(a); setIdx(0); setHist(null) }
      } catch (e) {
        if (alive) setErr(e instanceof TeamLibraryError ? e.message : '승인본을 열지 못했습니다.')
      }
    })()
    return () => { alive = false }
  }, [openId])

  const applySearch = () => { setQ(qIn); setPage(1); setOpenId(null) }
  const resetSearch = () => { setQIn(''); setQ(''); setPage(1); setOpenId(null) }

  /** 읽기 전용 뷰어를 **새 탭**으로 연다. 앞 창은 그대로 남아 고르던 자리를 잃지 않는다. */
  const openBig = (aid: string) => { window.open(`/view/${aid}`, '_blank', 'noopener') }

  const openHistory = async () => {
    if (!detail) return
    try { setHist(await apiTeamHistory(detail.project_id)) } catch { setHist([]) }
  }

  return (
    <div className="es-auth tl" onClick={onClose}>
      <div className="es-card wide ap-card" onClick={(e) => e.stopPropagation()}>
        <div className="ap-head">
          <div className="es-brand">
            <b>팀 공유</b>
            <span>승인된 자료만 올라옵니다</span>
          </div>
          <button className="es-mini" onClick={onClose}>닫기</button>
        </div>

        {err && <div className="es-msg err">{err}</div>}

        {phase === 'loading' ? (
          <div className="es-empty">불러오는 중…</div>
        ) : phase === 'error' ? (
          <div className="es-empty">
            불러오지 못했습니다.<br />
            <button className="es-mini" style={{ marginTop: 8 }}
              onClick={() => { setPhase('loading'); void load() }}>다시 시도</button>
          </div>
        ) : teams.length === 0 ? (
          /* **오류가 아니라 빈 화면이다.** 아직 볼 게 없을 뿐이고,
             그 이유와 다음에 할 일을 함께 적는다 — 「없습니다」로 끝내면 사람이 멈춘다. */
          <div className="es-empty tl-empty">
            <Users className="h-5 w-5" />
            <b>아직 팀에 올라온 자료가 없습니다.</b>
            <p>
              결재에서 <b>승인된 자료만</b> 여기에 올라옵니다.<br />
              팀에 배정되지 않았다면 관리자에게 팀 편성을 요청해 주세요.
            </p>
          </div>
        ) : (
          <>
            {/* 팀 고르개. 「현재」·「이전」을 **글자로** 붙인다(D19). */}
            <div className="es-tabs tl-tabs">
              {teams.map((t) => (
                <button key={t.id} className={'es-tab' + (team?.id === t.id ? ' on' : '')}
                  onClick={() => { setTeamId(t.id); setPage(1); setOpenId(null) }}>
                  <span className={'tl-rel ' + t.relation}>{RELATION_LABEL[t.relation]}</span>
                  {t.name} {t.count}
                </button>
              ))}
            </div>

            {team && team.relation !== 'current' && (
              <div className="tl-hint">{RELATION_HINT[team.relation]}</div>
            )}

            {/* 조회 조건 — **필요한 것만.** 여기서 찾는 것은 「그 자료」 아니면
                「그 사람이 낸 것」이고, 둘 다 한 칸으로 걸린다.
                날짜 범위는 두지 않는다 — 목록이 이미 승인 월로 묶여 있다. */}
            <div className="tl-search">
              <div className="tl-field">
                <Search className="h-4 w-4" />
                <input value={qIn} placeholder="자료 이름 · 작성자 · 부서 · 폴더"
                  aria-label="검색어"
                  onChange={(e) => setQIn(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') applySearch() }} />
              </div>
              <button className="es-mini primary" onClick={applySearch}>조회</button>
              {q && <button className="es-mini" onClick={resetSearch}>
                <X className="h-3 w-3" /> 초기화
              </button>}
              <span className="tl-count">{paged.total}건</span>
            </div>

            <div className="ap-body">
              {/* ── 왼쪽: 작성자 / 월로 묶인 목록 ── */}
              <div className="ap-list tl-list">
                {paged.total === 0 ? (
                  <div className="es-empty">
                    {q ? '검색 결과가 없습니다.' : '이 팀에 올라온 자료가 없습니다.'}
                  </div>
                ) : paged.rows.map((r) => {
                  if (r.kind === 'author') {
                    return (
                      <div key={r.key} className="tl-author">
                        <b>{r.name}</b>
                        {r.isMe && <span className="tl-me">나</span>}
                        {r.dept && <span className="tl-dept">{r.dept}</span>}
                        <span className="tl-n">{r.count}</span>
                      </div>
                    )
                  }
                  if (r.kind === 'month') {
                    return (
                      <div key={r.key} className="tl-month">{r.label} <span>{r.count}</span></div>
                    )
                  }
                  const a = r.flat.item
                  return (
                    <button key={r.key} className={'ap-item' + (openId === a.id ? ' on' : '')}
                      onClick={() => setOpenId(a.id)}>
                      <div className="ap-item-top">
                        <span className="ap-item-name">{a.project_name}</span>
                        {/* **그림은 안 바뀌되 곧 바뀔 자료임은 알려준다**(D8).
                            승인본은 얼어 있고, 여기 붙는 것은 글자뿐이다. */}
                        {a.doc_state_label && (
                          <span className={'tl-ds ' + (a.doc_state || '')}>{a.doc_state_label}</span>
                        )}
                        <span className="ap-st approved">{STATUS_LABEL.approved}</span>
                      </div>
                      <div className="ap-item-sub">
                        {a.round}회차 · {a.page_count}쪽 · 승인 {fmt(a.decided_at)}
                      </div>
                      {a.folder_path && <div className="ap-item-path">{a.folder_path}</div>}
                    </button>
                  )
                })}

                {/* 쪽 이동 — 이어진 다섯 칸(D25). 「…」이 끼어들 자리가 없다. */}
                {paged.totalPages > 1 && (
                  <div className="lib-pager tl-pager">
                    <button disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)}>이전</button>
                    {pageWindow(paged.page, paged.totalPages).map((n) => (
                      <button key={n} className={n === paged.page ? 'on' : ''}
                        onClick={() => setPage(n)}>{n}</button>
                    ))}
                    <button disabled={paged.page >= paged.totalPages}
                      onClick={() => setPage(paged.page + 1)}>다음</button>
                  </div>
                )}
              </div>

              {/* ── 오른쪽: 얼어붙은 승인본 ── */}
              <div className="ap-detail">
                {!detail ? (
                  <div className="es-empty">왼쪽에서 자료를 골라 주세요.</div>
                ) : (
                  <>
                    <div className="ap-d-head">
                      <div>
                        <b>{detail.project_name}</b>
                        {(detail as LibItem).doc_state_label && (
                          <span className={'tl-ds ' + ((detail as LibItem).doc_state || '')}>
                            {(detail as LibItem).doc_state_label}
                          </span>
                        )}
                        <span className="ap-st approved">{STATUS_LABEL.approved}</span>
                        <div className="ap-d-sub">
                          {detail.round}회차 · {detail.requester_name || detail.requester} 제출 ·
                          {' '}{detail.approver_name || ''} 승인 {fmt(detail.decided_at)}
                        </div>
                      </div>
                      <div className="tl-acts">
                        {/* **읽는 일은 새 탭이 맡는다**(㉰). 여기 미리보기는 「고른 게 이
                            자료가 맞나」를 확인하는 자리다 — 두 일을 한 자리에서 하려다
                            둘 다 못 하고 있었다(462×260 으로는 표가 안 읽힌다). */}
                        <button className="es-mini primary" onClick={() => openBig(detail.id)}>
                          <ExternalLink className="h-4 w-4" /> 새 탭에서 크게 보기
                        </button>
                        <button className="es-mini" onClick={() => void openHistory()}>
                          <History className="h-4 w-4" /> 지난 승인본
                        </button>
                      </div>
                    </div>

                    {(detail as LibItem).doc_state === 'revising' && (
                      <div className="tl-hint">
                        작성자가 이 자료를 <b>고치는 중</b>입니다. 지금 보이는 것은
                        <b> 직전 승인본</b>이고, 다시 승인이 나면 그때 바뀝니다.
                      </div>
                    )}
                    {(detail as LibItem).doc_state === 'revision_pending' && (
                      <div className="tl-hint">
                        작성자가 <b>수정 요청</b>을 냈습니다. 아직 허락 전이라 자료는 그대로입니다.
                      </div>
                    )}
                    {detail.decision_message && (
                      <div className="ap-note approved">“{detail.decision_message}”</div>
                    )}

                    {/* 목록에는 최신 1건만 뜬다 — 지운 게 아니라 뺀 것이다. */}
                    {hist && (
                      <div className="tl-hist">
                        <div className="ap-cmts-h">지난 승인본 {hist.length}건</div>
                        {hist.length <= 1 ? (
                          <div className="tl-hist-none">이 자료는 한 번 승인됐습니다.</div>
                        ) : hist.map((h) => (
                          <button key={h.id} className={'tl-hist-i' + (h.id === detail.id ? ' on' : '')}
                            onClick={() => setOpenId(h.id)}>
                            {h.round}회차 · {h.page_count}쪽 · 승인 {fmt(h.decided_at)}
                            {h.id === detail.id && <span className="tl-me">지금 보는 것</span>}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 그림 자체도 눌린다 — 목록에서 자료를 훑는 리듬이 버튼까지 갔다
                        오느라 끊기지 않게. 키보드로도 닿아야 하므로 button 이다. */}
                    <button className="ap-viewer tl-peek" title="새 탭에서 크게 보기"
                      onClick={() => openBig(detail.id)}>
                      <SlideViewer snap={detail.snapshot as never} idx={idx} onIdx={setIdx} />
                      <span className="tl-peek-veil">
                        <span><ExternalLink className="h-4 w-4" /> 새 탭에서 크게 보기</span>
                      </span>
                    </button>

                    {/* **자료는 팀의 것이지만 대화는 아니다.** 결재에서 오간 지적은
                        낸 사람과 결재자 사이의 일이다. 감춘 사실 자체는 감추지 않는다. */}
                    {detail.comments_hidden && (detail.comment_count || 0) > 0 && (
                      <div className="tl-locked">
                        결재 의견 {detail.comment_count}건은 낸 사람과 결재자만 봅니다.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** 한 쪽에 담기는 자료 수 — 화면과 계산이 같은 눈금을 쓴다. */
export { PAGE_SIZE }
