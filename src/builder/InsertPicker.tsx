import { useState } from 'react'
import { intakeImage } from './imageIntake'
import { useCanvasUI } from '../state/canvasUI'
import { useBuilder } from '../state/store'
import { mkFreeEl, pushSnap } from '../canvas/model'

// 이모지: [문자, 검색 키워드]
const EMOJI: Record<string, [string, string][]> = {
  '표정': [['😀','웃음 happy'],['😃','웃음'],['😄','웃음'],['😁','활짝'],['😆','하하'],['😊','미소 smile'],['🙂','미소'],['😉','윙크'],['😍','하트 love'],['🥰','사랑'],['😎','선글라스 cool'],['🤔','고민 think 생각'],['🤨','의심'],['🧐','관찰'],['😅','식은땀'],['😂','눈물 웃음'],['🥳','축하 party'],['😴','졸림 sleep'],['😌','안도'],['🙃','반전']],
  '제스처': [['👍','좋아요 good thumbs'],['👎','싫어요 bad'],['👌','오케이 ok'],['✌️','브이 victory'],['🙏','부탁 감사 thanks'],['👏','박수 clap'],['💪','힘 근육 strong'],['🙌','만세'],['👀','주목 눈 look'],['✍️','필기 write 작성'],['🫡','경례'],['🫰','하트'],['👋','인사 hi bye'],['🤝','악수 deal 협력']],
  '기호': [['✅','완료 체크 done check'],['❌','취소 no'],['❗','중요 느낌표'],['❓','질문 물음표'],['⭐','별 star'],['🔥','핫 인기 fire'],['💯','만점'],['⚠️','주의 경고 warning'],['🚫','금지'],['➡️','오른쪽 화살표'],['⬆️','위'],['⬇️','아래'],['🔴','빨강'],['🟢','초록'],['🔵','파랑'],['✔️','체크']],
  '업무': [['💡','아이디어 idea 인사이트'],['🎯','목표 target 타깃'],['📌','핀 고정 pin'],['📎','클립 첨부'],['🗂️','자료 폴더'],['🗓️','일정 캘린더'],['📊','차트 통계 chart'],['📈','상승 성장 up'],['📉','하락 down'],['💰','돈 비용 money'],['🧩','조각 퍼즐'],['🚀','론칭 성장 rocket'],['🏁','완료 목표 finish'],['🔗','링크 연결'],['📝','메모 노트'],['📋','체크리스트 clipboard'],['🔍','검색 분석 search'],['⏰','시간 마감 time']],
  '사물': [['📱','모바일'],['💻','노트북'],['🖥️','모니터'],['📷','카메라'],['🔒','보안 잠금 lock'],['🔑','키 열쇠'],['🎁','선물'],['📦','박스 배포'],['🌟','반짝'],['☕','커피'],['🍎','사과'],['🌿','잎'],['⚽','공'],['✈️','비행기'],['🏆','트로피 성과']],
}
const CATS = Object.keys(EMOJI)
const ALL_EMOJI = CATS.flatMap((c) => EMOJI[c])

// lucide 라인 아이콘: [키워드, svg inner]
const ICONS: [string, string][] = [
  ['별 star','<polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9"/>'],
  ['체크 check','<polyline points="20 6 9 17 4 12"/>'],
  ['화살표 arrow','<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>'],
  ['하트 heart','<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>'],
  ['북마크','<path d="M4 22V4a2 2 0 0 1 2-2h12v20l-8-5-6 5z"/>'],
  ['알림 bell','<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'],
  ['시간 clock','<circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 2"/>'],
  ['확인 checkcircle','<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'],
  ['차트 chart','<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>'],
  ['정보 info','<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'],
  ['깃발 flag','<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>'],
  ['타깃 target','<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'],
  ['전구 idea','<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12c1 1 1 2 1 3h6c0-1 0-2 1-3a7 7 0 0 0-4-12z"/>'],
  ['핀 pin','<path d="M12 21s-6-5.7-6-10a6 6 0 1 1 12 0c0 4.3-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>'],
]

