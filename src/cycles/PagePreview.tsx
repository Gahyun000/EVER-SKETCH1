import PageWithCanvas from '../cards/PageWithCanvas'
import { pageSize } from '../cards/sizing'
import type { Page } from '../state/store'

/**
 * 배부 전 미리보기.
 *
 * **편집 화면과 같은 렌더러를 그대로 쓴다.** 미리보기용 렌더러를 따로 만들면
 * 둘이 갈라져서, 미리보기는 멀쩡한데 실제 배부본은 깨지는 상태가 만들어진다.
 * (정본 좌표계가 어긋나 배부본이 종이 밖에 그려진 적이 있다 — 그때 이런 화면이
 *  있었다면 배부 전에 잡혔다.)
 */
export default function PagePreview({ page, width }: { page: Page; width: number }) {
  const { W, H } = pageSize('landscape')
  const scale = width / W
  return (
    <div className="cy-prev" style={{ width, height: Math.round(H * scale) }}>
      <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <PageWithCanvas page={page} docTitle="" orientation="landscape"
          size="m" font="auto" interactive={false} />
      </div>
    </div>
  )
}
