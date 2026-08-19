import { useState } from 'react'
import { LEVEL_LABEL } from './authApi'
import { useAuth } from './useAuth'

/** 승인 대기 화면 — 로그인은 됐지만 아직 어떤 자료에도 접근할 수 없는 상태. */
export default function PendingScreen() {
  const me = useAuth((s) => s.me)
  const logout = useAuth((s) => s.logout)
  const refresh = useAuth((s) => s.refresh)
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(false)

  if (!me) return null
  const disabled = me.status === 'disabled'

  const check = async () => {
    setBusy(true)
    try {
      await refresh()
      setChecked(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="es-auth">
      <div className="es-card es-center">
        <div className="es-wait-ico">{disabled ? '!' : '⏳'}</div>
        <div className="es-brand" style={{ justifyContent: 'center' }}>
          <b>{disabled ? '비활성화된 계정' : '승인 대기 중'}</b>
        </div>
        <p className="es-lede" style={{ marginBottom: 18 }}>
          {disabled ? (
            <>이 계정은 사용이 중지되었습니다.<br />관리자에게 문의해 주세요.</>
          ) : (
            <>가입 신청이 접수되었습니다.<br />관리자가 승인하면 바로 이용할 수 있습니다.</>
          )}
        </p>

        {checked && !disabled && (
          <div className="es-msg info">아직 승인되지 않았습니다. 잠시 후 다시 확인해 주세요.</div>
        )}

        <dl className="es-kv" style={{ textAlign: 'left' }}>
          <div><dt>아이디</dt><dd>{me.login_id}</dd></div>
          <div><dt>이름</dt><dd>{me.name}{me.dept ? ` · ${me.dept}` : ''}</dd></div>
          <div><dt>신청 권한</dt><dd>{LEVEL_LABEL[me.requested_level]}</dd></div>
        </dl>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {!disabled && (
            <button className="es-btn" onClick={() => void check()} disabled={busy}>
              {busy ? '확인 중…' : '승인됐는지 확인'}
            </button>
          )}
          <button className="es-btn ghost" onClick={() => void logout()}>로그아웃</button>
        </div>
      </div>
    </div>
  )
}