function iconSvgUrl(inner: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#111318" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

export default function InsertPicker() {
  const open = useCanvasUI((s) => s.pickerOpen)
  const close = useCanvasUI((s) => s.closePicker)
  const addEl = useBuilder((s) => s.addEl)
  const [tab, setTab] = useState<'emoji' | 'icon' | 'upload'>('emoji')
  const [cat, setCat] = useState(CATS[0])
  const [q, setQ] = useState('')

  if (!open) return null

  function targetPid(): number | null {
    const s = useBuilder.getState()
    if (s.selectedPageId != null) return s.selectedPageId
    return s.pages.length ? s.pages[s.pages.length - 1].id : null
  }
  function snapPage(pid: number) {
    const p = useBuilder.getState().pages.find((x) => x.id === pid)
    if (p) pushSnap(pid, JSON.stringify({ els: p.els, conns: p.conns, strokes: p.strokes }))
  }
  function insertEmoji(ch: string) {
    const pid = targetPid(); if (pid == null) return
    snapPage(pid)
    const el = mkFreeEl('text', 360, 250); el.text = ch; el.fs = 46; el.w = 72; el.h = 72; el.align = 'center'
    addEl(pid, el); close()
  }
  function insertImage(src: string, w = 64, h = 64) {
    const pid = targetPid(); if (pid == null) return
    snapPage(pid)
    const el = mkFreeEl('image', 360, 240); el.src = src; el.w = w; el.h = h; el.text = ''
    addEl(pid, el); close()
  }
  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0]; if (!f) return
    // 넣기 전에 축소하고, 상자는 사진 원래 비율대로 잡는다(고정 180×130 이면 여백이 생긴다).
    intakeImage(f).then((r) => {
      const base = 260
      const k = (r.w && r.h) ? base / Math.max(r.w, r.h) : 0
      insertImage(r.src, k ? Math.max(24, Math.round(r.w * k)) : 180, k ? Math.max(24, Math.round(r.h * k)) : 130)
    }).catch(() => { /* 읽기 실패 */ })
  }

  const emojiList = q.trim()
    ? ALL_EMOJI.filter(([c, k]) => k.includes(q.trim().toLowerCase()) || c === q.trim())
    : EMOJI[cat]

  return (
    <div className="ins-scrim" onClick={close}>
      <div className="ins-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="이모지·아이콘·이미지 삽입">
        <div className="ins-tabs">
          <button className={'ins-tab' + (tab === 'emoji' ? ' on' : '')} onClick={() => setTab('emoji')}>이모지</button>
          <button className={'ins-tab' + (tab === 'icon' ? ' on' : '')} onClick={() => setTab('icon')}>아이콘</button>
          <button className={'ins-tab' + (tab === 'upload' ? ' on' : '')} onClick={() => setTab('upload')}>업로드</button>
          <button className="ins-x" onClick={close} aria-label="닫기">✕</button>
        </div>

        {tab === 'emoji' && (
          <>
            <div className="ins-search">
              <span>🔍</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이모지 검색 (예: 목표, check)" aria-label="이모지 검색" />
              {q ? <button className="ins-clr" onClick={() => setQ('')} title="지우기">✕</button> : null}
            </div>
            <div className="ins-grid emoji">
              {emojiList.map(([c], i) => (
                <button key={c + i} className="ins-e" title={c} onClick={() => insertEmoji(c)}>{c}</button>
              ))}
              {emojiList.length === 0 ? <div className="ins-empty">검색 결과가 없어요.</div> : null}
            </div>
            {!q ? (
              <div className="ins-cats">
                {CATS.map((c) => (
                  <button key={c} className={'ins-cat' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>
                ))}
              </div>
            ) : null}
          </>
        )}

        {tab === 'icon' && (
          <div className="ins-grid icon">
            {ICONS.map(([k, d], i) => (
              <button key={i} className="ins-i" title={k} onClick={() => insertImage(iconSvgUrl(d), 60, 60)}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
              </button>
            ))}
          </div>
        )}

        {tab === 'upload' && (
          <label className="ins-drop">
            <input type="file" accept="image/*" onChange={onUpload} style={{ display: 'none' }} />
            <div className="ins-drop-ic">🖼</div>
            <div>이미지를 클릭해서 업로드</div>
            <div className="ins-drop-sub">PNG · JPG · SVG</div>
          </label>
        )}
      </div>
    </div>
  )
}
