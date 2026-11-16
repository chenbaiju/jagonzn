import { createRouter, createWebHistory } from 'vue-router'
import Shell from './layout/ConsoleShell.vue'
import Login from './pages/auth/LoginPage.vue'
import Register from './pages/auth/RegisterPage.vue'
import ForgotPassword from './pages/auth/ForgotPasswordPage.vue'
import ResetPassword from './pages/auth/ResetPasswordPage.vue'
import VerifyEmail from './pages/auth/VerifyEmailPage.vue'
import Projects from './pages/ProjectsPage.vue'
import ProjectSettings from './pages/ProjectSettingsPage.vue'
import Foundation from './pages/FoundationPage.vue'
import { needsLogin } from './core/session'
import { isPublicAuthPath, normalizeLegacyAuthHash } from './core/auth-routes'
import { deviceRoutes } from './features/devices/routes'
import { deviceTypeRoutes } from './features/device-types/routes'
import { ruleRoutes } from './features/rules/routes'
import { notificationGroupRoutes } from './features/alarms/notification-group-routes'
import { userApplicationRoutes } from './features/user-applications/routes'
import { dashboardRoutes } from './features/dashboards/routes'
import { endUserRoutes } from './features/end-users/routes'
import { applicationAdminRoutes } from './features/application-admins/routes'
import { projectMemberRoutes } from './features/project-members/routes'

// 邮件链接仍是 hash 形式；必须在 createWebHistory 读取地址之前还原。
normalizeLegacyAuthHash()

/** 模块只导出 RouteRecordRaw[]；此注册文件由主控单写。 */
export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', component: Login },
    { path: '/register', component: Register },
    { path: '/forgot-password', component: ForgotPassword },
    { path: '/reset-password', component: ResetPassword },
    { path: '/auth/reset-password', component: ResetPassword },
    { path: '/auth/verify-email', component: VerifyEmail },
    { path: '/signin', redirect: '/login' },
    { path: '/signup', redirect: '/register' },
    { path: '/find_pwd', redirect: '/forgot-password' },
    { path: '/', component: Shell, children: [
      { path: '', redirect: '/projects' },
      { path: 'projects', component: Projects },
      { path: 'projects/create', component: () => import('./pages/ProjectCreatePage.vue') },
      { path: 'overview', name: 'overview', component: () => import('./pages/OverviewPage.vue') },
      { path: 'account-settings', component: Foundation, meta: { pending: true, title: '账号设置' } },
      ...dashboardRoutes,
      ...endUserRoutes,
      ...applicationAdminRoutes,
      ...projectMemberRoutes,
      ...[
        ['screens', '大屏'], ['message-logs', '消息日志'],
        ['sim-overview', '卡概览'], ['sim-cards', 'SIM卡'], ['release-notes', '新功能'], ['blog', '博客'],
        ['mobile-app/ios', 'iOS App'], ['mobile-app/android', 'Android App'],
        ['custom-data-streams', '自定义数据流']
      ].map(([path, title]) => ({ path, component: Foundation, meta: { pending: true, title } })),
      { path: 'project-settings', component: ProjectSettings },
      ...deviceRoutes,
      ...deviceTypeRoutes,
      ...userApplicationRoutes,
      { path: 'applications', name: 'project-applications', component: () => import('./features/applications/ProjectApplications.vue') },
      { path: 'device-groups/:groupId?', name: 'device-groups', component: () => import('./features/device-groups/DeviceGroupDirectory.vue') },
      { path: 'device-queries', name: 'device-queries', component: () => import('./features/devices/DeviceQueryDirectory.vue') },
      { path: 'ota-versions', name: 'ota-versions', component: () => import('./features/ota/OtaVersions.vue') },
      { path: 'ota-campaigns', name: 'ota-campaigns', component: () => import('./features/ota/OtaCampaigns.vue') },
      ...ruleRoutes,
      ...notificationGroupRoutes,
      { path: 'alarm-rules', name: 'alarm-rules', component: () => import('./features/alarms/AlarmRulesPage.vue') },
      { path: 'alarm-history', name: 'alarm-history', component: () => import('./features/alarms/AlarmTransitionLogsView.vue'), props: route => ({initialRuleId: typeof route.query.ruleId === 'string' ? route.query.ruleId : undefined}) },
      { path: 'message-rules', redirect: '/rules/messages' },
      { path: 'rule-logs', redirect: '/rules/executions' },
      { path: 'automations', redirect: '/rules/automations' },
      { path: 'scenes', redirect: '/rules/scenes' },
      { path: 'task-jobs', redirect: '/tasks/jobs' },
      { path: ':pathMatch(.*)*', component: Foundation, meta: { pending: true } },
    ] }
  ]
})
router.beforeEach(to => {
  if (needsLogin() && !isPublicAuthPath(to.path))
    return { path: '/login', query: { redirect: to.fullPath } }
})
