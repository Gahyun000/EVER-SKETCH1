// 폴더 화면의 **확정된 값과 규칙**을 소스에서 지킨다 (계획서 D24~D29).
//
// 이 값들은 시안 v0.6~v0.9 를 오가며 정해진 결론이다. 숫자만 남으면
// 다음에 누가 「5칸은 좀 적은데」 하고 바꿨을 때 왜 5였는지 아무도 모른다.
// 장치 VM 에 브라우저가 없어 화면을 눈으로 못 보므로, 눈 대신 여기서 못박는다.
//
// 실행: node folder_screen.test.mjs

import { readFileSync } from 'node:fs'
const read = (p) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8')

let pass = 0, fail = 0
const check = (cond, label) => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label) }
}

const nav = read('./src/persistence/folderNav.ts')
const lib = read('./src/persistence/LibraryScreen.tsx')
const css = read('./src/index.css')

/** 주석을 걷어낸 코드. 「토글을 두지 않는다」는 **설명**이 「토글이 있다」로 읽히면 안 된다. */
const bare = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const libCode = bare(lib)

// ── 확정값 (D24 · D25 · D26 · D28) ──
check(/PAGE_WINDOW = 5/.test(nav), 'D25 — 쪽 번호 창 5칸')
check(/PATH_VISIBLE = 4/.test(nav), 'D26 — 경로는 4칸까지 다 보인다')
check(/const PAGE_SIZE = 12/.test(lib), 'D28 — 자료 한 쪽 12건')
check(/grid-template-columns:repeat\(5,1fr\)/.test(css), '폴더 한 줄 5개')
check(/MAX_DEPTH = 3/.test(read('./server/folders.py')), 'D24 — 폴더 최대 깊이 3')
check(/max_depth/.test(lib), '깊이는 **서버가 정한 값**을 받아 쓴다 — 화면이 숫자를 따로 들지 않는다')

// ── 「…」을 다루는 두 가지 답 ──
// **쪽 번호 막대 안만 본다.** 예전에는 `lib-pagebar` 뒤 **전부**를 봤는데,
// 그 아래에 확인창들이 있어서 「제출 중…」 같은 정상적인 라벨이 걸렸다(2026-09-08).
// 규칙은 「쪽 번호에 …을 쓰지 않는다」이지 「이 파일 아래쪽에 …을 쓰지 않는다」가 아니다.
const pagebar = (lib.match(/<div className="lib-pagebar">[\s\S]*?\n {8}<\/div>/) || [''])[0]
check(pagebar.length > 0, '(사전) 쪽 번호 막대를 찾았다 — 못 찾으면 아래 검사가 조용히 통과한다')
check(/pageWindow\(/.test(lib) && !/…/.test(pagebar),
  'D25 — 쪽 번호에는 「…」이 없다 (창을 고정해 끊길 자리를 없앴다)')
check(/lib-crumb-i dots|className=\{?'lib-crumb-i dots|dots["'][\s\S]{0,120}onClick/.test(lib),
  'D26 — 경로의 「…」은 **눌리는 버튼**이다 (지나온 길은 없앨 수 없다)')
check(/setPathOpen\(true\)/.test(lib), '「…」을 누르면 접힌 경로가 펼쳐진다')

// ── 검색 범위 (D27 · D29) ──
check(/scopedProjects\(/.test(lib), '목록·검색 범위를 순수 함수가 판정한다')
check(/scopeLabel\(path\)/.test(lib), 'D27 — 범위를 **글자로** 말한다')
check(!/이 폴더에서/.test(libCode) && !/scopeMode|setScope\(/.test(libCode),
  'D27 — 「전체에서 / 이 폴더에서」 토글이 없다 (주석의 설명은 빼고 본다)')
check(!/깊이\s*\{/.test(lib) && !/>깊이</.test(lib), 'D29 — 「깊이」 같은 군더더기를 안 띄운다')
check(/searching \? subtreeIds|searching \?/.test(nav),
  'D27 — 목록은 한 단계, 검색은 하위 전부')

// ── 폴더 삭제 (D20) ──
check(/빈 폴더|비어 있지 않습니다/.test(lib), 'D20 — 빈 폴더만 지운다고 화면이 먼저 말한다')
check(/folder_count \|\| fPendingDel\.project_count/.test(lib),
  '무엇이 남았는지 세어서 보여준다 — 「못 지웁니다」만 하면 왜인지 모른다')
check(/lib-confirm-box[\s\S]{0,400}폴더 삭제/.test(lib), '자체 확인창을 쓴다(브라우저 confirm 금지)')

// ── 새 자료는 지금 폴더에 ──
check(/newProject\(here\)/.test(lib) && /newFromTemplate\(ym, here\)/.test(lib),
  '새 이북은 **지금 보고 있는 폴더**에 만든다 — 만들고 옮기게 하면 두 번 일한다')
check(/canCreateHere\(path\.length, maxDepth\)/.test(lib),
  '3단에서는 「새 폴더」가 꺼진다')

// ── 두 줄 깨짐 방지 (표준 공통 UI 기준) ──
for (const k of ['lib-folder-name', 'lib-folder-sub', 'lib-crumb-i', 'lib-scope']) {
  check(new RegExp(`\\.${k}\\{[^}]*white-space:nowrap`).test(css), `.${k} 는 낱말이 안 끊긴다`)
}

// ── 폴더 상태는 화면이 들고 있다 (P1.5 의 교훈) ──
check(/useState<FolderRow\[\]>/.test(lib),
  '폴더는 모듈 스토어가 아니라 화면 상태다 — 스토어에 두면 계정이 바뀌어도 안 지워진다')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
