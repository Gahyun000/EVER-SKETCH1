// 3차 P4 — 'AI로 정리' 패널(규칙 기반 제안 → 사람이 수락).
// 가져온 결과는 그대로 유지, 원하는 항목만 적용한다.
import { useBuilder } from '../state/store'
import { analyzeCleanup } from '../import/cleanup'

export default function AiCleanup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pages = useBuilder((s) => s.pages)
  const polishAll = useBuilder((s) => s.polishAll)
  const setCard = useBuilder((s) => s.setCard)
  if (!open) return null

  const plan = analyzeCleanup(pages)
  const nothing = plan.polishCount === 0 && plan.kpi.length === 0

  return (
    <div className="scrim on" onClick={(e) => { if ((e.target as HTMLElement).classList.contains('scrim')) onClose() }}>
      <div className="ai-modal" role="dialog" aria-label="AI로 정리">
        <div className="ai-head">✨ AI로 정리<button className="close" onClick={onClose}>닫기</button></div>
        <p className="ai-sub">규칙 기반 제안입니다. 원하는 항목만 적용하세요. 가져온 결과는 그대로 유지됩니다.</p>
        {nothing && <div className="ai-empty">다듬을 제안이 없어요 — 이미 깔끔합니다.</div>}
        {plan.polishCount > 0 && (
          <div className="ai-item" data-sug="polish">
            <div className="ai-txt"><b>문구 다듬기</b><div className="ai-desc">공백·기호를 정리할 곳 {plan.polishCount}군데</div></div>
            <button className="ai-apply" onClick={() => polishAll()}>적용</button>
          </div>
        )}
        {plan.kpi.map((k) => (
          <div className="ai-item" data-sug="kpi" key={k.pageId}>
            <div className="ai-txt"><b>카드타입 제안 · 성과(KPI)</b><div className="ai-desc">“{k.title}” — 지표 {k.kv.length}개를 KPI 카드로</div></div>
            <button className="ai-apply" onClick={() => setCard(k.pageId, 'kpi', { title: k.title, k1: k.kv[0] || '', k2: k.kv[1] || '', k3: k.kv[2] || '' })}>적용</button>
          </div>
        ))}
      </div>
    </div>
  )
}
