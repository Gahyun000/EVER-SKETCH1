// ebook_html용 fetch 헬퍼 — Agentic-PM의 api()를 로컬 단일 사용자용으로 축약(토큰 없음).
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {})
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const res = await fetch(`/api${path}`, { ...init, headers })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}${t ? ': ' + t : ''}`)
  }
  return (await res.json()) as T
}
