import { useState } from 'react'
import ChangePasswordForm from './ChangePasswordForm'
import { useAuth } from './useAuth'

/**
 * 스스로 비밀번호를 바꾸는 창.
 *
 * 이 창이 생기기 전에는 비밀번호를 바꿀 길이 **최초 로그인 강제 화면 하나뿐**이었다.
 * 한 번 바꾸고 나면 그 화면은 다시 뜨지 않으므로, 그 뒤로는 앱 안에서 바꿀 방법이
 * 없었다 — 콘솔에서 `admin_cli reset-pw` 를 돌리는 것 말고는.
 *
 * 겉껍데기는 사용자 관리 창(UsersAdmin)과 같은 방식을 쓴다. 인증 화면들은
 * `es-auth` + `es-card` 로 한 벌을 이루고 있어서, 여기만 다른 껍데기를 쓰면 튄다.
 */
export default function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const logout = useAuth((s) => s.logout)
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <div className="es-auth">
        <div className="es-card es-center">
          <div className="es-wait-ico" style={{ background: '#E9F5EF', color: '#3E9E6E' }}>✓</div>
          <div className="es-brand" style={{ justifyContent: 'center' }}><b>비밀번호를 바꿨습니다</b></div>
          <p className="es-lede">보안을 위해 모든 기기에서 로그아웃됩니다.<br />새 비밀번호로 다시 로그인해 주세요.</p>
          <button className="es-btn" onClick={() => void logout()}>로그인 화면으로</button>
        </div>
      </div>
    )
  }

  return (
    <div className="es-auth" onClick={onClose}>
      <div className="es-card" onClick={(e) => e.stopPropagation()}>
        <div className="es-brand"><b>비밀번호 변경</b></div>
        <p className="es-lede">
          바꾸면 <b>이 계정으로 열어 둔 모든 기기에서 로그아웃</b>됩니다.
          여기서 정한 값이 앞으로 쓰는 비밀번호입니다.
        </p>
        <ChangePasswordForm onSuccess={() => setDone(true)} />
        <div className="es-switch">
          <button type="button" onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  )
}
