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
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import UserBar from '../auth/UserBar'
import { apiListApprovals } from '../approvals/approvalApi'
import {
  shellFolded, rememberShellFolded, shellWidth, rememberShellWidth,
  SIDE_MIN, SIDE_MAX, SIDE_DEFAULT,
} from '../persistence/prefs'
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
  const [width, setWidth] = useState(() => shellWidth())
  /** 끄는 중인가 — 끄는 동안에는 폭이 손을 따라가야 하므로 애니메이션을 끈다. */
  const [dragging, setDragging] = useState(false)
  /** **끌고 난 뒤에는 누른 것으로 치지 않는다.**
   *  손잡이를 끌면 `pointerup` 다음에 `click` 이 한 번 더 온다 — 브라우저가 원래 그렇다.
   *  이걸 안 막으면 **폭을 넓히자마자 접힌다**(2026-09-14, 실제로 그랬다). */
  const dragged = useRef(false)
  const [pending, setPending] = useState(0)

  const role = me?.role
  const canSubmit = role === 'writer' || role === 'admin'
  const admin = role === 'admin'

  // **편집에서는 기본으로 접는다.** 사람이 편 것은 그대로 둔다 —
  // 접었다 폈다를 화면이 대신 정하면, 편 사람은 편집에 들어갈 때마다 다시 편다.
  const shut = folded || view === 'editor'

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

  const items: (Item | { sep: string })[] = [
    { k: 'library', t: canSubmit ? '내 자료' : '개인 스케치', ic: 'lib' },
    ...(canSubmit ? [{ k: 'inbox' as const, t: '결재함', ic: 'inbox', badge: pending }] : []),
    { k: 'team', t: '팀 공유', ic: 'team' },
    ...(admin ? [{ sep: '관리' },
      { k: 'users' as const, t: '사용자 관리', ic: 'team' },
      { k: 'admin' as const, t: '팀 관리', ic: 'admin' },
      { k: 'settings' as const, t: '환경 설정', ic: 'set' }] : []),
  ]

  const fold = (v: boolean) => { setFolded(v); rememberShellFolded(v) }

  /** 경계선을 끌어 폭을 맞춘다(ㄹ).
   *
   *  **손잡이가 곧 끄는 자리다.** 접기 단추를 따로 두고 끄는 띠를 또 두면
   *  같은 경계에 장치가 둘이 된다 — 누르면 접히고, 끌면 넓어진다.
   *
   *  `SIDE_MIN` 보다 좁게 끌면 **접는다.** 끌어서 없앨 수 있다는 뜻이라
   *  「최소 폭에서 더 안 줄어드는」 벽에 부딪히는 느낌이 안 생긴다. */
  const onDragStart = (e: React.PointerEvent) => {
    if (shut) return
    e.preventDefault()
    setDragging(true)
    const startX = e.clientX, startW = width
    let moved = false
    dragged.current = false
    const move = (ev: PointerEvent) => {
      const w = startW + (ev.clientX - startX)
      if (Math.abs(ev.clientX - startX) > 3) { moved = true; dragged.current = true }
      if (w < SIDE_MIN - 28) { setWidth(SIDE_MIN) ; return }
      setWidth(Math.min(SIDE_MAX, Math.max(SIDE_MIN, w)))
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragging(false)
      // 끝까지 좁게 끌었으면 접는다. 안 움직였으면 그냥 누른 것이다 — 그건 onClick 이 받는다.
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
        {/* **신원은 앱에 한 곳뿐이어야 한다.** 셸이 들어오기 전에는 자료 목록 머리줄과
            편집 화면 제목줄에 각각 있었고, 셸이 생기면서 **셋이 됐다.**
            여기로 모으고 두 곳에서 뺐다 — 로그아웃 버튼이 화면마다 다른 자리에 있으면
            「방금 그거 어디 있었지」가 된다. */}
        <UserBar />
      </header>

      <div className={'sh-body' + (shut ? ' shut' : '') + (dragging ? ' drag' : '')}
        style={shut ? undefined : { gridTemplateColumns: width + 'px 1fr' }}>
        <nav className="sh-side" aria-label="갈 곳">
          {items.map((it, i) => 'sep' in it ? (
            <div className="sh-grp" key={'s' + i}>{it.sep}</div>
          ) : (
            <button key={it.k} className={'sh-nav' + (view === it.k ? ' on' : '')}
              onClick={() => onView(it.k)} title={it.t}
              aria-current={view === it.k ? 'page' : undefined}>
              <span className="ic"><Icon d={IC[it.ic]} /></span>
              <span className="lbl">{it.t}</span>
              {it.badge ? <span className="bd" title={`대기 ${it.badge}건`}>{it.badge}</span> : null}
            </button>
          ))}
        </nav>
        <main className="sh-main">{children}</main>

        {/* **경계선 위 손잡이**(사용자 결정 ㄴ+ㄹ).
            세로 자리를 하나도 안 쓰고, **움직이는 그 경계에 붙어** 있어
            「이 선이 왼쪽으로 간다」가 모양으로 읽힌다. 접히면 손잡이가 따라가므로
            편 상태와 접힌 상태가 **같은 물건**이다.
            누르면 접히고 끌면 넓어진다 — 한 자리에 한 물건. */}
        <button className="sh-edge" style={{ left: (shut ? 60 : width) - 11 + 'px' }}
          onPointerDown={onDragStart}
          onClick={() => {
            // 끌고 난 직후의 click 은 버린다 — 안 그러면 넓히자마자 접힌다.
            if (dragged.current) { dragged.current = false; return }
            fold(!shut)
          }}
          onDoubleClick={() => { setWidth(SIDE_DEFAULT); rememberShellWidth(SIDE_DEFAULT) }}
          aria-label={shut ? '메뉴 펴기' : '메뉴 접기'}
          title={shut ? '펴기' : '접기 · 끌어서 폭 조절'}>
          {shut ? '›' : '‹'}
        </button>
      </div>
    </div>
  )
}
