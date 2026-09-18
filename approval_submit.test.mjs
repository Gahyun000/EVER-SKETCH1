// **결재 제출은 두 걸음이다 — 그리고 「저장 중」은 경고가 아니다.**
//
// 2026-09-18 · 사용자가 영상을 보내며 말했다. 「제출을 눌렀을 때 제출하시겠습니까?
// 모달 뜨고 확인을 누르면 제출이 돼야지.」 재 보니 한 걸음이었다 — 「제출」이 곧 제출이었다.
// 시안 넷을 거쳐(v1.0 → v2.2) 두 걸음으로 줄었고, 세 걸음째로 두려던 「냈습니다 · 회수 안내」는
// ② 안으로 들어갔다. **낸 뒤에 「회수할 수 있다」를 들으면 「그럼 아까 말하지」가 된다.**
//
// 같이 고친 것: 제출을 누르는 **모든** 사람에게 25ms 스치던 노란 「저장 안 된 변경이
// 있습니다」. `unsaved` 가 `saving` 까지 한 덩어리로 묶고 있었고, 제출은 반드시
// `flushSave()` 를 거치므로 그 덩어리를 **반드시** 지났다.
//
// ── 이 파일이 조심하는 것 ──
// 1. 「파일 어딘가에 있으면 통과」를 하지 않는다. 걸음마다 **자리를 잘라서** 본다 —
//    ② 에 있어야 할 회수 안내가 ① 에 적혀 있어도 통과하면 가드가 아니다.
// 2. 주석을 먼저 지운다. 이 파일이 지키는 말(회수·확인·제출하시겠습니까)은
//    **코드 주석에도** 적혀 있어서, 안 지우면 주석이 자기를 지키는 꼴이 된다.
//    JSX 주석 `{/* */}` 을 먼저 지운다 — `/* */` 부터 지우면 `{}` 만 남아
//    「A 바로 다음이 B」 같은 검사가 어긋난다.
// 3. 저장 상태 셋은 **글자로 견주지 않고 실제로 돌려서** 잰다. 앱이 쓰는 식을 그대로
//    꺼내 다섯 가지 status 에 먹여 본다 — 여기에 같은 식을 베껴 쓰면 베낀 것을 재게 된다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs approval_submit.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (c, label, extra = '') => {
  if (c) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}

const RAW = readFileSync('./src/builder/chrome/ApprovalCard.tsx', 'utf8')
const CSS = readFileSync('./src/builder/chrome.css', 'utf8')

/** 주석을 지운다 — JSX 주석부터. (위 ②) */
function bare(t) {
  return t
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}
const SRC = bare(RAW)

/** a 와 b 사이를 잘라 준다. 못 찾으면 빈 글자 — 검사는 실패로 떨어진다. */
function cut(t, a, b) {
  const i = t.indexOf(a)
  if (i < 0) return ''
  const j = b ? t.indexOf(b, i + a.length) : -1
  return j < 0 ? t.slice(i) : t.slice(i, j)
}

// ── ⓪ 자르기 자체가 됐는지부터 ─────────────────────────
const MODAL = cut(SRC, '{ask && (', '\n  </>)')
check(MODAL.length > 800, '결재 창 덩어리를 찾았다', `${MODAL.length}자`)

