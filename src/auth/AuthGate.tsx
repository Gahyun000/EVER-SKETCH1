import { useEffect, useState } from 'react'
import ChangePasswordScreen from './ChangePasswordScreen'
import LoginScreen from './LoginScreen'
import PendingScreen from './PendingScreen'
import UsersAdmin from './UsersAdmin'
import { apiListUsers, isAdmin } from './authApi'
import { useAuth } from './useAuth'
import './auth.css'

/**
 * 앱 최상단 관문.
 *
 *   booting        → 잠깐 빈 화면(세션 확인 중)
 *   anon           → 로그인 / 가입
 *   must_change_pw → 비밀번호 변경 강제
 *   pending        → 승인 대기
 *   ready          → 실제 앱
 *
 * 이 관문은 UX 일 뿐이다. 실제 차단은 서버가 한다(permissions.decide).
 * 관문을 우회해도 API 가 403 을 돌려준다.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const phase = useAuth((s) => s.phase)
  const me = useAuth((s) => s.me)
  const boot = useAuth((s) => s.boot)
  const logout = useAuth((s) => s.logout)

  const [showAdmin, setShowAdmin] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => { void boot() }, [boot])

  // 승인 대기 인원 배지 — 관리자가 승인을 놓치면 그게 곧 병목이 된다.
  useEffect(() => {
    if (phase !== 'ready' || !isAdmin(me)) { setPendingCount(0); return }
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
  }, [phase, me?.role, showAdmin])

  if (phase === 'booting') return null
  if (phase === 'anon') return <LoginScreen />
  if (phase === 'must_change_pw') return <ChangePasswordScreen />
  if (phase === 'pending') return <PendingScreen />

  const role = me?.role || ''
  return (
    <>
      {children}
      <div className="es-userbar">
        <span className="es-chip">
          <b>{me?.name}</b>
          {/* 라벨은 서버가 내려준 문구를 그대로 쓴다 — 등급 표기가 바뀌면 서버만 고치면 된다. */}
          <span className={`es-lv r-${role}`}>{me?.role_label}</span>
        </span>
        {isAdmin(me) && (
          <button className="es-linkbtn" onClick={() => setShowAdmin(true)}>
            사용자 관리
            {pendingCount > 0 && <span className="es-badge">{pendingCount}</span>}
          </button>
        )}
        <button className="es-linkbtn" onClick={() => void logout()}>로그아웃</button>
      </div>
      {showAdmin && <UsersAdmin onClose={() => setShowAdmin(false)} />}
    </>
  )
}
