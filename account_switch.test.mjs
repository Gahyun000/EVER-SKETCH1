// 계정이 바뀌면 앞사람 것이 화면에 남지 않는다 — 노드 단독 실행.
//
// **왜 이 스위트가 있는가.**
// `App.tsx` 에는 `key={uid}` 와 "그러지 않으면 이전 사용자의 이북 목록이 화면에 남는다" 는
// 주석이 있다. 그런데 `useProjects`·`useBuilder` 는 모듈 단위 zustand 스토어라
// 컴포넌트를 다시 마운트해도 살아 있고, `boot()` 은 한 번 켜진 플래그를 보고 즉시 반환한다.
// 그래서 막으려던 그 일이 실제로 일어난다 — 관리자로 보던 목록이 작성자 화면에 남고,
// 편집 화면에서 로그아웃하면 다음 사람이 앞사람 슬라이드에 착지한다.
//
// 서버는 멀쩡하다(작성자에게는 본인 것만 내려준다). 새는 곳은 화면이다.
// 권한을 아무리 잘 짜도 화면이 앞사람 것을 들고 있으면 소용이 없다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs account_switch.test.mjs

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

const { useProjects, resetWorkspace } = await import('./src/persistence/projects.ts')
const { useBuilder } = await import('./src/state/store.ts')
const { useAutosave, setAutosaveReadOnly } = await import('./src/persistence/autosave.ts')
const { getActiveProjectId, setActiveProjectId } = await import('./src/persistence/session.ts')
const { pushSnap, canUndo } = await import('./src/canvas/history.ts')

let pass = 0, fail = 0
const check = (cond, label) => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label) }
}

/** 관리자가 한참 쓰다가 편집 화면까지 열어 둔 상태를 만든다. */
function asAdminAtWork() {
  useProjects.setState({
    view: 'editor',
    activeId: 'p_admin',
    access: { mine: true, can_write: true, can_comment: true },
    list: [
      { id: 'p_admin', name: '2026년 9월 임원회의 — 시스템 관리자', created_at: 1, updated_at: 1, published_id: null, page_count: 1 },
      { id: 'p_other', name: '2026년 9월 임원회의 — 김가현', created_at: 1, updated_at: 1, published_id: null, page_count: 1 },
    ],
    bootedFor: 'u_admin',
  })
  useBuilder.setState({ title: '관리자 문서', pages: [{ id: 1, cardKey: 'slide', els: [], fields: {} }], selectedPageId: 1 })
  setActiveProjectId('p_admin')
  setAutosaveReadOnly(true)
  useAutosave.setState({ status: 'saved', savedAt: '2026-09-04T00:00:00Z' })
  pushSnap(1, '{"els":[]}')
}

// ══════════ 로그아웃하면 아무것도 남지 않는다 ══════════
asAdminAtWork()
resetWorkspace()

check(useProjects.getState().list.length === 0, '목록이 비워진다 — 앞사람 자료 제목이 남지 않는다')
check(useBuilder.getState().pages.length === 0, '편집 중이던 문서가 남지 않는다 (제목이 아니라 본문이다)')
check(useProjects.getState().view === 'library', '편집 화면에 착지하지 않는다 — 라이브러리로 돌아간다')
check(useProjects.getState().activeId === null, '열려 있던 자료 id 가 남지 않는다')
check(useProjects.getState().access === null, '앞사람의 권한 판정이 남지 않는다')
check(getActiveProjectId() === null, '자동저장이 가리키던 자료 id 가 남지 않는다')
check(canUndo(1) === false, '되돌리기 기록이 남지 않는다 (앞사람 편집 내용이 들어 있다)')
check(useAutosave.getState().status === 'idle', '자동저장 배지가 「저장됨」으로 남지 않는다')
check(useProjects.getState().bootedFor === null, '다음 로그인 때 서버에 다시 묻는다')

// ══════════ 계정이 바뀌면 자동으로 비워진다 ══════════
// 로그아웃을 거치지 않는 길이 있다 — 세션이 끊겨 로그인 화면으로 튕긴 뒤 다른 계정으로 들어오는 경우.
asAdminAtWork()
await useProjects.getState().boot('u_writer')
check(useProjects.getState().list.length === 0, '다른 계정으로 들어오면 앞사람 목록이 사라진다')
check(useBuilder.getState().pages.length === 0, '다른 계정으로 들어오면 앞사람 문서도 사라진다')
check(useProjects.getState().bootedFor === 'u_writer', '새 계정으로 표시가 바뀐다')

// ══════════ 같은 계정이면 다시 부르지 않는다 ══════════
useProjects.setState({ list: [{ id: 'p1', name: '내 자료', created_at: 1, updated_at: 1, published_id: null, page_count: 1 }] })
await useProjects.getState().boot('u_writer')
check(useProjects.getState().list.length === 1, '같은 계정에서 다시 부르면 이미 받은 목록을 버리지 않는다')

// ══════════ 지우면 안 되는 것 ══════════
// 레거시 초안 이관은 브라우저에 남은 옛 작업본을 "라이브러리가 빈 계정"으로 옮긴다.
// 계정이 바뀔 때마다 다시 돌면, 앞사람의 브라우저 초안이 다음 계정으로 복사된다.
// 고치려는 유출과 정확히 같은 종류의 사고다. 그래서 이 플래그는 건드리지 않는다.
const legacy = await import('./src/persistence/legacyMigration.ts')
const first = await legacy.migrateLegacyDraftOnce()
resetWorkspace()
const second = await legacy.migrateLegacyDraftOnce()
check(first === null && second === null, '레거시 초안 이관은 계정이 바뀌어도 다시 돌지 않는다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
