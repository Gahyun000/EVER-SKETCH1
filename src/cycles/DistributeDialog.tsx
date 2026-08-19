import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, type Me } from '../auth/authApi'
import type { Page } from '../state/store'
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
  cycleId, writers, distributed, onClose, onDone,
}: {
  cycleId: string
  writers: Me[]
  /** 이미 배부된 건이 있는가 — 있으면 원본 교체를 막는다. */
  distributed: boolean
  onClose: () => void
  onDone: (msg: string) => void
}) {
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
      const d = await apiUploadDeck(cycleId, file)
      setDeck(d); setAssign({}); setCommon([])
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
      onDone(r.created_count > 0
        ? `${r.created_count}명에게 배부했습니다.${r.skipped_count ? ` (이미 받은 ${r.skipped_count}명 제외)` : ''}`
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
    <div className="cy-scrim" role="dialog" aria-modal="true" aria-labelledby="cy-ds-t"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="cy-modal wide">
        <h3 id="cy-ds-t">
          {step === 'choose' ? '무엇을 배부할까요?'
            : step === 'deck' ? '실물 PPT — 슬라이드별 배부'
            : '표준 양식 배부'}
        </h3>

        {err && <div className="cy-msg err">{err}</div>}

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
              <button className="cy-btn primary" disabled={!!busy || distributed}
                onClick={() => fileRef.current?.click()}>
                {busy === 'up' ? '읽는 중…' : 'PowerPoint 파일 고르기'}
              </button>
              <p className="cy-hint">
                {distributed
                  ? '이미 배부한 회차입니다. 원본을 바꾸려면 먼저 배부를 회수하거나 새 회차를 열어 주세요.'
                  : '.pptx 파일만 올릴 수 있습니다. 이미지로 굽지 않으니 받는 사람이 그대로 고칠 수 있습니다.'}
              </p>
            </div>
          ) : (<>
            <div className="cy-deck-head">
              <div><b>{deck.filename}</b><span className="cy-dim"> · {deck.slide_count}장</span></div>
              <div className="cy-acts">
                <button className="cy-mini" disabled={!!busy || distributed}
                  onClick={() => fileRef.current?.click()}>다시 올리기</button>
                <button className="cy-mini danger" disabled={!!busy || distributed}
                  onClick={() => void removeDeck()}>지우기</button>
              </div>
            </div>

            {deck.warnings.length > 0 && (
              <div className="cy-msg warn">
                <b>가져오지 못한 것이 있습니다.</b>
                <ul>{deck.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </div>
            )}

            <div className="cy-two">
              <div className="cy-rv-list tall">
                <table className="cy-table cy-slides">
                  <thead>
                    <tr>
                      <th style={{ width: 46 }} title="표지·목차처럼 모두에게 앞에 붙일 장">공통</th>
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
                            <input type="checkbox" checked={isCommon} disabled={distributed}
                              aria-label={`${s.index + 1}장을 공통으로`}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setCommon((c) =>
                                e.target.checked ? [...c, s.index] : c.filter((i) => i !== s.index))} />
                          </td>
                          <td className="cy-dim">{s.index + 1}</td>
                          <td><b>{s.title}</b></td>
                          <td>
                            <select className="cy-sel" value={assign[s.index] || ''}
                              disabled={distributed || isCommon}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setAssign((a) => ({ ...a, [s.index]: e.target.value }))}>
                              <option value="">— 배부 안 함 —</option>
                              {writers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name}{u.dept ? ` · ${u.dept}` : ''}
                                </option>
                              ))}
                            </select>
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

        <div className="cy-modal-btns">
          {step !== 'choose' && (
            <button className="cy-btn" disabled={!!busy}
              onClick={() => { setStep('choose'); setErr('') }}>← 뒤로</button>
          )}
          <span className="cy-modal-spacer">
            {step === 'deck' && deck && (
              <span className="cy-hint">
                담당자를 지정한 장만 나갑니다.
                {common.length > 0 && ` 공통 ${common.length}장은 ${people.size}명 모두의 맨 앞에 붙습니다.`}
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
              disabled={!!busy || distributed || assignments.length === 0}
              onClick={() => void sendDeck()}>
              {busy === 'dist' ? '배부 중…' : `슬라이드별 배부 (${people.size}명)`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
