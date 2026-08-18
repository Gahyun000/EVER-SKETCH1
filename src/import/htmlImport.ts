// 4차 HTML Import — 규칙 파서.
// 이사님 HTML 문자열을 표지 / 목차 / 페이지(섹션) 구조로 분해한다.
// 브라우저 DOMParser만 사용(앱 의존성 없음). 원본 서식은 버리고 내용만 가져온다.
//
// 목차 감지 두 방식:
//  (B) 명시적 목차: 문서에 Contents 네비(<a href="#id">)가 있으면 그걸 목차로 쓰고
//      각 항목을 대상 <section id>에 1:1 매핑한다(작성자 목차 + 정확한 페이지 매핑). ← 우선
//  (A) 폴백: 제목(H1/H2)마다 새 페이지로 쪼갠다. 첫 H1은 표지.

export type ImportBlockType = 'h1' | 'h2' | 'text' | 'bullet' | 'divider' | 'toggle' | 'callout'
export type CalloutTone = 'info' | 'key' | 'warn'
export interface ImportedBlock { type: ImportBlockType; text: string; tone?: CalloutTone }
export interface ImportedSection { title: string; blocks: ImportedBlock[]; contd?: boolean }
export interface ImportedDoc {
  title: string
  cover: { title: string; sub: string }
  sections: ImportedSection[]
}

const clean = (s: string | null | undefined): string => (s || '').replace(/\s+/g, ' ').trim()

// 강조박스(콜아웃) 감지 — 이사님 HTML의 색깔 박스를 색조(클래스명)로 정보/핵심/주의로 매핑.
const CALLOUT_SEL = '.note,.warn,.warning,.caution,.danger,.alert,.ok,.ok-box,.success,.tip,.key,.info,.q,.callout,.hint,blockquote'
function calloutTone(el: Element): CalloutTone {
  const cls = ((el.getAttribute('class') || '') + ' ' + el.tagName).toLowerCase()
  if (/\b(ok|success|tip|key|good|done)\b/.test(cls)) return 'key'   // 초록: 핵심
  if (/\b(warn|warning|caution|danger|alert|note)\b/.test(cls)) return 'warn' // 노랑/주황/빨강: 주의
  return 'info' // 파랑: 정보 (q·info·callout·blockquote 등)
}

// 제목에서 장식 요소(번호 뱃지·태그 칩 등)를 떼고 깔끔한 텍스트만 뽑는다.
function headingText(el: Element): string {
  const clone = el.cloneNode(true) as Element
  clone.querySelectorAll('.n, .no, .num, .step, .tag, .badge, .chip, .pill, sup').forEach((x) => x.remove())
  let t = clean(clone.textContent)
  t = t.replace(/^(\d{1,2})[.)\]]\s+/, '') // 선행 목록번호 "1. " "2) " 제거(연도 등 4자리는 보존)
  return t
}

// 표지 부제: .lede/.lead/.subtitle 우선, 없으면 첫 문단. 길면 단어 경계에서 자르고 말줄임.
function coverSubtitle(doc: Document): string {
  let sub = clean(doc.querySelector('.lede, .lead, .subtitle, .sub')?.textContent)
  if (!sub) sub = clean(doc.querySelector('p')?.textContent)
  if (sub.length > 140) {
    const cut = sub.slice(0, 140)
    const sp = cut.lastIndexOf(' ')
    sub = (sp > 80 ? cut.slice(0, sp) : cut).trim() + '…'
  }
  return sub
}

// 목차 링크로 인정하지 않을 앵커(건너뛰기·맨위 등)
const SKIP_ANCHORS = new Set(['#', '#top', '#content', '#main', '#skip'])

// (B) 명시적 목차 감지: 페이지 내부(#id)를 가리키는 앵커들이 실제 섹션을 가리키면 목차로 본다.
interface TocEntry { title: string; target: Element }
function detectTocNav(doc: Document): TocEntry[] {
  // 목차가 있을 법한 컨테이너 우선(사이드바·nav·목차 클래스), 없으면 문서 전체 앵커.
  const scopes = Array.from(doc.querySelectorAll('.side, aside, nav, .toc, .contents, .index'))
  const anchorSets: Element[][] = scopes.map((s) => Array.from(s.querySelectorAll('a[href^="#"]')))
  anchorSets.push(Array.from(doc.querySelectorAll('a[href^="#"]'))) // 전체 폴백
  for (const anchors of anchorSets) {
    const entries: TocEntry[] = []
    const seen = new Set<string>()
    for (const a of anchors) {
      const href = (a.getAttribute('href') || '').trim()
      if (SKIP_ANCHORS.has(href) || !href.startsWith('#') || href.length < 2) continue
      const id = href.slice(1)
      if (seen.has(id)) continue
      const target = doc.getElementById(id)
      if (!target) continue
      const title = headingText(a)
      if (!title) continue
      seen.add(id)
      entries.push({ title, target })
    }
    if (entries.length >= 3) return entries // 3개 이상이면 진짜 목차로 인정
  }
  return []
}

