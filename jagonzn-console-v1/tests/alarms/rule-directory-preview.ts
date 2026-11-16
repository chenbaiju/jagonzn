/** 正式504生成合同消费者；隔离memory fetch，不连接共享后端。 */
import {createApp,h} from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import Page from '../../src/features/alarms/AlarmRuleDirectoryView.vue'
import {session} from '../../src/core/session'
import {setAccessToken} from '../../src/core/http'
import {directoryRule,ruleProject} from './rule-directory-fixture'
const state=new URLSearchParams(location.search).get('state')||'list'
const rows=Array.from({length:49},(_,index)=>({...directoryRule(),id:`00000000-0000-4000-8000-${String(index+10).padStart(12,'0')}`,name:index?'西区仓库温湿度传感器温度超过安全范围 '+(index+1):'冷库温度监测',level:index%3===0?'IMPORTANT' as const:index%3===1?'URGENT' as const:'NORMAL' as const,sourceKind:index%2?'DEVICE' as const:'DEVICE_TYPE' as const,enabled:index%2===0,notificationGroups:directoryRule().notificationGroups.map(group=>({...group,name:index===1?null:group.name})),customerChannels:index===2?[]:directoryRule().customerChannels}))
window.fetch=async(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input),location.href);const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
 if(init?.method!=='GET'||url.pathname!==`/api/v1/projects/${ruleProject}/console/alarm-rules`)return response({message:'夹具没有此操作'},503)
 if(state==='error')return response({message:'目录暂时无法读取'},503)
 const page=Number(url.searchParams.get('page')||1),limit=Number(url.searchParams.get('limit')||24),sourceKind=url.searchParams.get('sourceKind'),selected=(state==='empty'?[]:rows).filter(row=>!sourceKind||row.sourceKind===sourceKind)
 return response({items:selected.slice((page-1)*limit,page*limit),total:String(selected.length),page,limit})
}
session.user={accountId:'00000000-0000-4000-8000-000000000099',currentProjectId:ruleProject,displayName:'项目成员',permissions:state==='forbidden'?[]:['alarm:read']};session.projects=[{id:ruleProject,name:'本地隔离夹具'}];session.ready=true;setAccessToken('local-fixture-only')
createApp({render:()=>h(Page,{onHistory:(identity:string)=>{document.getElementById('receipt')!.textContent='告警历史：'+identity}})}).use(ElementPlus).mount('#app')
const receipt=document.createElement('p');receipt.id='receipt';receipt.setAttribute('role','status');document.body.append(receipt)
