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

// 표준 양식 **두 장**(1쪽 로드맵 · 2쪽 진행현황·이슈).
// server/template_seed.py 가 만든 결과를 그대로 떠 놓은 것이다.
//   python3 -c "import json,sys; sys.path.insert(0,'.'); from server import template_seed as T; \
//     json.dump(T.build_template_state('2026-10','홍길동','SI개발본부'), \
//     open('e2e/fixture_template_state.json','w'), ensure_ascii=False)"
// 정본 사양이 바뀌면 위 명령으로 다시 뜨면 된다.
// REAL=1 이면 실물 PPT 에서 변환된 페이지를 그대로 쓴다(현장 재현용).
const state = JSON.parse(await readFile(new URL(
  process.env.REAL ? './fixture_real_slide3.json' : './fixture_template_state.json',
  import.meta.url), 'utf-8'))

// LEGACY=1 이면 **2026-09-07 이전에 만든 자료**를 흉내낸다 — 슬롯 요소마다
// `locked: true` 가 박혀 있는 상태. 양식에서 그 기본값을 뺀 것은 앞으로 만들 자료에만
// 적용되므로, 이미 나간 자료가 어떻게 열리는지는 따로 확인해야 한다.
// (실제로 「기능을 넣었다는데 내 화면에는 손잡이가 없다」는 보고를 받은 자리다.)
if (process.env.LEGACY) {
  for (const pg of state.pages || []) {
    for (const el of pg.els || []) if (el.slot) el.locked = true
  }
}

// ADMIN=1 이면 관리자로 로그인된 상태.
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

// 사용자 목록 모의 자료.
const WRITERS = [
  { id: 'u_test', login_id: 'hong', name: '홍길동', dept: 'SI개발본부', status: 'active',
    must_change_pw: false, role: 'writer', requested_role: 'writer', grade: 2,
    requested_grade: 2, role_label: '작성자', requested_role_label: '작성자' },
  { id: 'u_lee', login_id: 'lee', name: '이순신', dept: '제2본부', status: 'active',
    must_change_pw: false, role: 'writer', requested_role: 'writer', grade: 2,
    requested_grade: 2, role_label: '작성자', requested_role_label: '작성자' },
]
// 마지막으로 들어온 앵커 이동 요청. 테스트가 `/__lastShift` 로 되읽어
// **화면이 무엇을 보냈는지**를 확인한다(눈으로는 못 보는 부분이다).
let lastShift = null

// 검토 의견 — COMMENTS=1 이면 **미해결 하나가 이미 달려 있는 상태**로 시작한다.
//
// **이 두 줄이 P2(회차 제거)에서 통째로 지워졌다.** 회차 코드와 붙어 있어서
// 함께 딸려 나간 것인데, `comments` 는 회차와 아무 상관이 없었다 —
// 그 뒤로 모의 서버는 의견 요청마다 `ReferenceError` 로 죽었고,
// **의견 관련 스위트 3개가 조용히 죽어 있었다**(2026-09-04 P8 에서 처음 돌려 보고 발견).
// 지울 때 「이건 뭐였더라」 하고 한 번 더 보지 않으면 이렇게 된다.
let cmtSeq = 100
const comments = process.env.COMMENTS ? [{
  id: 'cm1', project_id: 'p_test', thread_id: 'cm1', page_id: 1,
  el_id: 100006, cell: '3_5', body: '5월 진행 구간이 실제와 다릅니다.',
  author_id: 'u_admin', created_at: Date.now(), resolved_at: null, resolved_by: null,
  replies: [],
}] : []

// PEER=1 로 띄우면 **남의 자료를 연 상태**가 된다.
// (회차 단계 개념은 P2 에서 사라졌다 — 이제 남의 자료는 어느 경우에도 읽기 전용이다.)
const PEER_STAGE = process.env.PEER || ''
const ACCESS = PEER_STAGE
  ? { mine: false, can_write: false, can_comment: false }
  : { mine: true, can_write: true, can_comment: true }

// `template` 은 **서버만 심는 표시**다(server/projects.py 의 컬럼).
// 화면은 이걸 보고 표준 양식인지 판정한다 — 연결 도구를 감출지가 여기서 갈린다.
// FREE=1 이면 자유 이북인 척한다.
const META = {
  id: 'p_test', name: '2026년 9월 임원회의 — 홍길동',
  created_at: Date.now(), updated_at: Date.now(),
  published_id: null, page_count: 2, owner_id: 'u_test',
  template: process.env.FREE ? null : 'v2.0',
}

