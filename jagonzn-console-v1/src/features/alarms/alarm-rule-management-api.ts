import {api,ApiError} from '../../core/http'
import type {Schema} from '../../core/contracts'
import {AlarmRuleJsonNumber,parseAlarmRuleJson,stringifyAlarmRuleJson,type AlarmRuleJson,type AlarmRuleJsonObject} from './alarm-rule-json'

/** 只替换生成合同中的数字常量表示；其余字段、枚举和可省语义均来自正式512。 */
export type AlarmRuleConstant=Omit<Schema<'ConsoleAlarmRuleConstantDocument'>,'value'>&{value:Exclude<Schema<'ConsoleAlarmRuleConstantDocument'>['value'],number>|AlarmRuleJsonNumber}
export type AlarmRuleValue=AlarmRuleConstant|Schema<'ConsoleAlarmRuleAttributeDocument'>
export type AlarmRuleTerm=Omit<Schema<'ConsoleAlarmRuleTermDocument'>,'value'|'upper'>&{value:AlarmRuleValue;upper?:AlarmRuleValue}
export type AlarmRuleConfiguration=Omit<Schema<'ConsoleAlarmRuleConfigurationDocument'>,'expression'>&{expression:Omit<Schema<'ConsoleAlarmRuleExpressionDocument'>,'terms'>&{terms:AlarmRuleTerm[]}}
export type ConfiguredAlarmRule=Omit<Schema<'ConsoleConfiguredAlarmRuleResponse'>,'configuration'>&{configuration:AlarmRuleConfiguration}
export type CreateConfiguredAlarmRule=Omit<Schema<'CreateConsoleConfiguredAlarmRuleRequest'>,'configuration'>&{configuration:AlarmRuleConfiguration}
export type UpdateConfiguredAlarmRule=Omit<Schema<'UpdateConsoleConfiguredAlarmRuleRequest'>,'configuration'>&{configuration:AlarmRuleConfiguration}
export type SetConfiguredAlarmRuleEnabled=Schema<'SetConsoleConfiguredAlarmRuleEnabledRequest'>
export type DeleteConfiguredAlarmRule=Schema<'DeleteConsoleConfiguredAlarmRuleRequest'>

