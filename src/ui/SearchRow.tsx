import type { ReactNode } from 'react'
import { Search } from 'lucide-react'
import './searchRow.css'

/**
 * 세 화면이 함께 쓰는 검색 줄.
 *
 * **왜 한 벌인가.** 2026-09-15 전에는 세 벌이었다.
 *   · 자료 목록 — 검색어 칸 글자 14px · 테두리 1.4 · 「검색」+「초기화」
 *   · 팀 공유   — 검색어 칸 글자 12.5px · 테두리 1 · 「조회」만 (초기화가 없어서
 *                 조건을 한 번 걸면 지울 방법이 없었다)
 *   · 결재함   — 아예 없음
 * 같은 일을 하는 자리가 화면마다 다르면 손이 매번 다시 배운다. 저장소 주석끼리도
 * 어긋나 있었다 — 한쪽은 「표준: 검색·초기화」, 다른 쪽은 「표준: 조회 버튼」.
 *
 * **차례는 기간이 먼저다**(사용자 결정 ①ㄴ). 원래 화면에 있던 차례다.
 * **말은 「검색」·「초기화」**(②ㄱ). **기간은 세 화면 다 둔다**(③ㄱ) — 다만 무엇의
 * 날짜인지는 화면마다 다르므로(`dateLabel`) 그 말을 칸에 적는다.
 *
 * **건수는 여기 없다**(④ㄴ). 목록 바로 위에 둔다 — 쪽 정보와 한자리에 모인다.
 */
export default function SearchRow({
  q, onQ, from, to, onFrom, onTo, placeholder, dateLabel, onSearch, onReset, children,
}: {
  q: string
  onQ: (v: string) => void
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
  placeholder: string
  /** 무엇의 날짜인가 — 「수정일」 「승인일」 「낸 날」. 칸에 적어 둔다. */
  dateLabel: string
  onSearch: () => void
  onReset: () => void
  /** 오른쪽 끝에 붙는 것. **그 화면에서만 하는 일**이 온다 —
   *  자료 목록의 「새 폴더 · 새 이북」이 그것이고, 보는 화면에는 아무것도 안 온다. */
  children?: ReactNode
}) {
  return (
    <div className="srow">
      <input className="srow-date" type="date" value={from} aria-label={`${dateLabel} 시작`}
        title={`${dateLabel} 시작`} onChange={(e) => onFrom(e.target.value)} />
      <span className="srow-tilde" aria-hidden="true">~</span>
      <input className="srow-date" type="date" value={to} aria-label={`${dateLabel} 끝`}
        title={`${dateLabel} 끝`} onChange={(e) => onTo(e.target.value)} />
      <div className="srow-q">
        <Search className="h-4 w-4" aria-hidden="true" />
        <input value={q} placeholder={placeholder} aria-label="검색어"
          onChange={(e) => onQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSearch() }} />
      </div>
      <button className="srow-btn dark" onClick={onSearch}>검색</button>
      <button className="srow-btn" onClick={onReset}>초기화</button>
      {children ? <div className="srow-end">{children}</div> : null}
    </div>
  )
}
