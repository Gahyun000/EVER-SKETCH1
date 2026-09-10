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
import { apiListApprovals } from '../approvals/approvalApi'
import { shellFolded, rememberShellFolded } from '../persistence/prefs'
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
  const initial = (me?.name || '?').slice(0, 1)

  return (
    <div className="sh">
      <header className="sh-head">
        <button className="sh-burger" onClick={() => fold(!shut)}
          aria-label={shut ? '메뉴 펴기' : '메뉴 접기'} title={shut ? '메뉴 펴기' : '메뉴 접기'}>☰</button>
        <div className="sh-brand"><span className="lg">ℓ</span><span className="nm">EVER-SKETCH</span></div>
        {/* **어디에 있는지 늘 보인다.** 편집에 들어가도 남는다 —
            지금까지는 편집에 들어가는 순간 어느 화면에서 왔는지가 사라졌다. */}
        <nav className="sh-crumb" aria-label="지금 자리">
          <span>{VIEW_LABEL[view === 'editor' ? 'library' : view]}</span>
          {crumb ? <><span className="sp">›</span><b>{crumb}</b></> : null}
        </nav>
        <div className="sh-sp" />
        <span className="sh-user">
          <span className="av">{initial}</span>
          <span className="nm">{me?.name || ''}</span>
          <span className="lv">{admin ? 'Lv1 관리자' : canSubmit ? 'Lv2 작성자' : 'Lv3 열람자'}</span>
        </span>
      </header>

      <div className={'sh-body' + (shut ? ' shut' : '')}>
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
      </div>
    </div>
  )
}
