// **PPT 로 내려받으면 색이 사라지던 문제.**
//
// 2026-09-16 · 사용자: 「PPT,PDF 다운받았을때 색상이며 도형들 그대로 다운 가능하게」.
// 미뤄 두셨다가(「PDF가 되니까 나중에」) 「백업용으로 있으면 좋겠다」고 다시 꺼내셨습니다.
//
// 짐작으로 고치지 않고 **진짜 .pptx 를 뽑아 XML 을 열어** 재었습니다.
//
//     고치기 전                          고친 뒤
//     칸 채우기        0개               21개 (화면의 칠해진 칸 수와 같음)
//     색 목록          …F2F5FA…          …FFFFCC · D98A2A…
//     열 너비          18열 전부 524933   1713817 / 641456 / 395844 …
//     TODAY            없음              1개 (파선 + 알약)
//
// 원인은 하나같이 **안 읽고 있었다**입니다 — `el.cbg` 를 아예 안 보고, `el.colw` 를
// 안 넘기고, 마커를 안 그렸습니다. 파워포인트가 못 하는 게 아니라 우리가 안 준 것입니다.
//
// 이 검사가 지키는 가장 중요한 것: **화면과 같은 함수로 판단한다.** 색 규칙을 여기서
// 따로 적으면 화면과 내려받은 것이 어긋나는데, 그게 바로 이 버그의 본체였습니다.
//
// 실행: node --experimental-strip-types --import ./ts_register.mjs pptx_fidelity.test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (cond, label, extra = '') => {
  if (cond) { pass++; console.log('✓ ' + label) }
  else { fail++; console.log('✗ ' + label + (extra ? '  — ' + extra : '')) }
}
const read = (p) => readFileSync(p, 'utf8')
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const src = read('./src/export/exportPptx.ts')
const px = bare(src)
const tbl = px.slice(px.indexOf("if (el.type === 'table')"), px.indexOf("if (el.type === 'note')"))
const shp = px.slice(px.indexOf('// 도형') > 0 ? px.indexOf('const st = ST[SHAPE') : 0)
const mk = px.slice(px.indexOf('function addTodayMarker'), px.indexOf('export async function exportPptx'))

// ── ① 칸 색을 읽는다 ──────────────────────────────
{
  check(/el\.cbg && el\.cbg\[key\]/.test(tbl), '**el.cbg 를 읽는다** — 이걸 안 읽어서 색이 통째로 사라졌다')
  check(/rgbToHex\(cellBackground\(cbg\)\)/.test(tbl),
    '색 규칙은 화면과 **같은 함수**에서 온다(cellBackground)')
  check(/rgbToHex\(cellTextColor\(cbg\)\)/.test(tbl),
    '어두운 칸의 글자색도 같은 함수에서 온다 — 검은 글자가 검은 칸에 묻히면 안 된다')
  check(/import \{[^}]*cellBackground[^}]*cellTextColor[^}]*\} from '\.\.\/template\/slots'/.test(src),
    'slots 에서 가져온다 — 여기에 규칙을 새로 적지 않는다')
}

// ── ② 머리글 회색을 **덮어쓰지 않는다** ───────────────
// 예전에는 r===0 이면 무조건 F2F5FA 였다. 그래서 양식의 연노랑(FFFFCC)이 회색이 됐다.
{
  check(/if \(!hx\) o\.fill = \{ color: 'F2F5FA' \}/.test(tbl),
    '색이 있으면 그 색이 이긴다 — F2F5FA 는 색이 없을 때만 쓰는 폴백이다')
  check(!/if \(head && r === 0\) \{ o\.bold = true; o\.fill = \{ color: 'F2F5FA' \} \}/.test(tbl),
    '「무조건 회색」 줄은 사라졌다')
  // 로드맵 머리글은 두 줄(연도 + 월)이다. 한 줄만 굵게 하면 연도 줄만 굵어진다.
  check(/lockedRowCount\(el\.slot\)/.test(tbl) && /r < headRows/.test(tbl),
    '머리글이 두 줄인 표(로드맵)도 두 줄 다 머리글로 본다')
}

