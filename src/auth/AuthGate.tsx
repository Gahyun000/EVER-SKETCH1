import { useEffect } from 'react'
import ChangePasswordScreen from './ChangePasswordScreen'
import LoginScreen from './LoginScreen'
import PendingScreen from './PendingScreen'
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
  const boot = useAuth((s) => s.boot)

  useEffect(() => { void boot() }, [boot])

  if (phase === 'booting') return null
  if (phase === 'anon') return <LoginScreen />
  if (phase === 'must_change_pw') return <ChangePasswordScreen />
  if (phase === 'pending') return <PendingScreen />

  // 신원 표시는 **화면이 자기 머리줄 안에 직접 놓는다**(라이브러리는 lib-head,
  // 편집 화면은 TitleBar). 여기서 띄우면 화면 밖에 떠 있는 오버레이가 되고,
  // 화면은 그게 있는 줄 몰라서 자기 오른쪽 위 버튼을 그 자리에 그린다 — 겹친다.
  return <>{children}</>
}
