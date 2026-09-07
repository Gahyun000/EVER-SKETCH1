import { useEffect } from 'react'
import AuthGate from './auth/AuthGate'
import Layout from './builder/Layout'
import LibraryScreen from './persistence/LibraryScreen'
import { useProjects } from './persistence/projects'
import { installAutosave } from './persistence/autosave'
import { useAuth } from './auth/useAuth'
import ApprovalViewer, { viewerIdFromPath } from './teamlib/ApprovalViewer'

function Workspace({ uid }: { uid: string | null }) {
  const view = useProjects((s) => s.view)
  const boot = useProjects((s) => s.boot)
  // 로그인이 끝난 뒤에만 마운트된다(AuthGate 가 ready 일 때만 children 을 그린다).
  // 로그인 전에 boot 를 부르면 401 만 받는다.
  // **uid 를 넘긴다** — 계정이 바뀌면 boot 가 앞사람 것을 비우고 다시 받는다.
  useEffect(() => { installAutosave(); void boot(uid) }, [boot, uid])
  // 기본은 '내 이북' 라이브러리, 프로젝트를 열면 편집 화면.
  if (view === 'editor') return <Layout />
  return <LibraryScreen />
}

export default function App() {
  const uid = useAuth((s) => s.me?.id)
  // **주소로 화면을 가르는 유일한 자리**(㉰). 라우터를 들이지 않는다 —
  // 갈래가 하나뿐이고, 뷰어는 새 탭으로 열리는 막다른 화면이라 안에서 이동하지 않는다.
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
