import type { PointerEvent as RPointerEvent } from 'react'
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
  // 빈 곳 클릭 시 선택 해제. 자식이 stopPropagation 하는 것에만 의존하면
  // 한 군데라도 빠뜨렸을 때 방금 만든 선택이 곧바로 날아간다 → 대상까지 직접 확인한다.
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement | null
    if (t && t.closest('.fel, .cardedit, .conn-hint')) return
    setSel(null)
  }
  return (
    <div id={domId} style={{ position: 'relative', width: W, height: H }} onPointerDown={interactive ? onDown : undefined}>
      <PageView page={page} docTitle={docTitle} orientation={orientation} size={size} font={font} tocItems={tocItems} editable={interactive} />
      <FreeLayer page={page} W={W} H={H} SC={SC} interactive={interactive} />
    </div>
  )
}
