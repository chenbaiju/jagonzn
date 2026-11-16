import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }, dedupe: ['vue'] },
  cacheDir: `${process.env.CONSOLE_V1_OUTPUT || '/Volumes/Samsung/Jagonzn/data/.private/workspaces/console-v1/main/runtime'}/vitest-cache`,
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'], maxWorkers: 2 }
})
