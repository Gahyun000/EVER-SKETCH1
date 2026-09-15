// 작성자 매뉴얼 — 열두 편 (2026-09-15).
//
// 예전엔 「▶ 예시영상」이라는 이름으로 스토리보드 GIF **한 장**을 띄우는 창이었다.
// 처음 쓰는 사람에게 필요한 건 「이 도구로 무엇을 어떻게 하나」라서, 열두 편으로 나눴다.
//
// ── GIF 를 문서가 아니라 `public/` 에 두는 이유 ────────────────
// 그림을 문서에 넣는 입구는 「🙂 이모지·아이콘·이미지」 하나뿐인데, 그러면 그림이
// **base64 로 문서 안에** 들어간다. 재 보니 12편이면 한 문서가 57MB 가 되고,
// 저장할 때마다 그걸 통째로 올린다. 매뉴얼은 **앱에 딸린 물건**이지 누군가의 자료가
// 아니므로 `public/manual/` 에 둔다 — 문서는 가벼운 채로 두고, 매뉴얼은 배포에 따라간다.
//
// ── 파일 이름을 영문으로 둔 이유 ──────────────────────────────
// 한글 파일명은 주소로 나갈 때 인코딩을 타고, 서버·CDN 마다 다르게 다룬다.
// 화면에 보이는 이름은 아래 표가 들고 있으므로 파일명은 안전한 쪽으로 둔다.
import { useEffect, useState } from 'react'
import Modal from '../ui/Modal'

interface Ep { no: number; title: string; file: string; line: string }

/** 열두 편. **찍은 순서가 곧 배우는 순서**다 — 만들기 → 흐름 → 막히는 곳 → 물어볼 곳. */
export const EPISODES: Ep[] = [
  { no: 1, title: '이 매뉴얼', file: '01_cover.png',
    line: 'EVER-SKETCH 를 처음 쓰는 작성자를 위한 열두 편입니다.' },
  { no: 2, title: '글로 뼈대 잡기', file: '02_tree.gif',
    line: '＋ 새 페이지 ▾ ▸ 트리 · 머메이드. 글로 치면 그림이 되고, 그다음엔 상자를 하나씩 잡고 옮깁니다.' },
  { no: 3, title: '세 등급', file: '03_levels.gif',
    line: 'Lv1 관리자 · Lv2 작성자 · Lv3 열람자. 로그인하면 사이드바부터 다릅니다.' },
  { no: 4, title: '자료의 일생', file: '04_lifecycle.gif',
    line: '초안 → 결재 중 → 승인 · 반려 → 수정 요청 중 → 수정 중. 이 흐름이 이 도구의 뼈대입니다.' },
  { no: 5, title: '제출하면 잠긴다', file: '05_submit.gif',
    line: '제출하는 순간 문서가 그대로 얼어붙습니다. 뒤에 고쳐도 결재본은 안 바뀝니다.' },
  { no: 6, title: '세 갈래', file: '06_decide.gif',
    line: '승인 · 반려는 관리자가, 회수는 낸 사람이 합니다. 관리자가 대신 회수하면 반려와 구분이 안 됩니다.' },
  { no: 7, title: '승인 뒤 고치기', file: '07_revise.gif',
    line: '승인된 자료는 잠깁니다. 「수정 요청」을 내고 관리자가 「허락」하면 그때 열립니다.' },
  { no: 8, title: '공유는 둘', file: '08_share.gif',
    line: '따로 공유 단추가 없습니다 — 승인이 곧 팀 공유입니다. 발행(EVER-FOLIO)은 관리자만 합니다.' },
  { no: 9, title: '의견', file: '09_comment.gif',
    line: '결재함에서 지적하고 답합니다. 이 대화는 관리자와 낸 사람만 봅니다.' },
  { no: 10, title: 'Lv3 화면', file: '10_viewer.gif',
    line: '열람자도 제 스케치를 씁니다. 같은 팀이면 승인본도 봅니다 — 등급이 아니라 팀이 정합니다.' },
  { no: 11, title: '막히는 곳', file: '11_blocked.gif',
    line: '팀 없이 제출 · 잠긴 자료 고치기 · 낸 자료 지우기. 막히는 자리마다 왜 막히는지 말해 줍니다.' },
  { no: 12, title: '물어볼 곳', file: '12_ask.png',
    line: '팀 편성 · 승인 · 발행은 Lv1 관리자가 합니다. 막히면 관리자에게.' },
]

export const MANUAL_DIR = '/manual/'

export default function DemoPlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0)
  // 창을 다시 열면 처음부터. 지난번에 보던 편이 남아 있으면 「왜 여기서 시작하지」가 된다.
  useEffect(() => { if (open) setI(0) }, [open])
  // ← → 로 넘긴다. 열두 편을 훑을 때 마우스로만 하면 손이 아프다.
  useEffect(() => {
    if (!open) return
    const on = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((v) => Math.min(EPISODES.length - 1, v + 1))
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1))
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open])
  if (!open) return null

  const ep = EPISODES[i]
  return (
    // **보기만 하는 창이라 「취소」가 없다** — 그래서 ✕ 다(`cancel="closeX"`).
    // 취소도 ✕ 도 없는 창은 만들 수 없다(ui/Modal 의 ModalCancel).
    <Modal title="작성자 매뉴얼 — 열두 편" onClose={onClose} size="lg"
      scrimClassName="demo-scrim" className="demo-modal" cancel="closeX">
      <div className="man-wrap">
        <ol className="man-list">
          {EPISODES.map((e, k) => (
            <li key={e.no}>
              <button className={'man-item' + (k === i ? ' on' : '')} onClick={() => setI(k)}>
                <span className="man-no">{String(e.no).padStart(2, '0')}</span>
                <span className="man-t">{e.title}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="man-stage">
          <img className="man-gif" src={MANUAL_DIR + ep.file} alt={`${ep.no}편 ${ep.title}`} />
          <p className="man-line">{ep.line}</p>
          <div className="man-nav">
            <button className="man-btn" disabled={i === 0} onClick={() => setI(i - 1)}>‹ 앞 편</button>
            <span className="man-cnt">{ep.no} / {EPISODES.length}</span>
            <button className="man-btn" disabled={i === EPISODES.length - 1} onClick={() => setI(i + 1)}>다음 편 ›</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
