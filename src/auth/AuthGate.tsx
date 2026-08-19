import { useEffect, useState } from 'react'
import ChangePasswordScreen from './ChangePasswordScreen'
import LoginScreen from './LoginScreen'
import PendingScreen from './PendingScreen'
import UsersAdmin from './UsersAdmin'
import { isAdmin } from './authApi'
import UserBar from './UserBar'
import { useAuth } from './useAuth'
import { useProjects } from '../persistence/projects'
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

  // 편집 화면에는 툴바가 있다 — 사용자 표시는 그 안(TitleBar)으로 들어간다.
  // 여기서 또 띄우면 툴바 버튼 위에 포개진다.
  const view = useProjects((s) => s.view)

  useEffect(() => { void boot() }, [boot])

  if (phase === 'booting') return null
  if (phase === 'anon') return <LoginScreen />
  if (phase === 'must_change_pw') return <ChangePasswordScreen />
  if (phase === 'pending') return <PendingScreen />

  return (
    <>
      {children}
      {view !== 'editor' && <UserBar />}
    </>
  )
}
