globalThis.window = { clearTimeout: () => {}, setTimeout: () => 0, addEventListener: () => {}, localStorage: {} }
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
globalThis.document = { addEventListener: () => {}, removeEventListener: () => {} }
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ projects: [] }) })
try {
  const m = await import('./src/persistence/projects.ts')
  console.log('import OK — exports:', Object.keys(m).join(', '))
  console.log('state keys:', Object.keys(m.useProjects.getState()).join(', '))
} catch (e) { console.log('import 실패:', String(e.message).split('\n')[0]) }
