import {computed,onScopeDispose,reactive,ref,shallowRef,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {projectId,session} from '@/core/session'
import {preparePresenceSettings,prepareRegistrationSettings,presenceReceiptMatches,registrationReceiptMatches,samePresence,sameRegistration,type PresenceSettings,type RegistrationSettings,type PresenceSettingsIntent,type RegistrationSettingsIntent,type PresenceSettingsDraft,type RegistrationSettingsDraft,type TypeSettingsAggregateTransport} from './type-settings-aggregate-api'
type Group='presence'|'registration'
type Snapshot={kind:'presence';value:PresenceSettings}|{kind:'registration';value:RegistrationSettings}
type Intent={kind:'presence';value:PresenceSettingsIntent;before:PresenceSettings}|{kind:'registration';value:RegistrationSettingsIntent;before:RegistrationSettings}
type Options={typeId:()=>string;readable:()=>boolean;writable:(group:Group)=>boolean;disabled:()=>boolean;transport:()=>TypeSettingsAggregateTransport;changed:()=>void}
/** 只服务类型设置的两个互斥弹窗；每组只保留一个草稿、基版及原请求。 */
export function useTypeSettingsAggregate(options:Options){
 const group=ref<Group>(),snapshot=shallowRef<Snapshot>(),intent=shallowRef<Intent>(),observed=shallowRef<Snapshot>(),busy=ref(false),unknown=ref(false),conflict=ref(false),error=ref(''),notice=ref(''),denied=ref(false)
 const presence=reactive<PresenceSettingsDraft>({online:'',activity:''}),registration=reactive<RegistrationSettingsDraft>({automaticCreationEnabled:false,identifierEnabled:false,productIdentifier:''})
 const readable=computed(()=>options.readable()&&!denied.value),writable=computed(()=>!!group.value&&readable.value&&options.writable(group.value)),locked=computed(()=>!!group.value||busy.value||unknown.value)
 let generation=0,alive=true,controller:AbortController|undefined
 function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,type:options.typeId(),actor:session.user?.accountId,group:group.value}}
 function current(value:ReturnType<typeof capture>){return alive&&readable.value&&value.generation===generation&&value.epoch===identityEpoch()&&value.project===projectId.value&&value.type===options.typeId()&&value.actor===session.user?.accountId&&value.group===group.value}
 function reset(){generation++;controller?.abort();group.value=undefined;snapshot.value=undefined;intent.value=undefined;observed.value=undefined;busy.value=false;unknown.value=false;conflict.value=false;error.value='';notice.value='';presence.online='';presence.activity='';registration.automaticCreationEnabled=false;registration.identifierEnabled=false;registration.productIdentifier=''}
 function bind(value:Snapshot){snapshot.value=value;if(value.kind==='presence'){presence.online=value.value.online.onlineTimeoutMinutes===null?'':String(value.value.online.onlineTimeoutMinutes);presence.activity=value.value.activity.activeTimeoutMinutes===null?'':String(value.value.activity.activeTimeoutMinutes)}else{registration.automaticCreationEnabled=value.value.registration.automaticCreationEnabled;registration.identifierEnabled=value.value.productIdentifier.enabled;registration.productIdentifier=value.value.productIdentifier.productIdentifier||''}}
 function deniedRead(cause:unknown){if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){reset();denied.value=true;error.value=errorMessage(cause)}}
 async function read(kind:Group,signal:AbortSignal):Promise<Snapshot>{return kind==='presence'?{kind,value:await options.transport().readPresence(projectId.value,options.typeId(),signal)}:{kind,value:await options.transport().readRegistration(projectId.value,options.typeId(),signal)}}
 async function load(){const kind=group.value;if(!kind||!readable.value||busy.value||unknown.value)return;const state=capture();busy.value=true;error.value='';controller=new AbortController();try{const actual=await read(kind,controller.signal);if(current(state)){bind(actual);conflict.value=false;intent.value=undefined}}catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){deniedRead(cause);error.value=errorMessage(cause)}}finally{if(current(state))busy.value=false}}
 async function open(kind:Group){if(options.disabled()||locked.value||!readable.value)return;reset();group.value=kind;await load()}
 function cancel(){if(!busy.value&&!unknown.value)reset()}
 function matches(left:Snapshot,right:Snapshot){return left.kind==='presence'&&right.kind==='presence'?samePresence(left.value,right.value):left.kind==='registration'&&right.kind==='registration'&&sameRegistration(left.value,right.value)}
 async function save(){
  const before=snapshot.value,kind=group.value;if(!kind||!before||before.kind!==kind||!writable.value||options.disabled()||busy.value||unknown.value||conflict.value)return
  let original:Intent
  try{original=before.kind==='presence'?{kind:'presence',before:before.value,value:preparePresenceSettings(projectId.value,options.typeId(),before.value,presence)}:{kind:'registration',before:before.value,value:prepareRegistrationSettings(projectId.value,options.typeId(),before.value,registration)}}catch(cause){error.value=errorMessage(cause);return}
  intent.value=original;busy.value=true;unknown.value=true;observed.value=undefined;error.value='';const state=capture();controller=new AbortController();let accepted=false
  try{
   const returned:Snapshot=original.kind==='presence'?{kind:'presence',value:await options.transport().changePresence(original.value,controller.signal)}:{kind:'registration',value:await options.transport().changeRegistration(original.value,controller.signal)};accepted=true;if(!current(state))return
   const valid=original.kind==='presence'&&returned.kind==='presence'?presenceReceiptMatches(returned.value,original.value,original.before):original.kind==='registration'&&returned.kind==='registration'&&registrationReceiptMatches(returned.value,original.value,original.before)
   if(!valid)throw new Error('组合设置回执与原草稿不符，请整组读取核对')
   const actual=await read(kind,controller.signal);if(!current(state))return;if(!matches(returned,actual))throw new Error('组合设置已变化，请整组读取核对')
   bind(actual);busy.value=false;unknown.value=false;group.value=undefined;intent.value=undefined;notice.value='设置已保存';options.changed()
  }catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){deniedRead(cause);if(!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,409,413,422,429].includes(cause.status)&&cause.code!==10014){unknown.value=false;conflict.value=true;intent.value=undefined;error.value='组合设置保存被拒绝，请重新读取整组设置后编辑。'}else error.value=errorMessage(cause)}}finally{if(current(state))busy.value=false}
 }
 async function review(){const kind=group.value;if(!kind||!unknown.value||busy.value||!readable.value)return;const state=capture();busy.value=true;observed.value=undefined;error.value='';controller=new AbortController();try{const actual=await read(kind,controller.signal);if(current(state))observed.value=actual}catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){deniedRead(cause);error.value=errorMessage(cause)}}finally{if(current(state))busy.value=false}}
 function finish(){if(!unknown.value||busy.value||!observed.value)return;bind(observed.value);observed.value=undefined;unknown.value=false;intent.value=undefined;group.value=undefined;notice.value='已采用当前整组设置；原保存结果仍未确认';options.changed()}
 watch([()=>projectId.value,()=>options.typeId(),()=>session.user?.accountId,()=>options.readable()],()=>{reset();denied.value=false},{flush:'sync'})
 const blocked=computed(()=>readable.value&&(busy.value||unknown.value));onBeforeRouteLeave(()=>!blocked.value);onBeforeRouteUpdate(()=>!blocked.value)
 function beforeUnload(event:BeforeUnloadEvent){if(blocked.value){event.preventDefault();event.returnValue=''}}window.addEventListener('beforeunload',beforeUnload)
 const dispose=onIdentityChange(()=>{reset();denied.value=false});onScopeDispose(()=>{alive=false;reset();dispose();window.removeEventListener('beforeunload',beforeUnload)})
 return reactive({group,snapshot,intent,observed,busy,unknown,conflict,error,notice,readable,writable,locked,presence,registration,open,load,cancel,save,review,finish,reset})
}
