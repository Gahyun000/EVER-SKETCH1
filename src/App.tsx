import { useEffect } from 'react'
import AuthGate from './auth/AuthGate'
import Layout from './builder/Layout'
import LibraryScreen from './persistence/LibraryScreen'
import ApprovalsPanel from './approvals/ApprovalsPanel'
import TeamLibraryPanel from './teamlib/TeamLibraryPanel'
import UsersAdmin from './auth/UsersAdmin'
import TeamsAdmin from './teams/TeamsAdmin'
import SettingsPage from './settings/SettingsPage'
import AppShell from './shell/AppShell'
import { pathOfView, viewFromPath, type ShellView } from './shell/shellPath'
import { useProjects } from './persistence/projects'
import { useBuilder } from './state/store'
import { installAutosave } from './persistence/autosave'
import { useAuth } from './auth/useAuth'
import ApprovalViewer, { viewerIdFromPath } from './teamlib/ApprovalViewer'

/**
 * 셸 안의 본문 — **화면 여섯**.
 *
 * 예전에는 둘이었다(라이브러리·편집). 나머지 넷은 덮개라 라이브러리 위에만 떴고,
 * 편집 중에는 갈 수가 없었다. 이제 자기 자리를 가진다.
 *
 * 덮개 시절의 `onClose` 는 안 넘긴다 — 닫을 데가 없다. 대신 `embedded` 로
 * 스크림과 「닫기」를 뺀다(각 패널이 그 한 줄만 안다).
 */
function Body({ view }: { view: string }) {
  if (view === 'editor') return <Layout />
  if (view === 'inbox') return <ApprovalsPanel embedded />
  if (view === 'team') return <TeamLibraryPanel embedded />
  if (view === 'users') return <UsersAdmin embedded />
  if (view === 'admin') return <TeamsAdmin embedded />
  if (view === 'settings') return <div className="sh-page"><SettingsPage /></div>
  return <LibraryScreen />
}

function Workspace({ uid }: { uid: string | null }) {
  const view = useProjects((s) => s.view)
  const setView = useProjects((s) => s.setView)
  const boot = useProjects((s) => s.boot)
  const title = useBuilder((s) => s.title)

  // 로그인이 끝난 뒤에만 마운트된다(AuthGate 가 ready 일 때만 children 을 그린다).
  // 로그인 전에 boot 를 부르면 401 만 받는다.
  // **uid 를 넘긴다** — 계정이 바뀌면 boot 가 앞사람 것을 비우고 다시 받는다.
  useEffect(() => { installAutosave(); void boot(uid) }, [boot, uid])

  /**
   * **주소를 최소만 쓴다**(사용자 결정 ㄴ). 라이브러리를 안 들였다 —
   * 갈래가 여섯뿐이고, 이 앱에는 이미 주소를 읽는 자리가 둘 있다.
   *
   * 들어올 때 한 번 읽고, 화면을 옮길 때 `pushState` 로 적고, 뒤로 가기에 답한다.
   * 이 셋이면 시안이 든 불만(「뒤로 가기도 새로고침도 안 통한다」)이 풀린다.
   */
  useEffect(() => {
    const first = viewFromPath(window.location.pathname)
    if (first && first !== 'library') setView(first)
    const onPop = () => {
      const v = viewFromPath(window.location.pathname)
      // **모르는 주소면 아무것도 안 한다.** 조용히 「내 자료」로 바꾸면
      // 뷰어 주소로 뒤로 간 사람이 엉뚱한 화면에 내린다.
      if (v) setView(v)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [setView])

  const go = (v: ShellView) => {
    setView(v)
    try {
      const to = pathOfView(v)
      if (window.location.pathname !== to) window.history.pushState({ v }, '', to)
    } catch { /* 주소를 못 써도 화면은 바뀐다 — 부가 기능이다 */ }
  }

  // 편집 중에는 자취 끝에 **자료 이름**이 온다. 지금까지는 편집에 들어가는 순간
  // 어느 화면에서 왔는지가 사라졌다.
  const crumb = view === 'editor' ? (title || '제목 없음') : ''

  return (
    <AppShell view={view as never} onView={go} crumb={crumb}>
      <Body view={view} />
    </AppShell>
  )
}

export default function App() {
  const uid = useAuth((s) => s.me?.id)
  // **주소로 화면을 가르는 유일한 자리**(㉰). 뷰어는 새 탭으로 열리는 막다른 화면이라
  // 셸 밖에 둔다 — 목록도 탭도 없이 자료 하나만 읽는 자리다.
  // `AuthGate` 안에 두는 이유: 로그인 안 한 사람은 로그인부터 하고, 끝나면 이 주소로 돌아온다.
  const viewId = viewerIdFromPath(window.location.pathname)
  return (
    <AuthGate>
      {/* key 로 컴포넌트를 새로 만들지만, **이것만으로는 부족하다** —
          useProjects·useBuilder 는 모듈 단위 스토어라 리마운트로 지워지지 않는다.
          실제로 비우는 것은 boot(uid) 안의 resetWorkspace() 다. */}
      {viewId
        ? <ApprovalViewer key={viewId} aid={viewId} />
        : <Workspace key={uid ?? 'anon'} uid={uid ?? null} />}
    </AuthGate>
  )
}
