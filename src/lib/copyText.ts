// 클립보드 복사 — 보안 컨텍스트가 아닌 곳(사내 IP + HTTP)에서도 동작해야 한다.
//
// navigator.clipboard 는 secure context(HTTPS 또는 localhost)에서만 존재한다.
// 사내 서버를 http://192.168.x.x 또는 http://<공인IP> 로 띄우면 이 API 자체가 undefined 라서,
// 개발 PC(localhost)에서는 멀쩡히 되고 임원 브라우저에서만 조용히 실패한다.
// 그래서 execCommand('copy') 폴백을 둔다. 성공 여부를 boolean 으로 돌려주고,
// 호출부는 실패를 사용자에게 알려야 한다(조용히 삼키면 "눌렀는데 아무 일도 안 남"이 된다).
export async function copyText(text: string): Promise<boolean> {
  // 1순위: 표준 API (HTTPS·localhost)
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* 권한 거부 등 — 폴백으로 내려간다 */
    }
  }
  // 2순위: execCommand 폴백 (http + IP)
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    // 화면 밖으로 빼되 display:none 은 쓰지 않는다(선택이 안 잡힘).
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    const sel = document.getSelection()
    const prev = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    // 사용자가 원래 선택해 둔 영역을 되돌린다.
    if (prev && sel) { sel.removeAllRanges(); sel.addRange(prev) }
    return ok
  } catch {
    return false
  }
}
