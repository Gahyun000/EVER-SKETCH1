// 확장자 없는 상대 경로를 .ts / .tsx 로 이어 준다.
//
// 왜 필요한가: 노드는 `./x` 를 그대로 찾는다. 화면 코드는 번들러 규칙(확장자 생략)을
// 쓰므로 그대로는 못 읽는다. 이게 없으면 테스트가 **원본 대신 같은 로직을 다시
// 구현해서** 검사하게 되는데, 그러면 원본이 바뀌어도 테스트는 통과한다.
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve as join } from 'node:path'

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.(ts|tsx|mjs|js|json)$/.test(specifier)) {
    const base = dirname(fileURLToPath(context.parentURL))
    for (const ext of ['.ts', '.tsx']) {
      const p = join(base, specifier + ext)
      if (existsSync(p)) return next(pathToFileURL(p).href, context)
    }
  }
  return next(specifier, context)
}
