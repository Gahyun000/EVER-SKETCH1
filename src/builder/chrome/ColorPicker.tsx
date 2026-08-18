import { useState } from 'react'

const PALETTE: string[] = [
  '#000000', '#333333', '#5b6270', '#8a93a5', '#c7ccd6', '#e6e8ee', '#f4f4f1', '#ffffff', '#0F1B3D',
  '#c5442f', '#e0553c', '#d98a2a', '#e8b93a', '#3E9E6E', '#2fa37a', '#2a78d6', '#2462EB', '#4a3aa7',
  '#7d4fd0', '#c14b8a', '#f3c9b6', '#f6ddc2', '#fbe7a8', '#dcedb1', '#c8e6cd', '#bfe0e3', '#cfe0fb',
  '#e7e3fb', '#f0d4e4', '#1f1d3d', '#0e1c30', '#123b2a', '#3a2a10', '#3a1520', '#20143a', '#eaf0ff',
]
const RECENT: string[] = []
const isHex = (v: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)

export default function ColorPicker({ value, onChange, allowTransparent }: { value?: string; onChange: (c: string) => void; allowTransparent?: boolean }) {
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
      <button type="button" className="cp-trig" onClick={() => setOpen((o) => !o)} title="색 선택"
        style={{ background: cur === 'transparent' ? 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 50% / 10px 10px' : cur }} />
      {open && (
        <>
          <div className="cp-back" onClick={() => setOpen(false)} />
          <div className="cp-pop" onClick={(e) => e.stopPropagation()}>
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
            </div>
          </div>
        </>
      )}
    </span>
  )
}
