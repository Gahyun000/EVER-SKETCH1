import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, type Me } from '../auth/authApi'
import {
  apiDeleteDeck, apiDistributeSlides, apiGetDeck, apiUploadDeck, type Deck,
} from './cyclesApi'

/**
 * 실물 PPT 업로드 · 슬라이드 배정 (관리자 전용).
 *
 * 화면의 핵심은 하나다 — **어느 슬라이드가 누구 것인가.**
 * 그래서 슬라이드 목록이 곧 배정표다. 별도의 '배정 화면'을 만들지 않는다.
 *
 * 공통 슬라이드(표지·목차)는 모두에게 앞에 붙는다. 이게 없으면 관리자가
 * 표지를 20번 중복 지정해야 한다.
 */
export default function DeckPanel({
  cycleId, writers, distributed, onDistributed,
}: {
  cycleId: string
  writers: Me[]
  distributed: boolean
  onDistributed: () => void
}) {
  const [deck, setDeck] = useState<Deck | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [assign, setAssign] = useState<Record<number, string>>({})
  const [common, setCommon] = useState<number[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      setDeck(await apiGetDeck(cycleId))
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '올린 자료를 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [cycleId])

  // 회차를 바꾸면 배정 내용도 함께 비운다 — 안 비우면 이전 회차의 배정이 남아
  // 엉뚱한 사람에게 배부된다.
  useEffect(() => { setAssign({}); setCommon([]); setMsg(''); void load() }, [cycleId, load])

  const pick = () => fileRef.current?.click()

  const upload = async (file: File) => {
    setBusy('up'); setErr(''); setMsg('')
    try {
      const d = await apiUploadDeck(cycleId, file)
      setDeck(d); setAssign({}); setCommon([])
      setMsg(`${d.filename} — 슬라이드 ${d.slide_count}장을 읽었습니다. 담당자를 지정하세요.`)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '파일을 올리지 못했어요.')
    } finally {
      setBusy('')
      if (fileRef.current) fileRef.current.value = ''   // 같은 파일을 다시 고를 수 있게
    }
  }

  const remove = async () => {
    setBusy('del'); setErr(''); setMsg('')
    try {
      await apiDeleteDeck(cycleId)
      setDeck(null); setAssign({}); setCommon([])
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '지우지 못했어요.')
    } finally {
      setBusy('')
    }
  }

  const assignments = Object.entries(assign)
    .filter(([, uid]) => !!uid)
    .map(([slide, uid]) => ({ slide: Number(slide), user_id: uid }))
  const people = new Set(assignments.map((a) => a.user_id))

  const distribute = async () => {
    setBusy('dist'); setErr(''); setMsg('')
    try {
      const r = await apiDistributeSlides(cycleId, { assignments, common })
      setMsg(r.created_count > 0
        ? `${r.created_count}명에게 배부했습니다.${r.skipped_count ? ` (이미 받은 ${r.skipped_count}명 제외)` : ''}`
        : '모두 이미 배부받았습니다. 새로 만든 자료는 없습니다.')
      onDistributed()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '배부하지 못했어요.')
    } finally {
      setBusy('')
    }
  }

  if (loading) return <div className="cy-deck"><div className="cy-dim">자료를 확인하는 중…</div></div>

  return (
    <div className="cy-deck">
      <div className="cy-deck-head">
        <div>
          <b>실물 PPT 배부</b>
          <span className="cy-dim">
            {deck ? ` · ${deck.filename} · ${deck.slide_count}장` : ' · 아직 올린 자료가 없습니다'}
          </span>
        </div>
        <div className="cy-acts">
          <input ref={fileRef} type="file" accept=".pptx" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} />
          <button className={'cy-mini' + (deck ? '' : ' primary')} disabled={!!busy || distributed}
            title={distributed ? '이미 배부한 회차입니다. 새 회차를 열어 주세요.' : 'PowerPoint(.pptx) 파일'}
            onClick={pick}>
            {busy === 'up' ? '읽는 중…' : deck ? '다시 올리기' : 'PPT 올리기'}
          </button>
          {deck && (
            <button className="cy-mini danger" disabled={!!busy || distributed} onClick={() => void remove()}>
              지우기
            </button>
          )}
        </div>
      </div>

      {err && <div className="cy-msg err">{err}</div>}
      {msg && <div className="cy-msg ok">{msg}</div>}

      {deck && deck.warnings.length > 0 && (
        <div className="cy-msg warn">
          <b>가져오지 못한 것이 있습니다.</b>
          <ul>{deck.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      {!deck ? (
        <p className="cy-foot">
          임원회의에 쓰는 <b>실물 PPT 를 그대로</b> 올리면 슬라이드가 표·글상자 그대로 들어옵니다.
          이미지로 굽지 않으니 배부받은 사람이 그 자리에서 고칠 수 있습니다.
        </p>
      ) : (<>
        <table className="cy-table cy-slides">
          <thead>
            <tr>
              <th style={{ width: 52 }} title="표지·목차처럼 모두에게 앞에 붙일 장">공통</th>
              <th style={{ width: 48 }}>장</th>
              <th>내용</th>
              <th style={{ width: 116 }}>구성</th>
              <th style={{ width: 180 }}>담당자</th>
            </tr>
          </thead>
          <tbody>
            {deck.slides.map((s) => {
              const isCommon = common.includes(s.index)
              return (
                <tr key={s.index} className={isCommon ? 'sent' : ''}>
                  <td>
                    <input type="checkbox" checked={isCommon} disabled={distributed}
                      aria-label={`${s.index + 1}장을 공통으로`}
                      onChange={(e) => setCommon((c) =>
                        e.target.checked ? [...c, s.index] : c.filter((i) => i !== s.index))} />
                  </td>
                  <td className="cy-dim">{s.index + 1}</td>
                  <td><b>{s.title}</b></td>
                  <td className="cy-dim">
                    {[s.tables && `표 ${s.tables}`, s.texts && `글 ${s.texts}`, s.images && `그림 ${s.images}`]
                      .filter(Boolean).join(' · ') || '빈 장'}
                  </td>
                  <td>
                    <select className="cy-sel" value={assign[s.index] || ''} disabled={distributed || isCommon}
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

        <div className="cy-deck-foot">
          <button className="cy-btn primary" disabled={!!busy || distributed || assignments.length === 0}
            onClick={() => void distribute()}>
            {busy === 'dist' ? '배부 중…' : `슬라이드별 배부 (${people.size}명)`}
          </button>
          <span className="cy-hint">
            {writers.length === 0
              ? '배부할 작성자가 없습니다. 먼저 가입을 승인해 주세요.'
              : distributed
                ? '이미 배부한 회차입니다. 원본을 바꾸려면 새 회차를 열어 주세요.'
                : `담당자를 지정한 장만 나갑니다. 공통으로 표시한 장은 ${people.size}명 모두의 맨 앞에 붙습니다.`}
          </span>
        </div>
      </>)}
    </div>
  )
}
