import { useState } from 'react'
import { ApiError, apiChangePassword } from './authApi'
import PasswordField from './PasswordField'
import { clearRememberedPassword } from './remember'

/**
 * 비밀번호 변경 입력부 — **한 벌만 있다.**
 *
 * 강제 변경 화면(최초 로그인)과 자발적 변경 창(사용자 표시줄)이 같은 것을 묻는다.
 * 각자 따로 만들어 두면 '8자 이상' 같은 규칙이 한쪽에서만 바뀌고, 그러면
 * 화면에서는 통과하는데 서버가 거부하는 상태가 된다 — 사용자에게는
 * 버튼이 먹지 않는 것으로 보인다. 그래서 묻는 부분은 여기 하나로 둔다.
 *
 * 성공하면 서버가 **모든 기기의 세션을 끊는다.** 그 뒤에 무엇을 보여줄지는
 * 부르는 쪽이 정한다(강제 화면은 성공 카드, 창은 닫으면서 재로그인).
 */
export default function ChangePasswordForm({
  onSuccess, submitLabel = '비밀번호 바꾸기',
}: {
  onSuccess: () => void
  submitLabel?: string
}) {
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const mismatch = confirm.length > 0 && newPw !== confirm
  const tooShort = newPw.length > 0 && newPw.length < 8
  const sameAsOld = newPw.length > 0 && newPw === oldPw
  const canSubmit = !!oldPw && newPw.length >= 8 && newPw === confirm && !sameAsOld && !busy

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      await apiChangePassword(oldPw, newPw)
      // 기기에 저장해 둔 비밀번호가 있으면 이제 낡은 값이다.
      // 두면 다음 로그인 화면이 틀린 값을 자동으로 채우고, 사용자는 계정이
      // 잠긴 줄 안다 — 지우면 한 번만 새로 치면 되고 그때 다시 저장된다.
      clearRememberedPassword()
      onSuccess()
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : '변경에 실패했어요.')
      setBusy(false)
    }
  }

  return (
    <>
      {err && <div className="es-msg err">{err}</div>}
      <form onSubmit={submit}>
        <PasswordField id="es-old" label="현재 비밀번호" value={oldPw} onChange={setOldPw}
          autoComplete="current-password" autoFocus />
        <PasswordField id="es-new" label="새 비밀번호" value={newPw} onChange={setNewPw}
          autoComplete="new-password" placeholder="8자 이상"
          hint={<>
            {tooShort && <div className="es-hint" style={{ color: '#b4232a' }}>8자 이상이어야 합니다.</div>}
            {sameAsOld && <div className="es-hint" style={{ color: '#b4232a' }}>현재 비밀번호와 다르게 정해 주세요.</div>}
          </>} />
        <PasswordField id="es-confirm" label="새 비밀번호 확인" value={confirm} onChange={setConfirm}
          autoComplete="new-password"
          hint={mismatch ? <div className="es-hint" style={{ color: '#b4232a' }}>입력한 두 비밀번호가 다릅니다.</div> : undefined} />
        <button className="es-btn" type="submit" disabled={!canSubmit}>
          {busy ? '변경 중…' : submitLabel}
        </button>
      </form>
    </>
  )
}
