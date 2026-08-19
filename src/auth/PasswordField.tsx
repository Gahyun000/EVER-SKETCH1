import { useId, useState } from 'react'

/**
 * 비밀번호 입력칸 — 보기/숨기기 토글 포함.
 *
 * 왜 필요한가
 *   가려진 칸에 오타가 나면 사용자는 **무엇을 잘못 쳤는지 볼 수가 없다.**
 *   서버는 보안상 "아이디 또는 비밀번호가 올바르지 않습니다" 라고만 답하므로
 *   (어느 쪽이 틀렸는지 알려주면 계정 존재 여부가 새어 나간다),
 *   눈으로 확인할 방법이 없으면 사용자는 같은 실수를 반복한다.
 *
 * 두 가지 안전장치
 *   1) **칸에서 포커스가 벗어나면 다시 가린다.** 사무실 화면은 남이 본다.
 *      타이머로 숨기면 "왜 갑자기 바뀌지" 가 되지만, 자리를 뜨거나 다른 칸으로
 *      넘어갈 때 가려지는 건 예상 가능한 동작이다.
 *   2) 보임 상태를 **어디에도 저장하지 않는다.** 다음에 열면 항상 가려져 있다.
 *      (아이디는 기억해도 비밀번호는 저장하지 않는다는 규칙과 같은 선상이다.)
 *
 * Caps Lock 경고도 여기서 한다 — 로그인 실패의 흔한 원인인데,
 * 가려진 칸에서는 대문자로 쳐지고 있다는 걸 알아챌 방법이 없다.
 */
export default function PasswordField({
  id, label, value, onChange, autoComplete, autoFocus, placeholder, hint,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  autoFocus?: boolean
  placeholder?: string
  hint?: React.ReactNode
}) {
  const [shown, setShown] = useState(false)
  const [caps, setCaps] = useState(false)
  const capsId = useId()

  return (
    <div className="es-field">
      <label htmlFor={id}>{label}</label>
      <div
        className="es-pwwrap"
        // 눈 버튼을 누르면 입력칸에서 포커스가 빠진다 — 그때 숨겨버리면 토글이 동작하지 않는다.
        // 그래서 '이 묶음 밖으로' 나갈 때만 숨긴다.
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setShown(false)
            setCaps(false)
          }
        }}
      >
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-describedby={caps ? capsId : undefined}
          onChange={(e) => onChange(e.target.value)}
          onKeyUp={(e) => setCaps(e.getModifierState('CapsLock'))}
          onKeyDown={(e) => setCaps(e.getModifierState('CapsLock'))}
        />
        <button
          type="button"              /* submit 이 아니어야 한다 — 아니면 눈을 누를 때 폼이 넘어간다 */
          className="es-pweye"
          aria-label={shown ? '비밀번호 숨기기' : '비밀번호 보기'}
          aria-pressed={shown}
          title={shown ? '숨기기 (다른 칸으로 옮기면 자동으로 가려집니다)' : '보기'}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.4 18.4 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12A3 3 0 1 1 9.88 9.88" />
              <path d="M1 1l22 22" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {caps && <div id={capsId} className="es-hint es-caps">Caps Lock 이 켜져 있습니다.</div>}
      {hint}
    </div>
  )
}
