import Modal from '../ui/Modal'

const SHORTCUTS: { k: string; d: string }[] = [
  { k: '⌘/Ctrl + Z', d: '되돌리기' },
  { k: '⌘/Ctrl + ⇧ + Z', d: '다시 실행' },
  { k: 'Delete', d: '선택한 도형 삭제' },
  { k: '⌘/Ctrl + D', d: '복제' },
  { k: '⌘/Ctrl + C · V · X', d: '복사 · 붙여넣기 · 잘라내기' },
  { k: '방향키 / ⇧+방향키', d: '도형 조금씩 이동 (⇧=10px)' },
  { k: '⌘/Ctrl + ] · [', d: '맨 앞으로 · 맨 뒤로' },
  { k: 'Esc', d: '선택 해제 · 도구 취소' },
  { k: 'V R O D T S I C P', d: '도구 전환(선택·사각형·원·마름모·글자·스티키·이미지·연결·펜)' },
  { k: 'PageUp / PageDown', d: '이전 / 다음 페이지' },
  { k: '⌘/Ctrl + S', d: '이북 만들기' },
  { k: '⌘/Ctrl + ⇧ + P · F5', d: '발표 시작' },
]

export default function Help({ open, onClose, onStartTutorial }: { open: boolean; onClose: () => void; onStartTutorial: () => void }) {
  if (!open) return null
  // 예전에는 손으로 그린 덮개였다 — Esc 는 Hotkeys 가 따로 받아 주고 있었지만
  // 포커스 가두기·되돌리기·배경 스크롤 잠금은 없었다. 껍데기를 쓰면 다 따라온다.
  return (
    <Modal title="이렇게 쓰면 됩니다" onClose={onClose} size="sm"
      scrimClassName="scrim on" className="modal"
      cancel={{ label: '확인', onClick: onClose }}>
      <ol>
        <li>왼쪽에서 <b>카드</b>를 고릅니다 (표지·가치제안·성과 등).</li>
        <li>오른쪽에서 <b>칸을 채웁니다</b> — 예시가 들어 있어 그대로 둬도 돼요.</li>
        <li>가운데 <b>미리보기</b>로 확인합니다.</li>
        <li>다 되면 <b>이북 만들기</b> 한 번.</li>
      </ol>
      <p className="help-tip">못 채운 칸이 있어도 이북은 만들어집니다. 편하게 시작하세요.</p>
      <div className="help-tut">
        <div className="help-tut-t">자유 캔버스가 처음이신가요?</div>
        <div className="help-tut-d">도형·화살표·펜을 직접 해보며 배우는 짧은 튜토리얼이 있어요.</div>
        <button className="help-tut-btn" onClick={onStartTutorial}>▶ 자유 캔버스 튜토리얼 시작</button>
      </div>
      <div className="help-keys">
        <div className="help-keys-t">⌨ 키보드 단축키 <small>(마우스로도 다 됩니다)</small></div>
        <table className="kbd-tbl"><tbody>
          {SHORTCUTS.map((s) => (<tr key={s.k}><td className="kbd-k">{s.k}</td><td className="kbd-d">{s.d}</td></tr>))}
        </tbody></table>
      </div>
    </Modal>
  )
}
