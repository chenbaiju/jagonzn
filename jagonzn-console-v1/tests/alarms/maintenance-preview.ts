/** 维护弹层隔离夹具，无正式路由或API；保存后的任何场景均是本地回调状态，不作为真实写入证明。 */
import { createApp, h, ref } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import Editor from '../../src/features/alarms/AlarmLogMaintenanceEditor.vue'
import { ApiError } from '../../src/core/http'
const params=new URLSearchParams(location.search),state=params.get('state')||'ok',open=ref(true)
window.fetch=async()=>new Response(JSON.stringify({message:'读取失败'}),{status:503,headers:{'Content-Type':'application/json'}})
const page={setup:()=>()=>h('main',{style:'padding:28px;background:#f5f7fa;min-height:100vh'},[h('h1',{style:'font-size:20px;font-weight:500'},'告警历史'),h('p','电流异常 · 配电柜 A-01'),h('button',{class:'open-editor',onClick:()=>{open.value=true}},'编辑维护信息'),open.value?h(Editor,{projectId:'fixture-project',logId:'fixture-log',normal:state!=='alerting',canMaintain:true,initial:{version:2,alarmReason:'线路检修后出现短时电流波动。',solution:'已检查接线端子，并恢复设备供电。',remark:'后续继续观察运行情况。'},save:async()=>{if(state==='unknown')throw new TypeError('fixture lost reply');if(state==='conflict')throw new ApiError('维护信息已变更',409);await new Promise(resolve=>setTimeout(resolve,350));throw new ApiError('维护信息已变更',409)},onClose:()=>{open.value=false}}):null])}
createApp(page).use(ElementPlus).mount('#app')
