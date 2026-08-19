import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 개발 모드(npm run dev)에서 /api 를 백엔드로 넘긴다.
// 프록시가 없으면 요청이 5173 으로 가서 404 가 되고, 무엇보다 세션 쿠키가
// 다른 오리진 취급을 받아 로그인이 풀린다. 운영에서는 uvicorn 이 dist/ 를
// 같은 포트에서 서빙하므로 프록시가 관여하지 않는다.
const BACKEND = process.env.ES_BACKEND || 'http://127.0.0.1:8820'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: BACKEND, changeOrigin: false },
      '/ebooks': { target: BACKEND, changeOrigin: false },
      '/deck_out': { target: BACKEND, changeOrigin: false },
    },
  },
})
