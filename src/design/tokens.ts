// design.md 색 토큰. 제목·표지=네이비, 본문=근검정, 브랜드 파랑/초록/앰버 + 콜아웃 틴트.
export const colors = {
  ink: '#111318', text: '#111318', navy: '#0F1B3D',
  canvas: '#ffffff', muted: '#5b6270', line: '#e6e8ee',
  accent: '#2462EB', blue: '#2462EB', green: '#3E9E6E', amber: '#D98A2A',
  // 콜아웃 (design.md §5): 틴트 배경 / 좌측 바
  tintBlue: '#EAF1FE', tintGreen: '#E9F5EF', tintAmber: '#FBF0E1',
  barBlue: '#2462EB', barGreen: '#3E9E6E', barAmber: '#D98A2A',
  // 노트 배경·스티키용 파스텔(별도 역할, 유지)
  blockLime: '#dceeb1', blockLilac: '#e7e3fb', blockCream: '#f5edd8',
  blockMint: '#cdeacf', blockCoral: '#f4d2c1',
} as const
export const fontStack = "-apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', Inter, system-ui, sans-serif"

// ── 문서 테마 (EVER-PEAK 라이트/다크) ───────────────────────────────
// 라이트 = EVER-PEAK_솔루션소개, 다크 = EVER-PEAK_솔루션소개_다크.
// 페이지(종이) 색만 이 토큰을 따른다. 뷰어 겉면(flip 크롬)은 손대지 않는다(불변 계약·옵션 A).
export type ThemeName = 'light' | 'dark'
export interface ThemeTokens {
  page: string        // 페이지(종이) 배경
  ink: string         // 제목
  body: string        // 본문 글자
  sub: string         // 보조 텍스트
  muted: string       // 캡션·페이지번호
  blue: string        // 강조·키커·링크
  kick: string        // 영문 키커
  line: string        // 구분선
  chipBd: string      // 번호칩 테두리
  card: string        // 콜아웃/카드 표면
  footer: string      // 하단 푸터 글자
  coverBg: string     // 표지 배경
  coverInk: string    // 표지 글자
}
export const themes: Record<ThemeName, ThemeTokens> = {
  light: {
    page: '#ffffff', ink: '#0F1B3D', body: '#1c2433', sub: '#5b6270', muted: '#98a1b2',
    blue: '#2462EB', kick: '#2462EB', line: '#e6e8ee', chipBd: '#2462EB', card: '#f6f8fc',
    footer: '#8a92a3', coverBg: '#0F1B3D', coverInk: '#ffffff',
  },
  dark: {
    page: '#0b1626', ink: '#ffffff', body: '#e7edf6', sub: '#9fb0c7', muted: '#68798f',
    blue: '#4d86ff', kick: '#4d86ff', line: 'rgba(255,255,255,.12)', chipBd: '#3d6dff', card: 'rgba(255,255,255,.05)',
    footer: '#5f7290', coverBg: '#0b1626', coverInk: '#ffffff',
  },
}
export const themeTokens = (t: ThemeName): ThemeTokens => themes[t] || themes.light
