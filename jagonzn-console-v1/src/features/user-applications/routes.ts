import type {RouteRecordRaw} from 'vue-router'
export const userApplicationRoutes:RouteRecordRaw[]=[
 {path:'user-applications',name:'user-applications',component:()=>import('./UserApplications.vue'),props:{mode:'directory'}},
 {path:'user-applications/new',name:'user-application-select',component:()=>import('./UserApplications.vue'),props:{mode:'select'}},
 {path:'user-applications/create/:kind',name:'user-application-create',component:()=>import('./UserApplications.vue'),props:route=>({mode:'create',kind:String(route.params.kind)})}
]
