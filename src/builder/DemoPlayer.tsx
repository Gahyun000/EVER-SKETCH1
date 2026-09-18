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
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer } from 'lucide-react'
import { MAKE_CHAPTERS, MAKE_DIR, MAKE_STEP_COUNT, MM_ROWS, MM_SAMPLE } from './manualMake'
import Modal from '../ui/Modal'

/**
 * **그림은 정지 캡처(PNG)다. 2026-09-17 에 GIF 에서 바꿨다.**
 *
 * 이유 셋.
 *  ① 매뉴얼은 **옆에 띄워 놓고 따라 하는 것**이다. GIF 는 놓치면 다시 돌려야 하고
 *     멈춰서 글자를 읽을 수가 없다.
 *  ② 인쇄가 안 된다. 정지 화면이면 그대로 PDF 가 된다.
 *  ③ 한 편이 400~600KB 라 열두 편이 3MB 였다. 지금은 절반 이하다.
 *
 * **그리고 그림 안에 글자를 박지 않는다.** 예전 GIF 에는 아래쪽에 설명 띠가
 * 구워져 있었는데, 그 글이 아래 `line` 과 같은 말을 두 벌로 갖고 있었다.
 * 그래서 규칙이 바뀌었을 때(발행이 작성자에게 열렸을 때) `line` 만 고쳐서는
 * **그림 속 글자가 틀린 채로 남았다.** 말은 코드에만 두고 — 여기 `line` 이 유일본이다 —
 * 그림은 화면만 담는다. 그래야 `manual_truth.test.mjs` 가 말의 옳고 그름을 잴 수 있다.
 */
interface Ep { no: number; title: string; file: string; line: string }

/** 열두 편. **찍은 순서가 곧 배우는 순서**다 — 만들기 → 흐름 → 막히는 곳 → 물어볼 곳. */
export const EPISODES: Ep[] = [
  { no: 1, title: '이 매뉴얼', file: '01_cover.png',
    line: 'EVER-SKETCH 를 처음 쓰는 작성자를 위한 열두 편입니다.' },
  // 2026-09-17 · 「트리 · 머메이드」가 **머메이드 TB / 머메이드 LR** 둘로 갈렸다(registry.ts).
  // 없는 이름을 가리키는 매뉴얼은 처음 쓰는 사람을 그 자리에서 막는다.
  { no: 2, title: '글로 뼈대 잡기', file: '02_tree.png',
    line: '＋ 새 페이지 ▾ ▸ 머메이드 TB(위→아래) 또는 머메이드 LR(왼→오른). 글로 치면 그림이 되고, 그다음엔 상자를 하나씩 잡고 옮깁니다.' },
  { no: 3, title: '세 등급', file: '03_levels.png',
    line: 'Lv1 관리자 · Lv2 작성자 · Lv3 열람자. 로그인하면 사이드바부터 다릅니다.' },
  { no: 4, title: '자료의 일생', file: '04_lifecycle.png',
    line: '초안 → 결재 중 → 승인 · 반려 → 수정 요청 중 → 수정 중. 이 흐름이 이 도구의 뼈대입니다.' },
  { no: 5, title: '제출하면 잠긴다', file: '05_submit.png',
    line: '제출하는 순간 문서가 그대로 얼어붙습니다. 뒤에 고쳐도 결재본은 안 바뀝니다.' },
  { no: 6, title: '세 갈래', file: '06_decide.png',
    line: '승인 · 반려는 관리자가, 회수는 낸 사람이 합니다. 관리자가 대신 회수하면 반려와 구분이 안 됩니다.' },
  { no: 7, title: '승인 뒤 고치기', file: '07_revise.png',
    line: '승인된 자료는 잠깁니다. 「수정 요청」을 내고 관리자가 「허락」하면 그때 열립니다.' },
  // 2026-09-16 · 발행이 **작성자에게도 열렸다**(permissions.py 의 PUBLISH, 단 제 자료만).
  // 「관리자만」이라고 적어 두면 작성자가 아예 안 해 본다 — 없는 기능이 되는 셈이다.
  { no: 8, title: '공유는 둘', file: '08_share.png',
    line: '따로 공유 단추가 없습니다 — 승인이 곧 팀 공유입니다. 발행(EVER-FOLIO)은 작성자도 제 자료는 직접 합니다.' },
  { no: 9, title: '의견', file: '09_comment.png',
    line: '결재함에서 지적하고 답합니다. 이 대화는 관리자와 낸 사람만 봅니다.' },
  { no: 10, title: 'Lv3 화면', file: '10_viewer.png',
    line: '열람자도 제 스케치를 씁니다. 같은 팀이면 승인본도 봅니다 — 등급이 아니라 팀이 정합니다.' },
  { no: 11, title: '막히는 곳', file: '11_blocked.png',
    line: '팀 없이 제출 · 잠긴 자료 고치기 · 낸 자료 지우기. 막히는 자리마다 왜 막히는지 말해 줍니다.' },
  // 발행이 여기서도 빠졌다(2026-09-16). 남은 셋은 여전히 관리자만 한다.
  { no: 12, title: '물어볼 곳', file: '12_ask.png',
    line: '팀 편성 · 승인 · 계정 관리는 Lv1 관리자가 합니다. 막히면 관리자에게.' },
]

