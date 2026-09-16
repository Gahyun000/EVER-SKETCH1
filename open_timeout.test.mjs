// **자료를 여는 데도 기다리기를 그만둔다.**
//
// 2026-09-16 · 서버가 멈췄을 때 「불러오는 중…」 동그라미가 **영영** 돌았다. 사용자는 그 화면을
// 한참 보고 있어야 했고, 자료가 큰 건지 서버가 죽은 건지 알 길이 없었다.
//
// 까닭은 하나였다. 첫 화면을 불러오는 길에는 시간 제한이 있는데(`withTimeout`),
// **자료를 여는 길에만 없었다.** 그래서 `fetch` 가 안 끝나면 아무 일도 안 일어난다.
//
// 고침은 셋이다.
//   · 여는 길에도 시간 제한을 두고, 시간은 **첫 화면과 같은 값**을 쓴다
//     (자리마다 다른 숫자를 두면 왜 여기만 다른지 아무도 모른다)
//   · 실패를 **삼키지 않고** 적는다 — 부르는 쪽은 `void openProject(...)` 라 던져 봐야 안 받는다
//   · 「다시」는 **그 자료를** 다시 연다. 목록을 다시 받는 게 아니다 — 사람이 하려던 일은 그것이었다
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs open_timeout.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const pj = bare(read('./src/persistence/projects.ts'))
const lib = bare(read('./src/persistence/LibraryScreen.tsx'))
const tree = bare(read('./src/shell/SideTree.tsx'))
const { classifyLoad, loadErrorText } = await import('./src/persistence/loadError.ts')

// ── ① 여는 길에 시간 제한 ────────────────────────────
{
  const i = pj.indexOf('openProject: async')
  check(i > 0, '여는 길을 찾았다')
  const blk = pj.slice(i, i + 900)
  check(/withTimeout\(apiGetProject\(id\), BOOT_STEP_MS\)/.test(blk),
    '**여는 길에도 기다리기를 그만둔다**')
  // 숫자를 새로 박지 않는다 — 첫 화면과 같은 값이어야 설명이 하나로 끝난다.
  check(!/\d{4,}/.test(blk), '시간을 그 자리에 숫자로 박지 않았다')
}
check(/export const BOOT_STEP_MS = \d+/.test(pj), '그 값은 한 곳에서 정한다')

// ── ② 실패를 적는다 ─────────────────────────────────
{
  const i = pj.indexOf('openProject: async')
  const blk = pj.slice(i, i + 900)
  check(/set\(\{ loading: true, openError: null, openErrorId: null \}\)/.test(blk),
    '다시 열 때 옛 오류를 먼저 지운다')
  check(/openError: loadErrorText\(e, '자료'\)/.test(blk), '왜 못 열었는지 갈래를 따져 적는다')
  check(/openErrorId: id/.test(blk), '**어느 자료**였는지 같이 적는다')
  check(/finally \{[\s\S]{0,60}set\(\{ loading: false \}\)/.test(blk), '성공하든 실패하든 동그라미를 끈다')
  // 던지면 `void openProject(...)` 뒤에서 아무도 안 받는다 — 콘솔에만 남고 화면은 그대로다.
  check(!/throw e/.test(blk), '삼키지도, 허공에 던지지도 않는다')
}
check(/openError: string \| null/.test(pj) && /openErrorId: string \| null/.test(pj),
  '상태에 자리가 있다')
// 목록 실패와 **따로** 둔다 — 사람이 할 일이 다르다.
check(/listError: string \| null/.test(pj), '목록 실패는 그대로 따로 있다')

// ── ③ 화면이 말한다 ─────────────────────────────────
check(/openError \? \(/.test(lib), '목록 화면이 그 오류를 그린다')
{
  const i = lib.indexOf('openError ? (')
  const j = lib.indexOf('listError ? (')
  // 여는 실패가 **먼저** 걸려야 한다. 뒤에 두면 목록 오류가 남아 있을 때 가려진다.
  check(i > 0 && j > i, '여는 실패를 목록 실패보다 먼저 본다')
  const blk = lib.slice(i, j)
  check(/openProject\(openErrorId\)/.test(blk), '「다시」가 **그 자료를** 다시 연다')
  check(!/loadList\(\)/.test(blk), '목록을 다시 받는 게 아니다')
}
// 나무는 스케치 화면에서도 보인다 — 거기서 누른 사람도 들어야 한다.
check(/openError && \(/.test(tree), '사이드 나무도 말한다')
{
  const i = tree.indexOf('openError && (')
  const blk = tree.slice(i, i + 400)
  check(/openProject\(openErrorId\)/.test(blk), '나무의 「다시」도 그 자료를 연다')
}

// ── ④ 글이 무슨 일인지 말하는가 ──────────────────────
{
  const slow = Object.assign(new Error('시간 초과'), { name: 'TimeoutError' })
  const t = loadErrorText(slow, '자료')
  check(/자료를/.test(t), '「자료를」 — 조사가 맞는다')
  check(t.includes('\n'), '두 줄이다 — 무슨 일인지, 그다음 무엇을 할지')
  check(/멈춰|느리/.test(t), '서버가 멈췄을 수 있다고 말한다')
  const dead = new TypeError('Failed to fetch')
  check(classifyLoad(dead) === 'unreachable', '닿지 못한 것과 느린 것을 가른다')
  check(/닿지 못했어요/.test(loadErrorText(dead, '자료')), '닿지 못했으면 그렇게 적는다')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
