import type { CSSProperties } from 'react'
import type { PaperType } from '../state/store'

const LINE = '#dfe4ee'
const DOT = '#cbd3e2'

// 페이지 배경에 얹는 종이 패턴(줄/점/모눈). 무지·미지정은 패턴 없음.
export function paperBgStyle(paper?: PaperType): CSSProperties {
  switch (paper) {
    case 'lined':
      return { backgroundImage: `repeating-linear-gradient(${LINE} 0 1px, transparent 1px 34px)`, backgroundPosition: '0 40px' }
    case 'lined-narrow':
      return { backgroundImage: `repeating-linear-gradient(${LINE} 0 1px, transparent 1px 22px)`, backgroundPosition: '0 30px' }
    case 'dotted':
      return { backgroundImage: `radial-gradient(${DOT} 1.4px, transparent 1.6px)`, backgroundSize: '22px 22px', backgroundPosition: '11px 11px' }
    case 'grid':
      return { backgroundImage: `repeating-linear-gradient(${LINE} 0 1px, transparent 1px 26px), repeating-linear-gradient(90deg, ${LINE} 0 1px, transparent 1px 26px)` }
    default:
      return {}
  }
}

export const PAPER_OPTIONS: { value: PaperType; label: string }[] = [
  { value: 'blank', label: '무지' },
  { value: 'lined', label: '줄지(넓은)' },
  { value: 'lined-narrow', label: '줄지(좁은)' },
  { value: 'dotted', label: '점선지' },
  { value: 'grid', label: '모눈' },
]
