import { useBuilder } from '../state/store'
import { cardByKey } from '../cards/registry'
import { polishFields } from './polish'
import BlockEditor from './BlockEditor'
export default function Editor() {
  const pages = useBuilder((s) => s.pages)
  const sel = useBuilder((s) => s.selectedPageId)
  const updateField = useBuilder((s) => s.updateField)
  const page = pages.find((p) => p.id === sel)
  if (!page) return <div className="empty">페이지를 추가하면 여기서 내용을 채웁니다.<br />못 채운 칸이 있어도 이북은 만들어져요.</div>
  if (page.cardKey === 'slide' || page.cardKey === 'deckslide') return (<div className="edit-sub">이 슬라이드는 <b>캔버스에서 직접 편집</b>합니다. 글자·도형을 클릭(더블클릭=글자 편집)해 고치고, 위 툴바·아래 도구로 요소를 추가하세요.</div>)
  const c = cardByKey(page.cardKey)
  if (!c) return null
  if (c.kind === 'toc') return (<div><div className="edit-h">{c.label}</div><div className="edit-sub">목차는 고른 카드들로 자동 생성됩니다.</div></div>)
  if (c.viz === 'note') return (<div><div className="edit-h">빈 페이지</div><div className="edit-sub">블록으로 자유롭게 틀을 짜세요. 보이는 그대로 이북에 담깁니다.</div><BlockEditor pageId={page.id} /></div>)
  function polishAll() {
    if (!page) return
    const cleaned = polishFields(page.fields)
    Object.keys(cleaned).forEach((k) => updateField(page.id, k, cleaned[k]))
  }
  return (<div>
    <div className="edit-h">{c.label} 카드</div>
    <div className="edit-sub">예시가 미리 들어 있어요. 그대로 둬도 되고 고쳐 쓰면 됩니다.</div>
    {c.fields.map((fd) => (<div className="fld" key={fd.key}>
      <label>{fd.label}</label>
      {fd.textarea
        ? <textarea value={page.fields[fd.key] || ''} onChange={(e) => updateField(page.id, fd.key, e.target.value)} />
        : <input value={page.fields[fd.key] || ''} onChange={(e) => updateField(page.id, fd.key, e.target.value)} />}
      <div className="hint">비우면 이 줄은 생략돼요.</div>
    </div>))}
    <button className="polish-btn" onClick={polishAll}>✨ 문구 다듬기</button>
    <div className="polish-cap">공백·기호를 자동으로 깔끔하게 정리합니다.</div>
  </div>)
}
