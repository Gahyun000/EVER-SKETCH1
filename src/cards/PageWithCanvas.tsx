import type { Page, Orientation, SizePreset } from '../state/store'
import type { TocItem } from '../builder/util'
import PageView from './PageView'
import FreeLayer from '../canvas/FreeLayer'
import { pageSize } from './sizing'
import { useCanvasUI } from '../state/canvasUI'

export interface PageWithCanvasProps {
  page: Page; docTitle: string; orientation: Orientation; size: SizePreset; font: string
  tocItems?: TocItem[]; domId?: string; interactive: boolean
}
export default function PageWithCanvas({ page, docTitle, orientation, size, font, tocItems, domId, interactive }: PageWithCanvasProps) {
  const { W, H, SC } = pageSize(orientation)
  const setSel = useCanvasUI((s) => s.setSel)
  // 빈 곳(요소·항목·핸들이 stopPropagation 하므로 여기 도달=빈 곳) 클릭 시 선택 해제.
  return (
    <div id={domId} style={{ position: 'relative', width: W, height: H }} onPointerDown={interactive ? () => setSel(null) : undefined}>
      <PageView page={page} docTitle={docTitle} orientation={orientation} size={size} font={font} tocItems={tocItems} editable={interactive} />
      <FreeLayer page={page} W={W} H={H} SC={SC} interactive={interactive} />
    </div>
  )
}
