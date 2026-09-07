// 사람이 마지막으로 고른 화면 설정. **이 브라우저에만** 남는다.
//
// 왜 필요한가
//   새 이북은 늘 세로로 시작했다 — `emptySnapshot()` 에 'portrait' 가 박혀 있었다.
//   오른쪽 패널에서 가로로 바꿀 수는 있지만 다음에 새로 만들면 또 세로다.
//   임원진 요청: 「가로 세로 변경 기능 추가. 한번 선택을 하면 이후 부터는 그 설정으로
//   계속 생성이 되어야 함」 — 앞의 절반은 이미 있었고, 뒤의 절반이 없었다.
//
// 왜 서버가 아니라 브라우저인가
//   이건 문서의 성질이 아니라 **그 사람의 손버릇**이다. 서버에 두면 계정 설정이 되고,
//   그러면 「관리자가 남의 기본값을 바꿀 수 있나」 같은 질문이 따라온다.
//   못 읽어도 잃을 게 없는 값이라 브라우저면 충분하다.
//
// 저장이 막힌 브라우저(시크릿 창, 사이트 데이터 차단)에서는 읽기도 쓰기도 **던진다.**
// 그래서 전부 try/catch 로 감싼다 — 기본값 하나 못 읽었다고 화면이 안 뜨면 안 된다.
type Orientation = 'portrait' | 'landscape'

const ORI_KEY = 'es_last_orientation'

/** 마지막에 고른 방향. 모르면 세로(지금까지의 기본값). */
export function lastOrientation(): Orientation {
  try {
    return localStorage.getItem(ORI_KEY) === 'landscape' ? 'landscape' : 'portrait'
  } catch {
    return 'portrait'
  }
}

export function rememberOrientation(o: Orientation): void {
  try {
    localStorage.setItem(ORI_KEY, o === 'landscape' ? 'landscape' : 'portrait')
  } catch { /* 저장이 막힌 브라우저 — 이번 판만 기억 못 할 뿐이다 */ }
}
