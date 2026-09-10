import { useEffect, useState } from 'react'
import { apiListUsers, isAdmin } from './authApi'
import { useAuth } from './useAuth'
import ChangePasswordDialog from './ChangePasswordDialog'
import { useProjects } from '../persistence/projects'

/**
 * 로그인한 사람 표시 + 사용자 관리 + 로그아웃.
 *
 * 두 곳에서 쓴다. **둘 다 화면의 머리줄 안**이다.
 *   편집 화면    = 툴바(TitleBar) 안
 *   라이브러리   = 머리줄(lib-head) 안, 「＋ 새 이북」 옆
 *
 * 왜 오버레이가 아닌가: 예전에는 `position: fixed; top:0; right:0` 전역 오버레이였다.
 * 툴바가 없는 화면에서는 멀쩡했지만, 편집 화면에서는 툴바 버튼과 **같은 자리를 두고
 * 서로 모른 채 겹쳤다.** 그때 편집 화면만 `inline` 으로 빼서 넘어갔는데, 라이브러리
 * 화면은 오버레이인 채로 남아 있었다 — 버튼이 세 개일 때는 우연히 안 닿았을 뿐이다.
 * 2026-09-04 P3 에서 「팀 관리」가 하나 늘자 막대가 넓어져 「＋ 새 이북」 위에 그대로
 * 포개졌다. **같은 사고가 다른 화면에서 다시 났다.**
 * 그래서 오버레이를 아예 없앴다. 화면 흐름 안에 있으면 버튼이 또 늘어도
 * 머리줄 안에서 밀릴 뿐 남의 버튼 위에 올라가지 않는다.
 * (`userbar_placement.test.mjs` 가 이 배치를 지킨다.)
 *
 * 아바타도 여기로 합쳤다. 툴바에 글자가 '가' 로 박힌 초록 원이 따로 있었는데,
 * 로그인한 사람과 아무 상관 없는 값이었다(ebook_html 에서 딸려온 자리표시자).
 * 한 사람인데 신원 표시가 두 개였다.
 */
export default function UserBar() {
  /** 관리 화면으로 옮긴다 — 덮개를 띄우던 자리다. */
  const setView = useProjects((s2) => s2.setView)
  const go = (v: 'users' | 'admin') => {
    setView(v)
    try {
      const to = '/' + v
      if (window.location.pathname !== to) window.history.pushState({ v }, '', to)
    } catch { /* 주소를 못 써도 화면은 바뀐다 */ }
  }
  const me = useAuth((s) => s.me)
  const logout = useAuth((s) => s.logout)
  const [showPw, setShowPw] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const admin = isAdmin(me)
  const view = useProjects((s2) => s2.view)

  // 승인 대기 인원 배지 — 관리자가 승인을 놓치면 그게 곧 병목이 된다.
  useEffect(() => {
    if (!admin) { setPendingCount(0); return }
    let alive = true
    const tick = async () => {
      try {
        const list = await apiListUsers('pending')
        if (alive) setPendingCount(list.length)
      } catch { /* 조용히 무시 — 배지는 부가 정보다 */ }
    }
    void tick()
    const t = setInterval(tick, 60_000)
    return () => { alive = false; clearInterval(t) }
    // 예전에는 「사용자 관리 덮개를 닫을 때」 다시 셌다. 덮개가 화면이 되면서
    // 그 순간이 없어졌으므로, **지금 보고 있는 화면**이 바뀔 때 다시 센다.
  }, [admin, view])

  const initial = (me?.name || me?.login_id || '?').trim().charAt(0) || '?'

  return (
    <>
      <div className="es-userbar">
        <span className="es-chip">
          <span className={`es-av r-${me?.role || ''}`} aria-hidden="true">{initial}</span>
          <b>{me?.name}</b>
          {/* 라벨은 서버가 내려준 문구를 그대로 쓴다 — 등급 표기가 바뀌면 서버만 고치면 된다. */}
          <span className={`es-lv r-${me?.role || ''}`}>{me?.role_label}</span>
        </span>
        {admin && (
          <button className="es-linkbtn" onClick={() => go('users')}>
            사용자 관리
            {pendingCount > 0 && <span className="es-badge">{pendingCount}</span>}
          </button>
        )}
        {admin && (
          <button className="es-linkbtn" onClick={() => go('admin')}>팀 관리</button>
        )}
        <button className="es-linkbtn" onClick={() => setShowPw(true)}>비밀번호 변경</button>
        <button className="es-linkbtn" onClick={() => void logout()}>로그아웃</button>
      </div>
      {/* 사용자 관리·팀 관리는 **덮개에서 화면으로** 올라갔다(셸, 2026-09-10).
          이름표 안 작은 글씨라 아는 사람만 찾던 것이, 이제 왼쪽 메뉴 「관리」에 있다.
          여기 링크는 그대로 둔다 — 손에 익은 길을 뺏지 않는다. */}
      {showPw && <ChangePasswordDialog onClose={() => setShowPw(false)} />}
    </>
  )
}
