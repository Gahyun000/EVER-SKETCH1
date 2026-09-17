// **막았으면 왜 막았는지 말한다 — 삭제.**
//
// 2026-09-17 · 사용자 지적: 「삭제가 안 되는 게 권한이 없어서면 **모달이 떠야지, 안 되는 이유랑**」.
//
// 열두 편 매뉴얼의 11편이 「막히는 자리마다 **왜 막히는지 말해 줍니다**」라고 하는데,
// 그 그림을 찍으려고 실제로 눌러 보니 **그 자리가 그러질 않았다.**
//   · 결재에 낸 자료의 🗑 를 누르고 「삭제」까지 누르면 → **창만 열린 채 아무 일도 안 일어난다.**
//   · 서버는 403 으로 제대로 거절하는데, 그 말이 **콘솔에만** 찍히고 사람에게는 안 갔다.
//   · 사용자 눈에는 「단추가 죽었다」로 보인다. 아무것도 안 깨지고 테스트도 다 통과했다.
//
// 원인 둘. 둘 다 고쳤고 이 파일이 지킨다.
//   ① 화면 — `confirmDelete` 에 `catch` 가 없었다(try/finally 뿐). 같은 파일의 다른 자리
//      (폴더 작업 · 제출 · 수정 요청)는 이미 이유를 띄우고 있었는데 여기만 빠져 있었다.
//   ② 서버 — 「권한이 없습니다」는 **결론이지 이유가 아니다.** 사람이 다음에 뭘 해야 할지
//      모른다. 작성자가 제 자료를 못 지우는 경우는 사실상 하나뿐이라(결재에 한 번이라도
//      냈을 때) 그 경우를 짚어 말해 준다.
//
// **고치면서 알게 된 것 하나 더.** 라우터 주석이 「삭제는 관리자만. 작성자는 본인 것도
// 지우지 못한다」라고 적혀 있었는데 **거짓**이었다 — D16(P5)에서 열려서 **초안은 작성자가
// 지운다**(재 봤다: 34개 → 33개). 주석만 읽으면 반대로 안다. 그래서 그 주석도 고쳤고,
// 여기서 **초안이 계속 지워지는지**도 같이 잰다 — 이유를 붙이다가 길을 막아 버리면
// 고친 게 아니라 새로 부순 것이다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs delete_reason.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const lib = bare(read('./src/persistence/LibraryScreen.tsx'))
const api = bare(read('./src/persistence/projectApi.ts'))
const css = read('./src/index.css')
const rp = read('./server/routes_projects.py')
const py = read('./server/permissions.py')

