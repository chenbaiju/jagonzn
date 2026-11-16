import type { RouteRecordRaw } from 'vue-router'
export const deviceRoutes: RouteRecordRaw[] = [
  { path: 'devices', name: 'devices', component: () => import('./DeviceList.vue') },
  { path: 'devices/create', name: 'device-create', component: () => import('./DeviceCreate.vue') },
  { path: 'devices/:deviceId', name: 'device-detail', component: () => import('../../pages/DeviceDetailRoute.vue') },
]
