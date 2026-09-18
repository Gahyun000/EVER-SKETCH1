// 셸 — 머리줄 + 왼쪽 사이드바. **갈 곳이 늘 왼쪽에 있다.**
//
// **왜 만드나.** 지금까지 화면은 둘뿐이었다(라이브러리·편집). 결재함·팀 공유·팀 관리·
// 환경 설정은 전부 **덮개**였고, 덮개는 라이브러리 위에만 떴다. 그래서
//
//   · 편집하다 결재함을 보려면 **나갔다 다시 들어와야** 했다
//   · 팀 관리·환경 설정은 이름표 안 작은 글씨라 **아는 사람만** 찾았다
//   · 대기 중인 결재가 몇 건인지 **열어 봐야** 알았다
//
// **역할은 「어느 메뉴를 갖는가」만 정한다.** 열람자에게 결재함은 **아예 없다** —
// 눌러 보고 403 을 받는 자리는 「고장 났다」로 읽힌다. 이건 이미 쓰던 방식이다
// (`{canSubmit && <결재함 버튼>}`).
//
// **편집 화면도 셸 안에 둔다**(사용자 결정 ㄱ). 다만 **기본으로 접는다** —
// 편집은 필름스트립 + 캔버스 + 오른쪽 패널로 이미 꽉 차 있어서, 214px 를 더 얹으면
// 방금 C에서 아낀 자리를 도로 내주는 셈이 된다. 60px 아이콘 줄이면 갈 곳은 있고
// 자리는 덜 먹는다.
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import UserBar from '../auth/UserBar'
import { apiListApprovals } from '../approvals/approvalApi'
import { apiListUsers } from '../auth/authApi'
import {
  shellFolded, rememberShellFolded, shellWidth, rememberShellWidth,
  shellFoldedEditor, rememberShellFoldedEditor,
  SIDE_MIN, SIDE_MAX, SIDE_DEFAULT,
} from '../persistence/prefs'
import SideTree, { useTreeOpen, useTreeCol } from './SideTree'
import { TREE_ROOT } from './sidebarTree'
import type { ShellView } from './shellPath'
import './shell.css'

export type ShellSlot = ShellView | 'editor'

type Item = { k: ShellView; t: string; ic: string; badge?: number }

/** 사람 그림 대신 선 그림 하나씩. lucide 를 쓰지 않는 이유는 없고,
 *  다섯 개뿐이라 파일 안에 두는 편이 읽기 쉽다. */
const IC: Record<string, string> = {
  lib: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  admin: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  set: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.36.4.66.73.86.3.18.64.28 1 .28H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
}
const Icon = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    {d.includes('circle') ? null : null}
  </svg>
)

export const VIEW_LABEL: Record<ShellSlot, string> = {
  library: '내 자료', inbox: '결재함', team: '팀 공유',
  users: '사용자 관리', admin: '팀 관리', settings: '환경 설정', editor: '편집',
}

