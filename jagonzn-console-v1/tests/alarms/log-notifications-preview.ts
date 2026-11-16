/** 纯展示夹具，不访问HTTP、剪贴板或实际通知供应商。 */
import {createApp,h,ref} from 'vue'
import ElementPlus,{ElDialog,ElButton} from 'element-plus'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import Notifications,{type AlarmLogNotificationDisplay} from '../../src/features/alarms/AlarmLogNotifications.vue'
const state=new URLSearchParams(location.search).get('state')||'list',open=ref(true),copied=ref('')
const base:AlarmLogNotificationDisplay[]=[{key:'email',kind:'EMAIL',recipient:'***',failureCode:null},{key:'hook',kind:'WEBHOOK',recipient:'',failureCode:'DEAD_LETTER'},{key:'push',kind:'PUSH',recipient:'',failureCode:'SUPPRESSED_QUOTA'}]
const items:AlarmLogNotificationDisplay[]=state==='empty'?[]:state==='truncated'?Array.from({length:100},(_,index)=>({...base[index%base.length]!,key:String(index)})):base
createApp({render:()=>h('main',{class:'tl-page'},[h(ElButton,{onClick:()=>open.value=true},()=> '查看详情'),h(ElDialog,{modelValue:open.value,'onUpdate:modelValue':(v:boolean)=>open.value=v,title:'查看告警详情',width:'min(600px,94vw)'},{default:()=>[h('dl',{class:'tl-key-values'},[h('dt','状态'),h('dd','重要告警'),h('dt','发生时间'),h('dd','2026-10-24 11:00:00'),h('dt','设备名称'),h('dd','冷库温湿度传感器 A-01')]),h(Notifications,{items,truncated:state==='truncated',onCopyError:(code:string)=>copied.value=code}),copied.value?h('p',{role:'status'},'已复制错误信息'):null],footer:()=>h(ElButton,{onClick:()=>open.value=false},()=> '关闭')})])}).use(ElementPlus).mount('#app')
