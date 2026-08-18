import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const src = readFileSync('src/import/deckToPages.ts', 'utf8')
  .replace(/^import type .*$/gm, '')
  .replace(/^import \{ pageSize \}.*$/m, 'const pageSize = () => ({ W: 750, H: 1000 })')
  .replace(/export function deckIrToPages/, 'function deckIrToPages')

const js = ts.transpileModule(`${src}\nglobalThis.deckIrToPages = deckIrToPages`, {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
}).outputText

const context = { globalThis: {} }
vm.createContext(context)
vm.runInContext(js, context)
const deckIrToPages = context.globalThis.deckIrToPages

const ir = {
  meta: { title: 'AX', theme: 'light', footerLeft: 'AX', brandTop: 'UNIEVER', brandTopRight: 'AX' },
  pages: [
    { type: 'cover', role: 'cover', sectionId: 'cover', pageNo: '01', editable: true, heading: '표지', sub: '리드', objects: [{ kind: 'text', name: 'heading', text: '표지' }] },
    { type: 'toc', role: 'toc', sectionId: 'toc', pageNo: '02', editable: true, title: '목차', tocItems: [
      { sectionId: 'sec-01', markN: '01', title: '첫 장', summary: '요약', pageNo: '03' },
    ], items: [['01', '첫 장', '요약', '03']], objects: [{ kind: 'toc', name: 'tocItems', items: [] }] },
    { type: 'section', role: 'content', sectionId: 'sec-01', pageNo: '03', editable: true, markN: '01', heading: '첫 장', sub: '요약', cards: [{ title: '카드', desc: '설명' }], objects: [{ kind: 'text', name: 'heading', text: '첫 장' }] },
  ],
}

const pages = deckIrToPages(ir, 'portrait')
const fails = []
const check = (cond, label) => {
  console.log(`${cond ? '✓' : '✗'} ${label}`)
  if (!cond) fails.push(label)
}

check(pages.length === 3, 'IR 페이지 수 보존')
check(pages[0].role === 'cover' && pages[1].role === 'toc' && pages[2].role === 'content', `role 보존: ${pages.map((p) => p.role).join(',')}`)
check(pages[2].sectionId === 'sec-01', `sectionId 보존: ${pages[2].sectionId}`)
check(pages[1].pageNo === '02' && pages[2].pageNo === '03', `pageNo 보존: ${pages.map((p) => p.pageNo).join(',')}`)
check((pages[1].tocItems || [])[0]?.sectionId === 'sec-01', `tocItems 보존: ${JSON.stringify(pages[1].tocItems)}`)
check(pages[1].els.some((el) => el.gotoSeq === 1 && el.text === '첫 장'), '목차 행 gotoSeq 메타 보존')
check(pages[2].fields.title === '첫 장', `content title field 보존: ${pages[2].fields.title}`)
check(pages.every((p) => p.free === true), '편집 가능한 자유 캔버스 페이지 유지')

if (fails.length) {
  console.log(`\n${fails.length} FAIL: ${fails.join(', ')}`)
  process.exit(1)
}
console.log('\nALL PASS')