// 한 요소(섹션) 안의 콘텐츠를 블록으로 변환. 섹션 제목(h1/h2)·목차 자체는 제외.
function sectionBlocks(root: Element): ImportedBlock[] {
  const blocks: ImportedBlock[] = []
  const els = Array.from(root.querySelectorAll('h3, h4, p, ul, ol, hr, pre, table, ' + CALLOUT_SEL))
  for (const el of els) {
    const tag = el.tagName.toLowerCase()
    if (el.closest('li')) continue                       // 목록 내부는 목록에서 처리
    // 콜아웃 = 한 블록으로 통째 처리
    if (el.matches(CALLOUT_SEL)) {
      const t = clean(el.textContent)
      if (t) blocks.push({ type: 'callout', text: t, tone: calloutTone(el) })
      continue
    }
    if (el.closest(CALLOUT_SEL)) continue                // 콜아웃 내부 요소 skip
    // 표 내부의 p/셀 등은 아래 table 분기에서 통째 처리하므로 개별 skip
    if (tag !== 'table' && el.closest('table')) continue
    if (tag === 'h3' || tag === 'h4') { const t = headingText(el); if (t) blocks.push({ type: 'h2', text: t }) }
    else if (tag === 'p') { const t = clean(el.textContent); if (t) blocks.push({ type: 'text', text: t }) }
    else if (tag === 'pre') { const t = clean(el.textContent); if (t) blocks.push({ type: 'text', text: t }) }
    else if (tag === 'hr') { blocks.push({ type: 'divider', text: '' }) }
    else if (tag === 'ul' || tag === 'ol') {
      Array.from(el.querySelectorAll(':scope > li')).forEach((li) => {
        const t = clean(li.textContent)
        if (t) blocks.push({ type: 'bullet', text: t })
      })
    } else if (tag === 'table') {
      // 표 → 행을 텍스트로. 첫 행(헤더)은 소제목, 나머지는 불릿(내용 보존이 목적).
      const rows = Array.from(el.querySelectorAll('tr'))
      rows.forEach((tr, i) => {
        const cells = Array.from(tr.querySelectorAll('th, td')).map((c) => clean(c.textContent)).filter(Boolean)
        if (!cells.length) return
        const line = cells.join('  ·  ')
        blocks.push({ type: i === 0 ? 'h2' : 'bullet', text: line })
      })
    }
  }
  // 빈 섹션 방지: 위 규칙으로 아무 블록도 못 뽑았으면 섹션 텍스트를 통째로 한 블록으로.
  if (blocks.length === 0) {
    const clone = root.cloneNode(true) as Element
    clone.querySelectorAll('h1, h2, .eyebrow').forEach((x) => x.remove())
    const t = clean(clone.textContent)
    if (t) blocks.push({ type: 'text', text: t.slice(0, 600) })
  }
  return blocks
}

export function parseHtml(html: string): ImportedDoc {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const docTitle = clean(doc.querySelector('title')?.textContent)
  const firstH1 = doc.querySelector('h1')
  const coverTitle = (firstH1 ? headingText(firstH1) : '') || docTitle || '가져온 문서'
  const coverSub = coverSubtitle(doc)

  // ── (B) 명시적 목차가 있으면 그걸로 섹션 구성 ──
  const toc = detectTocNav(doc)
  if (toc.length >= 3) {
    const sections: ImportedSection[] = toc.map((e) => {
      // 섹션 자체 제목(내부 h1/h2)이 있으면 그게 더 정확할 수 있으나, 목차 라벨을 우선(작성자 의도).
      return { title: e.title || headingText(e.target.querySelector('h1, h2, h3') || e.target) || '페이지', blocks: sectionBlocks(e.target) }
    })
    return { title: docTitle || coverTitle, cover: { title: coverTitle, sub: coverSub }, sections }
  }

  // ── (A) 폴백: 제목(H1/H2)마다 새 페이지 ──
  const sections: ImportedSection[] = []
  let cur: ImportedSection | null = null
  let sawFirstH1 = false

  const els = doc.body ? Array.from(doc.body.querySelectorAll('h1, h2, h3, p, ul, ol, hr, table, ' + CALLOUT_SEL)) : []
  for (const el of els) {
    const tag = el.tagName.toLowerCase()

    if (tag === 'h1') {
      if (!sawFirstH1) { sawFirstH1 = true; continue } // 첫 H1 = 표지
      cur = { title: headingText(el) || '페이지', blocks: [] }
      sections.push(cur)
      continue
    }
    if (tag === 'h2') {
      cur = { title: headingText(el) || '페이지', blocks: [] }
      sections.push(cur)
      continue
    }

    const c = cur
    if (!c) continue // 첫 섹션 이전 내용(표지 리드문 등)은 건너뜀
    if (el.closest('li')) continue
    if (tag !== 'table' && el.closest('table')) continue

    if (el.matches(CALLOUT_SEL)) {
      const t = clean(el.textContent)
      if (t) c.blocks.push({ type: 'callout', text: t, tone: calloutTone(el) })
      continue
    }
    if (el.closest(CALLOUT_SEL)) continue

    if (tag === 'h3') { const t = headingText(el); if (t) c.blocks.push({ type: 'h2', text: t }) }
    else if (tag === 'p') { const t = clean(el.textContent); if (t) c.blocks.push({ type: 'text', text: t }) }
    else if (tag === 'hr') { c.blocks.push({ type: 'divider', text: '' }) }
    else if (tag === 'ul' || tag === 'ol') {
      Array.from(el.querySelectorAll(':scope > li')).forEach((li) => {
        const t = clean(li.textContent)
        if (t) c.blocks.push({ type: 'bullet', text: t })
      })
    } else if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr'))
      rows.forEach((tr, i) => {
        const cells = Array.from(tr.querySelectorAll('th, td')).map((cc) => clean(cc.textContent)).filter(Boolean)
        if (!cells.length) return
        c.blocks.push({ type: i === 0 ? 'h2' : 'bullet', text: cells.join('  ·  ') })
      })
    }
  }

  return { title: docTitle || coverTitle, cover: { title: coverTitle, sub: coverSub }, sections }
}
