/** 纯显示模型与内存文件sink；无HTTP、浏览器文件写入或真实后端资格。 */
import {createApp,h,ref} from 'vue'
import ElementPlus,{ElButton} from 'element-plus'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import Dialog from '../../src/features/alarms/AlarmLogExportDialog.vue'
import PageHeader from '../../src/ui/PageHeader.vue'
import {alarmLogExportBlob,type AlarmLogExportDisplayRow,type AlarmLogExportFile} from '../../src/features/alarms/alarm-log-export-file'
const state=new URLSearchParams(location.search).get('state')||'default',open=ref(true),receipt=ref('')
const row:AlarmLogExportDisplayRow={device_id:'00000000-0000-4000-8000-000000000001',device_name:'冷库设备 A-01',device_type_name:'温湿度传感器',alarm_time:'2026-10-24 08:00:00',alarm_rule:'冷库温度监测',alarm_state:'告警',alarm_level:'重要告警',alarm_attributes:'温度: 0 °C',alarm_reason:'已复核传感器接线',solution:'',remark:'维护夹具😀'}
const load=async(signal:AbortSignal)=>{
 if(state==='busy')return new Promise<AlarmLogExportDisplayRow[]>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('取消','AbortError')),{once:true}))
 if(state==='error')throw new Error('告警日志暂时无法读取，请稍后重试')
 return state==='empty'?[]:[row]
}
function download(file:AlarmLogExportFile){const blob=alarmLogExportBlob(file);receipt.value=`${file.filename} · ${blob.type} · ${blob.size} 字节（内存文件）`}
createApp({render:()=>h('main',{class:'tl-page'},[h(PageHeader,{title:'告警历史'},()=>h(ElButton,{onClick:()=>open.value=true},()=> '导出')),h(Dialog,{modelValue:open.value,'onUpdate:modelValue':(value:boolean)=>open.value=value,scopeKey:'local-project/identity/filter',load,download}),receipt.value?h('p',{role:'status'},receipt.value):null])}).use(ElementPlus).mount('#app')
