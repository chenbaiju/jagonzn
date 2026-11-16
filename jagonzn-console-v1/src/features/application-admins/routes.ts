import type { RouteRecordRaw } from 'vue-router'

export const applicationAdminRoutes: RouteRecordRaw[] = [
  { path: 'admins', name: 'application-admins', component: () => import('./ApplicationAdminsDirectory.vue') },
  { path: 'admin_add', name: 'application-admin-create', component: () => import('./ApplicationAdminCreatePage.vue') },
  { path: 'admins/:adminId', name: 'application-admin-detail', component: () => import('./ApplicationAdminDetailPage.vue') }
]
