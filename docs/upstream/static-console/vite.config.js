import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 本机测试页仅监听回环；固定端口被占用时直接报错，避免误访问其他项目。
export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 13006,
    strictPort: true
  },
  preview: {
    host: '127.0.0.1',
    port: 13006,
    strictPort: true
  }
})
