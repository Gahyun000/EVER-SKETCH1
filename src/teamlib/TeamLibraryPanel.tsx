import { useEffect, useMemo, useRef, useState } from 'react'
import SearchRow from '../ui/SearchRow'
import { inRange } from '../ui/searchFilter'
import { clampMaster, keepOrFirst } from '../ui/masterSplit'
import { loadErrorText } from '../persistence/loadError'
import { masterWidth, rememberMasterWidth } from '../persistence/prefs'
import { History, Users, X, ExternalLink } from 'lucide-react'
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
/** **덮개가 아니라 화면이다**(셸, 2026-09-10 → 2026-09-15).
 *  결재함과 같은 몸이라 같은 이유로 카드를 걷었다 — 화면이 곧 마스터-디테일이고,
 *  덮개로 띄우는 길(`embedded` · `onClose`)은 부르는 데가 없어 함께 걷었다.
 *  자세한 까닭은 ApprovalsPanel 머리글에 한 번만 적어 둔다. */
export default function TeamLibraryPanel() {
  const [teams, setTeams] = useState<LibTeam[]>([])
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [err, setErr] = useState('')

  const [teamId, setTeamId] = useState<string | null>(null)
  const [qIn, setQIn] = useState('')     // 입력칸
  // **기간이 여기에도 생겼다**(2026-09-15 ③ㄱ). 뜻은 **승인일**이다 —
  // 이 화면에 올라온 시점이 곧 승인 시점이라, 「언제 올라온 것들인가」가 곧 승인일이다.
  const [fromIn, setFromIn] = useState(''); const [toIn, setToIn] = useState('')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [q, setQ] = useState('')         // **단추를 눌러야** 걸린다 — 치는 대로 걸리지 않는다
  const [page, setPage] = useState(1)

  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<LibItem | null>(null)
  // 목록 칸 폭 — 결재함과 **따로** 기억한다(④ㄴ). 여기 줄은 작성자로 묶여 있어
  // 좁아도 읽히는데, 한 값으로 묶으면 결재함에서 넓힌 값이 여기까지 따라온다.
  const [mw, setMw] = useState(() => masterWidth('tl'))
  const [dragging, setDragging] = useState(false)
  const gripRef = useRef(0)
  const [idx, setIdx] = useState(0)
  const [hist, setHist] = useState<Approval[] | null>(null)

  const load = async () => {
    setErr('')
    try {
      setTeams(await apiTeamLibrary())
      setPhase('ready')
    } catch (e) {
      // **서버가 거절한 것과 서버에 닿지도 못한 것은 다른 말이다**(2026-09-16).
      // 서버가 준 말이 있으면 그것이 가장 정확하고, 없으면 — 그러니까 요청이
      // 서버까지 못 갔으면 — 무엇을 하면 되는지까지 갈라 적는다.
      setErr(e instanceof TeamLibraryError ? e.message : loadErrorText(e, '팀 공유'))
      setPhase('error')
    }
  }
  useEffect(() => { void load() }, [])

  const team = useMemo(() => pickTeam(teams, teamId), [teams, teamId])
  const flat = useMemo(() => flatten(team), [team])
  // 기간은 **묶기 전에** 거른다 — 거른 뒤에 묶어야 작성자 옆 숫자가 실제로 보이는
  // 건수와 맞는다. 거꾸로 하면 「2」라고 적혀 있는데 한 건만 보인다.
  const ranged = useMemo(
    () => (from || to) ? flat.filter((f) => inRange(f.item.decided_at, from, to)) : flat,
    [flat, from, to])
  const paged = useMemo(() => pageOf(ranged, q, page), [ranged, q, page])

  /** **첫 줄은 저절로 골라진다**(③ㄴ). 묶음 줄(작성자·월)은 고를 수 있는 것이
   *  아니므로 건너뛰고 **자료 줄만** 센다 — 안 거르면 작성자 이름을 고른 척하고
   *  오른쪽이 영원히 빈다. 지금 고른 것이 이 쪽에 남아 있으면 안 건드린다. */
  const pickable = useMemo(
    () => paged.rows.flatMap((r) => (r.kind === 'item' ? [r.flat.item.id] : [])),
    [paged])
  useEffect(() => { setOpenId((cur) => keepOrFirst(pickable, cur)) }, [pickable])

  /** 경계선을 끌어 목록 칸을 넓힌다. 놓을 때만 기억한다. */
  const onGrip = (e: React.PointerEvent) => {
    e.preventDefault()
    setDragging(true)
    const startX = e.clientX, startW = mw
    gripRef.current = startW
    const move = (ev: PointerEvent) => {
      const w = clampMaster(startW + (ev.clientX - startX))
      gripRef.current = w
      setMw(w)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragging(false)
      rememberMasterWidth('tl', gripRef.current)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

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

  const applySearch = () => { setQ(qIn); setFrom(fromIn); setTo(toIn); setPage(1); setOpenId(null) }
  const resetSearch = () => {
    setQIn(''); setFromIn(''); setToIn(''); setQ(''); setFrom(''); setTo(''); setPage(1); setOpenId(null)
  }

  /** 읽기 전용 뷰어를 **새 탭**으로 연다. 앞 창은 그대로 남아 고르던 자리를 잃지 않는다. */
  const openBig = (aid: string) => { window.open(`/view/${aid}`, '_blank', 'noopener') }

  const openHistory = async () => {
    if (!detail) return
    try { setHist(await apiTeamHistory(detail.project_id)) } catch { setHist([]) }
  }

  return (
    <div className={'sh-page tl md-screen' + (dragging ? ' md-drag' : '')}>
      <div className="md-top">
        <div className="ap-head">
          {/* 부제목을 뺐다(2026-09-15) — 「승인된 자료만 올라옵니다」는 자료마다 붙는
              「승인」 칩이 이미 하는 말이다. */}
          <div className="es-brand"><b>팀 공유</b></div>
        </div>

        {err && <div className="es-msg err">{err}</div>}
      </div>

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
            {/* 머리 덩어리가 둘인 것은 **팀이 없을 때 탭도 검색도 뜨면 안 되기**
                때문이다. 화면 이름은 늘 보이고, 고르개와 검색은 고를 팀이 있을 때만
                생긴다 — 둘을 한 덩어리로 묶으면 빈 화면에 빈 검색 줄이 남는다. */}
            <div className="md-top">
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

            {/* 세 화면이 같은 줄을 쓴다(2026-09-15). 여기는 단추가 하나뿐이었고
                **초기화가 없어서** 조건을 한 번 걸면 지울 방법이 없었다. */}
            <SearchRow q={qIn} onQ={setQIn} from={fromIn} to={toIn} onFrom={setFromIn} onTo={setToIn}
              placeholder="자료 이름 · 작성자 · 부서 · 폴더" dateLabel="승인일"
              onSearch={applySearch} onReset={resetSearch} />
            {/* 건수는 **목록 바로 위**다(④ㄴ) — 쪽 정보와 한자리에 모인다. */}
            <div className="tl-count-row">전체 {paged.total}건</div>
            </div>

            <div className="ap-body md-body" style={{ gridTemplateColumns: mw + 'px auto 1fr' }}>
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

              {/* **경계선이 곧 손잡이다** — 결재함과 같은 물건이다. */}
              <div className="md-grip" onPointerDown={onGrip}
                title="끌어서 목록 칸 폭을 바꿉니다" aria-hidden="true" />

              {/* ── 오른쪽: 얼어붙은 승인본 ── */}
              <div className="ap-detail">
                {!detail ? (
                  /* 첫 줄이 저절로 골라지므로(③ㄴ) 여기가 비는 경우는 둘뿐이다 —
                     이 쪽에 자료가 없거나, 고른 것을 아직 받아 오는 중이거나. */
                  <div className="es-empty">{openId ? '불러오는 중…' : '볼 자료가 없습니다.'}</div>
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
  )
}

/** 한 쪽에 담기는 자료 수 — 화면과 계산이 같은 눈금을 쓴다. */
export { PAGE_SIZE }
