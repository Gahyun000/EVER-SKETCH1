// 화면 코드(.ts/.tsx)를 노드에서 그대로 불러오기 위한 등록기.
// 확장자 없는 상대 경로를 이어 주는 resolver 를 얹는다(ts_resolve.mjs 주석 참고).
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
register('./ts_resolve.mjs', pathToFileURL('./'))
