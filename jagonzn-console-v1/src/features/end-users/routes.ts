import type {RouteRecordRaw} from 'vue-router'

export const endUserRoutes:RouteRecordRaw[]=[
  {path:'end-users',name:'end-users',component:()=>import('./EndUsersDirectory.vue')}
]
