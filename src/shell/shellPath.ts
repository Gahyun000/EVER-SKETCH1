// 셸의 주소 — **라우터 없이 최소만**(사용자 결정 ㄴ).
//
// 지금까지 화면은 둘(라이브러리·편집)이었고 나머지는 전부 덮개였다. 덮개는
// **뒤로 가기도 새로고침도 안 통한다** — 결재함을 열어 두고 새로 고치면 내 자료로 돌아온다.
// 남에게 「결재함 열어 봐」라고 주소를 줄 수도 없다.
//
// **라이브러리를 안 들인 이유.** 갈래가 여섯뿐이고, 이 앱에는 이미 주소를 읽는 자리가
// 둘 있다(`viewerIdFromPath`, `wantsSharedFromSearch`). 습관이 코드에 있으니
// 의존성을 하나 늘리는 것보다 이 파일 하나가 낫다.
//
// **`/view/<id>` 는 절대 건드리지 않는다.** 그건 승인본 뷰어가 새 탭으로 여는 주소고,
// 팀에 이미 나갔을 수 있다. 여기서 `/view` 를 먹어 버리면 그 링크가 조용히 죽는다 —
// 죽는 자리가 「팀에 공유한 자료」라 가장 나쁜 자리다. 그래서 이 파일은 `/view` 를
// **모르는 주소로 돌려주고**, 검사가 그 사실을 못박는다.

export type ShellView = 'library' | 'inbox' | 'team' | 'users' | 'admin' | 'settings'

/** 주소 한 조각 ↔ 화면. 편집 화면은 여기 없다 —
 *  편집은 「어느 자료냐」가 붙어야 뜻이 생기는데, 그건 주소를 하나 더 늘리는 일이라
 *  이번 최소에서 뺐다. 편집 중 새로고침은 지금처럼 목록으로 돌아온다. */
const PATHS: Record<ShellView, string> = {
  library: '/',
  inbox: '/inbox',
  team: '/team',
  users: '/users',
  admin: '/admin',
  settings: '/settings',
}

/** 주소를 화면으로. **모르면 `null`** — 부르는 쪽이 「내 자료」로 둘지 정한다.
 *  여기서 조용히 `library` 로 바꿔 버리면 `/view/xxx` 같은 남의 주소까지
 *  「내 자료」라고 답하게 되고, 그게 뷰어를 죽이는 길이다. */
export function viewFromPath(pathname: string): ShellView | null {
  const p = String(pathname || '').replace(/\/+$/, '') || '/'
  if (p === '/') return 'library'
  for (const k of Object.keys(PATHS) as ShellView[]) {
    if (k !== 'library' && PATHS[k] === p) return k
  }
  return null
}

/** 화면을 주소로. */
export function pathOfView(v: ShellView): string {
  return PATHS[v] || '/'
}

/** 이 주소가 셸이 다루는 것인가. `/view/<id>` 처럼 **남의 주소**를 가려낸다. */
export function isShellPath(pathname: string): boolean {
  return viewFromPath(pathname) !== null
}
