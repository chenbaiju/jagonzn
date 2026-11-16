import {computed,onScopeDispose,ref,shallowRef} from 'vue'
import {ApiError,errorMessage,IdentityChanged} from '@/core/http'
import {projectId} from '@/core/session'
import {isDeviceScopeCurrent,useDeviceGuard} from './use-device-guard'
import type {DeviceAlarmRule} from './device-alarm-rules-api'
import {MAX_ALLOWANCE_VERSION,prepareDeviceAlarmAllowance,readDeviceAlarmAllowance,submitDeviceAlarmAllowance,type DeviceAlarmAllowance,type DeviceAlarmAllowanceIntent} from './device-alarm-allowance-api'

type Review=Readonly<{name:string;intent:DeviceAlarmAllowanceIntent;stage:'sending'|'unknown'|'rejected';error:string;reading:boolean;current?:DeviceAlarmAllowance}>
type Options={device:()=>string;visible:()=>boolean;readable:()=>boolean;writable:()=>boolean;current:(row:DeviceAlarmRule)=>boolean;hasRule:(rule:string)=>boolean;apply:(state:DeviceAlarmAllowance)=>void;beforeWrite:()=>void;readDenied:(cause:unknown)=>void}
/** 同设备模式隐藏保留未知意图；换身份/作用域由父页reset，迟到回执不得影响新操作。 */
export function useDeviceAlarmAllowance(options:Options){
 const entries=shallowRef<ReadonlyMap<string,Review>>(new Map()),pending=ref<string>(),writeDenied=ref(false)
 const reviews=computed(()=>[...entries.value.values()].filter(entry=>entry.stage!=='sending'))
 const busy=computed(()=>!!pending.value||[...entries.value.values()].some(entry=>entry.reading))
 const capture=useDeviceGuard(options.device)
 let generation=0,serial=0,disposed=false,writeController:AbortController|undefined,readController:AbortController|undefined
 function replace(rule:string,value?:Review){const next=new Map(entries.value);if(value)next.set(rule,Object.freeze(value));else next.delete(rule);entries.value=next}
 function active(check:()=>void,g:number,s:number){return !disposed&&g===generation&&s===serial&&isDeviceScopeCurrent(check)}
 function reset(){generation++;serial++;writeController?.abort();readController?.abort();pending.value=undefined;entries.value=new Map();writeDenied.value=false}
 function hide(){serial++;writeController?.abort();readController?.abort();pending.value=undefined;entries.value=new Map([...entries.value].map(([rule,value])=>[rule,Object.freeze({...value,stage:value.stage==='sending'?'unknown':value.stage,reading:false,current:undefined})]))}
 function canChange(row:DeviceAlarmRule){return options.visible()&&options.readable()&&options.writable()&&!writeDenied.value&&!busy.value&&!entries.value.has(row.id)&&options.current(row)&&row.deviceAllowanceVersion<MAX_ALLOWANCE_VERSION}
 function rowBusy(rule:string){return pending.value===rule||entries.value.get(rule)?.reading===true}
 async function change(row:DeviceAlarmRule,allowed:boolean){
  if(!canChange(row)||typeof allowed!=='boolean'||allowed===row.deviceAllowed)return
  const intent=prepareDeviceAlarmAllowance(projectId.value,{deviceId:options.device(),ruleId:row.id,allowed:row.deviceAllowed,version:row.deviceAllowanceVersion},allowed)
  const check=capture(),g=generation,s=++serial;options.beforeWrite();pending.value=row.id
  replace(row.id,{name:row.name,intent,stage:'sending',error:'',reading:false});const controller=new AbortController();writeController=controller
  try{
   const result=await submitDeviceAlarmAllowance(intent,controller.signal)
   if(!active(check,g,s)||!options.visible()||!options.readable()||!options.writable())return
   options.apply(result);replace(row.id)
  }catch(cause){
   if(!active(check,g,s)||cause instanceof IdentityChanged)return
   if(cause instanceof ApiError&&[401,404].includes(cause.status)){options.readDenied(cause);return}
   if(cause instanceof ApiError&&cause.status===403)writeDenied.value=true
   const rejected=cause instanceof ApiError&&!cause.outcomeUnknown&&[400,403,409,413,422,429].includes(cause.status)
   replace(row.id,{name:row.name,intent,stage:rejected?'rejected':'unknown',error:errorMessage(cause),reading:false})
  }finally{if(active(check,g,s))pending.value=undefined}
 }
 async function readCurrent(expected:Review){
  const rule=expected.intent.rule
  const entry=entries.value.get(rule)
  if(!entry||entry.intent!==expected.intent||entry.stage==='sending'||busy.value||!options.visible()||!options.readable())return
  const check=capture(),g=generation,s=++serial,controller=new AbortController();readController=controller
  replace(rule,{...entry,reading:true,current:undefined,error:''})
  try{
   const result=await readDeviceAlarmAllowance(entry.intent.project,entry.intent.device,rule,controller.signal)
   if(!active(check,g,s)||!options.visible()||!options.readable())return
   if(result.version<entry.intent.version)throw new Error('当前允许状态版本早于本次意图，请重新核对')
   options.apply(result);replace(rule,{...entry,reading:false,current:result,error:''})
  }catch(cause){
   if(!active(check,g,s)||controller.signal.aborted||cause instanceof IdentityChanged)return
   if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){options.readDenied(cause);return}
   replace(rule,{...entry,reading:false,current:undefined,error:errorMessage(cause)})
  }finally{if(active(check,g,s)){const value=entries.value.get(rule);if(value?.reading)replace(rule,{...value,reading:false})}}
 }
 function continueWithCurrent(expected:Review){
  const rule=expected.intent.rule
  const entry=entries.value.get(rule)
  if(!entry?.current||entry.intent!==expected.intent||entry.current!==expected.current||busy.value||!options.visible()||!options.readable()||!options.hasRule(rule))return
  options.apply(entry.current);replace(rule)
 }
 onScopeDispose(()=>{disposed=true;reset()})
 return {reviews,busy,writeDenied,canChange,rowBusy,change,readCurrent,continueWithCurrent,reset,hide}
}
