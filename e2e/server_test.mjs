import http from 'http'
import { readFile } from 'fs/promises'
import { extname, join, normalize } from 'path'
const DIST = new URL('../dist/', import.meta.url).pathname
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml' }
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/build') {
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{ res.writeHead(200,{'content-type':'application/json'}); res.end(JSON.stringify({ ok:true, id:'ebk_test', url:'/ebooks/ebk_test/index.html' })) })
    return
  }
  // ── 2차 모의 엔드포인트 (환경설정 · 챗) ──
  if (req.url === '/api/settings/llm' && req.method === 'GET') {
    res.writeHead(200,{'content-type':'application/json'})
    res.end(JSON.stringify({ effective:{provider:'self',base_url:'',user_id:'',model:'',enabled:true,timeout:45,api_key_masked:'',configured:false}, providers:['self','openai','anthropic','custom'] }))
    return
  }
  if (req.url === '/api/settings/llm' && req.method === 'PUT') {
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{ let b={}; try{b=JSON.parse(body)}catch{} ; res.writeHead(200,{'content-type':'application/json'}); res.end(JSON.stringify({ effective:{provider:b.provider||'self',base_url:b.base_url||'',user_id:b.user_id||'',model:b.model||'',enabled:b.enabled!==false,timeout:b.timeout||45,api_key_masked:b.api_key?'****1234':'',configured:!!(b.base_url&&b.api_key&&b.model&&b.user_id)}, providers:['self','openai','anthropic','custom'] })) })
    return
  }
  if (req.url === '/api/settings/llm/test' && req.method === 'POST') {
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{ res.writeHead(200,{'content-type':'application/json'}); res.end(JSON.stringify({ ok:false, configured:false, provider:'self', url:'', model:'', user_id_set:false, api_key_set:false, message:'모의 테스트' })) })
    return
  }
  const chatAnswer = (m) => {
    const s = m || ''
    if (s.includes('성과') || (s.includes('카드') && s.includes('추가'))) return { answer:"‘성과·KPI’ 카드를 추가했어요.", ui_action:{type:'add_card',payload:{cardKey:'kpi'},auto_apply:true} }
    if (s.includes('가로')) return { answer:'가로 덱으로 바꿨어요.', ui_action:{type:'set_orientation',payload:{orientation:'landscape'},auto_apply:true} }
    return { answer:'안녕하세요! 이북 도우미예요. 무엇을 도와드릴까요?', ui_action:null }
  }
  if (req.url === '/api/chat/v2' && req.method === 'POST') {
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{ let b={};try{b=JSON.parse(body)}catch{} ; const a=chatAnswer(b.message); res.writeHead(200,{'content-type':'application/json'}); res.end(JSON.stringify({ answer:a.answer, answer_kind:'chat', status:null, session_id:'t1', suggested_questions:[], pending_action_id:null, ui_action:a.ui_action })) })
    return
  }
  if (req.url === '/api/chat/v2/stream' && req.method === 'POST') {
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{ let b={};try{b=JSON.parse(body)}catch{} ; const a=chatAnswer(b.message); res.writeHead(200,{'content-type':'text/event-stream'}); const meta={answer_kind:'chat',status:null,session_id:'t1',suggested_questions:[],pending_action_id:null,ui_action:a.ui_action}; res.write('event: meta\ndata: '+JSON.stringify(meta)+'\n\n'); for(const ch of (a.answer.match(/.{1,4}/g)||[])){ res.write('event: token\ndata: '+JSON.stringify({t:ch})+'\n\n') } res.write('event: done\ndata: {}\n\n'); res.end() })
    return
  }
  let p = (req.url||'/').split('?')[0]; if (p === '/') p = '/index.html'
  const fp = normalize(join(DIST, p))
  try { const data = await readFile(fp); res.writeHead(200,{'content-type':MIME[extname(fp)]||'application/octet-stream'}); res.end(data) }
  catch { try { const idx = await readFile(join(DIST,'index.html')); res.writeHead(200,{'content-type':'text/html'}); res.end(idx) } catch { res.writeHead(404); res.end('nf') } }
})
server.listen(8899, () => console.log('serving dist on http://127.0.0.1:8899'))