export const MANUAL_DIR = '/manual/'

/** 장을 가로질러 **한 줄로 편** 걸음 목록. 「‹ 앞 · 다음 ›」이 장 경계를 모르고 넘어가야 한다 —
 *  사람은 2장 끝에서 3장 처음으로 그냥 이어 읽는다. 장은 **목록에 이름표를 붙일 때만** 쓴다. */
const FLAT = MAKE_CHAPTERS.flatMap((c) => c.steps.map((st) => ({ ...st, ch: c })))

/**
 * **인쇄는 「지금 보는 한 장」이 아니라 전부를 낸다.**
 *
 * 화면은 한 걸음씩 보여 주지만, 종이로 뽑는 사람이 원하는 건 **한 벌 전체**다.
 * 그래서 인쇄용으로 모든 걸음을 펼친 판을 따로 그리고, 평소엔 숨겨 둔다.
 *
 * **`document.body` 바로 아래에 붙인다**(포털). 인쇄 CSS 가 「이것만 빼고 다 감춘다」로
 * 동작하는데, 모달 안에 있으면 모달째 감춰지면서 같이 사라진다.
 */
function PrintSheet() {
  return createPortal(
    <div className="man-print" aria-hidden="true">
      <h1>EVER-SKETCH 작성자 매뉴얼 — ① 만들기</h1>
      <p className="mp-sub">표준 양식 한 장을 처음부터 끝까지 채우는 법 · {MAKE_STEP_COUNT}걸음</p>
      {MAKE_CHAPTERS.map((c) => (
        <section key={c.no} className="mp-ch">
          <h2>{c.no}장 · {c.title}</h2>
          <p className="mp-lead" dangerouslySetInnerHTML={{ __html: c.lead }} />
          {c.steps.map((st) => (
            <article key={st.n} className="mp-step">
              <h3><span className="mp-no">{st.n}</span>{st.t}</h3>
              <div className="mp-body">
                <div className="mp-txt">
                  <p dangerouslySetInnerHTML={{ __html: st.body }} />
                  {st.tip && <p className="mp-tip"><b>알아두면</b> <span dangerouslySetInnerHTML={{ __html: st.tip }} /></p>}
                  {st.warn && <p className="mp-warn"><b>주의</b> <span dangerouslySetInnerHTML={{ __html: st.warn }} /></p>}
                </div>
                <img src={MAKE_DIR + st.img} alt="" />
              </div>
            </article>
          ))}
        </section>
      ))}
      <section className="mp-ch">
        <h2>머메이드 — 처음이면 무엇을 어떻게 치나</h2>
        <table className="mp-tb">
          <tbody>
            {MM_ROWS.map((r, k) => (
              <tr key={k}><td>{r.k}</td><td><code>{r.code}</code></td>
                <td dangerouslySetInnerHTML={{ __html: r.d }} /></tr>
            ))}
          </tbody>
        </table>
        <pre className="mp-mono">{MM_SAMPLE}</pre>
      </section>
    </div>,
    document.body,
  )
}