const invalid=()=>new Error('告警规则配置资料不完整或不合法')
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const keyPattern=/^[A-Za-z0-9_-]{1,64}$/
function object(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||value instanceof AlarmRuleJsonNumber||![null,Object.prototype].includes(Object.getPrototypeOf(value)))throw invalid()
 const row=value as Record<string,unknown>,keys=Reflect.ownKeys(row)
 if(required.some(key=>!Object.hasOwn(row,key))||keys.some(key=>typeof key!=='string'||!required.includes(key)&&!optional.includes(key)))throw invalid()
 for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(row,key)!;if(!Object.hasOwn(descriptor,'value'))throw invalid()}
 return row
}
function array(value:unknown,max:number):unknown[]{if(!Array.isArray(value)||value.length>max||Reflect.ownKeys(value).length!==value.length+1)throw invalid();for(let i=0;i<value.length;i++){const descriptor=Object.getOwnPropertyDescriptor(value,i);if(!descriptor||!Object.hasOwn(descriptor,'value'))throw invalid()}return value}
function text(value:unknown,max:number,nonblank=false):string{if(typeof value!=='string'||value.length>max||nonblank&&!value.trim()||/[\u0000]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value))throw invalid();return value}
function id(value:unknown):string{const result=text(value,36);if(!uuid.test(result))throw invalid();return result}
function bool(value:unknown):boolean{if(typeof value!=='boolean')throw invalid();return value}
function integer(value:unknown,max:number):number{
 const raw=value instanceof AlarmRuleJsonNumber?stringifyAlarmRuleJson(value):typeof value==='number'&&Number.isSafeInteger(value)?String(value):''
 if(!/^(0|[1-9]\d*)$/.test(raw)||raw.length>10)throw invalid();const number=Number(raw);if(number>max)throw invalid();return number
}
function choice<const T extends readonly string[]>(value:unknown,choices:T):T[number]{if(typeof value!=='string'||!choices.includes(value))throw invalid();return value as T[number]}
function attribute(value:unknown):string{const key=text(value,64);if(!keyPattern.test(key))throw invalid();return key}
function staleSeconds(value:AlarmRuleJsonNumber):number{
 const raw=stringifyAlarmRuleJson(value),match=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw)!
 let digits=(match[2]!+(match[3]??'')).replace(/^0+/,'');if(!digits)return 0
 if(match[1]||match[4]&&match[4].replace(/^[+-]/,'').length>4)throw invalid()
 const scale=(match[3]?.length??0)-Number(match[4]??'0')
 if(scale>0){if(scale>=digits.length||!/^[0]+$/.test(digits.slice(-scale)))throw invalid();digits=digits.slice(0,-scale)}
 else{if(digits.length-scale>6)throw invalid();digits+='0'.repeat(-scale)}
 const result=Number(digits);if(result>604800)throw invalid();return result
}
function ids(value:unknown,max=65536):string[]{const result=array(value,max).map(id);if(new Set(result).size!==result.length)throw invalid();return result}
function ruleValue(value:unknown):AlarmRuleValue{
 const row=object(value,['kind'],['key','value'])
 if(row.kind==='ATTRIBUTE'){object(row,['kind','key']);return {kind:'ATTRIBUTE',key:attribute(row.key)}}
 object(row,['kind','value']);if(row.kind!=='CONSTANT')throw invalid()
 if(row.value instanceof AlarmRuleJsonNumber){stringifyAlarmRuleJson(row.value);return {kind:'CONSTANT',value:row.value}}
 if(typeof row.value==='string')return {kind:'CONSTANT',value:text(row.value,65536)}
 if(typeof row.value==='boolean')return {kind:'CONSTANT',value:row.value}
 throw invalid()
}
/** 校验完整公开定义，不删隐藏字段、不把旧阈值定义猜成V2；模型/归属由写入服务重核。 */
export function alarmRuleConfiguration(value:unknown):AlarmRuleConfiguration{
 const row=object(value,['schemaVersion','source','triggerKind','expression','repeatCount','durationSeconds','schedule','level','remark','recovery','notifications'])
 if(integer(row.schemaVersion,2)!==2)throw invalid()
 const source=object(row.source,['kind','ids']),kind=choice(source.kind,['DEVICE','DEVICE_TYPE'] as const),sourceIds=ids(source.ids,1000)
 if(!sourceIds.length||kind==='DEVICE_TYPE'&&sourceIds.length!==1)throw invalid()
 const expression=object(row.expression,['terms']),triggerKind=choice(row.triggerKind,['ATTRIBUTES','INACTIVITY'] as const)
 const terms=array(expression.terms,64).map((value,index):AlarmRuleTerm=>{
  const term=object(value,['key','operator','value'],['join','upper']),operator=choice(term.operator,['EQ','NE','GT','GTE','LT','LTE','BETWEEN','NOT_BETWEEN','INCLUDES','NOT_INCLUDES','KEY_EXISTS','KEY_NOT_EXISTS','STALE_FOR'] as const)
  const join=Object.hasOwn(term,'join')?choice(term.join,['AND','OR'] as const):undefined
  if(index&&!join||(operator==='STALE_FOR')!==(triggerKind==='INACTIVITY'))throw invalid()
  const range=operator==='BETWEEN'||operator==='NOT_BETWEEN'
  if(range!==Object.hasOwn(term,'upper'))throw invalid()
  const result:AlarmRuleTerm={key:attribute(term.key),operator,value:ruleValue(term.value)}
  if(join!==undefined)result.join=join
  if(range)result.upper=ruleValue(term.upper)
  if(['INCLUDES','NOT_INCLUDES','KEY_EXISTS','KEY_NOT_EXISTS'].includes(operator)&&(result.value.kind!=='CONSTANT'||typeof result.value.value!=='string'||result.value.value.length>2048))throw invalid()
  if(operator==='STALE_FOR'){
   if(result.value.kind!=='CONSTANT'||!(result.value.value instanceof AlarmRuleJsonNumber))throw invalid()
   // 失活秒数可由Java十进制规范输出为指数；只在此受限整数域精确判断，不转换阈值。
   staleSeconds(result.value.value)
  }
  return result
 })
 if(!terms.length)throw invalid()
 const repeatCount=integer(row.repeatCount,10),durationSeconds=integer(row.durationSeconds,604800)
 if(triggerKind==='INACTIVITY'&&(repeatCount!==0||durationSeconds!==0))throw invalid()
 const schedule=object(row.schedule,['enabled','halfHourSlots','recoveryOutsideAllowed']),slots=array(schedule.halfHourSlots,48).map(v=>integer(v,47))
 if(new Set(slots).size!==slots.length)throw invalid()
 const recovery=object(row.recovery,['manualClearAllowed','customerClearAllowed','customerDisableAllowed'])
 const notifications=object(row.notifications,['groupIds','customerChannels','dailyLimit','perDeviceDailyLimit','customerSmsQuotaRequired','customerVoiceQuotaRequired','wechatClickAction'],['wechatAppId'])
 const channels=array(notifications.customerChannels,4).map(v=>choice(v,['WECHAT','SMS','VOICE','APP'] as const))
 if(new Set(channels).size!==channels.length)throw invalid()
 const click=choice(notifications.wechatClickAction,['NONE','PROJECT_APP'] as const)
 const appId=Object.hasOwn(notifications,'wechatAppId')?id(notifications.wechatAppId):undefined
 if(channels.includes('WECHAT')&&click==='PROJECT_APP'&&!appId)throw invalid()
 const result:AlarmRuleConfiguration={schemaVersion:2,source:{kind,ids:sourceIds},triggerKind,expression:{terms},repeatCount,durationSeconds,
  schedule:{enabled:bool(schedule.enabled),halfHourSlots:slots,recoveryOutsideAllowed:bool(schedule.recoveryOutsideAllowed)},level:choice(row.level,['NORMAL','IMPORTANT','URGENT'] as const),remark:text(row.remark,2048),
  recovery:{manualClearAllowed:bool(recovery.manualClearAllowed),customerClearAllowed:bool(recovery.customerClearAllowed),customerDisableAllowed:bool(recovery.customerDisableAllowed)},
  notifications:{groupIds:ids(notifications.groupIds),customerChannels:channels,dailyLimit:integer(notifications.dailyLimit,2147483647),perDeviceDailyLimit:integer(notifications.perDeviceDailyLimit,2147483647),customerSmsQuotaRequired:bool(notifications.customerSmsQuotaRequired),customerVoiceQuotaRequired:bool(notifications.customerVoiceQuotaRequired),wechatClickAction:click}}
 if(appId!==undefined)result.notifications.wechatAppId=appId
 if(new TextEncoder().encode(stringifyAlarmRuleJson(ast(result))).byteLength>65536)throw invalid()
 return result
}
/** 已验证的小整数在唯一序列化边界转为词法节点；数值常量仍沿用原节点。 */
function ast(value:unknown):AlarmRuleJson{
 if(value===null||typeof value==='boolean'||typeof value==='string'||value instanceof AlarmRuleJsonNumber)return value
 if(typeof value==='number'){if(!Number.isSafeInteger(value))throw invalid();return new AlarmRuleJsonNumber(String(value))}
 if(Array.isArray(value))return value.map(ast)
 if(value&&typeof value==='object'){const result:AlarmRuleJsonObject=Object.create(null);for(const [key,child]of Object.entries(value))result[key]=ast(child);return result}
 throw invalid()
}
function instant(value:unknown):string{const result=text(value,64);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(result)||!Number.isFinite(Date.parse(result)))throw invalid();return result}
export function configuredAlarmRule(source:string,expectedId?:string):ConfiguredAlarmRule{
 const row=object(parseAlarmRuleJson(source),['id','name','enabled','version','createdAt','updatedAt','configuration']),identity=id(row.id)
 if(expectedId!==undefined&&identity!==id(expectedId))throw invalid()
 return {id:identity,name:text(row.name,128,true),enabled:bool(row.enabled),version:integer(row.version,2147483647),createdAt:instant(row.createdAt),updatedAt:instant(row.updatedAt),configuration:alarmRuleConfiguration(row.configuration)}
}
/** 同一次写回执与随后独立GET逐字段核对，不能用提交草稿冒充保存事实。 */
export function sameConfiguredAlarmRule(left:ConfiguredAlarmRule,right:ConfiguredAlarmRule):boolean{return stringifyAlarmRuleJson(ast(left))===stringifyAlarmRuleJson(ast(right))}
function request(value:unknown,mode:'create'|'update'|'enabled'|'delete'):string{
 const fields=mode==='create'?['name','enabled','configuration']:mode==='update'?['version','name','enabled','configuration']:mode==='enabled'?['version','enabled']:['version']
 const row=object(value,fields),result:Record<string,unknown>={}
 if(mode!=='create')result.version=integer(row.version,2147483646)
 if(mode!=='delete')result.enabled=bool(row.enabled)
 if(mode==='create'||mode==='update'){result.name=text(row.name,128,true);result.configuration=alarmRuleConfiguration(row.configuration)}
 return stringifyAlarmRuleJson(ast(result))
}
const options={headers:{'Content-Type':'application/json'},responseType:'text' as const,maxResponseBytes:96*1024}
async function written(read:Promise<string>,expectedVersion:number,expectedEnabled:boolean,expectedId?:string):Promise<ConfiguredAlarmRule>{const source=await read;try{const result=configuredAlarmRule(source,expectedId);if(result.version!==expectedVersion||result.enabled!==expectedEnabled)throw invalid();return result}catch{throw new ApiError('服务端已接收请求，返回资料无法核对，请重新读取确认',200,undefined,undefined,true)}}
/** 五个已生成操作；写失败不重放，异常成功回执明确标记结果未知。 */
export const alarmRuleManagementApi={
 async get(project:string,rule:string,signal?:AbortSignal):Promise<ConfiguredAlarmRule>{const projectId=id(project),ruleId=id(rule);return configuredAlarmRule(await api<string>(`/api/v1/projects/${projectId}/console/alarm-rules/${ruleId}`,{...options,signal}),ruleId)},
 async create(project:string,value:CreateConfiguredAlarmRule,signal?:AbortSignal):Promise<ConfiguredAlarmRule>{const projectId=id(project),rawBody=request(value,'create');return written(api<string>(`/api/v1/projects/${projectId}/console/alarm-rules`,{...options,method:'post',rawBody,signal}),0,value.enabled)},
 async update(project:string,rule:string,value:UpdateConfiguredAlarmRule,signal?:AbortSignal):Promise<ConfiguredAlarmRule>{const projectId=id(project),ruleId=id(rule),rawBody=request(value,'update');return written(api<string>(`/api/v1/projects/${projectId}/console/alarm-rules/${ruleId}`,{...options,method:'put',rawBody,signal}),value.version+1,value.enabled,ruleId)},
 async setEnabled(project:string,rule:string,value:SetConfiguredAlarmRuleEnabled,signal?:AbortSignal):Promise<ConfiguredAlarmRule>{const projectId=id(project),ruleId=id(rule),rawBody=request(value,'enabled');return written(api<string>(`/api/v1/projects/${projectId}/console/alarm-rules/${ruleId}/enabled`,{...options,method:'put',rawBody,signal}),value.version+1,value.enabled,ruleId)},
 async remove(project:string,rule:string,value:DeleteConfiguredAlarmRule,signal?:AbortSignal):Promise<void>{const projectId=id(project),ruleId=id(rule),rawBody=request(value,'delete');const response=await api<string|undefined>(`/api/v1/projects/${projectId}/console/alarm-rules/${ruleId}`,{...options,method:'delete',rawBody,signal});if(response!==undefined)throw new ApiError('删除请求已接收，返回资料无法核对，请重新读取确认',200,undefined,undefined,true)}
}
