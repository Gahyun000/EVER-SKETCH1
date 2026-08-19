import { useEffect } from 'react'
import AuthGate from './auth/AuthGate'
import Layout from './builder/Layout'
import LibraryScreen from './persistence/LibraryScreen'
import CyclesScreen from './cycles/CyclesScreen'
import './cycles/cycles.css'
import { useProjects } from './persistence/projects'
import { installAutosave } from './persistence/autosave'
import { useAuth } from './auth/useAuth'

function Workspace() {
  const view = useProjects((s) => s.view)
  const boot = useProjects((s) => s.boot)
  // 로그인이 끝난 뒤에만 마운트된다(AuthGate 가 ready 일 때만 children 을 그린다).
  // 로그인 전에 boot 를 부르면 401 만 받는다.
  useEffect(() => { installAutosave(); void boot() }, [boot])
  const back = useProjects((s) => s.backToLibrary)
  // 기본은 '내 이북' 라이브러리, 프로젝트를 열면 편집 화면, 회차 화면은 별도.
  if (view === 'editor') return <Layout />
  if (view === 'cycles') return <CyclesScreen onClose={() => void back()} />
  return <LibraryScreen />
}

export default function App() {
  const uid = useAuth((s) => s.me?.id)
  return (
    <AuthGate>
      {/* key 를 사용자에 묶는다 — 계정이 바뀌면 작업 상태를 처음부터 다시 만든다.
          그러지 않으면 이전 사용자의 이북 목록이 화면에 남는다. */}
      <Workspace key={uid ?? 'anon'} />
    </AuthGate>
  )
}
