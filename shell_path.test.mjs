// 셸의 주소 — 그리고 **이미 나가 있는 주소를 안 깨뜨렸는가.**
//
// 착수계획이 위험으로 적어 둔 것: 「주소를 넣다 ApprovalViewer 링크가 깨진다 —
// 이미 pathname 을 읽고 있다. **그 경로를 먼저 검사로 못박고 시작한다.**」
// 그래서 이 검사가 셸 코드보다 먼저 있다.
//
// `/view/<id>` 는 승인본 뷰어가 **새 탭으로 여는 주소**다. 팀에 이미 나갔을 수 있고,
// 셸이 그 주소를 먹으면 링크가 조용히 죽는다 — 죽는 자리가 「팀에 공유한 자료」라
// 가장 나쁜 자리다. 여기서는 셸이 그 주소를 **모른다고 답하는지**를 본다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs shell_path.test.mjs

import { viewFromPath, pathOfView, isShellPath } from './src/shell/shellPath.ts'
import { viewerIdFromPath } from './src/teamlib/teamLibraryModel.ts'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

// ── 1. 오가는 길이 맞는가 ──────────────────────────
for (const v of ['library', 'inbox', 'team', 'admin', 'settings']) {
  check(viewFromPath(pathOfView(v)) === v, `주소 ↔ 화면이 왕복한다 · ${v}`,
    `${pathOfView(v)} → ${viewFromPath(pathOfView(v))}`)
}
check(pathOfView('library') === '/', '「내 자료」는 뿌리 주소다')
check(viewFromPath('/') === 'library', '뿌리는 내 자료')
check(viewFromPath('/inbox/') === 'inbox', '끝의 빗금은 무시한다')
check(viewFromPath('') === 'library', '빈 주소도 뿌리로 본다')

// ── 2. **남의 주소를 안 먹는다** ────────────────────
//
// 여기가 이 검사의 이유다.
{
  const VIEWER = '/view/ap_01H9ZZ'
  check(viewerIdFromPath(VIEWER) === 'ap_01H9ZZ', '승인본 뷰어 주소는 여전히 뷰어가 읽는다')
  check(viewFromPath(VIEWER) === null, '**셸은 `/view/<id>` 를 모른다고 답한다**')
  check(isShellPath(VIEWER) === false, '셸이 다루는 주소가 아니라고 말한다')
  check(!Object.values(['/', '/inbox', '/team', '/admin', '/settings'])
    .some((p) => viewerIdFromPath(p)), '셸 주소가 뷰어 주소로 읽히지도 않는다')
}
{
  // 모르는 주소는 조용히 「내 자료」로 바꾸지 않는다 — 그러면 위 검사가 통과해도
  // 부르는 쪽이 뷰어를 덮어쓰게 된다.
  for (const p of ['/view/abc', '/nope', '/inbox/extra', '/team/2026', '/ADMIN']) {
    check(viewFromPath(p) === null, `모르는 주소는 null · ${p}`, String(viewFromPath(p)))
  }
}

// ── 3. 편집 화면은 주소를 안 가진다 ──────────────────
//
// 편집은 「어느 자료냐」가 붙어야 뜻이 생긴다. 그건 주소를 하나 더 늘리는 일이라
// 이번 **최소**에서 뺐다. 나중에 넣더라도 이 사실을 알고 넣게 적어 둔다.
check(viewFromPath('/editor') === null, '편집 화면 주소는 아직 없다 (일부러)')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
