import { useEffect, useState } from 'react'
import { Lock, History, X, Users } from 'lucide-react'
import SlideViewer from '../approvals/SlideViewer'
import { STATUS_LABEL } from '../approvals/approvalApi'
import { TeamLibraryError, apiTeamApproval, apiTeamHistory, type LibItem } from './teamLibraryApi'
import { viewerIdFromPath } from './teamLibraryModel'

const fmt = (ts?: number | null) =>
  ts ? new Date(ts).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : '-'

/**
 * 승인본 읽기 전용 뷰어 — **새 탭으로 여는 화면** (㉰).
 *
 * 팀 공유의 미리보기는 「고른 게 이 자료가 맞나」를 확인하는 자리고,
 * **읽는 일은 여기가 맡는다.** 그래서 이 화면에는 자료 하나뿐이다 —
 * 목록도, 탭도, 접히는 것도 없다. 읽는 데 방해가 될 것을 두지 않는다.
 *
 * **권한은 서버가 판정한다.** 주소를 아는 것만으로는 아무것도 열리지 않는다:
 * `/api/team-library/approval/{aid}` 가 `can_see_approval` 을 거치고,
 * 못 보는 건이면 404 다(403 이 아니다 — 403 은 「그 id 는 있다」를 확인해 준다).
 * 그래서 링크가 새어도 자료는 안 샌다. 화면은 그 사실을 **글자로도 적어 둔다.**
 */
export default function ApprovalViewer({ aid }: { aid: string }) {
  const [a, setA] = useState<LibItem | null>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading')
  const [err, setErr] = useState('')
  const [idx, setIdx] = useState(0)
  const [hist, setHist] = useState<LibItem[] | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const got = await apiTeamApproval(aid)
        if (!alive) return
        setA(got); setPhase('ready')
        document.title = got.project_name || '승인본'
      } catch (e) {
        if (!alive) return
        // **404 를 「없다」로 말하지 않는다.** 서버가 없는 것과 남의 것을 일부러
        // 같은 답으로 뭉갰으므로, 화면도 어느 쪽인지 모르는 채로 말해야 한다.
        if (e instanceof TeamLibraryError && e.status === 404) setPhase('denied')
        else { setErr(e instanceof Error ? e.message : '불러오지 못했습니다.'); setPhase('error') }
      }
    })()
    return () => { alive = false }
  }, [aid])

  const openHistory = async () => {
    if (!a) return
    try { setHist(await apiTeamHistory(a.project_id)) } catch { setHist([]) }
  }

  if (phase === 'loading') return <div className="tv"><div className="tv-mid">불러오는 중…</div></div>
  if (phase === 'denied') {
    return (
      <div className="tv"><div className="tv-mid tv-deny">
        <Lock className="h-5 w-5" />
        <b>이 자료는 볼 수 없습니다.</b>
        <p>
          승인본은 <b>같은 팀 사람만</b> 열 수 있습니다.<br />
          링크를 받으셨다면, 그 자료를 만든 팀에 속해 있어야 열립니다.
        </p>
      </div></div>
    )
  }
  if (phase === 'error' || !a) {
    return (
      <div className="tv"><div className="tv-mid">
        {err || '불러오지 못했습니다.'}<br />
        <button className="es-mini" style={{ marginTop: 10 }}
          onClick={() => { setPhase('loading'); setErr('') }}>다시 시도</button>
      </div></div>
    )
  }

  const pages = a.snapshot?.pages?.length || 0
  return (
    <div className={'tv' + (pages <= 1 ? ' one' : '')}>
      {/* 머리줄 한 줄. **무엇을 보고 있는지와, 누가 볼 수 있는지를 같이 적는다** —
          주소가 생긴 화면이라 「이 링크 아무나 보나」가 먼저 떠오른다. */}
      <div className="tv-head">
        <b className="tv-name">{a.project_name}</b>
        <span className="ap-st approved">{STATUS_LABEL.approved}본</span>
        <span className="tv-ro"><Lock className="h-3 w-3" /> 읽기 전용</span>
        {a.doc_state_label && (
          <span className={'tl-ds ' + (a.doc_state || '')}>{a.doc_state_label}</span>
        )}
        <span className="tv-meta">
          {a.round}회차 · {a.requester_name || a.requester} 제출 ·
          {' '}{a.approver_name || ''} 승인 {fmt(a.decided_at)}
        </span>
        <span className="tv-only">이 자료를 만든 팀만 볼 수 있어요</span>
        <button className="es-mini" onClick={() => void openHistory()}>
          <History className="h-4 w-4" /> 지난 승인본
        </button>
        {/* **돌아가는 길.** 이게 없으면 링크를 받은 사람은 문서 한 장을 보고 끝이다 —
            그 사람에게는 닫고 돌아갈 앞 창이 아예 없다(새 탭이 아니라 이 탭이 전부다).
            `/` 가 아니라 팀 공유로 보내는 이유: 방금까지 보던 것이 팀 자료였다.
            그냥 `/` 로 보내면 「내 서랍」에 내리고, 제 자료가 없는 열람자에게는
            그게 빈 화면이다. */}
        <button className="es-mini primary" onClick={() => { window.location.href = '/?shared=1' }}>
          <Users className="h-4 w-4" /> 팀 공유 열기
        </button>
      </div>

      {/* 「수정 중」은 그림을 바꾸지 않는다 — 지금 보이는 것이 직전 승인본임을 말해 준다(D8). */}
      {a.doc_state === 'revising' && (
        <div className="tv-hint">
          작성자가 이 자료를 <b>고치는 중</b>입니다. 지금 보이는 것은 <b>직전 승인본</b>이고,
          다시 승인이 나면 그때 바뀝니다.
        </div>
      )}
      {a.doc_state === 'revision_pending' && (
        <div className="tv-hint">
          작성자가 <b>수정 요청</b>을 냈습니다. 아직 허락 전이라 자료는 그대로입니다.
        </div>
      )}

      {hist && (
        <div className="tv-hist">
          <div className="tv-hist-h">
            지난 승인본 {hist.length}건
            <button className="es-mini" onClick={() => setHist(null)}><X className="h-3 w-3" /> 닫기</button>
          </div>
          {hist.length <= 1 ? (
            <div className="tv-hist-none">이 자료는 한 번 승인됐습니다.</div>
          ) : hist.map((h) => (
            <a key={h.id} className={'tv-hist-i' + (h.id === a.id ? ' on' : '')} href={`/view/${h.id}`}>
              {h.round}회차 · {h.page_count}쪽 · 승인 {fmt(h.decided_at)}
              {h.id === a.id && <span className="tv-me">지금 보는 것</span>}
            </a>
          ))}
        </div>
      )}

      <div className="tv-body">
        <SlideViewer snap={a.snapshot as never} idx={idx} onIdx={setIdx} />
      </div>
    </div>
  )
}

export { viewerIdFromPath }