export default function DemoPlayer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0)
  /** 어느 갈래를 보고 있나. 「만들기」가 먼저다 — 처음 쓰는 사람이 제일 먼저 할 일이 그것이다. */
  const [tab, setTab] = useState<'make' | 'flow'>('make')
  /** 「① 만들기」에서 몇째 걸음인가. 장 구분 없이 쭉 이어 센다. */
  const [mi, setMi] = useState(0)
  /**
   * **걸음을 넘기면 맨 위부터 보여 준다.**
   *
   * 틀을 고정하면서 무대 안쪽만 구르게 됐다(2026-09-18). 그러면 긴 그림을 보려고 내려간
   * 자리가 다음 걸음에도 그대로 남아, 새 걸음이 **제목도 없이 한복판부터** 뜬다.
   * 넘긴 사람은 그걸 「덜 그려졌다」로 읽는다.
   */
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0 }, [mi, i, tab])
  // 창을 다시 열면 처음부터. 지난번에 보던 편이 남아 있으면 「왜 여기서 시작하지」가 된다.
  useEffect(() => { if (open) { setI(0); setMi(0); setTab('make') } }, [open])
  // ← → 로 넘긴다. 열두 편을 훑을 때 마우스로만 하면 손이 아프다.
  useEffect(() => {
    if (!open) return
    // **보고 있는 갈래를 따라간다.** 예전에는 열두 편만 있어서 하나뿐이었다.
    const on = (e: KeyboardEvent) => {
      const last = tab === 'make' ? FLAT.length - 1 : EPISODES.length - 1
      const set = tab === 'make' ? setMi : setI
      if (e.key === 'ArrowRight') set((v) => Math.min(last, v + 1))
      if (e.key === 'ArrowLeft') set((v) => Math.max(0, v - 1))
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open, tab])
  if (!open) return null

  const ep = EPISODES[i]
  const st = FLAT[mi]
  return (
    // **보기만 하는 창이라 「취소」가 없다** — 그래서 ✕ 다(`cancel="closeX"`).
    // 취소도 ✕ 도 없는 창은 만들 수 없다(ui/Modal 의 ModalCancel).
    <Modal title="작성자 매뉴얼" onClose={onClose} size="lg"
      scrimClassName="demo-scrim" className="demo-modal" cancel="closeX">
      {/* **두 갈래를 탭으로 나눈다.** 「만들기」는 손으로 하는 법, 「제도」는 결재 흐름이다.
          성격이 달라서 한 줄로 이어 붙이면 「앞 편」을 누르다 갑자기 화제가 바뀐다. */}
      <div className="man-tabs">
        <button className={'man-tab' + (tab === 'make' ? ' on' : '')} onClick={() => setTab('make')}>
          ① 만들기 <span className="man-tc">{MAKE_STEP_COUNT}걸음</span>
        </button>
        <button className={'man-tab' + (tab === 'flow' ? ' on' : '')} onClick={() => setTab('flow')}>
          ② 제도 <span className="man-tc">{EPISODES.length}편</span>
        </button>
        {/* 인쇄는 **만들기 쪽만** 낸다 — 종이로 들고 따라 하는 건 이쪽이다.
            제도는 읽고 나면 끝이라 인쇄할 일이 없다. */}
        {tab === 'make' && (
          <button className="man-print-btn" onClick={() => window.print()}
            title="브라우저 인쇄로 내보냅니다 — 저장할 곳에서 「PDF로 저장」을 고르세요">
            <Printer className="h-4 w-4" /> 인쇄 · PDF
          </button>
        )}
      </div>

      {tab === 'flow' ? (
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
          {/* **구르는 칸은 여기까지다.** 이동 막대는 이 칸 밖에 있어서 어느 편에서도 같은 자리에 선다. */}
          <div className="man-scroll" ref={scrollRef}>
            <img className="man-gif" src={MANUAL_DIR + ep.file} alt={`${ep.no}편 ${ep.title}`} />
            <p className="man-line">{ep.line}</p>
          </div>
          <div className="man-nav">
            <button className="man-btn" disabled={i === 0} onClick={() => setI(i - 1)}>‹ 앞 편</button>
            <span className="man-cnt">{ep.no} / {EPISODES.length}</span>
            <button className="man-btn" disabled={i === EPISODES.length - 1} onClick={() => setI(i + 1)}>다음 편 ›</button>
          </div>
        </div>
      </div>
      ) : (
      <div className="man-wrap">
        {/* 목록은 **장으로 묶어** 보여 준다 — 서른일곱을 그냥 늘어놓으면 어디쯤인지 모른다.
            고르는 건 걸음이고, 장은 이름표일 뿐이다. */}
        <ol className="man-list">
          {MAKE_CHAPTERS.map((c) => (
            <li key={c.no} className="man-grp">
              <div className="man-gh">{c.no}장 · {c.title}</div>
              <ol className="man-sub">
                {c.steps.map((x) => {
                  const k = FLAT.findIndex((f) => f.n === x.n)
                  return (
                    <li key={x.n}>
                      <button className={'man-item' + (k === mi ? ' on' : '')} onClick={() => setMi(k)}>
                        <span className="man-no">{x.n}</span>
                        <span className="man-t">{x.t}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </li>
          ))}
        </ol>
        <div className="man-stage">
          <div className="man-scroll" ref={scrollRef}>
            <div className="man-sh"><span className="man-sn">{st.n}</span>{st.t}</div>
            <img className="man-gif" src={MAKE_DIR + st.img} alt={`${st.n} ${st.t}`} />
            <p className="man-line" dangerouslySetInnerHTML={{ __html: st.body }} />
            {st.tip && <p className="man-tip"><b>알아두면</b> <span dangerouslySetInnerHTML={{ __html: st.tip }} /></p>}
            {st.warn && <p className="man-tip warn"><b>주의</b> <span dangerouslySetInnerHTML={{ __html: st.warn }} /></p>}
          </div>
          <div className="man-nav">
            <button className="man-btn" disabled={mi === 0} onClick={() => setMi(mi - 1)}>‹ 앞</button>
            <span className="man-cnt">{mi + 1} / {FLAT.length}</span>
            <button className="man-btn" disabled={mi === FLAT.length - 1} onClick={() => setMi(mi + 1)}>다음 ›</button>
          </div>
        </div>
      </div>
      )}
      <PrintSheet />
    </Modal>
  )
}