// ── ③ 열 너비·행 높이를 넘긴다 ─────────────────────
// 안 넘기면 파워포인트가 전부 똑같이 나눈다(재어 본 값: 18열 전부 524933 EMU).
{
  check(/trackSizes\(el\.colw, C\)/.test(tbl) && /trackSizes\(el\.rowh, R\)/.test(tbl),
    '화면이 쓰는 그 함수로 너비를 읽는다')
  check(/colW, rowH/.test(tbl) || (/colW,/.test(tbl) && /rowH,/.test(tbl)),
    '**addTable 에 실제로 넘긴다** — 읽어 놓고 안 넘기면 아무 일도 안 일어난다')
  check(/\(box\.w \* v\) \/ sc/.test(tbl) && /\(box\.h \* v\) \/ sr/.test(tbl),
    '비율(fr)을 상자 크기로 풀어 인치로 준다')
}

// ── ④ 표 테두리 선 모양 ───────────────────────────
{
  check(/el\.borderWidth === 0\) \? 'none'/.test(tbl), '테두리 「없음」이 없음으로 간다')
  check(/el\.borderDash && el\.borderDash !== 'solid'\) \? 'dash'/.test(tbl),
    '파선·점선이 실선으로 뭉개지지 않는다 (파워포인트 표는 실선·파선·없음 셋뿐이다)')
}

// ── ⑤ TODAY 마커 ─────────────────────────────────
{
  check(/addTodayMarker\(slide, ST, el, cw, sc, sx, sy, node, nr\)/.test(tbl), '표마다 마커를 그린다')
  check(/todayPlace\(el\)/.test(mk), '자리는 화면과 **같은 함수**에서 온다')
  check(/ST\.line/.test(mk) && /'TODAY'/.test(mk), '파선 하나와 알약 하나를 그린다')
  check(/dashType: 'dash'/.test(mk), '선은 파선이다 — 화면도 파선이다')
  // 화면에서 읽는 길이 **먼저**여야 한다. 계산으로 맞추려다 6~8px 어긋났다:
  // todayX·todayY 는 .fel 상자가 아니라 안쪽 격자(.feltable)에서 잰 값이다.
  const iDom = mk.indexOf('.fel-today')
  const iCalc = mk.indexOf('place.kind === ')
  check(iDom > 0 && iCalc > 0 && iDom < iCalc,
    '**화면에서 읽는 길이 먼저다** — 계산은 화면이 없을 때의 폴백이다', 'dom@' + iDom + ' calc@' + iCalc)
  check(/getBoundingClientRect\(\)/.test(mk), '실제로 재서 옮긴다')
  check(/x - pw \/ 2/.test(mk), '알약이 선 가운데 온다 (화면의 translateX(-50%))')
}

// ── ⑥ 도형의 선 모양·반투명·그림자 ──────────────────
{
  check(/opts\.line\.dashType = el\.borderDash === 'dotted' \? 'sysDot' : 'dash'/.test(shp),
    '도형 테두리의 파선·점선이 따라간다')
  check(/transparency = Math\.round\(\(1 - el\.opacity\) \* 100\)/.test(shp),
    '반투명이 따라간다 — 화면은 0~1, 파워포인트는 「몇 % 비침」이라 뒤집는다')
  check(/el\.shadow\) opts\.shadow = \{ type: 'outer'/.test(shp), '그림자가 따라간다')
  // 채우기에만 걸면 테두리만 진하게 남아 딴 도형처럼 보인다(사진으로 확인, 2026-09-16).
  check(/opts\.line\.transparency = Math\.round\(\(1 - el\.opacity\) \* 100\)/.test(shp),
    '반투명이 **테두리에도** 걸린다')
}

// ── ⑦ 모양표는 그대로 있다 ────────────────────────
// 14가지 도형이 파워포인트 기본 도형으로 간다. 하나라도 빠지면 네모가 된다.
{
  for (const k of ['diamond', 'triangle', 'hexagon', 'pentagon', 'parallelogram', 'chevron',
                   'arrowR', 'arrowL', 'arrowU', 'arrowD', 'star5', 'star4', 'banner', 'callout']) {
    check(new RegExp(k + ":\\s*'").test(src), k + ' 이 제 모양으로 간다')
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
