import { useEffect, useState } from 'react'
import { apiListUsers, isAdmin } from './authApi'
import { useAuth } from './useAuth'
import UsersAdmin from './UsersAdmin'
import ChangePasswordDialog from './ChangePasswordDialog'

/**
 * 로그인한 사람 표시 + 사용자 관리 + 로그아웃.
 *
 * 두 곳에서 쓴다.
 *   inline  = 편집 화면 툴바(TitleBar) 안
 *   기본     = 라이브러리·회차 화면 오른쪽 위 (툴바가 없는 화면)
 *
 * 왜 나눴는가: 예전에는 이걸 `position: fixed; top:0; right:0` 전역 오버레이로
 * 띄웠다. 툴바가 없는 화면에서는 멀쩡했지만, 편집 화면에서는 툴바의 버튼들과
 * **같은 자리를 두고 서로 모른 채 겹쳤다**('새 이북'·'슬라이드쇼' 위에 이름표가 포개졌다).
 * 겹침은 z-index 로 덮어 가릴 수 있을 뿐 사라지지 않는다 — 자리를 나눠야 한다.
 *
 * 아바타도 여기로 합쳤다. 툴바에 글자가 '가' 로 박힌 초록 원이 따로 있었는데,
 * 로그인한 사람과 아무 상관 없는 값이었다(ebook_html 에서 딸려온 자리표시자).
 * 한 사람인데 신원 표시가 두 개였다.
 */
export default function UserBar({ inline = false }: { inline?: boolean }) {
  const me = useAuth((s) => s.me)
  const logout = useAuth((s) => s.logout)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const admin = isAdmin(me)

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
  }, [admin, showAdmin])

  const initial = (me?.name || me?.login_id || '?').trim().charAt(0) || '?'

  return (
    <>
      <div className={'es-userbar' + (inline ? ' inline' : '')}>
        <span className="es-chip">
          <span className={`es-av r-${me?.role || ''}`} aria-hidden="true">{initial}</span>
          <b>{me?.name}</b>
          {/* 라벨은 서버가 내려준 문구를 그대로 쓴다 — 등급 표기가 바뀌면 서버만 고치면 된다. */}
          <span className={`es-lv r-${me?.role || ''}`}>{me?.role_label}</span>
        </span>
        {admin && (
          <button className="es-linkbtn" onClick={() => setShowAdmin(true)}>
            사용자 관리
            {pendingCount > 0 && <span className="es-badge">{pendingCount}</span>}
          </button>
        )}
        <button className="es-linkbtn" onClick={() => setShowPw(true)}>비밀번호 변경</button>
        <button className="es-linkbtn" onClick={() => void logout()}>로그아웃</button>
      </div>
      {showAdmin && <UsersAdmin onClose={() => setShowAdmin(false)} />}
      {showPw && <ChangePasswordDialog onClose={() => setShowPw(false)} />}
    </>
  )
}