export default function AppShell({ view, onView, crumb, children }: {
  view: ShellSlot
  onView: (v: ShellView) => void
  /** 머리줄 자취의 **마지막 칸**. 편집 중에는 자료 이름이 온다. */
  crumb?: string
  children: React.ReactNode
}) {
  const me = useAuth((s) => s.me)
  const [folded, setFolded] = useState(() => shellFolded())
  /** 편집에서의 접힘은 **따로** 기억한다. 아래 `fold` 참고. */
  const [foldedEd, setFoldedEd] = useState(() => shellFoldedEditor())
  const [width, setWidth] = useState(() => shellWidth())
  /** 끄는 중인가 — 끄는 동안에는 폭이 손을 따라가야 하므로 애니메이션을 끈다. */
  const [dragging, setDragging] = useState(false)
  /** **끌고 난 뒤에는 누른 것으로 치지 않는다.**
   *  손잡이를 끌면 `pointerup` 다음에 `click` 이 한 번 더 온다 — 브라우저가 원래 그렇다.
   *  이걸 안 막으면 **폭을 넓히자마자 접힌다**(2026-09-14, 실제로 그랬다). */
  const [pending, setPending] = useState(0)
  /** 가입 승인을 기다리는 사람 수. **UserBar 에서 옮겨 온 신호다** — 「사용자 관리」
   *  링크를 머리줄에서 빼면서 이 배지까지 같이 사라질 뻔했다. 관리자가 승인을
   *  놓치면 그게 곧 병목이라, 배지는 링크가 아니라 **그 일을 하는 자리**를 따라간다. */
  const [signups, setSignups] = useState(0)
  /** 나무에서 펴 둔 폴더. **셸이 들고 있다** — 뿌리(「내 자료」)의 ▾ 와
   *  나무가 같은 값을 봐야 접고 편 것이 어긋나지 않는다. */
  const { open: treeOpen, toggle: treeToggle } = useTreeOpen()
  /** 나무를 제 칸으로 뺐는가(사용자 결정 ①). 기본은 메뉴 안이다. */
  const { col: treeCol, swap: treeSwap } = useTreeCol()

  const role = me?.role
  const canSubmit = role === 'writer' || role === 'admin'
  const admin = role === 'admin'

  // **접힘은 화면마다 따로 기억한다.**
  //
  // 2026-09-15 · 여기 `|| view === 'editor'` 가 있었다. 편집에서는 무조건 접는다는 뜻인데,
  // 펴는 단추는 `folded` 만 바꾸므로 **편집에서는 눌러도 안 펴졌다.** 접힌 열에 남은 것은
  // 아이콘뿐이고 그걸 누르면 화면이 옮겨 갔으니, 「사이드바를 펴려던 손짓」이
  // 그대로 **편집에서 나가는 길**이 되어 있었다.
  //
  // 편집은 여전히 **접힌 채로 시작한다**(필름스트립 + 캔버스 + 오른쪽 패널로 이미 꽉 차 있다).
  // 다만 그건 첫 기본값일 뿐이고, 사람이 편 것은 그대로 남는다.
  const inEditor = view === 'editor'
  const shut = inEditor ? foldedEd : folded

  /** 나무가 메뉴 안에 달려 있는 상태. 제 칸으로 뺐으면 「내 자료」 밑은 비어 있다. */
  const treeInNav = !treeCol && !shut

  // 대기 건수 — 관리자에게는 「내가 결정할 것」, 작성자에게는 「답을 기다리는 것」이다.
  // 둘 다 **열어 보지 않아도 알아야** 하는 숫자라 같은 자리에 붙인다.
  useEffect(() => {
    if (!canSubmit) { setPending(0); return }
    let live = true
    const load = () => {
      void apiListApprovals('pending')
        .then((r) => { if (live) setPending(r.counts?.pending || 0) })
        .catch(() => { /* 부가 정보다 — 조용히 넘어간다 */ })
    }
    load()
    // **창을 다시 볼 때** 새로 읽는다. 결재는 몇 분·몇 시간 단위 일이라 실시간이 필요 없고,
    // 사람은 대개 다른 걸 하다 돌아와서 본다.
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { live = false; document.removeEventListener('visibilitychange', onVis) }
  }, [canSubmit, view])

  // 가입 승인 대기 — 관리자에게만 뜻이 있다. **화면이 바뀔 때 다시 센다**:
  // 사용자 관리 화면에서 승인하고 나오면 그 자리에서 숫자가 맞아야 한다.
  useEffect(() => {
    if (!admin) { setSignups(0); return }
    let live = true
    void apiListUsers('pending')
      .then((us) => { if (live) setSignups(us.length) })
      .catch(() => { /* 배지는 부가 정보다 — 조용히 넘어간다 */ })
    return () => { live = false }
  }, [admin, view])

  const items: (Item | { sep: string })[] = [
    { k: 'library', t: canSubmit ? '내 자료' : '개인 스케치', ic: 'lib' },
    ...(canSubmit ? [{ k: 'inbox' as const, t: '결재함', ic: 'inbox', badge: pending }] : []),
    { k: 'team', t: '팀 공유', ic: 'team' },
    ...(admin ? [{ sep: '관리' },
      { k: 'users' as const, t: '사용자 관리', ic: 'team', badge: signups },
      { k: 'admin' as const, t: '팀 관리', ic: 'admin' },
      { k: 'settings' as const, t: '환경 설정', ic: 'set' }] : []),
  ]

  /** 접고 편다. **편집이면 편집 쪽 기억에 쓴다** — 목록에서는 펴 두고 편집에서는
   *  접어 두는 손버릇이 흔해서, 한 값으로 묶으면 화면을 옮길 때마다 상대를 덮어쓴다. */
  const fold = (v: boolean) => {
    if (inEditor) { setFoldedEd(v); rememberShellFoldedEditor(v) }
    else { setFolded(v); rememberShellFolded(v) }
  }

  /** 경계선을 끌어 폭을 맞춘다.
   *
   *  **2026-09-18 · 끄는 일과 누르는 일을 갈랐다**(사용자 결정 ㄷ ·
   *  docs/화면시안_사이드바손잡이_v1.0.html). 예전에는 손잡이 하나가 둘을 겸했다 —
   *  「같은 경계에 장치가 둘이면 안 된다」는 뜻이었는데, 겸하게 두니 **누르려다
   *  4px 만 흔들려도 접기가 안 먹었다**(움직였으면 click 을 버리는 코드가 있다).
   *  이제 경계선 **전체**가 끄는 자리이고(`.sh-rail`), 손잡이는 **누르기만** 한다.
   *  장치가 둘로 는 것이 아니라, **한 경계 안에서 일이 갈린 것**이다.
   *
   *  `SIDE_MIN` 보다 좁게 끌면 **접는다.** 끌어서 없앨 수 있다는 뜻이라
   *  「최소 폭에서 더 안 줄어드는」 벽에 부딪히는 느낌이 안 생긴다. */
  const onDragStart = (e: React.PointerEvent) => {
    if (shut) return
    e.preventDefault()
    setDragging(true)
    const startX = e.clientX, startW = width
    let moved = false
    const move = (ev: PointerEvent) => {
      const w = startW + (ev.clientX - startX)
      if (Math.abs(ev.clientX - startX) > 3) moved = true
      if (w < SIDE_MIN - 28) { setWidth(SIDE_MIN) ; return }
      setWidth(Math.min(SIDE_MAX, Math.max(SIDE_MIN, w)))
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragging(false)
      // 끝까지 좁게 끌었으면 접는다. 안 움직였으면 아무 일도 없다 —
      // **접는 일은 손잡이가 맡는다.** 띠를 톡 눌렀다고 접히면, 본문 왼쪽 끝을
      // 짚으려다 사이드바가 사라진다.
      if (moved && ev.clientX - startX < -(startW - SIDE_MIN) - 28) fold(true)
      else if (moved) rememberShellWidth(startW + (ev.clientX - startX))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="sh">
      <header className="sh-head">
        {/* **접기는 머리줄이 아니라 경계선에 있다**(2026-09-14).
            여기 ☰ 를 두면 손이 왼쪽 메뉴에 가 있는데 접으려고 위로 올라가야 하고,
            사이드바가 60px 로만 접혀 늘 보이므로 같은 일을 하는 단추가 둘일 이유가 없다. */}
        <div className="sh-brand"><span className="lg">ℓ</span><span className="nm">EVER-SKETCH</span></div>
        {/* **어디에 있는지 늘 보인다.** 편집에 들어가도 남는다 —
            지금까지는 편집에 들어가는 순간 어느 화면에서 왔는지가 사라졌다. */}
        <nav className="sh-crumb" aria-label="지금 자리">
          <span>{VIEW_LABEL[view === 'editor' ? 'library' : view]}</span>
          {crumb ? <><span className="sp">›</span><b>{crumb}</b></> : null}
        </nav>
        <div className="sh-sp" />
        {/* **오른쪽 끝은 비워 둔다**(2026-09-15). 여기 이름 + 사용자 관리 + 팀 관리 +
            비밀번호 변경 + 로그아웃 다섯이 늘어서 있었다. 앞의 둘은 왼쪽 메뉴 「관리」에
            이미 있어 같은 길이 두 벌이었고, 나머지는 하루에 한 번 쓸까 말까 한 것이
            늘 자리를 차지했다. 계정은 **사이드바 맨 아래**로 내려갔다 —
            신원은 여전히 앱에 한 곳뿐이다. */}
      </header>

      <div className={'sh-body' + (shut ? ' shut' : '') + (dragging ? ' drag' : '')}
        style={{
          gridTemplateColumns: (shut ? '60px' : width + 'px')
            + (treeCol && !shut ? ' 220px' : '') + ' 1fr',
        }}>
        {/* **사이드바는 두 켜다.** 갈 곳 목록은 길어지면 스스로 구르고, 계정 줄은
            맨 아래에 붙어 안 밀린다. 예전에는 `.sh-side` 자체가 `<nav>` 라서
            계정 줄을 그 뒤에 두면 **사이드바 밖 격자 칸으로 빠졌다**(2026-09-15). */}
        <aside className="sh-side">
        <nav className="sh-navs" aria-label="갈 곳">
          {items.map((it, i) => 'sep' in it ? (
            <div className="sh-grp" key={'s' + i}>{it.sep}</div>
          ) : (
            /* 「내 자료」만 아래로 나무가 달린다. **한 줄에 누를 곳이 둘**이라
               단추를 겹쳐 두지 않고 나란히 둔다 — 단추 안에 단추는 없는 것이다. */
            <div key={it.k} className="sh-navwrap">
            <div className={'sh-navrow' + (it.k === 'library' && treeInNav ? ' hastree' : '')}>
            <button className={'sh-nav' + (view === it.k ? ' on' : '')}
              onClick={() => {
                // **접혀 있으면 먼저 편다**(사용자 결정 ⑪ㄱ). 글자가 없는 아이콘 열에서
                // 누르는 것은 대개 「어디에 뭐가 있나」를 보려는 손짓이지 화면을 옮기려는
                // 것이 아니다. 한 번 더 눌러야 옮겨 가므로 **펴려다 나가 버리는 일이 없다.**
                if (shut) { fold(false); return }
                onView(it.k)
              }}
              title={shut ? `${it.t} · 누르면 메뉴가 펴집니다` : it.t}
              aria-current={view === it.k ? 'page' : undefined}>
              <span className="ic"><Icon d={IC[it.ic]} /></span>
              <span className="lbl">{it.t}</span>
              {it.badge ? <span className="bd" title={`대기 ${it.badge}건`}>{it.badge}</span> : null}
            </button>
            {it.k === 'library' && treeInNav ? (
              /* 아이콘 자리를 덮는다 — 평소엔 아래 아이콘이 보이고 마우스를 올리면
                 이 ▾ 가 드러난다(사용자 결정 ⑥). **화면은 안 옮긴다.** */
              <button className={'sh-fold' + (treeOpen.has(TREE_ROOT) ? '' : ' shut')
                + (view === 'library' ? ' on' : '')}
                onClick={() => treeToggle(TREE_ROOT)}
                aria-expanded={treeOpen.has(TREE_ROOT)}
                aria-label={treeOpen.has(TREE_ROOT) ? '폴더 접기' : '폴더 펴기'}
                title={treeOpen.has(TREE_ROOT) ? '접기' : '펴기'}>▾</button>
            ) : null}
            {it.k === 'library' && treeInNav ? (
              /* **「내 자료」의 머리줄 오른쪽 끝**(2026-09-15). 제 칸일 때 「합치기」가
                 칸 머리줄에 있는 것과 같은 자리다 — 전에는 나무 위에 줄을 하나 더
                 만들어 어중간하게 떠 있었다.
                 나무를 접어 둔 사람에게도 보인다는 이득이 하나 더 있다: 전에는
                 나무를 펴야만 이 글자가 나왔는데, 처음에는 나무가 접힌 채로 시작한다(⑧ㄴ). */
              <button className="sh-tswap onrow" onClick={treeSwap}
                title="폴더를 제 칸으로 뺀다">칸 나누기</button>
            ) : null}
            </div>
            {it.k === 'library' && treeInNav
              ? <SideTree open={treeOpen} toggle={treeToggle} col={false}
                  onSwap={treeSwap} onGo={() => onView('library')} />
              : null}
            </div>
          ))}
        </nav>
        {/* 계정은 **갈 곳 목록이 아니다.** `nav` 밖에 두고 맨 아래에 붙인다 —
            매일 누르는 메뉴와 하루에 한 번 누르는 것이 같은 줄에 서면 안 된다. */}
        <UserBar />
        </aside>
        {/* **폴더 전용 칸**(①ㄴ). 메뉴와 폴더가 갈라져서, 폴더가 아무리 많아도
            「결재함·팀 공유」가 스크롤 아래로 안 밀린다. 접힌 사이드바에서는 안 그린다 —
            글자가 없는 60px 열 옆에 220px 짜리 폴더 칸만 남으면 짝이 안 맞는다. */}
        {treeCol && !shut ? (
          <aside className="sh-col" aria-label="폴더">
            <SideTree open={treeOpen} toggle={treeToggle} col
              onSwap={treeSwap} onGo={() => onView('library')} />
          </aside>
        ) : null}
        <main className="sh-main">{children}</main>

        {/* **경계선 전체가 끄는 자리다**(2026-09-18 · 사용자 결정 ㄷ).
            5px 띠라 겨누지 않아도 잡힌다 — 잡히는 넓이가 484px² 에서 2250px² 로 늘었다.
            평소에는 **투명**이다. 아무것도 안 가리면서 본문 왼쪽 3px 만 가로챈다.

            **접혀 있을 때는 아예 안 그린다.** 60px 은 줄일 폭이 없어서, 띠를 남겨 두면
            `col-resize` 커서가 「끌 수 있다」고 거짓말을 한다. */}
        {!shut && (
          <div className="sh-rail" style={{ left: width - 2 + 'px' }}
            onPointerDown={onDragStart}
            onDoubleClick={() => { setWidth(SIDE_DEFAULT); rememberShellWidth(SIDE_DEFAULT) }}
            aria-hidden="true" />
        )}
        {/* **손잡이는 누르기만 한다.** 세로 자리를 하나도 안 쓰고, 움직이는 그 경계에
            붙어 있어 「이 선이 왼쪽으로 간다」가 모양으로 읽힌다. 접히면 따라가므로
            편 상태와 접힌 상태가 **같은 물건**이다.

            **늘 보인다**(사용자 지시 2026-09-18 「커서 안 올려도 계속 뜨고 눈에 띄게」).
            예전에는 `opacity: .22` 였고 셸에 마우스가 들어와야 드러났다 —
            본문 위로 걸치는 것이 싫어서였는데, **안 보이는 단추는 없는 단추다.** */}
        <button className="sh-edge" style={{ left: (shut ? 60 : width) - 10 + 'px' }}
          onClick={() => fold(!shut)}
          aria-label={shut ? '메뉴 펴기' : '메뉴 접기'}
          title={shut ? '펴기' : '접기 · 경계선을 끌면 폭 조절'}>
          {shut ? '›' : '‹'}
        </button>
      </div>
    </div>
  )
}
