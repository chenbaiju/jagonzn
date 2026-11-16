import type { RouteRecordRaw } from 'vue-router'
/** 通知组独立接收入口；主控可先注册本集合，后继规则/历史仍各自成套接收。 */
export const notificationGroupRoutes: RouteRecordRaw[] = [
  { path: '/notification-groups', name: 'alarm-notification-groups', component: () => import('./NotificationGroupsPage.vue'), meta: { permission: 'alarm:read' } },
  { path: '/notification-groups/create', name: 'alarm-notification-group-create', component: () => import('./NotificationGroupCreatePage.vue'), meta: { permission: 'alarm:manage' } },
  { path: '/notification-groups/:groupId', name: 'alarm-notification-group', component: () => import('./NotificationGroupsPage.vue'), meta: { permission: 'alarm:read' } },
  { path: '/notification-templates', name: 'alarm-notification-templates', component: () => import('./NotificationTemplatesPage.vue'), meta: { permission: 'alarm:read' } },
]
