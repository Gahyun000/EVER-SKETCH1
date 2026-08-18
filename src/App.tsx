import { useEffect } from 'react'
import Layout from './builder/Layout'
import LibraryScreen from './persistence/LibraryScreen'
import { useProjects } from './persistence/projects'
import { installAutosave } from './persistence/autosave'

export default function App() {
  const view = useProjects((s) => s.view)
  const boot = useProjects((s) => s.boot)
  useEffect(() => { installAutosave(); void boot() }, [boot])
  // 앱 진입점: 기본은 '내 이북' 라이브러리, 프로젝트를 열면 편집 화면.
  return view === 'editor' ? <Layout /> : <LibraryScreen />
}
