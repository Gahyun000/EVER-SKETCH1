// EVER-SKETCH 브라우저 테스트용 모의 서버.
//
// dist/ 를 그대로 서빙하고, 화면이 뜨는 데 필요한 최소 API 만 흉내낸다.
// (로그인·프로젝트 목록·프로젝트 열기) 진짜 서버를 띄우면 DB·파이썬 의존성까지
// 끌고 와야 해서, **화면 동작만** 보려는 테스트가 무거워진다.
//
// 실행: node e2e/es_mock.mjs   (기본 127.0.0.1:8899)
import http from 'http'
import { readFile } from 'fs/promises'
import { extname, join, normalize } from 'path'

const DIST = new URL('../dist/', import.meta.url).pathname
const PORT = Number(process.env.PORT || 8899)
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
}

// 배부되는 표준 양식 1장. server/template_seed.py 가 만든 결과를 그대로 떠 놓은 것이다.
//   python3 -c "import json,sys; sys.path.insert(0,'.'); from server import template_seed as T; \
//     json.dump(T.build_template_state('2026-10','홍길동','SI개발본부'), \
//     open('e2e/fixture_template_state.json','w'), ensure_ascii=False)"
// 정본 사양이 바뀌면 위 명령으로 다시 뜨면 된다.
const state = JSON.parse(
  await readFile(new URL('./fixture_template_state.json', import.meta.url), 'utf-8'))

const ME = {
  id: 'u_test', login_id: 'hong', name: '홍길동', dept: 'SI개발본부',
  status: 'active', must_change_pw: false,
  role: 'writer', requested_role: 'writer',
  grade: 2, requested_grade: 2,
  role_label: '작성자', requested_role_label: '작성자',
}
const META = {
  id: 'p_test', name: '2026년 10월 임원회의 — 홍길동',
  created_at: Date.now(), updated_at: Date.now(),
  published_id: null, page_count: 1, owner_id: 'u_test',
  cycle_id: 'c_test', submit_status: 'draft',
}

const json = (res, body, code = 200) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0]

  // authApi.apiMe 는 { user: Me } 를 기대한다(값만 돌려주면 로그인 화면으로 떨어진다).
  // ANON=1 로 띄우면 로그아웃 상태 — 로그인 화면 자체를 테스트할 때 쓴다.
  if (url === '/api/auth/me') return json(res, { user: process.env.ANON ? null : ME })
  if (url === '/api/auth/login' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => json(res, { user: ME }))
    return
  }
  if (url === '/api/projects' && req.method === 'GET') return json(res, { projects: [META] })
  if (url === '/api/projects/p_test' && req.method === 'GET') return json(res, { ...META, state })
  if (url.startsWith('/api/projects/p_test') && (req.method === 'PUT' || req.method === 'PATCH')) {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => json(res, { ...META, state }))
    return
  }
  if (url.startsWith('/api/')) return json(res, { ok: true })

  // 정적 파일 — SPA 라 못 찾으면 index.html 로 되돌린다.
  const rel = normalize(url === '/' ? '/index.html' : url).replace(/^(\.\.[/\\])+/, '')
  try {
    const buf = await readFile(join(DIST, rel))
    res.writeHead(200, { 'content-type': MIME[extname(rel)] || 'application/octet-stream' })
    res.end(buf)
  } catch {
    const buf = await readFile(join(DIST, 'index.html'))
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(buf)
  }
})

server.listen(PORT, '127.0.0.1', () => console.log('mock on http://127.0.0.1:' + PORT))
