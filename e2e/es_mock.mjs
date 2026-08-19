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
// REAL=1 이면 실물 PPT 에서 변환된 페이지를 그대로 쓴다(현장 재현용).
const state = JSON.parse(await readFile(new URL(
  process.env.REAL ? './fixture_real_slide3.json' : './fixture_template_state.json',
  import.meta.url), 'utf-8'))

// ADMIN=1 이면 관리자로 로그인된 상태 — 회차·배부·회수 화면을 볼 수 있다.
const ADMIN = !!process.env.ADMIN
const ME = ADMIN
  ? {
    id: 'u_admin', login_id: 'admin', name: '김가현', dept: 'AI팀',
    status: 'active', must_change_pw: false,
    role: 'admin', requested_role: 'admin',
    grade: 1, requested_grade: 1,
    role_label: '관리자', requested_role_label: '관리자',
  }
  : {
    id: 'u_test', login_id: 'hong', name: '홍길동', dept: 'SI개발본부',
    status: 'active', must_change_pw: false,
    role: 'writer', requested_role: 'writer',
    grade: 2, requested_grade: 2,
    role_label: '작성자', requested_role_label: '작성자',
  }

// 회차 화면용 모의 자료. 홍길동은 12칸을 썼고, 이순신은 아직 비어 있다.
const WRITERS = [
  { id: 'u_test', login_id: 'hong', name: '홍길동', dept: 'SI개발본부', status: 'active',
    must_change_pw: false, role: 'writer', requested_role: 'writer', grade: 2,
    requested_grade: 2, role_label: '작성자', requested_role_label: '작성자' },
  { id: 'u_lee', login_id: 'lee', name: '이순신', dept: '제2본부', status: 'active',
    must_change_pw: false, role: 'writer', requested_role: 'writer', grade: 2,
    requested_grade: 2, role_label: '작성자', requested_role_label: '작성자' },
]
const CYCLE = {
  id: 'c_test', title: '2026년 10월 임원회의', period_ym: '2026-10', status: 'writing',
  due_at: null, template_id: 't1', created_at: Date.now(),
  published_at: null, closed_at: null,
}
// EMPTY=1 이면 아직 아무것도 배부되지 않은 회차 — 배부 창구를 테스트할 때 쓴다.
// (이미 배부된 회차에서는 원본 교체·재배정이 잠긴다. 그게 정상 동작이다.)
const CYCLE_PROJECTS = process.env.EMPTY ? [] : [
  { id: 'p_test', name: '2026년 10월 임원회의 — 홍길동', owner_id: 'u_test',
    submit_status: 'submitted', updated_at: Date.now(), page_count: 1 },
  { id: 'p_lee', name: '2026년 10월 임원회의 — 이순신', owner_id: 'u_lee',
    submit_status: 'draft', updated_at: Date.now(), page_count: 1 },
]
const REVOKE_PREVIEW = {
  cycle_id: 'c_test',
  items: [
    { project_id: 'p_test', owner_id: 'u_test', name: '2026년 10월 임원회의 — 홍길동',
      submit_status: 'submitted', updated_at: Date.now(), filled_cells: 12, page_count: 1 },
    { project_id: 'p_lee', owner_id: 'u_lee', name: '2026년 10월 임원회의 — 이순신',
      submit_status: 'draft', updated_at: Date.now(), filled_cells: 0, page_count: 1 },
  ],
  total: 2, with_content: 1, submitted: 1,
}
// 테스트가 들여다볼 수 있게 마지막 회수 요청을 기억해 둔다.
let lastRevoke = null
let lastDistribute = null
// 테스트에서 '이미 배부된 회차' 상태를 만들기 위한 스위치.
let forcedProjects = null
// DECK=1 로 띄우면 이미 PPT 를 올려둔 상태에서 시작한다.
let hasDeck = !!process.env.DECK
const DECK = {
  id: 'd_test', cycle_id: 'c_test', filename: '수행전략회의_2026.pptx', slide_count: 3,
  slides: [
    { index: 0, title: '표지 — 2026년 수행전략회의', tables: 0, texts: 2, images: 0 },
    { index: 1, title: '곽두섭 상무 로드맵', tables: 3, texts: 1, images: 0 },
    { index: 2, title: '이순신 상무 로드맵', tables: 3, texts: 1, images: 0 },
  ],
  warnings: [], uploaded_at: Date.now(),
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
  if (url === '/api/auth/users') return json(res, { users: WRITERS })
  if (url === '/api/cycles' && req.method === 'GET') return json(res, { cycles: [CYCLE] })
  if (url === '/api/cycles/c_test' && req.method === 'GET') {
    return json(res, {
      cycle: CYCLE,
      projects: forcedProjects == null ? CYCLE_PROJECTS
        : [{ id: 'p_test', name: '표준 양식 — 홍길동', owner_id: 'u_test',
             submit_status: 'draft', updated_at: Date.now(), page_count: 1 }].slice(0, forcedProjects),
      progress: process.env.EMPTY
        ? { total: 0, counts: { draft: 0, submitted: 0, returned: 0, approved: 0 }, submitted: 0 }
        : { total: 2, counts: { draft: 1, submitted: 1, returned: 0, approved: 0 }, submitted: 1 },
    })
  }
  if (url === '/api/cycles/c_test/deck') {
    if (req.method === 'DELETE') { hasDeck = false; return json(res, { ok: true }) }
    if (req.method === 'POST') { hasDeck = true; return json(res, { ok: true, deck: DECK }) }
    return hasDeck ? json(res, { deck: DECK }) : json(res, { detail: '없음' }, 404)
  }
  if (url === '/api/cycles/c_test/deck/distribute' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      try { lastDistribute = JSON.parse(body) } catch { lastDistribute = { parseError: body } }
      json(res, { ok: true, created_count: 2, skipped_count: 0, created: [] })
    })
    return
  }
  if (url === '/api/cycles/c_test/distribute' && req.method === 'POST') {
    lastDistribute = { standard: true }
    return json(res, { ok: true, created_count: 2, skipped_count: 0, created: [] })
  }
  if (url === '/__lastDistribute') return json(res, lastDistribute || {})
  if (url.startsWith('/__setDistributed')) {
    const n = Number(((req.url || '').split('n=')[1] || '0'))
    forcedProjects = n
    return json(res, { ok: true, n })
  }
  if (url === '/__resetDistribute') {
    lastDistribute = null; hasDeck = !!process.env.DECK; forcedProjects = null
    return json(res, { ok: true })
  }
  if (url === '/api/cycles/c_test/preview') {
    const q = (req.url || '').split('?')[1] || ''
    const m = /(?:^|&)slide=(\d+)/.exec(q)
    if (m) {
      const i = Number(m[1])
      if (i >= DECK.slide_count) return json(res, { detail: '없는 슬라이드' }, 400)
      return json(res, { mode: 'deck', slide: i, page: state.pages[0] })
    }
    return json(res, { mode: 'template', page: state.pages[0] })
  }
  if (url === '/api/cycles/c_test/revoke-preview') return json(res, REVOKE_PREVIEW)
  if (url === '/api/cycles/c_test/revoke' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      try { lastRevoke = JSON.parse(body) } catch { lastRevoke = { parseError: body } }
      json(res, { ok: true, removed_count: 2, remaining: 0, lost_cells: 12, removed: [] })
    })
    return
  }
  // 테스트 전용 — 마지막 회수 요청 본문. 앞선 실행의 흔적이 남아 있으면
  // '아무것도 안 보냈다' 를 검사할 수 없으므로 초기화 경로도 함께 둔다.
  if (url === '/__lastRevoke') return json(res, lastRevoke || {})
  if (url === '/__resetRevoke') { lastRevoke = null; return json(res, { ok: true }) }
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
