import { useState, useRef, useEffect } from 'react'
import { useBuilder } from '../../state/store'
import { useProjects } from '../../persistence/projects'
import { useCanvasUI } from '../../state/canvasUI'
import { useKey } from '../../ui/keyLabel'
import { useAutosave } from '../../persistence/autosave'
import { canPublish, isAdmin } from '../../auth/authApi'
import { useAuth } from '../../auth/useAuth'
import type { Tool } from '../../state/canvasUI'

interface MItem {
  label?: string; sc?: string; run?: () => void; disabled?: boolean; sep?: boolean
  /** 관리자만 쓸 수 있는 항목 — 작성자에게는 아예 보이지 않는다.
   *  서버가 403 으로 막으므로 보안이 목적은 아니다. 눌러도 안 되는 버튼을
   *  띄워두면 사용자는 '고장 났다' 고 이해한다. */
  admin?: boolean
  /** 발행할 수 있는 사람(관리자 + 작성자)에게만 보이는 항목. 2026-09-16. */
  publish?: boolean
}
interface Menu { label: string; hwp?: boolean; items: MItem[] }

// 구글 슬라이드식 드롭다운 메뉴. 실동작 가능한 항목은 연결, 미구현은 비활성 표시.
export default function MenuBar({ onHelp, onTutorial, onNotes, onSettings, onImport, onPresent }: { onHelp: () => void; onTutorial: () => void; onNotes: () => void; onSettings: () => void; onImport: () => void; onPresent: () => void }) {
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
  const me = useAuth((s) => s.me)
  const admin = isAdmin(me)
  const pub = canPublish(me)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [])

  const emit = (n: string) => window.dispatchEvent(new CustomEvent(n))
  // 단축키 글자는 **보는 사람 키보드에 있는 것**으로 적는다(ui/keyLabel).
  const K = useKey()
  const tool = (t: Tool) => setTool(t)
  /** 캔버스에 「이걸 놓아 달라」고 알린다 — 놓는 일은 캔버스가 한다(FreeLayer 의 ebook:place). */
  const place = (t: Tool) => window.dispatchEvent(new CustomEvent('ebook:place', { detail: { type: t } }))
  const curBg = (d: boolean) => { if (selId != null) setPageBg(selId, d ? '#0e1c30' : '') }

  const MENUS: Menu[] = [
    { label: '파일', items: [
      { label: '📄 HTML 가져오기', sc: K('alt+O'), run: onImport },
      { sep: true },
      { label: '💾 저장', sc: K('mod+S'), run: () => { void saveNow() } },
      { sep: true },
      { label: '🖼 PDF로 내보내기 (이미지)', run: () => emit('ebook:export-pdf') },
      { label: '📊 PPT로 내보내기 (편집 가능)', run: () => emit('ebook:export-pptx') },
      // **작성자도 발행한다**(2026-09-16). 서버는 제 자료만 열어 주므로,
      // 여기 보이는 것과 서버가 허락하는 것의 넓이가 같다.
      { label: '↧ 이북(웹) 만들기', sc: K('mod+enter'), run: () => emit('ebook:build'), publish: true },
      { sep: true },
      { label: '▷ 슬라이드쇼 (미리 보기)', run: onPresent },
      { sep: true },
      { label: '⚙ 환경설정', run: onSettings, admin: true },
    ] },
    { label: '수정', items: [
      { label: '실행취소', sc: K('mod+Z'), run: () => emit('ebook:undo') },
      { label: '재실행', sc: K('mod+Y'), run: () => emit('ebook:redo') },
      { sep: true },
      { label: '선택 요소 복제', sc: K('mod+D'), run: () => emit('ebook:dup') },
      { label: '선택 요소 삭제', sc: K('del'), run: () => emit('ebook:del') },
    ] },
    // 2026-09-17 · 「▶ 튜토리얼 (30초 시연)」이 여기로 왔다(사용자 결정).
    // 원래는 도움말 메뉴에만 있었는데 그 메뉴를 걷으면서 갈 곳이 없어졌다. 보기 메뉴가
    // 맞는 자리다 — **바로 위 「작성자 매뉴얼」과 같은 성격**(보기만 하는 것)이라,
    // 둘이 나란히 있으면 「배우는 것들」이 한곳에 모인다.
    { label: '보기', items: [
      // **등급에 따라 보이는 것이 다르다**(2026-09-18 · 사용자 결정).
      //   작성자 매뉴얼 — 관리자 ○ 작성자 ○ **열람자 ✕**
      //   관리자 매뉴얼 — 관리자 ○ **작성자 ✕ 열람자 ✕**
      //
      // **새로 만든 장치가 없다.** 아래 거르개가 이미 둘을 본다 — `admin`(관리자만)과
      // `publish`(= canPublish, 관리자 + 작성자). **`publish` 가 곧 「열람자에게만 숨김」**이다.
      // 열람자는 만들 수가 없는데 「만들기 37걸음」을 보고 있었다.
      { label: '▶ 작성자 매뉴얼', publish: true, run: () => emit('ebook:demo') },
      { label: '🛡 관리자 매뉴얼', admin: true, run: () => emit('ebook:admin-manual') },
      { label: '▶ 튜토리얼 (30초 시연)', run: onTutorial },
      { label: '도움말', run: onHelp },
    ] },
    { label: '삽입', items: [
      // **여기 셋도 고르면 바로 놓인다**(2026-09-18). 도구줄과 같은 길을 쓴다 —
      // 메뉴와 도구줄이 다른 길을 쓰면 한쪽만 고쳐지는 날이 온다.
      { label: 'T  텍스트 상자', run: () => place('text') },
      { label: '🖼  이미지', run: () => emit('ebook:insert-image') },
      // **도구줄의 도형 팝업을 연다**(2026-09-16). 전에는 사각형 하나를 무장시켰는데,
      // 팝업에는 스무 가지가 있어서 같은 이름이 두 곳에서 다른 말을 했다.
      // 목록을 여기에도 적지 않는다 — 두 벌이 되면 한쪽만 는다.
      { label: '◇  도형…', run: () => emit('ebook:pick-shape') },
      { label: '▦  표', run: () => place('table') },
      { label: '╱  선', run: () => tool('pen') },
      { label: '🅰  Word Art (글맵시)', run: () => place('wordart') },
      { sep: true },
      { label: '＋ 새 슬라이드', run: () => addCard('slide') },
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
      { label: '＋ 새 슬라이드', run: () => addCard('slide') },
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
    // 2026-09-18 · **메모장이 여기로 들어왔다.** 떠 있던 왼쪽 아래 단추를 없앴으니
    // 「찾는 사람」의 길이 하나 있어야 한다 — 없으면 챗봇을 안 여는 사람은 메모장이
    // 있는 줄도 모른다. 구글 문서도 곁패널 메모장을 도구 ▸ Keep 메모장에 둔다.
    // 이웃인 「맞춤법 검사」도 문서를 바꾸는 게 아니라 옆에서 돕는 곁것이라 성격이 맞는다.
    { label: '도구', items: [
      { label: '🗒 메모장', run: onNotes },
      { sep: true },
      { label: '⚙ 환경설정', run: onSettings, admin: true },
      { label: '맞춤법 검사 켜기/끄기', run: () => { const c = useCanvasUI.getState(); c.setSpell(!c.spell) } },
    ] },
    // 2026-09-17 · **「도움말」 메뉴를 걷어냈다**(사용자 결정).
    // 두 항목뿐이었고 「도움말 열기」는 **보기 메뉴와 F1 에 이미 있었다.**
    // 남은 「▶ 튜토리얼 (30초 시연)」은 위 보기 메뉴로 옮겼다 — 지우지 않았다.
    // 도움말 창은 보기 ▸ 도움말 과 F1 로 그대로 열린다.
  ]

  return (
    <div className="ax-menu" ref={wrap}>
      {/* 라이브러리로 돌아가는 단추. 글자는 제품 이름으로 통일했다(2026-09-07) —
          어디로 가는지는 title 이 계속 말해 준다. */}
      <button className="ax-lib" title="EVER-SKETCH — 라이브러리로 돌아가기" onClick={() => void backToLibrary()}>☰ EVER-SKETCH</button>
      {MENUS.map((m0, i) => {
        // 관리자 전용 항목을 뺀 뒤, 위아래가 비어버린 구분선도 함께 정리한다.
        const kept = m0.items.filter((it) => (admin || !it.admin) && (pub || !it.publish))
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
