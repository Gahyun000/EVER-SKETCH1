import { useState } from 'react'
import { clearRememberedId, loadRememberedId, saveRememberedId } from './rememberId'
import { ApiError, apiSignup, ROLE_DESC, ROLE_LABEL, ROLE_ORDER, type Role } from './authApi'
import PasswordField from './PasswordField'
import { useAuth } from './useAuth'

type Mode = 'login' | 'signup'

export default function LoginScreen() {
  const login = useAuth((s) => s.login)
  const sessionLost = useAuth((s) => s.sessionLost)
  const clearSessionLost = useAuth((s) => s.clearSessionLost)

  const [mode, setMode] = useState<Mode>('login')
  // 저장해 둔 아이디가 있으면 채워 두고, 커서는 비밀번호로 보낸다.
  const [remembered] = useState(() => loadRememberedId())
  const [loginId, setLoginId] = useState(remembered)
  const [remember, setRemember] = useState(!!remembered)
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [dept, setDept] = useState('')
  // 기본은 작성자 — 임원·부서 담당자가 대다수다.
  const [role, setRole] = useState<Role>('writer')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')

  const switchMode = (m: Mode) => {
    setMode(m); setErr(''); setDone(''); setPassword('')
    clearSessionLost()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(''); setDone(''); setBusy(true)
    try {
      if (mode === 'login') {
        await login(loginId, password)
        // 로그인에 성공한 뒤에만 저장한다 — 오타난 아이디를 기억하면 오히려 방해가 된다.
        if (remember) saveRememberedId(loginId)
        else clearRememberedId()
      } else {
        const r = await apiSignup({ login_id: loginId, password, name, dept, requested_role: role })
        setDone(r.message)
        setMode('login')
        setPassword('')
      }
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : '연결에 실패했어요. 서버가 켜져 있는지 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="es-auth">
      <div className="es-card">
        <div className="es-brand"><b>EVER-SKETCH</b><span>임원회의 자료 협업</span></div>
        <p className="es-lede">
          {mode === 'login'
            ? '사내 계정으로 로그인해 주세요.'
            : '가입 신청 후 관리자 승인을 받으면 이용할 수 있습니다.'}
        </p>

        {sessionLost && !err && (
          <div className="es-msg info">
            로그인이 만료되어 다시 로그인이 필요합니다.<br />
            관리자가 권한을 변경했거나 오랫동안 사용하지 않은 경우에도 이렇게 됩니다.
          </div>
        )}
        {done && <div className="es-msg ok">{done}</div>}
        {err && <div className="es-msg err">{err}</div>}

        <form onSubmit={submit}>
          <div className="es-field">
            <label htmlFor="es-login-id">아이디</label>
            <input id="es-login-id" value={loginId} autoComplete="username"
              autoFocus={!remembered}
              onChange={(e) => setLoginId(e.target.value)} placeholder="사내 아이디" />
          </div>

          <PasswordField
            id="es-pw"
            label="비밀번호"
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            autoFocus={!!remembered && mode === 'login'}
            placeholder={mode === 'signup' ? '8자 이상' : ''}
          />

          {mode === 'login' && (
            <label className="es-check">
              <input type="checkbox" checked={remember}
                onChange={(e) => {
                  setRemember(e.target.checked)
                  if (!e.target.checked) clearRememberedId()
                }} />
              <span>아이디 기억하기</span>
              <em>비밀번호는 저장되지 않습니다</em>
            </label>
          )}

          {mode === 'signup' && (
            <>
              <div className="es-field">
                <label htmlFor="es-name">이름</label>
                <input id="es-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
              </div>
              <div className="es-field">
                <label htmlFor="es-dept">부서 <span style={{ fontWeight: 400, color: '#98a1b2' }}>(선택)</span></label>
                <input id="es-dept" value={dept} onChange={(e) => setDept(e.target.value)} placeholder="사업본부" />
              </div>
              <div className="es-field">
                <label htmlFor="es-role">희망 권한</label>
                <select id="es-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {ROLE_ORDER.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
                <div className="es-hint">{ROLE_DESC[role]}</div>
                <div className="es-hint">
                  신청한 권한은 <b>관리자 승인 시 확정</b>됩니다. 승인 전에는 자료에 접근할 수 없습니다.
                </div>
              </div>
            </>
          )}

          <button className="es-btn" type="submit" disabled={busy || !loginId || !password}>
            {busy ? '처리 중…' : mode === 'login' ? '로그인' : '가입 신청'}
          </button>
        </form>

        <div className="es-switch">
          {mode === 'login' ? (
            <>계정이 없으신가요? <button type="button" onClick={() => switchMode('signup')}>가입 신청</button></>
          ) : (
            <>이미 계정이 있으신가요? <button type="button" onClick={() => switchMode('login')}>로그인</button></>
          )}
        </div>
      </div>
    </div>
  )
}
