import {taskModbusTcpCommon,taskModbusTcpInput} from './task-modbus-tcp-common'
import {taskOtaUpgradeValue} from './task-ota-upgrade'
import {hasTaskModbusRtuCommon,taskModbusRtuInput,taskModbusRtuCommon} from './task-modbus-rtu-common'
import {taskPropertyFunctionValue,isTaskPropertyFunction,isTaskFunction} from './task-property-function'
import {taskTagsValue} from './task-tags-api'
import {taskDataValue} from './task-data-content'
import {taskDataFunctionValue} from './task-data-function'
import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {cas,objectJson,taskActionType,taskEditor,taskUpdateBody,type Task,type TaskWrite} from './models'
import {parsePreprocessJson,ExactDecimal,compareDecimal,type ExactJson} from './preprocess-exact-json'

export type TaskContentIntent={project:string;id:string;beforeVersion:number;body:TaskWrite;tags:Record<string,string>}
/** 固定命令保留method、params和可选整数id；关联ID不混入参数或函数来源。 */
export function taskCommandValue(text:string):Pick<TaskWrite,'commandKey'|'input'|'commandRequestId'>{
 const parsed=parsePreprocessJson(text)
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||parsed instanceof ExactDecimal)throw new Error('下发命令 JSON 必须是对象。')
 const value=parsed
 if(Object.keys(value).some(key=>!['method','params','id'].includes(key))||!Object.hasOwn(value,'method')||!Object.hasOwn(value,'params')||typeof value.method!=='string'||!value.method.trim()||value.method.trim().length>64||!value.params||typeof value.params!=='object'||Array.isArray(value.params)||value.params instanceof ExactDecimal)throw new Error('下发命令 JSON 必须只包含有效的 method 和对象 params，以及可选整数 id。')
 let commandRequestId:TaskWrite['commandRequestId']
 if(Object.hasOwn(value,'id')){
  const id=value.id
  if(!(id instanceof ExactDecimal)||!/^-?(0|[1-9]\d*)$/.test(id.literal)||!Number.isSafeInteger(Number(id.literal)))throw new Error('命令 id 必须是安全范围内的 JSON 整数。')
  commandRequestId=Number(id.literal)
 }
 return {commandKey:value.method.trim(),input:portable(value.params) as Record<string,unknown>,commandRequestId}
}
/** 创建配置与既有详情共用同一命令解析，不为未创建任务伪造定义或id。 */
export function taskCommandBody(task:Task,text:string):TaskWrite{if(taskActionType(task)!=='COMMAND')throw new Error('当前任务不是命令下发。');return {...taskEditor(task),...taskCommandValue(text)}}
/** 沿既有精确JSON读取器拒绝会被当前任务HTTP数值模型改写的数字，不静默舍入。 */
function portable(value:ExactJson,label='命令参数'):unknown{
 if(value instanceof ExactDecimal){const number=Number(value.literal);if(!Number.isFinite(number)||Number.isInteger(number)&&!Number.isSafeInteger(number)||compareDecimal(value,new ExactDecimal(JSON.stringify(number)))!==0)throw new Error(`${label}含无法精确提交的数字，请检查 JSON。`);return number}
 if(Array.isArray(value))return value.map(item=>portable(item,label))
 if(value&&typeof value==='object'){const result:Record<string,unknown>=Object.create(null);for(const [key,item] of Object.entries(value))result[key]=portable(item,label);return result}
 return value
}
export function taskCommandJson(task:Task){if(taskActionType(task)!=='COMMAND')throw new Error('当前任务不是命令下发。');const body=taskEditor(task);return JSON.stringify({method:body.commandKey,params:body.input,...(body.commandRequestId===undefined?{}:{id:body.commandRequestId})},null,2)}
/** 固定属性只解析原JSON对象，不猜命令信封，也不在创建配置时生成任务身份。 */
export type TaskPropertyPurpose='downlink'|'cloud-update'
function propertyObject(text:string,purpose:TaskPropertyPurpose):Record<string,unknown>{
 const label=purpose==='cloud-update'?'更新属性':'下发属性'
 let parsed:ExactJson
 try{parsed=parsePreprocessJson(text)}catch{throw new Error(`${label} JSON 无效、字段重复或超出编辑预算。`)}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||parsed instanceof ExactDecimal)throw new Error(`${label} JSON 必须是对象。`)
 return portable(parsed,label) as Record<string,unknown>
}
/** 真实固定下发必须至少一个属性；空对象只作为配置初始草稿保留。 */
export function taskPropertyValue(text:string,purpose:TaskPropertyPurpose='downlink'):Record<string,unknown>{
 const value=propertyObject(text,purpose)
 if(Object.keys(value).length===0)throw new Error(purpose==='cloud-update'?'请至少填写一个更新属性。':'请至少填写一个下发属性。')
 return value
}
/** 整理仅显式替换本地草稿，允许原站默认空对象，不发请求或自动补属性。 */
export function formatTaskPropertyJson(text:string,purpose:TaskPropertyPurpose='downlink'):string{return JSON.stringify(propertyObject(text,purpose),null,2)}
/** 仅同类属性内容修订；完整隐藏定义与CAS来自原任务，属性键空值不冒命令标识。 */
export function taskPropertyBody(task:Task,value:Record<string,unknown>):TaskWrite{
 if(taskActionType(task)!=='PROPERTY_SET')throw new Error('当前任务不是属性下发。')
 return {...taskEditor(task),input:taskPropertyValue(JSON.stringify(value))}
}
/** 云更新只修订同类属性内容，不把平台操作转换为命令下发。 */
export function taskCloudBody(task:Task,value:Record<string,unknown>):TaskWrite{
 if(taskActionType(task)!=='CLOUD_UPDATE')throw new Error('当前任务不是属性更新。')
 return {...taskEditor(task),input:taskPropertyValue(JSON.stringify(value),'cloud-update')}
}
/** 固定数据只改同类内容；协议、流、格式和原文共同进入原CAS意图。 */
export function taskDataBody(task:Task,value:unknown):TaskWrite{
 if(taskActionType(task)!=='DATA_DOWNLINK')throw new Error('当前任务不是自定义数据下发。')
 return {...taskEditor(task),input:taskDataValue(value)}
}
/** OTA只修订原版本来源及模块，不选择固件或伪装普通命令；旧计划/目标/标签保持。 */
export function taskOtaUpgradeBody(task:Task,value:unknown):TaskWrite{
 if(taskActionType(task)!=='OTA_UPGRADE')throw new Error('当前任务不是 OTA 推送。')
 return {...taskEditor(task),commandKey:null,commandRequestId:undefined,input:taskOtaUpgradeValue(value)}
}
/** 函数内容只修订同类原始源码，不将固定属性配置隐式转换为函数。 */
export function taskPropertyFunctionBody(task:Task,value:unknown):TaskWrite{
 if(!isTaskPropertyFunction(taskActionType(task)))throw new Error('当前任务不是属性云函数。')
 return {...taskEditor(task),input:taskPropertyFunctionValue(value)}
}
/** 命令函数仅修改同类原始源码，动态标识与数字id由执行结果准入。 */
export function taskCommandFunctionBody(task:Task,value:unknown):TaskWrite{
 if(taskActionType(task)!=='COMMAND_FUNCTION')throw new Error('当前任务不是命令云函数。')
 return {...taskEditor(task),input:taskPropertyFunctionValue(value)}
}
/** DATA函数只修订源码；协议和流严格沿打开时原定义，不接收编辑器替换路由。 */
export function taskDataFunctionBody(task:Task,value:unknown):TaskWrite{
 if(taskActionType(task)!=='DATA_DOWNLINK_FUNCTION')throw new Error('当前任务不是自定义数据云函数。')
 if(hasTaskModbusRtuCommon(task.input))throw new Error('请通过Modbus配置修改任务内容。')
 const before=taskDataFunctionValue(task.input),source=taskPropertyFunctionValue(value)
 return {...taskEditor(task),input:taskDataFunctionValue({...before,...source})}
}
/** 同一common类型原位修订；原route/完整定义/CAS沿原ContentIntent，不开放任意源码。 */
export function taskModbusRtuBody(task:Task,value:unknown):TaskWrite{
 if(taskActionType(task)!=='DATA_DOWNLINK_FUNCTION'||!hasTaskModbusRtuCommon(task.input))throw new Error('当前任务不是Modbus RTU通用配置。')
 const before=taskDataFunctionValue(task.input)
 if(!('common' in before)||before.common.kind!=='MODBUS_RTU')throw new Error('任务通用配置家族不能更换。')
 return {...taskEditor(task),input:taskModbusRtuInput({protocol:before.protocol,streamIdentifier:before.streamIdentifier,common:taskModbusRtuCommon(value)})}
}
/** TCP只允许同家族内容修订，路由和完整旧定义由原CAS意图保留。 */
export function taskModbusTcpBody(task:Task,value:unknown):TaskWrite{
 if(taskActionType(task)!=='DATA_DOWNLINK_FUNCTION'||!hasTaskModbusRtuCommon(task.input))throw new Error('当前任务不是Modbus TCP通用配置。')
 const before=taskDataFunctionValue(task.input)
 if(!('common' in before)||before.common.kind!=='MODBUS_TCP')throw new Error('任务通用配置家族不能更换。')
 return {...taskEditor(task),input:taskModbusTcpInput({protocol:before.protocol,streamIdentifier:before.streamIdentifier,common:taskModbusTcpCommon(value)})}
}
export type TaskDataRoute={protocol:'MQTT'|'TCP';streamIdentifier:string}
/** 专用运输设置仅修改协议和流；原消息/源码及格式逐字保留，不复用内容编辑器替换用途。 */
export function taskDataRouteBody(task:Task,route:TaskDataRoute):TaskWrite{
 const kind=taskActionType(task)
 if(kind!=='DATA_DOWNLINK'&&kind!=='DATA_DOWNLINK_FUNCTION')throw new Error('当前任务不是自定义数据下发。')
 if(!route||Object.keys(route).sort().join(',')!=='protocol,streamIdentifier')throw new Error('自定义下发设置字段不完整。')
 const before=kind==='DATA_DOWNLINK_FUNCTION'?taskDataFunctionValue(task.input):taskDataValue(task.input)
 const input=kind==='DATA_DOWNLINK_FUNCTION'?taskDataFunctionValue({...before,...route}):taskDataValue({...before,...route})
 return {...taskEditor(task),input}
}
/** 完整未编辑字段来自打开时原定义；请求仅修改命令内容和原CAS。 */
export function createTaskContentIntent(project:string,task:Task,body:TaskWrite):TaskContentIntent{
 const beforeVersion=cas(task.version)
 if(!task.id||beforeVersion>=Number.MAX_SAFE_INTEGER||cas(body.expectedVersion)!==beforeVersion)throw new Error('任务内容版本无效，请重新读取任务。')
 if(taskActionType(task)!==taskActionType(body))throw new Error('任务内容不能更改任务类型。')
 return {project,id:task.id,beforeVersion,tags:taskTagsValue(task.tags),body:{...taskEditor(task),commandKey:body.commandKey,commandRequestId:taskActionType(body)==='COMMAND'?body.commandRequestId:undefined,input:taskActionType(body)==='OTA_UPGRADE'?taskOtaUpgradeValue(body.input):taskActionType(body)==='DATA_DOWNLINK_FUNCTION'?taskDataFunctionValue(body.input):isTaskFunction(taskActionType(body))?taskPropertyFunctionValue(body.input):taskActionType(body)==='DATA_DOWNLINK'?taskDataValue(body.input):objectJson(JSON.stringify(body.input))}}
}
function stable(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']'
 if(value&&typeof value==='object')return '{'+Object.keys(value).filter(key=>(value as Record<string,unknown>)[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+stable((value as Record<string,unknown>)[key])).join(',')+'}'
 return JSON.stringify(value)
}
function signature(body:TaskWrite){const kind=taskActionType(body);return stable({...body,actionType:kind,commandKey:kind==='COMMAND'?body.commandKey:null,expectedVersion:undefined,targetDeviceIds:body.targetDeviceIds?.slice().sort(),targetGroupIds:body.targetGroupIds?.slice().sort()})}
/** 只确认当前完整期望状态，不证明未知写由原请求或原账号受理。 */
export function confirmTaskContent(intent:TaskContentIntent,task:Task){
 if(task.id!==intent.id||cas(task.version)!==intent.beforeVersion+1||signature(taskEditor(task))!==signature(intent.body)||stable(taskTagsValue(task.tags))!==stable(intent.tags))throw new Error('当前任务内容尚未与本次期望一致，请继续核对；未重复保存。')
}
/** 沿正式任务完整请求与内容专用模式，不发送信息或目标更新标记。 */
export function saveTaskContent(project:string,id:string,body:TaskWrite){
 if(body.initialSchedule!==undefined)throw new Error('初始计划不能用于任务内容修改。')
 return api<Schema<'TaskJobResponse'>>(`/api/v1/projects/${project}/task-jobs/${id}`,{method:'put',query:{contentOnly:true},body:{...taskUpdateBody(body),expectedVersion:cas(body.expectedVersion)}})
}
