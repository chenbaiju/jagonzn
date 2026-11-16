/** 纯展示夹具，只有本地事件回执，不配置HTTP或正式路由。 */
import {createApp,h,ref} from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import Table,{type AlarmRuleTableRow} from '../../src/features/alarms/AlarmRuleDirectoryTable.vue'
import PageHeader from '../../src/ui/PageHeader.vue'
const state=new URLSearchParams(location.search).get('state')||'empty',selected=ref('')
const rows:AlarmRuleTableRow[]=state==='empty'?[]:[{identity:'rule-1',name:'冷库温度监测',severityLabel:'重要',severityTone:'warning',sourceLabel:'设备类型',enabledLabel:'可用',notificationGroupLabels:['仓库值班人员通知'],customerChannels:['VOICE','SMS','WECHAT','APP']},{identity:'rule-2',name:'西区仓库温湿度传感器的温度超过安全范围',severityLabel:'紧急',severityTone:'danger',sourceLabel:'设备',enabledLabel:'停用',notificationGroupLabels:[],customerChannels:null}]
createApp({render:()=>h('main',{class:'tl-page'},[h(PageHeader,{title:'告警规则',count:rows.length}),h(Table,{rows,canManage:state!=='viewer',onEdit:(id:string)=>selected.value=id,onHistory:(id:string)=>selected.value=id}),selected.value?h('p',{role:'status'},selected.value):null])}).use(ElementPlus).mount('#app')
