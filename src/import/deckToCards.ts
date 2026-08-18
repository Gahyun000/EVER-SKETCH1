// 덱 IR → 편집 가능한 '카드' 페이지(P2). 표지=cover, 목차=toc(자동·클릭이동), 섹션=dsection(덱 룩).
// 카드 모델이라 역할(kind)·목차 tocItems·핫스팟·편집이 기존 파이프라인 그대로 작동한다.
import type { Page } from '../state/store'

interface IRCard { type?: string; title?: string; desc?: string; kick?: string; dot?: string }
interface IRTable { rows: string[][]; cells?: number }
interface IRPage { type: string; markN?: string; heading?: string; title?: string; sub?: string; cols?: string; cards?: IRCard[]; table?: IRTable }
interface DeckIR { meta?: { theme?: string }; pages: IRPage[] }

// 표 → 카드(첫 열=제목, 나머지=설명). 카드 렌더러는 표를 못 그리므로 행을 카드로 보존해 빈 페이지를 막는다.
function tableToCards(t: IRTable): IRCard[] {
  const rows = t.rows || []
  if (rows.length < 2) return []
  return rows.slice(1).map((r) => ({ title: (r[0] || '').trim(), desc: r.slice(1).map((c) => (c || '').trim()).filter(Boolean).join(' · ') }))
}

const mk = (cardKey: string, fields: Record<string, string>): Page =>
  ({ id: 0, cardKey, fields, free: false, els: [], conns: [], strokes: [] })

export function deckIrToCards(ir: DeckIR): Page[] {
  const out: Page[] = []
  for (const pg of ir.pages || []) {
    if (pg.type === 'cover') {
      out.push(mk('cover', { title: pg.heading || '', sub: pg.sub || '' }))
    } else if (pg.type === 'toc') {
      out.push(mk('toc', {}))                    // 목차는 자동(tocItems) — 본문 카드에서 클릭이동 산출
    } else {
      // section(및 그 외) → 덱-섹션 카드. c1~c6 = "제목|설명".
      // 표가 있으면(백엔드가 보존) 표 행을 카드로 — 카드가 비지 않도록 표 우선.
      const baseCards = (pg.cards && pg.cards.length) ? pg.cards : (pg.table ? tableToCards(pg.table) : [])
      const cards = baseCards.slice(0, 6)
      let cn = 3
      if (pg.cols) { const m = String(pg.cols).match(/\d/); if (m) cn = Number(m[0]) }
      const fields: Record<string, string> = {
        markN: pg.markN || '',
        title: pg.heading || pg.title || '섹션',
        sub: pg.sub || '',
        cols: String(cn === 2 ? 2 : 3),
      }
      cards.forEach((c, i) => {
        const t = (c.title || '').trim(), d = (c.desc || '').trim()
        fields['c' + (i + 1)] = t && d ? t + '|' + d : (t || d || '')
      })
      out.push(mk('dsection', fields))
    }
  }
  return out
}
