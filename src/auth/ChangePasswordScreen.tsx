import { useState } from 'react'
import ChangePasswordForm from './ChangePasswordForm'
import { useAuth } from './useAuth'

/**
 * 비밀번호 변경 강제 화면.
 *
 * 시드 관리자 계정은 초기 비밀번호가 콘솔에 찍힌 채로 만들어진다.
 * 그 상태로 돌아다니면 콘솔 로그를 본 누구나 관리자가 될 수 있으므로,
 * 승인 상태 확인보다도 **먼저** 이 화면을 띄운다.
 */
export default function ChangePasswordScreen() {
  const me = useAuth((s) => s.me)
  const logout = useAuth((s) => s.logout)
  const [done, setDone] = useState(false)


  if (done) {
    return (
      <div className="es-auth">
        <div className="es-card es-center">
          <div className="es-wait-ico" style={{ background: '#E9F5EF', color: '#3E9E6E' }}>✓</div>
          <div className="es-brand" style={{ justifyContent: 'center' }}><b>비밀번호를 바꿨습니다</b></div>
          <p className="es-lede">보안을 위해 모든 기기에서 로그아웃됩니다.<br />새 비밀번호로 다시 로그인해 주세요.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="es-auth">
      <div className="es-card">
        <div className="es-brand"><b>비밀번호 변경</b><span>최초 1회 필수</span></div>
        <p className="es-lede">
          {me?.login_id === 'admin'
            ? '관리자 계정의 초기 비밀번호는 서버 콘솔에 출력됩니다. 계속 쓰면 콘솔을 본 사람이 관리자 권한을 갖게 되므로 지금 바꿔 주세요.'
            : '초기 비밀번호를 사용 중입니다. 계속하려면 새 비밀번호로 바꿔 주세요.'}
        </p>

        <ChangePasswordForm onSuccess={() => {
          setDone(true)
          // 서버가 세션을 전부 끊었다. 새 비밀번호로 다시 로그인해야 한다.
          setTimeout(() => { void logout() }, 1600)
        }} />

        <div className="es-switch">
          <button type="button" onClick={() => void logout()}>다른 계정으로 로그인</button>
        </div>
      </div>
    </div>
  )
}
