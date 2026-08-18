import { useBuilder } from '../state/store'
import PageWithCanvas from '../cards/PageWithCanvas'
import { pageSize } from '../cards/sizing'
import { tocItems } from './util'

// 왼쪽 세로 썸네일 — 실제 페이지를 축소해 미리보기(구글 슬라이드식).
export default function Filmstrip() {
  const pages = useBuilder((s) => s.pages)
  const sel = useBuilder((s) => s.selectedPageId)
  const title = useBuilder((s) => s.title)
  const orientation = useBuilder((s) => s.orientation)
  const size = useBuilder((s) => s.size)
  const font = useBuilder((s) => s.font)
  const selectPage = useBuilder((s) => s.selectPage)
  const movePage = useBuilder((s) => s.movePage)
  const removePage = useBuilder((s) => s.removePage)
  const items = tocItems(pages)

  if (!pages.length) return <div className="axth-empty">＋ 새 슬라이드로 시작하세요</div>

  const { W, H } = pageSize(orientation)
  const miniW = orientation === 'landscape' ? 168 : 150
  const scale = miniW / W
  const miniH = H * scale

  return (
    <div className="axth-list">
      {pages.map((p, i) => (
        <div key={p.id} className={'axth' + (p.id === sel ? ' on' : '')} onClick={() => selectPage(p.id)}>
          <span className="axth-no">{i + 1}</span>
          <div className="axth-mini" style={{ width: miniW, height: miniH }}>
            <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
              <PageWithCanvas page={p} docTitle={title} orientation={orientation} size={size} font={font} tocItems={items} interactive={false} />
            </div>
            <div className="axth-tools">
              <button title="위로" onClick={(e) => { e.stopPropagation(); movePage(p.id, -1) }}>▲</button>
              <button title="아래로" onClick={(e) => { e.stopPropagation(); movePage(p.id, 1) }}>▼</button>
              <button title="삭제" className="del" onClick={(e) => { e.stopPropagation(); removePage(p.id) }}>✕</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
