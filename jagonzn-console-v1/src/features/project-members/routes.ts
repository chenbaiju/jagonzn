import type { RouteRecordRaw } from 'vue-router'

export const projectMemberRoutes: RouteRecordRaw[] = [
  { path: 'project-members', name: 'project-members', component: () => import('./ProjectMembersPage.vue') }
]