const json = (res, body, code = 200) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

// 제출이 서버에 몇 번 닿았는가 — 화면이 두 번 보내면 여기서 2가 된다.
let submits = 0

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
  if (url === '/api/projects/p_test' && req.method === 'GET') return json(res, { ...META, state, access: ACCESS })
  if (url.startsWith('/api/projects/p_test') && (req.method === 'PUT' || req.method === 'PATCH')) {
    // 남의 자료면 서버가 실제로 막는다. 모의 서버가 순순히 200 을 주면,
    // 화면 쪽 잠금이 풀려도 테스트가 알아채지 못한다.
    if (PEER_STAGE) { res.writeHead(403, { 'content-type': 'application/json' }); res.end('{"detail":"권한이 없습니다."}'); return }
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => json(res, { ...META, state }))
    return
  }
  if (url === '/api/auth/users') return json(res, { users: WRITERS })

  // ── 검토 의견 ──
  if (url === '/api/projects/p_test/comments' && req.method === 'GET') {
    return json(res, { comments })
  }
  if (url === '/api/projects/p_test/comments' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      let b = {}
      try { b = JSON.parse(body) } catch { /* 무시 */ }
      const id = 'cm' + (++cmtSeq)
      const root = b.reply_to ? comments.find((t) => t.id === b.reply_to) : null
      const item = {
        id, project_id: 'p_test', thread_id: root ? root.id : id,
        page_id: root ? root.page_id : (b.page_id || 1),
        el_id: root ? root.el_id : (b.el_id ?? null),
        cell: root ? root.cell : (b.cell ?? null),
        body: b.body || '', author_id: ME.id, created_at: Date.now(),
        resolved_at: null, resolved_by: null,
      }
      if (root) root.replies.push(item)
      else comments.push({ ...item, replies: [] })
      json(res, { ok: true, comment: item })
    })
    return
  }
  // 「고쳤습니다」 — 답글 한 줄이 함께 달린다(서버와 같은 동작).
  if (/^\/api\/comments\/[^/]+\/fixed$/.test(url) && req.method === 'POST') {
    const id = url.split('/')[3]
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      let b = {}
      try { b = JSON.parse(body) } catch { /* 무시 */ }
      const t = comments.find((x) => x.id === id || x.replies.some((r) => r.id === id))
      if (t) {
        t.fixed_at = b.fixed ? Date.now() : null
        t.fixed_by = b.fixed ? ME.id : null
        if (b.fixed) {
          t.replies.push({
            id: 'cm' + (++cmtSeq), project_id: 'p_test', thread_id: t.id,
            page_id: t.page_id, el_id: t.el_id, cell: t.cell,
            body: (b.body || '').trim() || '고쳤습니다.', author_id: ME.id,
            created_at: Date.now(), resolved_at: null, resolved_by: null,
          })
        }
      }
      json(res, { ok: true, comment: t || {} })
    })
    return
  }
  if (/^\/api\/comments\/[^/]+\/resolve$/.test(url) && req.method === 'POST') {
    const id = url.split('/')[3]
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      let b = {}
      try { b = JSON.parse(body) } catch { /* 무시 */ }
      const t = comments.find((x) => x.id === id || x.replies.some((r) => r.id === id))
      if (t) {
        t.resolved_at = b.resolved ? Date.now() : null
        if (b.resolved) { t.fixed_at = null; t.fixed_by = null }
      }
      json(res, { ok: true, comment: t || {} })
    })
    return
  }
  if (/^\/api\/comments\/[^/]+$/.test(url) && req.method === 'DELETE') {
    const id = url.split('/')[3]
    const i = comments.findIndex((x) => x.id === id)
    if (i >= 0) comments.splice(i, 1)
    return json(res, { ok: true })
  }
  // ── 앵커 이동 (표에서 행·열이 늘거나 줄 때) ──
  if (url === '/api/projects/p_test/comments/shift' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      let b = {}
      try { b = JSON.parse(body) } catch { /* 무시 */ }
      lastShift = b
      let moved = 0, lost = 0
      for (const t of comments.slice()) {
        if (t.el_id !== b.el_id || !t.cell) continue
        const [h, tl] = t.cell.split(':')
        const pt = (x) => x.split('_').map(Number)
        const [r0, c0] = pt(h)
        const [r1, c1] = tl ? pt(tl) : [r0, c0]
        let lo = b.axis === 'row' ? r0 : c0
        let hi = b.axis === 'row' ? r1 : c1
        if (b.delta > 0) {
          if (lo >= b.at) lo += b.delta
          if (hi >= b.at) hi += b.delta
        } else if (lo === b.at && hi === b.at) {
          lost++
          if (b.on_lost === 'delete') comments.splice(comments.indexOf(t), 1)
          else t.lost_at = Date.now()
          continue
        } else if (lo > b.at) { lo -= 1; hi -= 1 } else if (hi >= b.at) { hi -= 1 }
        const nr0 = b.axis === 'row' ? lo : r0, nr1 = b.axis === 'row' ? hi : r1
        const nc0 = b.axis === 'col' ? lo : c0, nc1 = b.axis === 'col' ? hi : c1
        const next = (nr0 === nr1 && nc0 === nc1)
          ? `${nr0}_${nc0}` : `${nr0}_${nc0}:${nr1}_${nc1}`
        if (next !== t.cell) { t.cell = next; moved++ }
      }
      json(res, { ok: true, moved, lost, deleted: b.on_lost === 'delete' ? lost : 0 })
    })
    return
  }
  if (url === '/__lastShift') return json(res, lastShift || {})

  // ── 폴더 · 결재 · 팀 공유 (P4~P7) ──────────────────────
  // **모양까지 맞춰서 답한다.** 아래 catch-all 의 `{ok:true}` 로 때우면
  // `folders` 가 undefined 로 화면까지 흘러 들어가 **자료 목록이 하얗게 뜬다** —
  // 실제로 그렇게 됐고(2026-09-04 P8), 그때 테스트는 「임원회의 글자가 없다」고만
  // 말해서 원인을 찾는 데 한참 걸렸다. 부수 호출일수록 모양을 지켜 줘야 한다.
  if (url === '/api/folders') return json(res, { folders: [], path: [], max_depth: 3 })
  if (url === '/api/approvals/status-map') return json(res, { status_map: {} })

  // 제출 — **서버처럼 답한다.** 두 번째는 400 이다(server/approvals.py 의 `이미 결재 대기 중입니다`).
  //
  // 여기서 `{ok:true}` 로 두 번 다 성공시키면 안 된다. 그러면 화면이 두 번 보내도
  // 아무 일도 안 일어난 것처럼 보여서, **정작 재현하려던 것이 사라진다.**
  // 늦게 답하는 것도 일부러다 — 이 구멍은 **응답을 기다리는 그 사이**에만 열린다.
  if (url === '/api/approvals/request' && req.method === 'POST') {
    submits++
    const dup = submits > 1
    return setTimeout(() => {
      if (dup) { res.writeHead(400, { 'content-type': 'application/json' })
                 return res.end(JSON.stringify({ detail: '이미 결재 대기 중입니다.' })) }
      json(res, { ok: true, approval: { id: 'a_1', project_id: 'p_test', status: 'pending', round: 1 } })
    }, 400)
  }
  // 세어 둔 것을 **되돌릴 수 있어야 한다.** mock 을 살려 둔 채 검사를 두 번 돌리면
  // 앞 회차가 남긴 수가 뒤 회차의 실패로 나온다 — 실제로 그렇게 한 번 헤맸다.
  // `url` 은 물음표를 이미 떼어 냈다(113줄) — 되돌리기는 **경로로** 받는다.
  if (url === '/__submits/reset') { submits = 0; return json(res, { submits }) }
  if (url === '/__submits') return json(res, { submits })
  if (url === '/api/approvals') return json(res, { approvals: [], counts: {} })
  if (url === '/api/team-library') return json(res, { teams: [] })

  // 그 밖의 API 는 조용히 성공시킨다 — 화면이 부르는 부수 호출까지 막으면
  // 정작 보려던 것이 아니라 엉뚱한 곳에서 실패한다.
  // **다만 `{ok:true}` 로 때울 수 있는 것은 「값을 안 쓰는」 호출뿐이다.**
  // 화면이 응답을 실제로 읽는 엔드포인트가 새로 생기면 위에 한 줄 적는다.
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
