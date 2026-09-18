import { useState } from 'react'
import { ApiError, apiChangePassword, apiSetOwnPassword, isAdmin } from './authApi'
import PasswordField from './PasswordField'
import { clearRememberedPassword } from './remember'
import { useAuth } from './useAuth'

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
  const me = useAuth((s) => s.me)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  /**
   * **옛 비밀번호를 모르는 채로 바꾸는 길**(2026-09-18 · 사용자 결정 · 관리자만).
   *
   * 관리자가 **한 명**인 조직에서 그 사람이 비밀번호를 잊으면 화면에 길이 없었다 —
   * 본인 초기화는 막혀 있고, 여기는 옛 값을 묻는다. 남는 것은 서버 명령뿐이었다.
   *
   * **「초기화」가 아니라 「직접 정하기」로 연 이유.** 초기화는 세션을 끊어서
   * 내 창이 그 자리에서 로그인 화면으로 튕기고, **한 번만 보이는 임시 비밀번호가
   * 그 화면과 함께 사라진다**(실측). 관리자가 한 명이면 그대로 갇힌다.
   * 내가 정한 값이면 놓칠 글자가 없다.
   *
   * **처음 값은 false 다.** 평소에는 옛 값을 묻는 것이 맞고, 이 길은 사람이
   * 「기억나지 않습니다」를 눌러 **일부러 들어와야** 한다.
   */
  const [noOld, setNoOld] = useState(false)
  const canNoOld = isAdmin(me)

  const mismatch = confirm.length > 0 && newPw !== confirm
  const tooShort = newPw.length > 0 && newPw.length < 8
  const sameAsOld = !noOld && newPw.length > 0 && newPw === oldPw
  const canSubmit = (noOld || !!oldPw) && newPw.length >= 8 && newPw === confirm
    && !sameAsOld && !busy

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      // **관리자가 아니면 이 갈래로 들어올 수 없다.** 화면에서 막고, 서버가 또 막는다 —
      // 둘 중 하나만 있으면 한쪽이 바뀌는 날 조용히 뚫린다.
      if (noOld && canNoOld) await apiSetOwnPassword(newPw)
      else await apiChangePassword(oldPw, newPw)
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
        {noOld ? (
          // **무엇을 내주는지 적어 둔다.** 옛 값 확인은 자리를 비운 사이 누가 계정을
          // 가져가는 것을 막던 장치였다. 빼는 이상 그 말을 안 하고 넘어갈 수 없다.
          <div className="es-msg warn">
            <b>지금 비밀번호를 묻지 않고 바꿉니다.</b> 관리자만, <b>지금 로그인된 이 창에서만</b> 됩니다.
            자리를 비운 사이 누가 이 화면을 쓰면 계정을 가져갈 수 있으니 <b>자리를 뜰 때는 화면을 잠그세요.</b>
            <button type="button" className="es-link" onClick={() => { setNoOld(false); setErr('') }}>
              지금 비밀번호를 압니다
            </button>
          </div>
        ) : (
          <PasswordField id="es-old" label="현재 비밀번호" value={oldPw} onChange={setOldPw}
            autoComplete="current-password" autoFocus />
        )}
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
        {canNoOld && !noOld && (
          // **관리자에게만 보인다.** 작성자·열람자는 잊으면 관리자가 풀어 주면 되지만,
          // 관리자는 풀어 줄 사람이 없을 수 있다 — 그 한 사람을 위한 길이다.
          <button type="button" className="es-link es-forgot"
            onClick={() => { setNoOld(true); setOldPw(''); setErr('') }}>
            지금 비밀번호가 기억나지 않습니다
          </button>
        )}
      </form>
    </>
  )
}
