import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const src = readFileSync('src/persistence/draftStorage.ts', 'utf8')
  .replace(/^import type .*$/gm, '')
  .replace(/^export /gm, '')

const js = ts.transpileModule(`${src}
globalThis.createDraft = createDraft
globalThis.normalizeDraft = normalizeDraft
globalThis.draftMeta = draftMeta`, {
  compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
}).outputText

const context = { globalThis: {} }
vm.createContext(context)
vm.runInContext(js, context)

const { createDraft, normalizeDraft, draftMeta } = context.globalThis
const fails = []
const check = (cond, label) => {
  console.log(`${cond ? '✓' : '✗'} ${label}`)
  if (!cond) fails.push(label)
}

const snapshot = {
  title: 'AX 초안',
  orientation: 'portrait',
  theme: 'light',
  font: 'auto',
  size: 'm',
  selectedPageId: 7,
  pages: [
    { id: 7, cardKey: 'slide', fields: { title: '목차' }, free: true, els: [{ id: 1, type: 'text', x: 1, y: 2, w: 3, h: 4, text: '첫 장', color: 'transparent', fs: 12, gotoSeq: 1 }], conns: [], strokes: [], role: 'toc' },
  ],
}
const draft = createDraft(snapshot, 'AX_전환.html')
const restored = normalizeDraft(draft)
const meta = draftMeta(draft)

check(draft.draftVersion === 1, 'draftVersion=1')
check(draft.app === 'ebook_html', 'app 식별자')
check(draft.sourceName === 'AX_전환.html', 'sourceName 보존')
check(restored?.state.title === 'AX 초안', 'title 복원')
check(restored?.state.pages?.[0]?.els?.[0]?.gotoSeq === 1, '자유 요소 메타 보존')
check(restored?.state.selectedPageId === 7, 'selectedPageId 복원')
check(meta?.pageCount === 1 && meta?.title === 'AX 초안', 'draft meta 생성')
check(normalizeDraft({ draftVersion: 999, app: 'ebook_html', state: {} }) === null, '알 수 없는 버전 거부')
check(normalizeDraft({ draftVersion: 1, app: 'ebook_html', state: { pages: 'bad' } }) === null, '깨진 pages 거부')

if (fails.length) {
  console.log(`\n${fails.length} FAIL: ${fails.join(', ')}`)
  process.exit(1)
}
console.log('\nALL PASS')