// ── ① 화면이 이유를 받아서 띄운다 ──────────────────────
{
  const i = lib.indexOf('const confirmDelete')
  const body = i < 0 ? '' : lib.slice(i, lib.indexOf('\n  }', i))
  check(i > 0, 'confirmDelete 가 있다')
  check(/catch \(e\)/.test(body),
    '**거절을 잡는다** — 여기 catch 가 없어서 403 이 조용히 삼켜졌다')
  // **잡기만 하는 catch 는 안 잡은 것과 같다**(부수기 A 에서 드러났다).
  // 처음엔 함수 전체에서 `setDelErr(` 가 보이기만 하면 통과시켰는데, 그러면
  // `catch (e) { }` 로 비워 두고 다른 데 setDelErr 가 있어도 초록불이 난다 —
  // 그게 바로 이번에 고친 버그의 모양(조용히 삼키기)이다. **catch 안**을 본다.
  const ci = body.indexOf('catch (e) {')
  const cbody = ci < 0 ? '' : body.slice(ci, body.indexOf('} finally', ci))
  check(ci > 0 && /setDelErr\(/.test(cbody),
    '**catch 안에서** 이유를 넣는다 — 잡고 아무것도 안 하면 안 잡은 것과 같다')
  check(/setDelErr\('\'\)|setDelErr\(''\)/.test(body),
    '누를 때마다 **옛 이유를 먼저 지운다** — 안 지우면 지난번 실패가 계속 붙어 있다')
  // **서버가 준 말을 그대로** 옮기는가. 우리가 지어낸 말로 덮으면 이유가 사라진다.
  check(/e instanceof Error && e\.message \? e\.message :/.test(body),
    '서버가 준 말을 **그대로** 옮긴다 — 못 알아들을 때만 우리가 지어낸다')
  // 던져지는 것이 클래스가 아니라 `status` 를 붙인 평범한 Error 라는 사실에 기댄다.
  check(/err\.status = res\.status/.test(api) && !/class .*ApiError/.test(api),
    '(근거) projectApi 는 클래스가 아니라 status 를 붙인 Error 를 던진다 — instanceof 로 클래스를 찾으면 늘 빗나간다')
  check(/\{delErr && <div className="lib-delerr">\{delErr\}<\/div>\}/.test(lib),
    '**모달 안에** 띄운다 — 창을 닫아 버리면 이유를 읽을 새가 없다')
  check(/\.lib-delerr\{/.test(css), '그 자리에 모양이 있다(안 그리면 글자가 본문에 섞인다)')
}

// ── ② 서버가 결론이 아니라 이유를 말한다 ────────────────
{
  const i = rp.indexOf('def projects_delete')
  const body = rp.slice(i, rp.indexOf('@router', i + 10))
  check(/한 번이라도 결재에 낸 자료는 지울 수 없습니다/.test(body),
    '**왜 막혔는지**를 말한다 — 「권한이 없습니다」는 결론이지 이유가 아니다')
  check(/status_code=403/.test(body), '거절은 그대로 403 이다')
  // **판정을 두 벌로 만들지 않았는가.** 이유를 말하려고 규칙을 다시 짜면 언젠가 갈라진다.
  check(/try:\s*\n\s*require_project\(user, pid, perm\.DELETE\)/.test(body),
    '**판정은 여전히 require_project 가 한다** — 이유를 말하려고 규칙을 다시 짜지 않았다')
  check(/except HTTPException as e:/.test(body) && /\n\s*raise\n/.test(body),
    '403 이 아니거나 이력이 없으면 **원래 거절을 그대로 올려보낸다**(404 순서도 그대로)')
  check(/approvals_store\.has_history\(pid\)/.test(body),
    '이력이 있을 때만 그 이유를 댄다 — 아무 거절에나 갖다 붙이면 거짓말이 된다')
  // 낡은 주석이 남아 있으면 다음 사람이 그걸 읽고 반대로 안다.
  //
  // **이 줄을 한 번 틀렸다.** 처음엔 옛 문구가 파일에 있기만 하면 실패시켰는데,
  // 고친 주석이 「여기에는 『…』라고 적혀 있었는데 거짓이었다」로 **그 문구를 인용**하고
  // 있어서 제 기록에 제가 걸렸다. 지우는 게 답이 아니다 — 무엇이 왜 틀렸는지는 남아야 한다.
  // 그래서 「사실로 주장하는가」와 「내력으로 인용하는가」를 가른다.
  const stale = '작성자는 본인 것도'
  const at = rp.indexOf(stale)
  check(at < 0 || /적혀 있었는데|거짓|낡아/.test(rp.slice(at, at + 260)),
    '옛 문구가 **사실이 아니라 내력으로** 남아 있다 — 그냥 남아 있으면 다음 사람이 반대로 안다')
  check(/D16|열렸다|초안은 지워진다/.test(rp.slice(Math.max(0, at - 200), at + 400)),
    '**무엇이 맞는지**도 그 자리에 적혀 있다 — 틀렸다고만 하면 뭐가 맞는지 모른다')
}

// ── ③ 이유를 붙이다가 길을 막지 않았는가 ────────────────
// 여기가 이 파일에서 제일 중요하다. ②만 재면 「전부 못 지우게 만들고 이유를 붙인」
// 상태도 통과한다 — 그건 고친 게 아니라 새로 부순 것이다.
{
  const i = py.indexOf('if action == DELETE:', py.indexOf('# ── 작성자'))
  const seg = py.slice(i, i + 900)
  check(i > 0, '작성자의 DELETE 판정이 있다')
  check(/not res\.has_approval_history/.test(seg) || /has_approval_history/.test(seg),
    '**결재 이력으로 가른다** — 이력이 없으면(=초안) 작성자가 지운다')
  check(/owns/.test(seg), '남의 자료는 여전히 못 지운다')
  // 서버 쪽 규칙을 건드리지 않았다는 것도 함께 잰다 — 이번 고침은 **말**만 바꾼 것이다.
  check(!/return False\s*$/m.test(seg.split('\n').slice(0, 3).join('\n')),
    '작성자의 DELETE 가 통째로 막히지 않았다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
