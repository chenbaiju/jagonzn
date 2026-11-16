/** 仅48格展示与选择，无HTTP/时区写入或真实告警运行。 */
import {createApp,h,ref} from 'vue'
import ElementPlus,{ElDialog,ElButton} from 'element-plus'
import 'element-plus/dist/index.css'
import '../../src/styles/tokens.css'
import Slots from '../../src/features/alarms/AlarmRuleTimeSlots.vue'
import {alarmRuleTimeRanges} from '../../src/features/alarms/alarm-rule-time-slots'
const state=new URLSearchParams(location.search).get('state')||'all',selected=ref(state==='empty'?[]:state==='split'?[0,1,2,3,18,19,20,21,47]:Array.from({length:48},(_,i)=>i)),open=ref(true)
createApp({render:()=>h(ElDialog,{modelValue:open.value,'onUpdate:modelValue':(v:boolean)=>open.value=v,title:'设置告警规则',width:'min(700px,94vw)',closeOnClickModal:false,lockScroll:false},{default:()=>[h('div',{style:'margin-bottom:16px;font-size:14px'},'有效时间'),h('p','选择时间段'),h(Slots,{modelValue:selected.value,'onUpdate:modelValue':(v:number[])=>selected.value=v}),h('p',{role:'status',style:'font-size:14px'},alarmRuleTimeRanges(selected.value).map(range=>range.join(' - ')).join('，')||'未选择时段')],footer:()=>[h(ElButton,{onClick:()=>open.value=false},()=> '取消'),h(ElButton,{type:'primary'},()=> '提交')]} )}).use(ElementPlus).mount('#app')
