// **더블클릭 = 띄어쓰기 기준 낱말.** (2026-09-21)
//
// 사용자: 「기본 글자 상관없이 띄어쓰기를 기준으로 더블클릭했을 때 선택. 머메이드뿐만
// 아니라 텍스트 전체가 적용이 안 돼 있네.」 참고 화면: 스프레드시트에서 「성번02_. SAMPLE」 을
// 더블클릭하면 「성번02_.」 가 통째로 골라진다.
//
// ① 경계 규칙(wordBounds)을 순수 함수로 재고
// ② 다섯 자리가 **모두 같은 문**으로 들어오는지 본다 — 한 곳이라도 따로 놀면
//    「여기선 되는데 저기선 안 된다」가 다시 생긴다. 이번 신고가 그 모양이었다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs word_select.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const { wordBounds } = await import('./src/lib/wordSelect.ts')
const pick = (s, i) => { const w = wordBounds(s, i); return w ? s.slice(w[0], w[1]) : null }

// ── ① 경계 ─────────────────────────────────────────────
check(pick('성번02_. SAMPLE', 2) === '성번02_.', '「성번02_.」 는 한 낱말이다 — 밑줄·마침표에서 쪼개지 않는다(참고 화면 그대로)', pick('성번02_. SAMPLE', 2))
check(pick('성번02_. SAMPLE', 11) === 'SAMPLE', '뒤 낱말을 누르면 뒤 낱말', pick('성번02_. SAMPLE', 11))
check(pick('가지 2', 1) === '가지', '「가지 2」 의 「가지」', pick('가지 2', 1))
check(pick('가지 2', 4) === '2', '「가지 2」 의 「2」')
check(pick('가지 2', 2) === '가지', '낱말 **끝**을 누르면(커서가 글자 뒤) 그 낱말 — 글자 오른쪽 절반을 누른 경우', pick('가지 2', 2))
check(pick('품질 관리팀', 4) === '관리팀', '한글 낱말도 띄어쓰기로만 자른다')
check(pick('a  b', 2) === null, '공백 한가운데는 아무 낱말도 아니다(부르는 쪽이 커서를 놓는다)')
check(pick('첫줄\n둘째줄', 4) === '둘째줄', '줄바꿈도 경계다')
check(pick('', 0) === null, '빈 칸은 null')
check(pick('Lv1·Lv2·Lv3', 5) === 'Lv1·Lv2·Lv3', '가운뎃점은 경계가 아니다 — 띄어쓰기만 경계다')
check(pick('끝', 99) === '끝', '범위 밖 자리는 끝으로 붙인다')

// ── ② 다섯 자리가 같은 문으로 ─────────────────────────────
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
const fl = bare(readFileSync('./src/canvas/FreeLayer.tsx', 'utf8'))
const pv = bare(readFileSync('./src/cards/PageView.tsx', 'utf8'))
const nb = bare(readFileSync('./src/builder/NoteBlocks.tsx', 'utf8'))

check(/if \(at\) \{ selectWordOrCaretAtPoint\(n, at\.x, at\.y\); return \}/.test(fl) && fl.indexOf('if (at) { selectWordOrCaretAtPoint') < fl.indexOf('if (!sel.isCollapsed) return', fl.indexOf('if (at) { selectWordOrCaretAtPoint') - 400),
  '[캔버스 글자 · 켤 때] 누른 낱말을 고른다 — 커서만 꽂던 자리')
check(!/\(document as any\)\.caretRangeFromPoint/.test(fl),
  '[캔버스] 좌표→글자 자리를 **따로** 구하는 옛 줄이 남아 있지 않다(한 문으로)')
check(/onDoubleClick=\{\(e\) => \{\s*e\.stopPropagation\(\)\s*selectWordOrCaretAtPoint\(e\.currentTarget, e\.clientX, e\.clientY\)/.test(fl),
  '[캔버스 글자 · 편집 중] 같은 기준 + 바깥 더블클릭으로 새지 않는다')
check(/onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}\s*onDoubleClick=\{\(e\) => \{\s*e\.stopPropagation\(\)\s*selectWordOrCaretAtPoint/.test(fl),
  '[캔버스 글자 · 편집 중] 글자 위 누름이 도형 끌기로 새지 않는다(끌어 고르기·세 번 누르기가 살아 있다)')
check(/if \(editingThis\) \{ e\.stopPropagation\(\); selectWordOrCaretAtPoint\(e\.currentTarget, e\.clientX, e\.clientY\); return \}/.test(fl),
  '[표 칸 · 편집 중] 브라우저 기본(ICU)에 맡기지 않는다')
check(/node\.focus\(\)\s*selectWordOrCaretAtPoint\(node, x, y\)/.test(fl),
  '[표 칸 · 켤 때] 켜자마자 누른 낱말까지')
check((pv.match(/onDoubleClick=\{\(e\) => \{ selectWordOrCaretAtPoint\(e\.currentTarget, e\.clientX, e\.clientY\) \}\}/g) || []).length === 3,
  '[카드 칸] 세 종류(Ef · EfIn · EfPair) 모두')
check(/onDoubleClick=\{\(e\) => \{ selectWordInField\(e\.currentTarget\) \}\}/.test(nb),
  '[메모 textarea] 같은 기준')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
