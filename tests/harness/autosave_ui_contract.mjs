import { readFileSync } from 'node:fs'

const files = {
  layout: readFileSync('src/builder/Layout.tsx', 'utf8'),
  title: readFileSync('src/builder/chrome/TitleBar.tsx', 'utf8'),
  confirm: readFileSync('src/persistence/ConfirmSaveModal.tsx', 'utf8'),
  restore: readFileSync('src/persistence/RestoreDraftModal.tsx', 'utf8'),
  css: readFileSync('src/builder/chrome.css', 'utf8'),
}

const fails = []
const check = (cond, label) => {
  console.log(`${cond ? '✓' : '✗'} ${label}`)
  if (!cond) fails.push(label)
}

check(files.layout.includes('installAutosave()'), 'Layout autosave 설치')
check(files.layout.includes('checkRestore()') && files.layout.includes('<RestoreDraftModal'), '복구 모달 연결')
check(files.layout.includes('beforeunload'), '새로고침/닫기 beforeunload 보호')
check(files.layout.includes('withSaveGuard(() => classicRef.current?.openImport()'), 'HTML import 저장 확인 보호')
check(files.layout.includes('withSaveGuard(() => setDemo(true)'), '데모 실행 저장 확인 보호')
check(files.title.includes('saveNow') && files.title.includes("className={'save state-' + saveStatus}"), 'TitleBar 수동 저장 버튼 연결')
check(files.confirm.includes('저장하고 계속') && files.confirm.includes('저장하지 않고 계속') && files.confirm.includes('취소'), '저장 확인 모달 버튼 3종')
check(files.restore.includes('복구하기') && files.restore.includes('새로 시작'), '복구 모달 버튼')
check(files.css.includes('.save-modal') && files.css.includes('.ax-title .save.state-error'), '저장 UI 스타일')

if (fails.length) {
  console.log(`\n${fails.length} FAIL: ${fails.join(', ')}`)
  process.exit(1)
}
console.log('\nALL PASS')
