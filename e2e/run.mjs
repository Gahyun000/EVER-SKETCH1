import { spawn } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
const dir = dirname(fileURLToPath(import.meta.url))
const srv = spawn(process.execPath, [join(dir, 'server_test.mjs')], { stdio: 'inherit' })
await new Promise((r) => setTimeout(r, 1300))
const smoke = spawn(process.execPath, [join(dir, 'smoke.mjs')], { stdio: 'inherit' })
smoke.on('exit', (code) => { srv.kill(); process.exit(code || 0) })
