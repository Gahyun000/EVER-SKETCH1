import { useBuilder } from '../state/store'
import PageWithCanvas from '../cards/PageWithCanvas'
import { tocItems } from './util'
export default function Preview() {
  const pages = useBuilder((s) => s.pages)
  const selId = useBuilder((s) => s.selectedPageId)
  const orientation = useBuilder((s) => s.orientation)
  const size = useBuilder((s) => s.size)
  const font = useBuilder((s) => s.font)
  const title = useBuilder((s) => s.title)
  const page = pages.find((p) => p.id === selId)
  const items = tocItems(pages)
  const land = orientation === 'landscape'
  return (<>
    <div className="pv-h">미리보기</div>
    <div className="stage">
      {page
        ? <PageWithCanvas page={page} docTitle={title} orientation={orientation} size={size} font={font} tocItems={items} interactive={true} />
        : <div className="pv-empty">카드를 추가하세요</div>}
    </div>
    <div className="pv-cap">{land ? '가로 덱 (1.33:1)' : '세로 이북 (0.75:1)'} · {font === 'auto' ? '자동 폰트' : '커스텀 폰트'} · 크기 {size === 's' ? '작게' : size === 'l' ? '크게' : '보통'}</div>
  </>)
}
