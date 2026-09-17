// 3차 P4 — 'AI로 정리' 패널(규칙 기반 제안 → 사람이 수락).
// 가져온 결과는 그대로 유지, 원하는 항목만 적용한다.
import { useBuilder } from '../state/store'
import { analyzeCleanup } from '../import/cleanup'
import Modal from '../ui/Modal'

export default function AiCleanup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pages = useBuilder((s) => s.pages)
  const polishAll = useBuilder((s) => s.polishAll)
  if (!open) return null

  const plan = analyzeCleanup(pages)
  // **「제안 없음」 판정도 같이 고쳐야 한다.** KPI 항목만 지우고 이 줄을 두면,
  // KPI 후보가 있는 자료에서 `nothing` 이 거짓이라 「없어요」도 안 뜨고 보일 것도 없는
  // **빈 상자**가 된다 — 지우는 것보다 나쁜 상태다.
  const nothing = plan.polishCount === 0

  return (
    <Modal title="✨ AI로 정리" onClose={onClose} size="sm"
      scrimClassName="scrim on" className="ai-modal"
      cancel={{ label: '닫기', onClick: onClose }}>
        <p className="ai-sub">규칙 기반 제안입니다. 원하는 항목만 적용하세요. 가져온 결과는 그대로 유지됩니다.</p>
        {nothing && <div className="ai-empty">다듬을 제안이 없어요 — 이미 깔끔합니다.</div>}
        {plan.polishCount > 0 && (
          <div className="ai-item" data-sug="polish">
            <div className="ai-txt"><b>문구 다듬기</b><div className="ai-desc">공백·기호를 정리할 곳 {plan.polishCount}군데</div></div>
            <button className="ai-apply" onClick={() => polishAll()}>적용</button>
          </div>
        )}
    </Modal>
  )
}
