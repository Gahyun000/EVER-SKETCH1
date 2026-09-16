import { useState } from 'react'

const PALETTE: string[] = [
  '#000000', '#333333', '#5b6270', '#8a93a5', '#c7ccd6', '#e6e8ee', '#f4f4f1', '#ffffff', '#0F1B3D',
  '#c5442f', '#e0553c', '#d98a2a', '#e8b93a', '#3E9E6E', '#2fa37a', '#2a78d6', '#2462EB', '#4a3aa7',
  '#7d4fd0', '#c14b8a', '#f3c9b6', '#f6ddc2', '#fbe7a8', '#dcedb1', '#c8e6cd', '#bfe0e3', '#cfe0fb',
  '#e7e3fb', '#f0d4e4', '#1f1d3d', '#0e1c30', '#123b2a', '#3a2a10', '#3a1520', '#20143a', '#eaf0ff',
]
const RECENT: string[] = []
const isHex = (v: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)

/**
 * **앞줄(`head`) 은 「이 자리에서 쓰는 색」이다.**
 *
 * 2026-09-16 · 표의 칸 색을 위 도구줄에서도 바꾸게 하면서 생겼다. 칸 색은 아무 색이나
 * 되는 게 아니라 **양식이 정한 색이 먼저**다(로드맵의 「진행 표시」는 색이 곧 뜻이다).
 * 일반 팔레트만 열어 주면 그 약속이 눈에 안 보이므로, 그 자리에서 쓰는 색을
 * 이름과 함께 **맨 위에** 따로 깔아 준다. 아래 팔레트는 그대로 남는다 —
 * 「목록에 없는 색은 왜 안 되나」를 만들지 않으려는 것이다.
 *
 * `onClear` 가 있으면 「색 지우기」가 같이 뜬다. 칸 색은 **없음이 정상 상태**라
 * 지우는 길이 없으면 한 번 칠한 칸을 되돌릴 수 없다.
 */
export default function ColorPicker({ value, onChange, allowTransparent, head, onClear, disabled, title, caret }: {
  value?: string
  onChange: (c: string) => void
  allowTransparent?: boolean
  head?: { lab: string; colors: string[]; titles?: Record<string, string> }
  onClear?: () => void
  disabled?: boolean
  title?: string
  /** 여는 단추를 **색 네모가 아니라 ▾** 로 그린다. 색을 보여 주는 일은 옆 단추가 맡고,
   *  여기는 **고르개를 여는 일만** 한다 — 파워포인트의 「색 단추 + 화살표」와 같은 나눔이다. */
  caret?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState(value || '#000000')
  function pick(c: string) {
    onChange(c)
    if (c !== 'transparent' && !RECENT.includes(c)) { RECENT.unshift(c); if (RECENT.length > 9) RECENT.pop() }
    setOpen(false)
  }
  const cur = value || 'transparent'
  return (
    <span className="cp">
      {caret ? (
        <button type="button" className="cp-trig cp-caret" onClick={() => setOpen((o) => !o)}
          title={title || '다른 색'} disabled={disabled} aria-label={title || '다른 색'}>▾</button>
      ) : (
        <button type="button" className="cp-trig" onClick={() => setOpen((o) => !o)} title={title || '색 선택'}
          disabled={disabled}
          style={{ background: cur === 'transparent' ? 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 50% / 10px 10px' : cur }} />
      )}
      {open && (
        <>
          <div className="cp-back" onClick={() => setOpen(false)} />
          <div className="cp-pop" onClick={(e) => e.stopPropagation()}>
            {head && head.colors.length > 0 && (
              <>
                <div className="cp-lab">{head.lab}</div>
                <div className="cp-grid">
                  {head.colors.map((c) => (
                    <button key={'h' + c} type="button" className={'cp-sw' + (value === c ? ' on' : '')}
                      style={{ background: c }} title={(head.titles && head.titles[c]) || c} onClick={() => pick(c)} />
                  ))}
                </div>
              </>
            )}
            {RECENT.length > 0 && (
              <>
                <div className="cp-lab">최근</div>
                <div className="cp-grid">{RECENT.map((c, i) => <button key={'r' + i} type="button" className="cp-sw" style={{ background: c }} onClick={() => pick(c)} />)}</div>
              </>
            )}
            <div className="cp-lab">팔레트</div>
            <div className="cp-grid">
              {PALETTE.map((c) => <button key={c} type="button" className={'cp-sw' + (value === c ? ' on' : '')} style={{ background: c }} title={c} onClick={() => pick(c)} />)}
            </div>
            <div className="cp-row">
              <input className="cp-hex" value={hex} onChange={(e) => setHex(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && isHex(hex)) pick(hex) }} placeholder="#RRGGBB" />
              <label className="cp-native" title="사용자 색" style={{ background: isHex(hex) ? hex : '#fff' }}>
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#000000'} onChange={(e) => { setHex(e.target.value); onChange(e.target.value) }} />
              </label>
              {allowTransparent && <button type="button" className="cp-none" onClick={() => pick('transparent')}>없음</button>}
              {onClear && <button type="button" className="cp-none" onClick={() => { onClear(); setOpen(false) }}>색 지우기</button>}
            </div>
          </div>
        </>
      )}
    </span>
  )
}
