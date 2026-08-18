// 가벼운 문구 자동 정리(플레이스홀더 AI). 실제 LLM 연동 시 이 함수만 교체.
export function polish(s: string): string {
  return (s || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*·\s*/g, ' · ')
    .trim()
    .replace(/[ \t]*[·,]+$/, '')
    .trim()
}
export function polishFields(f: Record<string, string>): Record<string, string> {
  const o: Record<string, string> = {}
  Object.keys(f).forEach((k) => { o[k] = polish(f[k]) })
  return o
}