// ── ① 걸음이 둘이다 ────────────────────────────────────
{
  check(/const \[step2, setStep2\] = useState\(false\)/.test(SRC),
    '**처음은 ① 이다** — step2 의 첫 값이 false')

  const FOOT = cut(MODAL, 'footer={', '\n        }>')
  check(FOOT.length > 200, '단추 자리를 찾았다', `${FOOT.length}자`)
  // 「제출」이 곧 제출이면 두 걸음이 아니다. 넘어가는 줄이 send 보다 **먼저** 와야 한다.
  const iJump = FOOT.indexOf('setStep2(true)')
  const iSend = FOOT.indexOf('send(ask)')
  check(iJump > 0 && iSend > 0 && iJump < iSend,
    '① 의 단추는 **아직 안 낸다** — step2 로 넘긴 뒤 return, 그 다음이 send',
    `jump=${iJump} send=${iSend}`)
  check(/if \(ask === 'submit' && !step2\)[\s\S]{0,220}?return\s/.test(FOOT),
    '넘어가는 갈래는 **제출일 때만**이고 return 으로 끊는다 — 안 끊으면 넘어가면서 같이 낸다')
  check(/step2 \? '확인' : '제출'/.test(FOOT), '단추 글자가 걸음 따라 바뀐다(제출 → 확인)')
  check(!/ask === 'revise'[\s\S]{0,80}setStep2/.test(FOOT),
    '수정 요청·그만두기는 **한 걸음 그대로**다 — 두 걸음은 제출에만 붙인다')

  const TITLE = cut(MODAL, 'title={', 'size="sm"')
  check(/step2 \? '제출하시겠습니까\?' : '결재 제출'/.test(TITLE),
    '창 이름이 걸음 따라 바뀐다 — 같은 이름이면 넘어간 줄을 모른다')
}

