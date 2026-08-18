import { useBuilder } from '../state/store'
import PageWithCanvas from '../cards/PageWithCanvas'
import { tocItems } from './util'
export default function ExportLayer() {
  const pages = useBuilder((s) => s.pages)
  const orientation = useBuilder((s) => s.orientation)
  const size = useBuilder((s) => s.size)
  const font = useBuilder((s) => s.font)
  const title = useBuilder((s) => s.title)
  const items = tocItems(pages)
  return (<div style={{ position: 'absolute', left: -99999, top: 0, pointerEvents: 'none' }} aria-hidden>
    {pages.map((p) => (
      <PageWithCanvas key={p.id} page={p} docTitle={title} orientation={orientation} size={size} font={font} tocItems={items} domId={'export-page-' + p.id} interactive={false} />
    ))}
  </div>)
}
