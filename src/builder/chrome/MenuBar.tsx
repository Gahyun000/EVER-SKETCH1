import { useState, useRef, useEffect } from 'react'
import { useBuilder } from '../../state/store'
import { useProjects } from '../../persistence/projects'
import { useCanvasUI } from '../../state/canvasUI'
import { useAutosave } from '../../persistence/autosave'
import { isAdmin } from '../../auth/authApi'
import { useAuth } from '../../auth/useAuth'
import type { Tool } from '../../state/canvasUI'

interface MItem {
  label?: string; sc?: string; run?: () => void; disabled?: boolean; sep?: boolean
  /** 관리자만 쓸 수 있는 항목 — 작성자에게는 아예 보이지 않는다.
   *  서버가 403 으로 막으므로 보안이 목적은 아니다. 눌러도 안 되는 버튼을
   *  띄워두면 사용자는 '고장 났다' 고 이해한다. */
  admin?: boolean
}
interface Menu { label: string; hwp?: boolean; items: MItem[] }

// 구글 슬라이드식 드롭다운 메뉴. 실동작 가능한 항목은 연결, 미구현은 비활성 표시.
export default function MenuBar({ onHelp, onTutorial, onSettings, onImport, onPresent }: { onHelp: () => void; onTutorial: () => void; onSettings: () => void; onImport: () => void; onPresent: () => void }) {
  const addCard = useBuilder((s) => s.addCard)
  const backToLibrary = useProjects((s) => s.backToLibrary)
  const setPageBg = useBuilder((s) => s.setPageBg)
  const removePage = useBuilder((s) => s.removePage)
  const duplicatePage = useBuilder((s) => s.duplicatePage)
  const selId = useBuilder((s) => s.selectedPageId)
  const setTool = useCanvasUI((s) => s.setTool)
  const saveNow = useAutosave((s) => s.saveNow)
  const [open, setOpen] = useState<number | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const admin = isAdmin(useAuth((s) => s.me))

  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [])

  const emit = (n: string) => window.dispatchEvent(new CustomEvent(n))
  const tool = (t: Tool) => setTool(t)
  const curBg = (d: boolean) => { if (selId != null) setPageBg(selId, d ? '#0e1c30' : '') }

  const MENUS: Menu[] = [
    { label: '파일', items: [
      { label: '📄 HTML 가져오기', sc: 'Alt+O', run: onImport },
      { sep: true },
      { label: '💾 저장', sc: '⌘S', run: () => { void saveNow() } },
      { sep: true },
      { label: '🖼 PDF로 내보내기 (이미지)', run: () => emit('ebook:export-pdf') },
      { label: '📊 PPT로 내보내기 (편집 가능)', run: () => emit('ebook:export-pptx') },
      { label: '↧ 이북(웹) 만들기', sc: '⌘↵', run: () => emit('ebook:build'), admin: true },
      { sep: true },
      { label: '▷ 슬라이드쇼 (미리 보기)', run: onPresent },
      { sep: true },
      { label: '⚙ 환경설정', run: onSettings, admin: true },
    ] },
    { label: '수정', items: [
      { label: '실행취소', sc: '⌘Z', run: () => emit('ebook:undo') },
      { label: '재실행', sc: '⌘Y', run: () => emit('ebook:redo') },
      { sep: true },
      { label: '선택 요소 복제', sc: '⌘D', run: () => emit('ebook:dup') },
      { label: '선택 요소 삭제', sc: 'Del', run: () => emit('ebook:del') },
    ] },
    { label: '보기', items: [
      { label: '▶ 예시영상', run: () => emit('ebook:demo') },
      { label: '도움말', run: onHelp },
    ] },
    { label: '삽입', items: [
      { label: 'T  텍스트 상자', run: () => tool('text') },
      { label: '🖼  이미지', run: () => emit('ebook:insert-image') },
      { label: '◇  도형', run: () => tool('box') },
      { label: '▦  표', run: () => tool('table') },
      { label: '╱  선', run: () => tool('pen') },
      { label: '🅰  Word Art (글맵시)', run: () => tool('wordart') },
      { sep: true },
      { label: '＋ 새 슬라이드', sc: '⌘M', run: () => addCard('slide') },
      { label: '＋ 덱 섹션 카드', run: () => addCard('dsection') },
    ] },
    { label: '서식', items: [
      { label: '굵게 (선택 요소)', run: () => emit('ebook:fmt-bold') },
      { label: '글자색 (선택 요소)', run: () => emit('ebook:fmt-color') },
      { sep: true },
      { label: '정렬 및 들여쓰기', run: () => emit('ebook:align-cycle') },
      { label: '글머리기호', run: () => emit('ebook:bullet') },
      { label: '서식 지우기', run: () => emit('ebook:fmt-clear') },
    ] },
    { label: '슬라이드', items: [
      { label: '▷ 슬라이드쇼', run: onPresent },
      { sep: true },
      { label: '＋ 새 슬라이드', sc: '⌘M', run: () => addCard('slide') },
      { label: '＋ 덱 섹션 카드', run: () => addCard('dsection') },
      { label: '⧉ 슬라이드 복제', run: () => { if (selId != null) duplicatePage(selId) } },
      { label: '🗑 슬라이드 삭제', run: () => { if (selId != null) removePage(selId) } },
      { sep: true },
      { label: '◻ 배경 — 라이트', run: () => curBg(false) },
      { label: '◼ 배경 — 다크', run: () => curBg(true) },
      { label: '테마 변경(라이트/다크)', run: () => emit('ebook:bg-toggle') },
    ] },
    { label: '정렬', items: [
      { label: '맨 앞으로', run: () => emit('ebook:z-front') },
      { label: '맨 뒤로', run: () => emit('ebook:z-back') },
      { sep: true },
      { label: '페이지 중앙 배치', run: () => emit('ebook:el-center') },
      { label: '회전 (+15°)', run: () => emit('ebook:el-rotate') },
    ] },
    { label: '도구', items: [
      { label: '⚙ 환경설정', run: onSettings, admin: true },
      { label: '맞춤법 검사 켜기/끄기', run: () => { const c = useCanvasUI.getState(); c.setSpell(!c.spell) } },
    ] },
    { label: '도움말', items: [
      { label: '도움말 열기', run: onHelp },
      { label: '▶ 튜토리얼 (30초 시연)', run: onTutorial },
    ] },
  ]

  return (
    <div className="ax-menu" ref={wrap}>
      {/* 라이브러리로 돌아가는 단추. 글자는 제품 이름으로 통일했다(2026-09-07) —
          어디로 가는지는 title 이 계속 말해 준다. */}
      <button className="ax-lib" title="EVER-SKETCH — 라이브러리로 돌아가기" onClick={() => void backToLibrary()}>☰ EVER-SKETCH</button>
      {MENUS.map((m0, i) => {
        // 관리자 전용 항목을 뺀 뒤, 위아래가 비어버린 구분선도 함께 정리한다.
        const kept = m0.items.filter((it) => admin || !it.admin)
        const items = kept.filter((it, j) =>
          !it.sep || (j > 0 && j < kept.length - 1 && !kept[j - 1].sep))
        const m = { ...m0, items }
        return (
        <div key={m.label} className="ax-mwrap">
          <button
            className={'m' + (m.hwp ? ' hwp' : '') + (open === i ? ' active' : '')}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => { if (open !== null) setOpen(i) }}
          >{m.label}</button>
          {open === i ? (
            <div className="ax-mdrop">
              {m.items.map((it, j) => it.sep
                ? <div key={j} className="ax-msep" />
                : <button key={j} className={'ax-mitem' + (it.disabled ? ' dis' : '')} disabled={it.disabled}
                    onClick={() => { if (!it.disabled && it.run) { it.run(); setOpen(null) } }}>
                    <span>{it.label}</span>{it.sc ? <span className="sc">{it.sc}</span> : null}
                  </button>
              )}
            </div>
          ) : null}
        </div>
        )
      })}
    </div>
  )
}
