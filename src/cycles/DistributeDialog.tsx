import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, type Me } from '../auth/authApi'
import type { Page } from '../state/store'
import Modal from '../ui/Modal'
import PagePreview from './PagePreview'
import {
  apiDeleteDeck, apiDistribute, apiDistributeSlides, apiGetDeck, apiPreviewPage,
  apiUploadDeck, type Deck,
} from './cyclesApi'

type Step = 'choose' | 'deck' | 'template'

/**
 * 배부 창구 — **하나뿐이다.**
 *
 * 예전에는 '표준 양식 배부'(파란 버튼)와 'PPT 올리기'(아래 패널)가 따로 있었다.
 * 파란 버튼이 눈에 먼저 들어오니 다들 그걸 눌렀고, 실물 PPT 를 배부하려던
 * 사람이 빈 표준 양식을 배부해 버렸다. 두 갈래를 한 창구 안의 선택지로 합친다.
 *
 * 두 갈래 모두 **누르기 전에 실제로 나갈 장을 보여준다.** 배부는 되돌리기 비싼
 * 조작이고(회수해야 한다), 잘못 나가면 임원 20명이 그걸 먼저 본다.
 */
export default function DistributeDialog({
  cycleId, writers, distributedCount, onClose, onDone,
}: {
  cycleId: string
  writers: Me[]
  /** 이 회차에서 이미 배부된 건수. */
  distributedCount: number
  onClose: () => void
  onDone: (msg: string) => void
}) {
  // **원본 교체와 추가 배부는 다른 일이다.**
  //
  // 예전엔 하나라도 배부됐으면 창 전체를 잠갔다. 그래서 표준 양식 한 장이 나간
  // 회차에서는 PPT 담당자를 고르는 칸까지 회색이 됐고, '모두에게 보내는 게
  // 잠긴 거냐' 는 질문을 받았다. 잠긴 이유를 화면 어디에도 안 적어둔 탓이다.
  //
  // 서버 규칙 그대로 맞춘다:
  //   원본 교체·삭제 → 이미 나간 자료와 어긋나므로 막는다(save_deck 이 거부).
  //   추가 배부      → 허용. 이미 받은 사람은 서버가 건너뛴다(distribute_slides).
  const lockSource = distributedCount > 0
  const [step, setStep] = useState<Step>('choose')
  const [deck, setDeck] = useState<Deck | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [assign, setAssign] = useState<Record<number, string>>({})
  const [common, setCommon] = useState<number[]>([])
  const [preview, setPreview] = useState<Page | null>(null)
  const [previewOf, setPreviewOf] = useState<number | null>(null)   // null = 표준 양식
  const [previewErr, setPreviewErr] = useState('')
  const [reset, setReset] = useState(false)     // 다시 올리면서 배정을 지웠는가
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setDeck(await apiGetDeck(cycleId)) }
    catch (e) { setErr(e instanceof ApiError ? e.message : '올린 자료를 확인하지 못했어요.') }
    finally { setLoading(false) }
  }, [cycleId])

  useEffect(() => { void load() }, [load])

  // 미리보기는 단계가 바뀔 때마다 새로 받는다 — 화면에 남은 옛 장을 보고
  // '이게 나가겠구나' 하면 그게 곧 오배부다.
  const showPreview = useCallback(async (slide: number | null) => {
    setPreview(null); setPreviewErr(''); setPreviewOf(slide)
    try {
      const r = await apiPreviewPage(cycleId, slide ?? undefined)
      setPreview(r.page as Page)
    } catch (e) {
      setPreviewErr(e instanceof ApiError ? e.message : '미리보기를 불러오지 못했어요.')
    }
  }, [cycleId])

  const goTemplate = () => { setStep('template'); setErr(''); void showPreview(null) }
  const goDeck = () => {
    setStep('deck'); setErr('')
    if (deck) void showPreview(0)
  }

  const upload = async (file: File) => {
    setBusy('up'); setErr('')
    try {
      const hadPlan = Object.values(assign).some(Boolean) || common.length > 0
      const d = await apiUploadDeck(cycleId, file)
      // 장 수와 순서가 달라질 수 있으니 배정을 비운다. **조용히 비우면 안 된다** —
      // 공통 체크가 사라진 걸 모르고 배부해서 표지가 안 나간 일이 있었다.
      setDeck(d); setAssign({}); setCommon([])
      setReset(hadPlan)
      await showPreview(0)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '파일을 올리지 못했어요.')
    } finally {
      setBusy('')
      if (fileRef.current) fileRef.current.value = ''    // 같은 파일을 다시 고를 수 있게
    }
  }

  const removeDeck = async () => {
    setBusy('del'); setErr('')
    try {
      await apiDeleteDeck(cycleId)
      setDeck(null); setAssign({}); setCommon([]); setPreview(null)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '지우지 못했어요.')
    } finally { setBusy('') }
  }

  const assignments = Object.entries(assign)
    .filter(([slide, uid]) => !!uid && !common.includes(Number(slide)))
    .map(([slide, uid]) => ({ slide: Number(slide), user_id: uid }))
  const people = new Set(assignments.map((a) => a.user_id))

  const sendDeck = async () => {
    setBusy('dist'); setErr('')
    try {
      const r = await apiDistributeSlides(cycleId, { assignments, common })
      const pages = r.created.map((x) => x.page_count)
      const each = pages.length && pages.every((n) => n === pages[0]) ? `각 ${pages[0]}장` : ''
      onDone(r.created_count > 0
        ? `${r.created_count}명에게 배부했습니다${each ? ` (${each}` : ''}`
          + `${each && common.length ? `, 공통 ${common.length}장 포함` : ''}${each ? ')' : ''}.`
          + `${r.skipped_count ? ` 이미 받은 ${r.skipped_count}명은 건너뛰었습니다.` : ''}`
        : '모두 이미 배부받았습니다. 새로 만든 자료는 없습니다.')
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '배부하지 못했어요.')
      setBusy('')
    }
  }

  const sendTemplate = async () => {
    setBusy('dist'); setErr('')
    try {
      const r = await apiDistribute(cycleId)
      onDone(r.created_count > 0
        ? `${r.created_count}명에게 표준 양식을 배부했습니다.${r.skipped_count ? ` (이미 받은 ${r.skipped_count}명 제외)` : ''}`
        : '모두 이미 배부받았습니다. 새로 만든 장은 없습니다.')
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '배부하지 못했어요.')
      setBusy('')
    }
  }

  const previewBox = (
    <div className="cy-prevbox">
      <div className="cy-prevhead">
        미리보기
        <span className="cy-dim">
          {previewOf == null ? ' · 표준 양식 1장' : ` · ${previewOf + 1}번 슬라이드`}
          {' · 실제로 나가는 그대로입니다'}
        </span>
      </div>
      {previewErr ? <div className="cy-msg err">{previewErr}</div>
        : preview ? <PagePreview page={preview} width={560} />
        : <div className="cy-prev-load">불러오는 중…</div>}
    </div>
  )

  return (
    /* 껍데기(스크림·Esc·포커스)는 ui/Modal 이 맡는다 — 창마다 따로 만들지 않는다. */
    <Modal size="lg" className="cy-modal wide" scrimClassName="cy-scrim" footClassName="cy-modal-btns"
      labelId="cy-ds-t" busy={!!busy} error={err} onClose={onClose}
      title={step === 'choose' ? '무엇을 배부할까요?'
        : step === 'deck' ? '실물 PPT — 슬라이드별 배부'
        : '표준 양식 배부'}
      footer={<>
      {step !== 'choose' && (
        <button className="cy-btn" disabled={!!busy}
          onClick={() => { setStep('choose'); setErr('') }}>← 뒤로</button>
      )}
      <span className="cy-modal-spacer">
        {step === 'deck' && deck && (
          /* 잠긴 버튼이 이유를 말하지 않으면, 사용자는 엉뚱한 곳(경고 문구 등)을
             원인으로 짚는다. 실제로 '가져오지 못한 게 있어서 배부가 안 되냐' 는
             질문을 받았다 — 관계없는 경고였다. 무엇이 모자란지 여기서 말한다. */
          <span className={'cy-hint' + (assignments.length === 0 ? ' cy-need' : '')}>
            {assignments.length === 0
              ? (common.length > 0
                ? '공통 장은 「받는 사람」이 정해져야 나갑니다. 담당자를 한 명 이상 지정해 주세요.'
                : '담당자를 한 명 이상 지정해야 배부할 수 있습니다. 위 표의 「담당자」에서 고르세요.')
              : `${people.size}명에게 담당분 ${assignments.length}장이 나갑니다.`}
            {common.length > 0 && ` 공통 ${common.length}장은 ${people.size || '받는'}${people.size ? '명' : ' 사람'} 모두의 맨 앞에 붙습니다.`}
          </span>
        )}
      </span>
      <button className="cy-btn" disabled={!!busy} onClick={onClose}>닫기</button>
      {step === 'template' && (
        <button className="cy-btn primary" disabled={!!busy || writers.length === 0}
          onClick={() => void sendTemplate()}>
          {busy === 'dist' ? '배부 중…' : `${writers.length}명에게 배부`}
        </button>
      )}
      {step === 'deck' && deck && (
        <button className="cy-btn primary"
          disabled={!!busy || assignments.length === 0}
          title={assignments.length === 0 ? '담당자를 한 명 이상 지정해 주세요'
            : `${people.size}명에게 배부합니다 (이미 받은 사람은 건너뜁니다)`}
          onClick={() => void sendDeck()}>
          {busy === 'dist' ? '배부 중…' : `슬라이드별 배부 (${people.size}명)`}
        </button>
      )}
      </>}>

        {/* ── 1) 방식 고르기 ── */}
        {step === 'choose' && (loading ? <p className="cy-dim">확인하는 중…</p> : (
          <div className="cy-pick">
            <button className="cy-pickcard" onClick={goDeck}>
              <b>실물 PPT 올리기</b>
              <span className="cy-pick-tag">권장</span>
              <p>
                임원회의에 쓰던 파일을 그대로 올립니다. 표는 표로, 병합·색·열너비까지
                그대로 들어와서 받는 사람이 그 자리에서 고칩니다.
              </p>
              <span className="cy-dim">
                {deck ? `올린 자료: ${deck.filename} · ${deck.slide_count}장` : '아직 올린 자료가 없습니다'}
              </span>
            </button>
            <button className="cy-pickcard" onClick={goTemplate}>
              <b>표준 양식</b>
              <p>
                빈 정본 1장을 작성자 전원에게 나눠 줍니다. 쓰던 자료가 없거나
                처음부터 새로 쓸 때 씁니다.
              </p>
              <span className="cy-dim">
                {writers.length ? `대상 ${writers.length}명` : '배부할 작성자가 없습니다'}
              </span>
            </button>
          </div>
        ))}

        {/* ── 2-A) 표준 양식 ── */}
        {step === 'template' && (
          <div className="cy-two">
            <div>
              <p className="cy-rv-lead">
                활성 작성자 <b>{writers.length}명</b>에게 빈 정본 1장씩 나갑니다.
              </p>
              <div className="cy-rv-list">
                <table className="cy-table">
                  <thead><tr><th>받는 사람</th><th style={{ width: 110 }}>부서</th></tr></thead>
                  <tbody>
                    {writers.map((u) => (
                      <tr key={u.id}><td><b>{u.name}</b></td><td className="cy-dim">{u.dept || '—'}</td></tr>
                    ))}
                    {writers.length === 0 && (
                      <tr><td colSpan={2} className="cy-dim">먼저 가입을 승인해 주세요.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {previewBox}
          </div>
        )}

        {/* ── 2-B) 실물 PPT ── */}
        {step === 'deck' && (<>
          <input ref={fileRef} type="file" accept=".pptx" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} />

          {!deck ? (
            <div className="cy-drop">
              <button className="cy-btn primary" disabled={!!busy || lockSource}
                onClick={() => fileRef.current?.click()}>
                {busy === 'up' ? '읽는 중…' : 'PowerPoint 파일 고르기'}
              </button>
              <p className="cy-hint">
                {lockSource
                  ? '이미 배부한 회차입니다. 원본을 올리려면 먼저 배부를 회수하거나 새 회차를 열어 주세요.'
                  : '.pptx 파일만 올릴 수 있습니다. 이미지로 굽지 않으니 받는 사람이 그대로 고칠 수 있습니다.'}
              </p>
            </div>
          ) : (<>
            <div className="cy-deck-head">
              <div><b>{deck.filename}</b><span className="cy-dim"> · {deck.slide_count}장</span></div>
              <div className="cy-acts">
                <button className="cy-mini" disabled={!!busy || lockSource}
                  title={lockSource ? '이미 배부한 회차입니다. 원본을 바꾸려면 먼저 회수해 주세요.' : undefined}
                  onClick={() => fileRef.current?.click()}>다시 올리기</button>
                <button className="cy-mini danger" disabled={!!busy || lockSource}
                  title={lockSource ? '이미 배부한 회차입니다. 원본을 바꾸려면 먼저 회수해 주세요.' : undefined}
                  onClick={() => void removeDeck()}>지우기</button>
              </div>
            </div>

            {lockSource && (
              /* 잠긴 이유를 말하지 않으면 사용자는 엉뚱한 곳을 원인으로 짚는다.
                 무엇이 잠겼고, 무엇은 되고, 어떻게 푸는지까지 한 문단에 담는다. */
              <div className="cy-msg warn">
                <b>이미 배부한 회차입니다 ({distributedCount}건).</b>{' '}
                원본 PPT 를 바꾸거나 지우는 것은 막혀 있습니다 — 이미 나간 자료와 어긋나기 때문입니다.
                <b> 담당자 지정과 추가 배부는 그대로 됩니다</b>(이미 받은 사람은 건너뜁니다).
                원본을 바꾸려면 회차 화면의 <b>「배부 취소」</b>로 먼저 회수해 주세요.
              </div>
            )}

            {deck.stale && (
              <div className="cy-msg warn">
                <b>예전 변환기로 읽은 자료입니다.</b> 그동안 고친 것들
                (표 크기·표지 배경·슬라이드 제목)이 이 자료에는 반영돼 있지 않습니다.
                <b> 「다시 올리기」</b>를 눌러 주세요.
                <span className="cy-dim"> (읽은 판 {deck.converter || '알 수 없음'})</span>
              </div>
            )}

            {deck.warnings.length > 0 && (
              <div className="cy-msg warn">
                <b>가져오지 못한 것이 있습니다.</b>
                <ul>{deck.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </div>
            )}

            {reset && (
              <div className="cy-msg warn">
                새 파일을 읽었으므로 <b>담당자 지정과 공통 표시를 비웠습니다.</b>
                장 수나 순서가 달라졌을 수 있어서입니다 — 다시 지정해 주세요.
              </div>
            )}

            <div className="cy-two">
              <div className="cy-rv-list tall">
                <table className="cy-table cy-slides">
                  <thead>
                    <tr>
                      <th style={{ width: 46 }}
                title="표지·목차처럼 담당자 없이 모두에게 붙일 장. 받는 사람은 아래 '담당자'에서 정해집니다.">공통</th>
                      <th style={{ width: 40 }}>장</th>
                      <th>내용</th>
                      <th style={{ width: 152 }}>담당자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deck.slides.map((s) => {
                      const isCommon = common.includes(s.index)
                      return (
                        <tr key={s.index}
                          className={(isCommon ? 'sent ' : '') + (previewOf === s.index ? 'cy-row-on' : '')}
                          onClick={() => void showPreview(s.index)}>
                          <td>
                            <input type="checkbox" checked={isCommon}
                              aria-label={`${s.index + 1}장을 공통으로`}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setCommon((c) =>
                                e.target.checked ? [...c, s.index] : c.filter((i) => i !== s.index))} />
                          </td>
                          <td className="cy-dim">{s.index + 1}</td>
                          <td><b>{s.title}</b></td>
                          <td>
                            {/* 공통으로 표시한 장은 담당자가 필요 없다 — 모두에게 가니까.
                                예전에는 회색으로 잠긴 select 를 그대로 뒀는데,
                                '체크했더니 막혔다' 로 읽혔다. 잠금이 아니라 결과를 보여준다. */}
                            {isCommon ? (
                              <span className="cy-allto">모두에게</span>
                            ) : (
                              <select className="cy-sel" value={assign[s.index] || ''}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setAssign((a) => ({ ...a, [s.index]: e.target.value }))}>
                                <option value="">— 배부 안 함 —</option>
                                {writers.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name}{u.dept ? ` · ${u.dept}` : ''}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {previewBox}
            </div>
          </>)}
        </>)}

        {step === 'deck' && deck && (
          /* 보내기 전에 **누가 몇 장 받는지**를 못 박아 보여준다.
             예전에는 공통 체크가 빠진 줄 모르고 배부해서 표지가 안 나갔다.
             '= 1장' 이 눈앞에 있었으면 누르기 전에 알아챘을 일이다. */
          <div className="cy-plan">
            <b>이렇게 나갑니다</b>
            {assignments.length === 0 ? (
              <span className="cy-dim"> — 아직 받는 사람이 없습니다.</span>
            ) : (
              <ul>
                {[...people].map((uid) => {
                  const u = writers.find((x) => x.id === uid)
                  const own = assignments.filter((a) => a.user_id === uid).length
                  return (
                    <li key={uid}>
                      <b>{u ? u.name : uid}</b>
                      {common.length > 0 ? ` — 공통 ${common.length}장 + 담당 ${own}장 = ` : ' — '}
                      <b className="cy-plan-n">{common.length + own}장</b>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

    </Modal>
  )
}
