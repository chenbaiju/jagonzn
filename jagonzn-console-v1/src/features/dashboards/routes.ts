import type {RouteRecordRaw} from 'vue-router'

export const dashboardRoutes:RouteRecordRaw[]=[
  {path:'dashboards',name:'dashboards',component:()=>import('./DashboardDirectory.vue')},
  {path:'dashboards/new',name:'dashboard-create',component:()=>import('./DashboardCreate.vue')},
  {path:'dashboards/:dashboardId',name:'dashboard-detail',component:()=>import('./DashboardDetail.vue')}
]