// ── ② 「취소」는 창을 닫지 않고 ① 로 돌아온다 ─────────────
{
  const CANCEL = cut(MODAL, 'cancel={{', '\n        }}')
  check(CANCEL.length > 40, '취소 자리를 찾았다', `${CANCEL.length}자`)
  check(/if \(step2\) \{ setStep2\(false\)/.test(CANCEL),
    '**② 의 취소는 ① 로 돌아온다** — 적어 둔 「전달할 말」이 망설였다고 날아가면 안 된다')
  check(/\} else closeAsk\(\)/.test(CANCEL), '① 의 취소는 창을 닫는다')
  // 돌아오는 갈래에서 창까지 닫으면 뒤로 오는 길이 아니라 그냥 나가는 길이다.
  const back = cut(CANCEL, 'if (step2)', 'else')
  check(back.length > 0 && !/setAsk\(null\)|closeAsk\(/.test(back),
    '돌아오는 갈래는 **창을 닫지 않는다**', back.trim())
}

// ── ③ 회수 안내는 ② 에만 있다 ──────────────────────────
{
  const S2 = cut(MODAL, "{ask === 'submit' && step2 ? (", ') : (<>')
  const S1 = cut(MODAL, ') : (<>', '{err &&')
  check(/apc-ask-in/.test(S2),
    '② 의 본문은 **한 덩어리로 감싸** 있다 — 바깥이 세로 flex 라, 안 감싸면 한 문장이 줄마다 갈린다')
  check(S2.length > 80 && S1.length > 300, '두 걸음의 본문을 각각 찾았다', `②${S2.length} ①${S1.length}`)
  check(/apc-ok/.test(S2) && /결재함에서 회수/.test(S2), '② 가 **회수할 수 있다**고 말한다')
  check(/이력에는 남습니다/.test(S2),
    '② 가 **회수해도 이력엔 남는다**고 같이 말한다 — 안 적으면 「없던 일로 되는구나」로 읽힌다')
  check(!/회수/.test(S1), '① 에는 회수 얘기가 없다 — ① 은 읽을 것이 이미 많다', S1.match(/.{0,40}회수.{0,40}/)?.[0] || '')
  check(/apc-danger/.test(S1) && /얼어붙습니다/.test(S1),
    '① 의 「얼어붙는다」는 **빨간 칸**에 든다 — 회색 본문에 묻히면 입력 칸이 더 세다')
  check(!/apc-danger/.test(S2), '② 에는 빨간 칸이 없다 — ② 는 묻기만 하는 자리다')
  // **겁주는 말 옆에는 나가는 길이 있어야 한다**(2026-09-18 · 사용자 지시 「같은 투로 맞춰」).
  // 카드는 「반려 시 수정 가능」이라 적어 놓고 창은 얼어붙는다고만 하면 둘 다 안 믿긴다.
  check(/반려되면 고쳐서 다시 냅니다/.test(S1), '① 이 **반려되면 다시 낸다**고 같이 말한다')
  check(/승인된 뒤에 고치려면 <b>수정 요청<\/b>/.test(S1),
    '승인 뒤의 길도 적는다 — **화면에 실제로 있는 단추 이름**으로')
  // 없는 단추를 가리키면 그 말은 길이 아니라 막다른 골목이다.
  // (카드 본문은 사용자가 손보는 자리라 여기서 재지 않는다 — 창만 본다.)
  check(!/반려 요청/.test(S1), '창이 「반려 요청」이라는 없는 단추를 가리키지 않는다')
  check(/>수정 요청</.test(SRC), '「수정 요청」은 실제로 있는 단추다', '')
  // 카드 본문도 같은 자를 댄다(2026-09-18 · 사용자 승인). 한동안 「승인되면 **반려 요청**
  // 해야함」이라 적혀 있었는데, 승인된 자료의 카드에 달린 단추 이름은 「수정 요청」이다.
  // 없는 단추 이름은 길이 아니라 막다른 골목이라, 창에만 자를 대면 반쪽이다.
  const CARD = cut(SRC, "{shape === 'draft' && (", '<div className="apc-chk">')
  check(CARD.length > 40, '카드의 초안 안내를 찾았다', `${CARD.length}자`)
  check(!/반려 요청/.test(CARD), '카드도 「반려 요청」이라는 없는 단추를 가리키지 않는다',
    CARD.match(/.{0,40}반려 요청.{0,20}/)?.[0] || '')
  check(/수정 요청/.test(CARD), '카드가 승인 뒤의 길을 **실제 단추 이름**으로 가리킨다', CARD.trim())
  // 적으라는 칸이 ② 에 또 나오면 「확인만 하면 되는 줄 알았는데」가 된다.
  const INPUT = cut(MODAL, "{ask !== 'end'", 'lib-mkin')
  check(/!step2/.test(INPUT), '전달할 말 입력 칸은 ② 에 없다', INPUT.trim().slice(0, 80))
}

// ── ④ 두 걸음의 높이를 맞춘다(사용자 결정 ㉡) ─────────────
{
  const FOOT = cut(MODAL, 'footer={', '\n        }>')
  check(/setFixH\(askRef\.current\?\.offsetHeight \|\| 0\)/.test(FOOT),
    '**① 을 넘어가는 그 순간에 잰다** — 사람이 마지막으로 본 높이가 그 높이다')
  const iH = FOOT.indexOf('setFixH('), iS = FOOT.indexOf('setStep2(true)')
  check(iH > 0 && iS > 0 && iH < iS,
    '재고 나서 넘긴다 — 순서가 바뀌면 ② 를 재게 된다', `fixH=${iH} step2=${iS}`)
  const WRAP = cut(MODAL, '<div ref={askRef}', '>\n          {ask')
  check(/className=\{'apc-ask' \+ \(step2 \? ' fix' : ''\)\}/.test(WRAP), '② 에만 fix 를 붙인다')
  check(/style=\{step2 && fixH \? \{ minHeight: fixH \} : undefined\}/.test(WRAP),
    '잰 높이를 ② 에 물린다 — minHeight 라 ② 가 더 길면 그냥 길어진다', WRAP.trim().slice(0, 120))
  const cssBare = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = cut(cssBare, '.apc-ask.fix{', '}')
  check(/justify-content:center/.test(rule) && /flex/.test(rule),
    '남는 자리를 위아래로 나눠 갖는다 — 위로 몰리면 단추 줄이 그대로여도 글이 뛴다', rule)
}

// ── ⑤ 창을 아주 닫으면 걸음도 처음으로 ──────────────────
{
  const CLOSE = cut(SRC, 'const closeAsk = ()', '\n\n')
  check(/setAsk\(null\)/.test(CLOSE) && /setStep2\(false\)/.test(CLOSE) && /setErr\(''\)/.test(CLOSE),
    'closeAsk 는 셋을 다 되돌린다 — 닫았다 여니 ② 가 떠 있으면 무엇에 확인하는지 모른다', CLOSE.trim())
  check(/onClose=\{\(\) => \{ if \(!busy\) closeAsk\(\) \}\}/.test(MODAL),
    'Esc·바깥 누르기도 같은 길로 닫는다 — 여기만 빠뜨리면 거기서만 걸음이 남는다')
  const SEND = cut(SRC, 'const send = (kind:', '/** 「낸 것 보기」')
  check(/setAsk\(null\); setStep2\(false\); setMsg\(''\)/.test(SEND),
    '내고 나서도 걸음을 처음으로 돌린다')
  check(/catch \(e\)/.test(SEND) && !/setStep2/.test(cut(SEND, 'catch (e)', 'finally')),
    '**실패하면 ② 에 그대로 선다** — ① 로 튕기면 무엇이 잘못됐는지 못 읽는다')
}

// ── ⑥ 「저장 중」은 「저장 안 됨」이 아니다 ────────────────
{
  // 앱이 쓰는 식을 **그대로 꺼내서** 다섯 status 에 먹여 본다.
  const grab = (name) => {
    const m = SRC.match(new RegExp('const ' + name + " = ([^\\n]+)"))
    return m ? m[1].trim() : null
  }
  const exprs = { dirty: grab('dirty'), saving: grab('saving'), unsaved: grab('unsaved') }
  check(!!exprs.dirty && !!exprs.saving && !!exprs.unsaved, '셋 다 적혀 있다', JSON.stringify(exprs))
  const val = (name, status, d, s) =>
    Function('status', 'dirty', 'saving', 'return (' + exprs[name] + ')')(status, d, s)
  const WANT = {
    idle:   { dirty: false, saving: false, unsaved: false },
    saved:  { dirty: false, saving: false, unsaved: false },
    dirty:  { dirty: true,  saving: false, unsaved: true  },
    error:  { dirty: true,  saving: false, unsaved: true  },
    saving: { dirty: false, saving: true,  unsaved: true  },
  }
  for (const [st, w] of Object.entries(WANT)) {
    const d = val('dirty', st), s = val('saving', st), u = val('unsaved', st, d, s)
    check(d === w.dirty && s === w.saving && u === w.unsaved,
      `status='${st}' → dirty=${w.dirty} saving=${w.saving} unsaved=${w.unsaved}`,
      `실제 dirty=${d} saving=${s} unsaved=${u}`)
  }

  // 노란 칸이 붙는 **자리마다** 본다. 한 군데만 고치고 넘어가기 쉬운 곳이다.
  const S1 = cut(MODAL, ') : (<>', '{err &&')
  check(/\{dirty && <div className="apc-note">저장 안 된/.test(S1),
    '창의 노란 칸은 **dirty 일 때만** — 여기가 25ms 깜빡이던 자리다',
    S1.match(/.{0,30}apc-note.{0,30}/)?.[0] || '')
  check(!/unsaved/.test(S1), '창 본문에 unsaved 가 남아 있지 않다')

  const CHK = cut(SRC, '<div className="apc-chk">', '{toMe > 0 &&')
  check(/dirty \? 'no' : saving \? 'wait' : 'ok'/.test(CHK),
    '카드 체크줄도 셋으로 갈린다 — 저장 중은 wait(회색)')
  check(/saving \? '저장 중…'/.test(CHK), '저장 중에는 **「저장 중…」**이라고 적는다')
  check(/\{dirty \? <span className="go">낼 때 저장합니다<\/span> : null\}/.test(CHK),
    '「낼 때 저장합니다」는 dirty 일 때만 — 저장 중에 이 말은 거짓이다')

  const BRIEF = cut(SRC, 'const brief = ', '.filter(Boolean)')
  check(/dirty \? '저장 안 됨' : saving \? '저장 중' : ''/.test(BRIEF),
    '접힌 줄 요약도 갈린다 — 여기만 빠뜨리면 접어 둔 사람에게는 그대로 거짓말이다', BRIEF.trim())

  const cssBare = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  const wait = cut(cssBare, '.apc-chk .wait{', '}')
  check(wait.length > 0, 'wait 색이 정해져 있다')
  check(!/#D98A2A|#8a5a12|#FFF4E3/i.test(wait),
    '**wait 는 노랑이 아니다** — 색이 같으면 갈라 놓은 뜻이 화면에 안 나온다', wait)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
