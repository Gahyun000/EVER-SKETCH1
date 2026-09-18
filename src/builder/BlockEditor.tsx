import { useBuilder } from '../state/store'
import NoteBlocks from './NoteBlocks'
import { useKey } from '../ui/keyLabel'

const BG_SWATCHES = ['', '#ffffff', '#f5f6f8', '#eef2fb', '#eafaf0', '#fdf3d6', '#fdecef', '#111318']

// 빈 페이지(note) 블록 편집기 — 배경 선택 + 블록 코어(NoteBlocks).
export default function BlockEditor({ pageId }: { pageId: number }) {
  const K = useKey()
  const page = useBuilder((s) => s.pages.find((p) => p.id === pageId))
  const setBlocks = useBuilder((s) => s.setBlocks)
  const setPageBg = useBuilder((s) => s.setPageBg)
  if (!page) return null
  return (
    <div className="block-editor">
      <div className="be-topbar">
        <span className="be-bglabel">배경</span>
        {BG_SWATCHES.map((c) => (
          <button key={c || 'none'} className={'be-swatch' + ((page.bg || '') === c ? ' on' : '')}
            style={{ background: c || 'transparent' }} title={c || '없음'} onClick={() => setPageBg(pageId, c)}>{c ? '' : '⌀'}</button>
        ))}
      </div>
      <div className="be-hint">‘/’ 블록 추가 · ‘&gt;’ 토글 · {K('mod+B')} 굵게 · Enter 새 줄</div>
      <NoteBlocks blocks={page.blocks || []} onChange={(b) => setBlocks(page.id, b)} />
    </div>
  )
}
