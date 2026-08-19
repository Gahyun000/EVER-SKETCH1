import { useState } from 'react'
import { ApiError, apiChangePassword } from './authApi'
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
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  const mismatch = confirm.length > 0 && newPw !== confirm
  const tooShort = newPw.length > 0 && newPw.length < 8
  const sameAsOld = newPw.length > 0 && newPw === oldPw
  const canSubmit = !!oldPw && newPw.length >= 8 && newPw === confirm && !sameAsOld && !busy

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      await apiChangePassword(oldPw, newPw)
      setDone(true)
      // 서버가 세션을 전부 끊었다. 새 비밀번호로 다시 로그인해야 한다.
      setTimeout(() => { void logout() }, 1600)
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : '변경에 실패했어요.')
      setBusy(false)
    }
  }

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

        {err && <div className="es-msg err">{err}</div>}

        <form onSubmit={submit}>
          <div className="es-field">
            <label htmlFor="es-old">현재 비밀번호</label>
            <input id="es-old" type="password" value={oldPw} autoComplete="current-password" autoFocus
              onChange={(e) => setOldPw(e.target.value)} />
          </div>
          <div className="es-field">
            <label htmlFor="es-new">새 비밀번호</label>
            <input id="es-new" type="password" value={newPw} autoComplete="new-password"
              onChange={(e) => setNewPw(e.target.value)} placeholder="8자 이상" />
            {tooShort && <div className="es-hint" style={{ color: '#b4232a' }}>8자 이상이어야 합니다.</div>}
            {sameAsOld && <div className="es-hint" style={{ color: '#b4232a' }}>현재 비밀번호와 다르게 정해 주세요.</div>}
          </div>
          <div className="es-field">
            <label htmlFor="es-confirm">새 비밀번호 확인</label>
            <input id="es-confirm" type="password" value={confirm} autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)} />
            {mismatch && <div className="es-hint" style={{ color: '#b4232a' }}>입력한 두 비밀번호가 다릅니다.</div>}
          </div>
          <button className="es-btn" type="submit" disabled={!canSubmit}>
            {busy ? '변경 중…' : '비밀번호 바꾸기'}
          </button>
        </form>

        <div className="es-switch">
          <button type="button" onClick={() => void logout()}>다른 계정으로 로그인</button>
        </div>
      </div>
    </div>
  )
}
