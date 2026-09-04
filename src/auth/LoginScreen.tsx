import { useState } from 'react'
import { clearRemembered, loadRemembered, saveRemembered } from './remember'
import { ApiError, apiCheckLoginId, apiSignup, ROLE_DESC, ROLE_LABEL, ROLE_ORDER, type Role } from './authApi'
import { idCheckState, normalizeLoginId, passwordState, signupBlockers } from './signupCheck'
import PasswordField from './PasswordField'
import { useAuth } from './useAuth'

type Mode = 'login' | 'signup'

export default function LoginScreen() {
  const login = useAuth((s) => s.login)
  const sessionLost = useAuth((s) => s.sessionLost)
  const clearSessionLost = useAuth((s) => s.clearSessionLost)

  const [mode, setMode] = useState<Mode>('login')
  // 저장해 둔 것이 있으면 채워 두고, 커서는 빈 칸으로 보낸다.
  const [remembered] = useState(() => loadRemembered())
  const [loginId, setLoginId] = useState(remembered.loginId)
  const [remember, setRemember] = useState(!!remembered.loginId)
  const [password, setPassword] = useState(remembered.password)
  const [confirmPw, setConfirmPw] = useState('')
  const [name, setName] = useState('')
  const [dept, setDept] = useState('')
  // 「확인했다」는 깃발이 아니라 **어떤 값으로 확인했는지**를 들고 있는다.
  // 깃발이면 아이디를 고쳤을 때 지우는 걸 빠뜨릴 수 있지만, 비교는 빠뜨릴 자리가 없다.
  const [checkedFor, setCheckedFor] = useState<string | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkErr, setCheckErr] = useState('')
  // 기본은 작성자 — 임원·부서 담당자가 대다수다.
  const [role, setRole] = useState<Role>('writer')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')

  const switchMode = (m: Mode) => {
    setMode(m); setErr(''); setDone(''); setPassword('')
    // 가입 화면을 떠나면 확인 결과도 버린다. 남겨 두면 다음에 들어왔을 때
    // 아무것도 안 눌렀는데 「사용할 수 있습니다」가 떠 있다.
    setConfirmPw(''); setCheckedFor(null); setAvailable(null); setCheckErr('')
    clearSessionLost()
  }

  // 아이디 형식·중복·비밀번호 판정은 전부 순수 함수가 한다(signupCheck.ts).
  const idState = idCheckState(loginId, checkedFor, available)
  const pwState = passwordState(password, confirmPw)
  const blockers = signupBlockers({
    typed: loginId, checkedFor, available, password, confirm: confirmPw, name,
  })

  const runCheck = async () => {
    const v = normalizeLoginId(loginId)
    setChecking(true); setCheckErr('')
    try {
      const ok = await apiCheckLoginId(v)
      setCheckedFor(v); setAvailable(ok)
    } catch (e) {
      // 확인에 실패했으면 **확인하지 않은 상태로 되돌린다.** 실패를
      // 「사용 가능」으로 두면 눌러 놓고 가입에서 막힌다.
      setCheckedFor(null); setAvailable(null)
      setCheckErr(e instanceof ApiError ? e.message : '확인하지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setChecking(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(''); setDone(''); setBusy(true)
    try {
      if (mode === 'login') {
        await login(loginId, password)
        // 로그인에 성공한 뒤에만 저장한다 — 틀린 값을 기억하면 오히려 방해가 된다.
        if (remember) saveRemembered(loginId, password)
        else clearRemembered()
      } else {
        const r = await apiSignup({ login_id: loginId, password, name, dept, requested_role: role })
        // 순서 주의: switchMode 가 done 을 비우므로 **먼저** 갈아탄 뒤에 메시지를 넣는다.
        switchMode('login')
        setDone(r.message)
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
            {mode === 'signup' ? (
              <div className="es-inline">
                <input id="es-login-id" value={loginId} autoComplete="username" autoFocus
                  onChange={(e) => { setLoginId(e.target.value); setCheckErr('') }}
                  placeholder="사내 아이디" />
                <button type="button" className="es-mini"
                  disabled={checking || idState.kind === 'idle' || idState.kind === 'format'}
                  onClick={() => void runCheck()}>
                  {checking ? '확인 중…' : '중복 확인'}
                </button>
              </div>
            ) : (
              <input id="es-login-id" value={loginId} autoComplete="username"
                autoFocus={!remembered.loginId}
                onChange={(e) => setLoginId(e.target.value)} placeholder="사내 아이디" />
            )}
            {mode === 'signup' && (
              /* 형식은 서버에 묻지 않고 화면이 판정한다 — 대문자나 한글을 치는 순간 바로 말해 준다.
                 서버 호출은 형식이 맞은 다음에만 나간다. */
              <div className={'es-hint' + (
                idState.kind === 'available' ? ' es-ok'
                : idState.kind === 'taken' || idState.kind === 'format' ? ' es-bad'
                : idState.invalidated ? ' es-warn' : '')}>
                {checkErr || idState.message}
              </div>
            )}
          </div>

          <PasswordField
            id="es-pw"
            label="비밀번호"
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            autoFocus={!!remembered.loginId && !remembered.password && mode === 'login'}
            placeholder={mode === 'signup' ? '8자 이상' : ''}
            hint={mode === 'signup' && (pwState.pw === 'short' || pwState.pw === 'long')
              ? <div className="es-hint es-bad">{pwState.pwMessage}</div> : undefined}
          />

          {/* 확인칸이 없으면 오타가 난 채로 가입이 되고, 로그인할 때 비로소 막힌다.
              이 제품에는 비밀번호 찾기가 없어서 그때부터는 관리자가 초기화해 줘야 들어온다.
              「비밀번호 변경」 화면은 이미 확인칸을 받고 있었다 — 더 위험한 쪽이 안 받고 있었다. */}
          {mode === 'signup' && (
            <PasswordField
              id="es-pw2"
              label="비밀번호 확인"
              value={confirmPw}
              onChange={setConfirmPw}
              autoComplete="new-password"
              placeholder="한 번 더"
              hint={pwState.confirm === 'idle' ? undefined : (
                <div className={'es-hint ' + (pwState.confirm === 'match' ? 'es-ok' : 'es-bad')}>
                  {pwState.confirmMessage}
                </div>
              )}
            />
          )}

          {mode === 'login' && (
            <>
              <label className="es-check">
                <input type="checkbox" checked={remember}
                  onChange={(e) => {
                    setRemember(e.target.checked)
                    if (!e.target.checked) clearRemembered()
                  }} />
                <span>아이디, 비밀번호 기억하기</span>
              </label>
              {/* 경고는 **켰을 때만** 띄운다. 그때가 사실이 되는 순간이고,
                  꺼진 채로 늘 떠 있으면 읽히지 않는 글자가 하나 느는 것뿐이다.
                  줄을 따로 쓰는 이유: 체크박스 옆에 붙이면 라벨과 자리를 다투다가
                  '비밀번호도 저 / 장' 처럼 낱말 가운데가 끊긴다. */}
              {remember && (
                <p className="es-check-note">
                  이 기기에 그대로 저장됩니다. 공용 PC 에서는 켜지 마세요.
                </p>
              )}
            </>
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

          {/* 가입에서는 무엇이 모자란지까지 본다. 버튼만 회색이면 사용자는 위아래를 훑는다. */}
          <button className="es-btn" type="submit"
            disabled={busy || (mode === 'signup' ? blockers.length > 0 : (!loginId || !password))}>
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
