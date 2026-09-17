/**
 * **형제 앱 주소 — 화면이 쓰는 한 자리.**
 *
 * 2026-09-17 · 이 파일이 생긴 이유를 적는다.
 *
 * 같은 날 포트를 `ports.json` 한 곳으로 모았는데 **실행기만 모았다.** 화면은 그대로여서
 * `LibraryScreen` · `TopBar` · `TitleBar` 세 파일이 저마다 `const FOLIO_URL =
 * 'http://127.0.0.1:8811'` 을 들고 있었다. 「모았다」고 말해 놓고 반쪽이었다.
 *
 * 세 벌이면 반드시 갈라진다. 게다가 갈라져도 **아무 소리가 안 난다** — 칩이 빈 탭을
 * 열 뿐이라, 눌러 본 사람만 알고 그 사람도 「FOLIO 가 안 떴나 보다」라고 넘긴다.
 *
 * 그래서 값은 `ports.json` 에서만 오고, 여기서는 **주소 모양으로 바꾸기만** 한다.
 * 포트를 옮길 일이 생기면 고칠 곳은 `ports.json` 하나다.
 */
// **주의 — 이 import 는 Vite 에서만 그냥 통한다.**
// 맨 노드(root 의 `*.test.mjs` 가 도는 자리)는 JSON 을 들일 때 `with { type: 'json' }`
// 을 요구해서, 이 파일을 **노드 쪽에서 타고 들어오면 ERR_IMPORT_ATTRIBUTE_MISSING 으로
// 깨진다.** 2026-09-17 현재 그렇게 타고 들어오는 테스트는 없다(2,348개 통과 확인).
// 나중에 `ports.ts` 를 쓰는 모듈을 노드 테스트에서 import 하게 되면 여기가 먼저 터진다 —
// 그때는 속성을 붙이지 말고(빌드 쪽이 갈린다) 그 테스트에서 ports.json 을 직접 읽어라.
// `ports.test.mjs` 가 이미 그렇게 한다(JSON.parse).
import ports from '../ports.json'

/** 「127.0.0.1:8811」. 화면에 그대로 보여 주는 자리(title)가 있어서 따로 뺀다. */
export const FOLIO_HOST = `127.0.0.1:${ports.folio}`

/** EVER-FOLIO(uniever_ebook 이북 라이브러리) 뿌리 주소. run.command 가 같이 띄운다. */
export const FOLIO_URL = `http://${FOLIO_HOST}`

/** 발행본 한 권의 주소. 세 자리에서 같은 문자열을 이어 붙이고 있었다. */
export const folioBookUrl = (publishedId: string): string =>
  `${FOLIO_URL}/ebooks/${publishedId}/index.html`
