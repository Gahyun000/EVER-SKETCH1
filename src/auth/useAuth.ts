// 로그인 상태 저장소. 앱 전체가 이 하나만 본다.
import { create } from 'zustand'
import { apiLogin, apiLogout, apiMe, type Me } from './authApi'
import { setSessionLostHandler } from './session'

export type AuthPhase = 'booting' | 'anon' | 'pending' | 'must_change_pw' | 'ready'

interface AuthState {
  phase: AuthPhase
  me: Me | null
  /** 세션이 끊겨서 튕겨 나온 경우 그 사실을 알려준다(그냥 로그아웃과 구분). */
  sessionLost: boolean
  boot: () => Promise<void>
  login: (loginId: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  clearSessionLost: () => void
}

function phaseOf(me: Me | null): AuthPhase {
  if (!me) return 'anon'
  // 비밀번호 강제 변경이 승인 상태보다 먼저다 — 시드 관리자가 초기 비밀번호로 돌아다니면 안 된다.
  if (me.must_change_pw) return 'must_change_pw'
  if (me.status !== 'active') return 'pending'
  return 'ready'
}

export const useAuth = create<AuthState>((set, get) => ({
  phase: 'booting',
  me: null,
  sessionLost: false,

  boot: async () => {
    // 어느 API 든 401 을 받으면 로그인 화면으로 되돌린다.
    setSessionLostHandler(() => {
      if (get().phase !== 'anon') set({ phase: 'anon', me: null, sessionLost: true })
    })
    try {
      const me = await apiMe()
      set({ me, phase: phaseOf(me) })
    } catch {
      // 서버가 안 떠 있어도 앱이 흰 화면으로 멈추지 않게 한다.
      set({ me: null, phase: 'anon' })
    }
  },

  login: async (loginId, password) => {
    const me = await apiLogin(loginId, password)
    set({ me, phase: phaseOf(me), sessionLost: false })
  },

  logout: async () => {
    try {
      await apiLogout()
    } finally {
      set({ me: null, phase: 'anon', sessionLost: false })
    }
  },

  refresh: async () => {
    const me = await apiMe()
    set({ me, phase: phaseOf(me) })
  },

  clearSessionLost: () => set({ sessionLost: false }),
}))
