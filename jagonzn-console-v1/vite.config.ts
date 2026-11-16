import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { existsSync, realpathSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'

// Mac 的挂载点为 /Volumes/Samsung；Windows 上同一外置目录映射到当前盘符下的 \Volumes\Samsung。
const samsungRoot = resolve('/Volumes/Samsung')
const output = resolve(process.env.CONSOLE_V1_OUTPUT || '/Volumes/Samsung/Jagonzn/data/.private/workspaces/console-v1/main/runtime')

function isWithinSamsung(target: string) {
  if (!existsSync(samsungRoot)) return false
  let existing = target
  while (!existsSync(existing)) {
    const parent = dirname(existing)
    if (parent === existing) return false
    existing = parent
  }
  const normalize = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value
  const root = normalize(realpathSync(samsungRoot))
  const resolved = normalize(realpathSync(existing))
  return resolved === root || resolved.startsWith(root.endsWith(sep) ? root : root + sep)
}

if (!isWithinSamsung(output)) {
  throw new Error('Console V1 产物目录必须位于已挂载的 Samsung 外设')
}
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }, dedupe: ['vue'] },
  cacheDir: resolve(output, 'vite-cache'),
  server: {
    fs: {
      allow: [
        fileURLToPath(new URL('.', import.meta.url)),
        fileURLToPath(new URL('../..', import.meta.url))
      ]
    },
    proxy: {
    '^/_AMapService/api/v1/projects/[^/]+/directory-map-contexts/[^/]+/_AMapService/': {
      target: process.env.CONSOLE_V1_API || 'http://localhost:8080', changeOrigin: true,
      rewrite: path => path.slice('/_AMapService'.length),
    },
    '/api': {
      target: process.env.CONSOLE_V1_API || 'http://localhost:8080', changeOrigin: true,
      configure(proxy) {
        proxy.on('proxyRes', response => {
          // 只平移地图专用 Cookie 的精确 Path，普通会话 Cookie 不变。
          const cookies = response.headers['set-cookie']
          if (cookies) response.headers['set-cookie'] = cookies.map(cookie => cookie.startsWith('tc_directory_map=')
            ? cookie.replace(/(;\s*Path=)(\/api\/v1\/projects\/[^/;]+\/directory-map-contexts\/[^/;]+\/_AMapService\/)(?=;|$)/i, '$1/_AMapService$2')
            : cookie)
        })
      },
    },
  } },
  build: { outDir: resolve(output, 'dist'), emptyOutDir: false, rollupOptions: { input: { console: fileURLToPath(new URL('./index.html', import.meta.url)), directoryMap: fileURLToPath(new URL('./directory-map-frame.html', import.meta.url)) } } },
})
