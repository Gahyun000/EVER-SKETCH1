/**
 * **더블클릭 = 띄어쓰기 기준 낱말 고르기.** (2026-09-21 · 사용자 결정)
 *
 * 사용자: 「기본 글자 상관없이 띄어쓰기를 기준으로 더블클릭했을 때 선택.
 * 머메이드뿐만 아니라 텍스트 전체가 적용이 안 돼 있네.」 — 참고로 보여 준 것은
 * 스프레드시트에서 「성번02_. SAMPLE」을 더블클릭하면 「성번02_.」 가 통째로,
 * 한 번 더 누르면 「SAMPLE」 이 골라지는 모습이었다.
 *
 * 그전까지 캔버스는 더블클릭을 **편집 켜기**로만 쓰고, 켠 뒤에는 누른 자리에
 * 커서만 꽂았다(caretRangeFromPoint → collapse). 브라우저가 해 주던 낱말 고르기를
 * 우리가 덮어쓰고 있었던 것이다. 표 칸·카드·메모는 브라우저 기본값에 맡겨 두어
 * 그나마 낱말이 골라졌지만, **기준이 달랐다** — 브라우저는 ICU 낱말 경계라
 * 「성번02_.」 를 「성번02_」 와 「.」 으로 쪼갠다. 사람이 말한 기준은 띄어쓰기다.
 *
 * 그래서 경계를 **여기 한 곳**에서 정하고 다섯 자리가 모두 이 문으로 들어온다:
 * 캔버스 글자(글상자·도형·마인드맵·트리 노드) 편집 켤 때 / 편집 중 · 표 칸 켤 때 /
 * 편집 중 · 카드 칸 · 메모(textarea). 한 곳이라도 따로 놀면 「여기선 되는데 저기선
 * 안 된다」가 다시 생긴다 — 이번 신고가 바로 그 모양이었다.
 *
 * 세 번 누르면 전체 — 그것은 브라우저 기본값(문단 고르기)에 그대로 맡긴다.
 */

const isSpace = (ch: string) => /\s/.test(ch)

/**
 * `i` 자리에서 띄어쓰기 기준 낱말의 [시작, 끝). 누른 자리가 공백 한가운데면 null.
 *
 * 낱말 **끝**을 누르면(바로 뒤가 공백) 왼쪽 낱말을 준다 — 글자의 오른쪽 절반을
 * 누르면 커서는 그 글자 뒤에 서므로, 그때도 누른 글자가 속한 낱말이어야 한다.
 */
export function wordBounds(text: string, i: number): [number, number] | null {
  let a = Math.max(0, Math.min(i, text.length))
  let b = a
  while (a > 0 && !isSpace(text[a - 1])) a--
  while (b < text.length && !isSpace(text[b])) b++
  return a === b ? null : [a, b]
}

/** 화면 좌표의 글자 자리. 크롬·사파리는 caretRangeFromPoint, 파이어폭스는 caretPositionFromPoint. */
export function caretFromPoint(x: number, y: number): Range | null {
  const d = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  if (d.caretRangeFromPoint) return d.caretRangeFromPoint(x, y)
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y)
    if (!p) return null
    const r = document.createRange()
    r.setStart(p.offsetNode, p.offset)
    r.collapse(true)
    return r
  }
  return null
}

/**
 * contentEditable 안에서 누른 자리의 낱말을 고른다. 골랐으면 true.
 * 누른 자리가 이 칸 밖이거나, 글자 마디가 아니거나(빈 칸), 공백이면 false —
 * 그때는 부르는 쪽이 원래 하던 일(커서 놓기·전체 고르기)을 한다.
 */
export function selectWordAtPoint(root: HTMLElement, x: number, y: number): boolean {
  const cr = caretFromPoint(x, y)
  if (!cr || !root.contains(cr.startContainer) || cr.startContainer.nodeType !== Node.TEXT_NODE) return false
  const t = cr.startContainer as Text
  const w = wordBounds(t.data, cr.startOffset)
  if (!w) return false
  const sel = window.getSelection()
  if (!sel) return false
  const r = document.createRange()
  r.setStart(t, w[0])
  r.setEnd(t, w[1])
  // **글자 위를 눌렀을 때만** 낱말을 고른다. 글줄 끝 뒤의 빈 곳을 누르면 브라우저는
  // 「맨 끝」 자리를 돌려주는데, 그걸 그대로 넓히면 **마지막 낱말이 골라져** 이어 쓰려던
  // 글자가 그 낱말을 지운다(머리글 「… 진행보고」 뒤를 눌러 「 (수정)」 을 붙이던 검사가
  // 실제로 「… (수정)」 이 됐다). 빈 곳은 「거기에 커서」가 맞다.
  const T = 2
  const hit = Array.from(r.getClientRects()).some((b) =>
    x >= b.left - T && x <= b.right + T && y >= b.top - T && y <= b.bottom + T)
  if (!hit) return false
  sel.removeAllRanges()
  sel.addRange(r)
  return true
}

/**
 * **이미 편집 중인 칸**의 더블클릭. 글자 위면 낱말, 빈 곳이면 **그 자리에 커서**.
 *
 * 편집 중에는 브라우저가 먼저 제 방식대로 낱말을 골라 둔다(글줄 끝 뒤 빈 곳을 눌러도
 * 마지막 낱말을 고른다). 그래서 낱말이 아닐 때 **아무것도 안 하면** 브라우저 선택이
 * 그대로 남는다 — 「빈 곳인데 왜 낱말이 골라지지」가 된다. 여기서 반드시 덮는다.
 */
export function selectWordOrCaretAtPoint(root: HTMLElement, x: number, y: number): void {
  if (selectWordAtPoint(root, x, y)) return
  const sel = window.getSelection()
  if (!sel) return
  const cr = caretFromPoint(x, y)
  const r = document.createRange()
  if (cr && root.contains(cr.startContainer)) { r.setStart(cr.startContainer, cr.startOffset) }
  else { r.selectNodeContents(root); r.collapse(false) }
  r.collapse(true)
  sel.removeAllRanges()
  sel.addRange(r)
}

/**
 * textarea·input 은 좌표로 글자 자리를 못 얻는다. 대신 **브라우저가 방금 고른 자리**
 * (더블클릭 기본 동작)에서 시작해 띄어쓰기 기준으로 다시 넓힌다.
 */
export function selectWordInField(el: HTMLTextAreaElement | HTMLInputElement): boolean {
  const i = el.selectionStart
  if (i == null) return false
  const w = wordBounds(el.value, i)
  if (!w) return false
  el.setSelectionRange(w[0], w[1])
  return true
}
