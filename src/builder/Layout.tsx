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
import { autoFold } from './panelFold'
import { pageSize } from '../cards/sizing'
import Present from './Present'
import TutorialCoach from './TutorialCoach'
import Hotkeys from './Hotkeys'
import SettingsPage from '../settings/SettingsPage'
import ChatPanel from '../chat/ChatPanel'
import NotesPanel from '../notes/NotesPanel'
import CommentsPanel from '../comments/CommentsPanel'
import { useComments } from '../comments/store'
import { applyUiAction } from '../chat/actions'
import DemoPlayer from './DemoPlayer'
import InsertPicker from './InsertPicker'
import AiCleanup from './AiCleanup'
import { useRef, useEffect } from 'react'
import { useBuilder } from '../state/store'
import { useProjects } from '../persistence/projects'
import { hasUnsavedChanges, useAutosave } from '../persistence/autosave'
import ConfirmSaveModal from '../persistence/ConfirmSaveModal'
import type { ConfirmSaveRequest } from '../persistence/ConfirmSaveModal'
import Modal from '../ui/Modal'

/**
 * 「요소 N개를 종이 안으로 옮겼습니다 · 되돌리기」 한 줄.
 *
 * **조용히 옮기면 안 된다.** 방향을 바꿨더니 요소가 움직여 있는데 아무 말도 없으면
 * 「내가 놓은 자리가 아닌데」가 된다. 그렇다고 확인창을 띄우면 방향을 바꿀 때마다
 * 창이 뜬다 — 옮기는 일이 되돌릴 수 있는 일이라 그렇게까지 할 것은 아니다.
 *
 * **⌘Z 로는 부족하다.** 되돌리기 이력이 쪽별이라 ⌘Z 는 지금 쪽 하나만 되돌린다.
 * 방향은 모든 쪽을 건드리므로 여기 「되돌리기」가 통째로 돌려놓는다.
 */
interface FitNote { moved: number; overlapping?: number; restored?: boolean }

function FitToast() {
  const undoFit = useBuilder((s) => s.undoFit)
  const [note, setNote] = useState<FitNote | null>(null)
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<FitNote>).detail
      // **옮긴 게 없으면 접는다.** 방향을 다시 바꾼 뒤에도 「종이 안으로 옮겼습니다」가
      // 떠 있으면 이제 맞지 않는 문장이다 — 실물 녹화에서 그대로 남아 있었다.
      if (!d || (!d.moved && !d.restored)) { setNote(null); return }
      setNote(d)
      // 옮겼을 때 10초. 되돌렸다는 말은 짧게 4초 — 확인이지 할 일이 아니다.
      const ms = d.restored ? 4_000 : 10_000
      window.setTimeout(() => setNote((n) => (n === d ? null : n)), ms)
    }
    window.addEventListener('ebook:fitted', on)
    return () => window.removeEventListener('ebook:fitted', on)
  }, [])
  if (!note) return null
  if (note.restored) {
    return (
      <div className="fit-toast" role="status">
        <span>자리를 되돌렸습니다.</span>
        <button className="x" onClick={() => setNote(null)} aria-label="닫기">×</button>
      </div>
    )
  }
  return (
    <div className="fit-toast" role="status">
      {/* 한 문장은 **한 덩어리로 묶는다.** 묶음이 flex(gap:10px)라 글자를 맨몸으로 두면
          「요소 / 3개 / 를 …」 세 조각이 되어 사이가 벌어진다 — 실물에서 그렇게 나왔다. */}
      <span>요소 <b>{note.moved}개</b>를 종이 안으로 옮겼습니다.
        {/* **겹쳤으면 그 말도 한다.** 옮겼다는 말만 하면 사람은 무엇이 어디 갔는지 못 찾는다. */}
        {note.overlapping ? <> 그중 <b>{note.overlapping}개</b>가 겹칩니다.</> : null}
      </span>
      <button onClick={() => { undoFit(); setNote(null) }}>되돌리기</button>
      <button className="x" onClick={() => setNote(null)} aria-label="닫기">×</button>
    </div>
  )
}

