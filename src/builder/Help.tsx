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

export default function Help({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      {/* 2026-09-17 · **「▶ 자유 캔버스 튜토리얼 시작」을 걷어냈다**(사용자 결정).
          그 튜토리얼(TutorialCoach)은 `[data-tut="tool-box"]` 같은 표를 찾아 반짝였는데
          **저장소 어디에도 그 표를 다는 곳이 없었다.** 그래서 「반짝이는 네모 버튼을
          누르세요」라고 말하면서 반짝이는 것도 그 단추도 없었다. 게다가 가르치던
          「단추 누르고 캔버스 클릭」 두 걸음은 같은 날 도형이 바로 놓이도록 바뀌면서
          사실도 아니게 됐다. 고쳐 쓰는 대신 지운다 — 보기 ▸ 작성자 매뉴얼(45걸음)과
          ▶ 튜토리얼(30초 시연)이 같은 일을, 맞는 내용으로 한다. */}
      <div className="help-keys">
        <div className="help-keys-t">⌨ 키보드 단축키 <small>(마우스로도 다 됩니다)</small></div>
        <table className="kbd-tbl"><tbody>
          {SHORTCUTS.map((s) => (<tr key={s.k}><td className="kbd-k">{s.k}</td><td className="kbd-d">{s.d}</td></tr>))}
        </tbody></table>
      </div>
    </Modal>
  )
}
