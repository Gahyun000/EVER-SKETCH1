import { useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import ChangePasswordDialog from './ChangePasswordDialog'

/**
 * 계정 줄 — **사이드바 맨 아래**에 있다.
 *
 * ## 어디에 있었나
 *
 * 처음에는 `position: fixed; top:0; right:0` 전역 오버레이였다. 툴바가 없는 화면에서는
 * 멀쩡했지만 편집 화면에서는 툴바 버튼과 **서로 모른 채 자리를 다퉜다.** 그때는 편집
 * 화면만 흐름 안으로 빼서 넘어갔는데, 라이브러리 화면은 오버레이인 채로 남았다 —
 * 버튼이 세 개일 때는 우연히 안 닿았을 뿐이다. 2026-09-04 P3 에서 「팀 관리」가 하나
 * 늘자 막대가 넓어져 「＋ 새 이북」 위에 그대로 포개졌다. **같은 사고가 두 번 났다.**
 * 그래서 오버레이를 없애고 화면마다 제 머리줄 안에 놓았다.
 *
 * 2026-09-10 셸이 생기면서 그 규칙이 반대로 뒤집혔다. 셸 머리줄에도 신원이 있으니
 * 자료 목록에서는 이름표가 위아래로 **두 번** 나왔다. 그래서 셸 머리줄 하나로 모았다.
 *
 * ## 왜 또 옮겼나 (2026-09-15)
 *
 * 셸 머리줄의 오른쪽 끝에 **이름 + 사용자 관리 + 팀 관리 + 비밀번호 변경 + 로그아웃**
 * 다섯이 늘어서 있었다. 그중 「사용자 관리·팀 관리」는 **왼쪽 메뉴 「관리」에 이미
 * 있는 것**이라 같은 길이 두 벌이었고, 나머지 셋은 **하루에 한 번 쓸까 말까 한 것**이
 * 늘 자리를 차지하고 있었다.
 *
 * 이제 사이드바 맨 아래에 이름 한 줄로 서 있고, 누르면 위로 열린다.
 * 「사용자 관리·팀 관리」는 여기서 뺐다 — **다만 그 링크에 붙어 있던 「승인 대기 N명」
 * 배지는 지우면 안 되는 신호다**(관리자가 승인을 놓치면 그게 곧 병목이다).
 * 그 배지는 사이드바의 「사용자 관리」 메뉴로 옮겨 갔다(`AppShell`).
 *
 * `userbar_placement.test.mjs` 가 이 배치를 지킨다.
 */
export default function UserBar() {
  const me = useAuth((s) => s.me)
  const logout = useAuth((s) => s.logout)
  const [open, setOpen] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  // **바깥을 누르면 닫는다.** 안 닫으면 메뉴를 열어 둔 채로 다른 걸 누르게 되고,
  // 사이드바 맨 아래라 화면 대부분을 가린 채 남는다.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initial = (me?.name || me?.login_id || '?').trim().charAt(0) || '?'

  return (
    <div className="sh-acct" ref={boxRef}>
      {/* 위로 열린다 — 맨 아래 줄이라 아래로 열면 화면 밖으로 나간다. */}
      {open && (
        <div className="sh-acct-pop" role="menu">
          {/* 등급은 **여기서** 말한다. 줄에는 이름만 둔다(사용자 결정 ①ㄱ) —
              등급은 하루에 한 번 확인할 값이지 늘 읽을 값이 아니다. */}
          <div className="sh-acct-who">
            <b>{me?.name}</b>
            <span className={`es-lv r-${me?.role || ''}`}>{me?.role_label}</span>
          </div>
          <button className="sh-acct-it" role="menuitem"
            onClick={() => { setOpen(false); setShowPw(true) }}>비밀번호 변경</button>
          <button className="sh-acct-it danger" role="menuitem"
            onClick={() => { setOpen(false); void logout() }}>로그아웃</button>
        </div>
      )}
      <button className={'sh-acct-btn' + (open ? ' on' : '')} onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu" aria-expanded={open} title={`${me?.name || ''} · ${me?.role_label || ''}`}>
        <span className={`es-av r-${me?.role || ''}`} aria-hidden="true">{initial}</span>
        <span className="nm">{me?.name}</span>
        <span className="cx" aria-hidden="true">⌃</span>
      </button>
      {showPw && <ChangePasswordDialog onClose={() => setShowPw(false)} />}
    </div>
  )
}
