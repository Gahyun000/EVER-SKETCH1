import { useState, useEffect } from 'react'
import type { Page, Orientation, SizePreset } from '../../state/store'
import PageWithCanvas from '../../cards/PageWithCanvas'
import { pageSize } from '../../cards/sizing'
import { tocItems } from '../util'

// P4(i): 미리보기 = 캔버스가 쓸 '그 카드'를 축소 렌더한 것(WYSIWYG).
//   · 서버 PPTX 이미지가 아니라 실제 카드 컴포넌트라 목차·편집·역할이 그대로 살아있다.
//   · 한 장씩 차오르게(dpReveal) 등장 — "페이지가 만들어질 때마다 보이는" 느낌.
export default function DeckCards({ cards, docTitle, orientation, size, font }: {
  cards: Page[]; docTitle: string; orientation: Orientation; size: SizePreset; font: string
}) {
  const { W, H } = pageSize(orientation)
  const COL = 210
  const scale = COL / W
  const items = tocItems(cards)

  // 한 장씩 등장(150ms 간격). cards 가 바뀌면 처음부터 다시 차오른다.
  const [shown, setShown] = useState(0)
  useEffect(() => {
    setShown(0)
    if (!cards.length) return
    let i = 0
    const id = setInterval(() => { i += 1; setShown(i); if (i >= cards.length) clearInterval(id) }, 150)
    return () => clearInterval(id)
  }, [cards])

  return (
    <div>
      <style>{`@keyframes dpReveal{0%{clip-path:inset(0 0 100% 0);opacity:.4}60%{opacity:1}100%{clip-path:inset(0 0 0 0);opacity:1}}`}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {cards.slice(0, shown).map((card, i) => (
          <div key={i} style={{ width: COL, animation: 'dpReveal .5s ease both' }}>
            <div style={{
              width: COL, height: Math.round(H * scale), overflow: 'hidden', borderRadius: 10,
              border: '1px solid #e6ebf3', background: '#fff', position: 'relative',
              boxShadow: '0 6px 16px -12px rgba(20,40,80,.4)',
            }}>
              <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: W, height: H, pointerEvents: 'none' }}>
                <PageWithCanvas page={card} docTitle={docTitle} orientation={orientation} size={size} font={font} tocItems={items} interactive={false} />
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#93a1bb', marginTop: 4, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {String(i + 1).padStart(2, '0')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
