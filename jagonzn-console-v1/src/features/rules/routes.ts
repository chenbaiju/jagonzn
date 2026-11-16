import type { RouteRecordRaw } from 'vue-router'
/** 由主控挂入 ConsoleShell.children；本域不修改全局注册。 */
export const ruleRoutes: RouteRecordRaw[] = [
  { path: '/task-runs', name: 'V1TaskLogs', component: () => import('./TaskLogsPage.vue') },
  { path: '/tasks/jobs/create', name: 'V1DeviceTaskCreate', component: () => import('./DeviceTaskCreatePage.vue') },
  { path: '/tasks/jobs/:id', name: 'V1TaskJobDetail', component: () => import('./TaskDetailPage.vue') },
  { path: '/rules/automations', name: 'V1Automations', component: () => import('./OrchestrationPage.vue'), props: { kind: 'automation' } },
  { path: '/rules/automations/create', name: 'V1AutomationCreate', component: () => import('./AutomationEditorPage.vue') },
  { path: '/rules/automations/:id/edit', name: 'V1AutomationEdit', component: () => import('./AutomationEditorPage.vue') },
  { path: '/rules/automations/:id', name: 'V1AutomationDetail', component: () => import('./AutomationDetailPage.vue') },
  { path: '/rules/scenes', name: 'V1Scenes', component: () => import('./OrchestrationPage.vue'), props: { kind: 'scene' } },
  { path: '/rules/scenes/create', name: 'V1SceneCreate', component: () => import('./SceneEditorPage.vue') },
  { path: '/rules/scenes/:id/edit', name: 'V1SceneEdit', component: () => import('./SceneEditorPage.vue') },
  { path: '/rules/scenes/:id', name: 'V1SceneDetail', component: () => import('./SceneDetailPage.vue') },
  { path: '/tasks/jobs', name: 'V1TaskJobs', component: () => import('./TasksPage.vue') },
  { path: '/rules/executions', name: 'V1RuleExecutions', component: () => import('./ExecutionsPage.vue') },
  { path: '/rules/messages', name: 'V1MessageRules', component: () => import('./RulesPage.vue') },
  { path: '/rules/messages/create', name: 'V1DeviceMessageRuleCreate', component: () => import('./DeviceRuleCreatePage.vue') },
  { path: '/rules/messages/:id', name: 'V1MessageRuleDetail', component: () => import('./RuleDetailEntry.vue') },
]
