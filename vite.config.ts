import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // booth.localhost / admin.localhost 등 서브도메인 접근 허용 (host 모드 분기용)
    host: true,
    // *.localhost 는 macOS 가 자동 해석함. 윈도우/리눅스는 /etc/hosts 추가 필요.
  },
})
