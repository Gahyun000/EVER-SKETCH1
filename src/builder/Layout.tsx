import { useState } from 'react'
import './chrome.css'
import TitleBar from './chrome/TitleBar'
import MenuBar from './chrome/MenuBar'
import EditToolbar from './chrome/EditToolbar'
import ClassicBar from './chrome/ClassicBar'
import type { ClassicBarHandle } from './chrome/ClassicBar'
import RightPanel from './chrome/RightPanel'
import Filmstrip from './Filmstrip'
import CardPicker from './CardPicker'
import Preview from './Preview'
import ExportLayer from './ExportLayer'
import Help from './Help'
import { useCanvasCommands } from './useCanvasCommands'
import Present from './Present'
import TutorialCoach from './TutorialCoach'
import Hotkeys from './Hotkeys'
import SettingsPage from '../settings/SettingsPage'
import ChatPanel from '../chat/ChatPanel'
import NotesPanel from '../notes/NotesPanel'
import { applyUiAction } from '../chat/actions'
import DemoPlayer from './DemoPlayer'
import InsertPicker from './InsertPicker'
import AiCleanup from './AiCleanup'
import { useRef, useEffect } from 'react'
import { useBuilder } from '../state/store'
import { hasUnsavedChanges, useAutosave } from '../persistence/autosave'
import ConfirmSaveModal from '../persistence/ConfirmSaveModal'
import type { ConfirmSaveRequest } from '../persistence/ConfirmSaveModal'

export default function Layout() {
  useCanvasCommands()
  const [help, setHelp] = useState(false)
  const [present, setPresent] = useState(false)
  const [tutorial, setTutorial] = useState(false)
  const [settings, setSettings] = useState(false)
  const [chat, setChat] = useState(false)
  const [demo, setDemo] = useState(false)
  const [ai, setAi] = useState(false)
  const [confirmSave, setConfirmSave] = useState<ConfirmSaveRequest | null>(null)
  const classicRef = useRef<ClassicBarHandle>(null)
  const addCard = useBuilder((s) => s.addCard)
  const saveNow = useAutosave((s) => s.saveNow)
  function withSaveGuard(action: () => void, message?: string) {
    if (!hasUnsavedChanges()) { action(); return }
    setConfirmSave({
      message,
      onSaveAndContinue: async () => { await saveNow(); action() },
      onContinueWithoutSave: action,
    })
  }
  const [leftW, setLeftW] = useState(212)
  const [rightW, setRightW] = useState(336)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  function startResize(side: 'left' | 'right') {
    return (e: { clientX: number; preventDefault: () => void }) => {
      e.preventDefault()
      const sx = e.clientX, sw = side === 'left' ? leftW : rightW
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - sx
        if (side === 'left') setLeftW(Math.max(150, Math.min(380, sw + dx)))
        else setRightW(Math.max(240, Math.min(560, sw - dx)))
      }
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.style.cursor = '' }
      document.body.style.cursor = 'col-resize'
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    }
  }

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  useEffect(() => {
    const h = () => setPresent(true)
    const imp = () => withSaveGuard(() => classicRef.current?.openImport(), '새 HTML을 불러오면 현재 작업 화면이 바뀔 수 있습니다.')
    window.addEventListener('ebook:present', h)
    window.addEventListener('ebook:import', imp)
    return () => { window.removeEventListener('ebook:present', h); window.removeEventListener('ebook:import', imp) }
  }, [saveNow])

  useEffect(() => {
    const clamp = () => {
      const w = window.innerWidth
      setLeftW((v) => Math.min(v, Math.max(150, Math.round(w * 0.28))))
      setRightW((v) => Math.min(v, Math.max(240, Math.round(w * 0.36))))
    }
    clamp(); window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [])

  return (<div className="ax-app">
    <Hotkeys
      presentOpen={present} helpOpen={help} tutorialOpen={tutorial}
      onBuild={() => window.dispatchEvent(new CustomEvent('ebook:build'))}
      onPresent={() => setPresent(true)} onHelp={() => setHelp(true)}
      onCloseHelp={() => setHelp(false)} onCloseTutorial={() => setTutorial(false)}
    />
    <TitleBar onPresent={() => setPresent(true)} />
    <MenuBar onHelp={() => setHelp(true)} onSettings={() => setSettings(true)} onImport={() => withSaveGuard(() => classicRef.current?.openImport(), '새 HTML을 불러오면 현재 작업 화면이 바뀔 수 있습니다.')} onPresent={() => setPresent(true)} />
    <EditToolbar />
    <ClassicBar ref={classicRef} onSettings={() => setSettings(true)} onDemo={() => withSaveGuard(() => setDemo(true), '데모 실행 중 현재 작업 화면이 임시로 바뀔 수 있습니다.')} onAiCleanup={() => setAi(true)} />

    <div className="ax-body" style={{ gridTemplateColumns: `${leftOpen ? leftW : 0}px 1fr ${rightOpen ? rightW : 0}px` }}>
      <div className="ax-film" style={{ overflow: 'hidden' }}>
        <CardPicker />
        <Filmstrip />
      </div>
      <div className="ax-stage-wrap">
        <button className="ax-edge l" title="슬라이드 패널 접기/펼치기" onClick={() => setLeftOpen((o) => !o)}>{leftOpen ? '‹' : '›'}</button>
        <button className="ax-edge r" title="속성 패널 접기/펼치기" onClick={() => setRightOpen((o) => !o)}>{rightOpen ? '›' : '‹'}</button>
        {leftOpen && <div className="ax-resize l" onPointerDown={startResize('left')} title="드래그로 폭 조절" />}
        {rightOpen && <div className="ax-resize r" onPointerDown={startResize('right')} title="드래그로 폭 조절" />}
        <Preview />
      </div>
      <div className="ax-rightcell" style={{ overflow: 'hidden' }}><RightPanel /></div>
    </div>

    <ExportLayer />
    <Help open={help} onClose={() => setHelp(false)} onStartTutorial={() => { setHelp(false); setTutorial(true) }} />
    <Present open={present} onClose={() => setPresent(false)} />
    <TutorialCoach open={tutorial} onClose={() => setTutorial(false)} />
    {settings ? (
      <div className="scrim on settings-scrim" onClick={(e) => { if ((e.target as HTMLElement).classList.contains('scrim')) setSettings(false) }}>
        <div className="settings-modal">
          <button className="close" onClick={() => setSettings(false)}>확인</button>
          <SettingsPage />
        </div>
      </div>
    ) : null}
    {!chat ? <button className="chat-fab" onClick={() => setChat(true)}>💬 챗봇</button> : null}
    <ChatPanel isOpen={chat} onClose={() => setChat(false)} screenContext={{ page: 'builder' }} onUiAction={applyUiAction} />
    <NotesPanel />
    <DemoPlayer open={demo} onClose={() => setDemo(false)} />
    <InsertPicker />
    <AiCleanup open={ai} onClose={() => setAi(false)} />
    {confirmSave ? <ConfirmSaveModal req={confirmSave} onClose={() => setConfirmSave(null)} /> : null}
  </div>)
}