export default function Layout() {
  useCanvasCommands()
  // 편집 중인 자료가 바뀌면 검토 의견도 그 자료 것으로 바꾼다.
  // 안 바꾸면 앞 사람 문서의 지적이 다음 문서 위에 핀으로 뜬다.
  const activePid = useProjects((s) => s.activeId)
  const loadComments = useComments((s) => s.load)
  useEffect(() => { if (activePid) void loadComments(activePid) }, [activePid, loadComments])
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
      // 저장이 실패하면 진행하지 않는다(false 반환). 그대로 진행하면 아직 서버에 없는 작업을 덮어쓴다.
      onSaveAndContinue: async () => { const ok = await saveNow(); if (ok) action(); return ok },
      onContinueWithoutSave: action,
    })
  }
  const orientation = useBuilder((s) => s.orientation)
  const [leftW, setLeftW] = useState(212)
  const [rightW, setRightW] = useState(336)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  // **손잡이를 한 번이라도 누르면 그 패널은 자동에서 빠진다**(사용자 결정 ㄱ).
  // 자동이 사람의 선택을 되돌리면 그게 「패널이 저 혼자 움직인다」는 느낌이다.
  // 되돌릴 길은 남긴다 — 다시 눌러 되접거나 되펴면 그 상태가 그대로 지켜진다.
  const touched = useRef({ left: false, right: false })
  const bodyRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
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

  // ⑤ **창이 좁아지면 곁의 패널을 접어 종이에게 자리를 내준다.**
  //
  // 재는 것은 `.ax-body` 의 폭과 무대의 높이다 — 둘 다 **접어도 안 변하는 값**이라
  // 접었다 폈다 하는 되먹임이 생기지 않는다. 판단은 panelFold.autoFold 가 한다.
  //
  // 지금 열림 상태는 **ref 로 읽는다.** 갱신 함수(setState(prev => …)) 안에서
  // 다른 상태를 건드리면 React 가 그 함수를 두 번 불러도 되는 약속이 깨진다.
  const openRef = useRef({ left: leftOpen, right: rightOpen })
  openRef.current = { left: leftOpen, right: rightOpen }
  useEffect(() => {
    const body = bodyRef.current, stage = stageRef.current
    if (!body || !stage) return
    const decide = () => {
      const { W, H } = pageSize(orientation)
      const cur = openRef.current
      const r = autoFold({
        bodyW: body.getBoundingClientRect().width,
        stageH: stage.getBoundingClientRect().height,
        pageW: W, pageH: H, leftW, rightW,
        leftOpen: cur.left, rightOpen: cur.right,
      })
      // **손댄 쪽은 넘기지 않는다.** 자동은 「자동」인 패널만 움직인다.
      if (!touched.current.left) setLeftOpen(r.leftOpen)
      if (!touched.current.right) setRightOpen(r.rightOpen)
    }
    decide()
    const ro = new ResizeObserver(decide)
    ro.observe(body); ro.observe(stage)
    return () => ro.disconnect()
  }, [orientation, leftW, rightW])

  return (<div className="ax-app">
    <Hotkeys
      presentOpen={present} helpOpen={help} tutorialOpen={tutorial}
      onBuild={() => window.dispatchEvent(new CustomEvent('ebook:build'))}
      onSave={() => { void saveNow() }}
      onPresent={() => setPresent(true)} onHelp={() => setHelp(true)}
      onCloseHelp={() => setHelp(false)} onCloseTutorial={() => setTutorial(false)}
    />
    <TitleBar onPresent={() => setPresent(true)} />
    <MenuBar onHelp={() => setHelp(true)} onSettings={() => setSettings(true)} onImport={() => withSaveGuard(() => classicRef.current?.openImport(), '새 HTML을 불러오면 현재 작업 화면이 바뀔 수 있습니다.')} onPresent={() => setPresent(true)} />
    <EditToolbar />
    <ClassicBar ref={classicRef} onSettings={() => setSettings(true)} onDemo={() => withSaveGuard(() => setDemo(true), '데모 실행 중 현재 작업 화면이 임시로 바뀔 수 있습니다.')} onAiCleanup={() => setAi(true)} />

    <div className="ax-body" ref={bodyRef} style={{ gridTemplateColumns: `${leftOpen ? leftW : 0}px 1fr ${rightOpen ? rightW : 0}px` }}>
      <div className="ax-film" style={{ overflow: 'hidden' }}>
        <CardPicker />
        <Filmstrip />
      </div>
      <div className="ax-stage-wrap" ref={stageRef}>
        {/* 접혀 있을 때는 **무엇이 접혔는지 이름을 보여 준다.** 자동으로 접히는 이상,
            빈 가장자리에 화살표만 남기면 「쪽 목록이 어디 갔지」로 끝난다. */}
        <button className={'ax-edge l' + (leftOpen ? '' : ' named')}
          title={leftOpen ? '쪽 목록 접기' : '쪽 목록 펴기'}
          onClick={() => { touched.current.left = true; setLeftOpen((o) => !o) }}>
          {leftOpen ? '‹' : <>›<em>쪽 목록</em></>}
        </button>
        <button className={'ax-edge r' + (rightOpen ? '' : ' named')}
          title={rightOpen ? '속성 패널 접기' : '속성 패널 펴기'}
          onClick={() => { touched.current.right = true; setRightOpen((o) => !o) }}>
          {rightOpen ? '›' : <>‹<em>속성</em></>}
        </button>
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
      <Modal title="환경설정" onClose={() => setSettings(false)} size="lg"
        scrimClassName="scrim on settings-scrim" className="settings-modal"
        cancel={{ label: '확인', onClick: () => setSettings(false) }}>
        <SettingsPage />
      </Modal>
    ) : null}
    {!chat ? <button className="chat-fab" onClick={() => setChat(true)}>💬 챗봇</button> : null}
    <ChatPanel isOpen={chat} onClose={() => setChat(false)} screenContext={{ page: 'builder' }} onUiAction={applyUiAction} />
    <NotesPanel />
    <CommentsPanel />
    <DemoPlayer open={demo} onClose={() => setDemo(false)} />
    <InsertPicker />
    <AiCleanup open={ai} onClose={() => setAi(false)} />
    {confirmSave ? <ConfirmSaveModal req={confirmSave} onClose={() => setConfirmSave(null)} /> : null}
    <FitToast />
  </div>)
}
