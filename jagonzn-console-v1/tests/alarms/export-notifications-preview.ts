/** 实际HTTP封装+内存fetch与文件sink；无共享8080、真实DB、剪贴板或磁盘下载。 */
import {createApp,h,ref} from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import {createMemoryHistory,createRouter,RouterView} from 'vue-router'
import Page from '../../src/features/alarms/AlarmTransitionLogsView.vue'
import {session} from '../../src/core/session'
import {setAccessToken} from '../../src/core/http'
import {alarmLogExportBlob,type AlarmLogExportFile} from '../../src/features/alarms/alarm-log-export-file'
import {transitionMaintenanceServer,maintenanceProject} from './transition-maintenance-server'
const receipt=ref(''),server=transitionMaintenanceServer('notifications');window.fetch=server.fetcher;setAccessToken('fixture-only');session.user={currentProjectId:maintenanceProject,projectRole:'VIEWER',permissions:['alarm:read']}
const download=(file:AlarmLogExportFile)=>{const blob=alarmLogExportBlob(file);receipt.value=`${file.filename} · ${blob.type} · ${blob.size} 字节`}
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:Page,props:{exportDownload:download}}]});await router.push('/');await router.isReady()
createApp({render:()=>h('div',[h(RouterView),receipt.value?h('p',{role:'status',style:'padding:0 20px'},receipt.value):null])}).use(ElementPlus).use(router).mount('#app')
