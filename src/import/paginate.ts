// 3차 HTML Import — P2 페이지네이션(넘침 이어짐).
// 섹션이 카드 한 장보다 길면 '제목 (2)(3)'으로 나눈다.
// 실제 브라우저 렌더 높이를 측정한다(오프스크린 flex-column 측정기).
// ⚠ 아래 블록 지표(폰트크기·여백·패딩)는 cards/PageView.tsx 의 note 렌더와
//    반드시 일치시킬 것. PageView note 스타일을 바꾸면 여기도 함께 고친다.

import type { ImportedDoc, ImportedSection, ImportedBlock } from './htmlImport'
import { pageSize } from '../cards/sizing'
import type { Orientation, SizePreset } from '../state/store'

function fontFamilyOf(font: string): string {
  return font === 'auto' ? "-apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" : font
}

// PageView note 블록과 동일한 스타일을 적용한 측정용 엘리먼트
function blockEl(b: ImportedBlock, H1: number, BODY: number): HTMLElement {
  const d = document.createElement('div')
  d.style.margin = '5px 0'
  d.style.lineHeight = '1.32'
  d.style.wordBreak = 'break-word'
  if (b.type === 'divider') { d.style.height = '1px'; d.style.margin = '10px 0'; return d }
  if (b.type === 'callout') { // 콜아웃 박스: 패딩+좌측 바 → PageView와 동일 지표
    d.style.fontSize = BODY + 'px'
    d.style.padding = Math.round(BODY * 0.55) + 'px ' + Math.round(BODY * 0.7) + 'px'
    d.style.borderLeft = '4px solid #ccc'
    d.style.borderRadius = '8px'
    d.style.boxSizing = 'border-box'
    d.textContent = b.text || ''
    return d
  }
  if (b.type === 'h1') { d.style.fontSize = (H1 * 0.82) + 'px'; d.style.fontWeight = '800' }
  else if (b.type === 'h2') { d.style.fontSize = (BODY * 1.3) + 'px'; d.style.fontWeight = '800' }
  else if (b.type === 'toggle') { d.style.fontSize = (BODY * 1.14) + 'px'; d.style.fontWeight = '800' }
  else if (b.type === 'bullet') { d.style.fontSize = BODY + 'px'; d.style.paddingLeft = '14px' }
  else { d.style.fontSize = BODY + 'px' }
  d.textContent = b.text || ''
  return d
}

// 섹션들을 카드 높이에 맞춰 분할한다. 각 페이지는 상단에 제목(h1)을 갖는다(importDoc이 실제로 추가).
export function paginate(doc: ImportedDoc, orientation: Orientation, size: SizePreset, font: string): ImportedDoc {
  if (typeof document === 'undefined') return doc // 측정 불가 환경은 원본 그대로

  const { W, H, SC } = pageSize(orientation)
  const mul = (size === 's' ? 0.86 : size === 'l' ? 1.18 : 1) * SC
  const H1 = (orientation === 'landscape' ? 30 : 26) * mul
  const BODY = (orientation === 'landscape' ? 15 : 14) * mul
  const pad = Math.round(24 * SC)
  const contentW = W - 2 * (pad - 4)
  const contentH = H - 2 * pad

  const wrap = document.createElement('div')
  wrap.style.position = 'absolute'
  wrap.style.left = '-99999px'
  wrap.style.top = '0'
  wrap.style.width = contentW + 'px'
  wrap.style.display = 'flex'
  wrap.style.flexDirection = 'column'
  wrap.style.boxSizing = 'border-box'
  wrap.style.visibility = 'hidden'
  wrap.style.fontFamily = fontFamilyOf(font)
  document.body.appendChild(wrap)

  const fits = (title: string, blocks: ImportedBlock[]): boolean => {
    wrap.innerHTML = ''
    wrap.appendChild(blockEl({ type: 'h1', text: title }, H1, BODY))
    for (const b of blocks) wrap.appendChild(blockEl(b, H1, BODY))
    return wrap.scrollHeight <= contentH
  }

  const out: ImportedSection[] = []
  try {
    for (const s of doc.sections) {
      if (!s.blocks.length) { out.push(s); continue } // 표만 있는 섹션 등: 제목만 한 장
      let i = 0, part = 0
      while (i < s.blocks.length) {
        const title = part === 0 ? s.title : `${s.title} (${part + 1})`
        const start = i
        while (i < s.blocks.length) {
          if (!fits(title, s.blocks.slice(start, i + 1)) && i > start) break // 넘치면 직전까지
          i++
        }
        out.push({ title, blocks: s.blocks.slice(start, i), contd: part > 0 })
        part++
      }
    }
  } finally {
    document.body.removeChild(wrap)
  }
  return { ...doc, sections: out }
}
