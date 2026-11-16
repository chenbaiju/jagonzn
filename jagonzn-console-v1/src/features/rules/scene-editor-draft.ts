import type {Schema} from '@/core/contracts'
import {cas} from './models'
import {newRuleTag,ruleTagsValue,type RuleTagDraft} from './rule-tag-draft'
import {sceneTagInputValue,type SceneTagDraft} from './scene-tag-input'
import {definitionUuid} from './device-task-definition-port'
import {ExactDecimal,parsePreprocessJson,writePreprocessJson,validUnicode,type ExactJson} from './preprocess-exact-json'
export const scenePropertyNode='scene-device-property-set-action'
export const scenePropertyTransformNode='scene-device-property-transform-action'
export const sceneCloudNode='scene-device-cloud-update-action'
export const sceneCloudTransformNode='scene-device-cloud-transform-action'
export type SceneCloudOperation={propertyKey:string;op:'set_ref';refDeviceId:string;refPropertyKey:string}|{propertyKey:string;op:'toggle'|'clear'}|{propertyKey:string;op:'set'|'inc'|'dec'|'inc_pct'|'dec_pct';value:ExactJson}
export type ScenePropertyOperation=SceneCloudOperation
export const sceneCloudOperationLabels={set:'设置为',set_ref:'引用',inc:'增加',dec:'减少',inc_pct:'增加%',dec_pct:'减少%',toggle:'切换',clear:'清空'} as const
export const sceneTaskNode='scene-task-run-action'
export const sceneDelayNode='scene-delay-action'
export type ScenePolicyDraft={runtimeVersion:2;concurrencyPolicy:'skip_current'|'terminate_prev';actionFailPolicy:'continue'|'stop'}
export const newScenePolicy=():ScenePolicyDraft=>({runtimeVersion:2,concurrencyPolicy:'skip_current',actionFailPolicy:'continue'})
export const sceneDelayPresentation={label:'延迟',description:'延迟一段时间。',glyph:'󰔟',background:'#fbe9e7',color:'#e64a19'} as const
export const sceneTaskPresentation={label:'执行任务',description:'运行设备的任务。',glyph:'󰃰',background:'#e0f7fa',color:'#00838f'} as const
export type ScenePropertyPurpose='downlink'|'cloud-update'
export const scenePropertyPresentation={
 downlink:{label:'下发属性',description:'向设备下发属性，支持单属性或多属性组合下发。',glyph:'󰇚',background:'#e3f2fd',color:'#1e88e5'},
 'cloud-update':{label:'更新属性',description:'更新设备的云端私有属性，支持单属性或多属性组合更新。',glyph:'󰳿',background:'#f3e5f5',color:'#8e24aa'},
} as const
export type SceneNode=Schema<'SceneActionRequest'>
export type SceneActionDraft={key:string;node:SceneNode}
export type SceneDraft={name:string;description:string;enabled:boolean;tags:RuleTagDraft[];conditions:SceneNode[];actions:SceneActionDraft[];deviceScope:Schema<'SceneDeviceScope'>;originalName?:string;originalDescription?:string;executionPolicy?:ScenePolicyDraft}
export type SceneBody=Schema<'CreateSceneRequest'> & {name:string;conditions:SceneNode[];actions:SceneNode[];deviceScope:Schema<'SceneDeviceScope'>;tags?:Record<string,string>}
/** 旧响应缺省为空；持久空值与所有自有键原样保留，拒绝不完整标签。 */
export function sceneTags(value:unknown):Record<string,string>{
 if(value===undefined)return {}
 if(!exactObject(value)||Object.values(value).some(item=>typeof item!=='string'))throw new Error('场景标签无法完整读取。')
 return ruleTagsValue(Object.entries(value).map(([key,item])=>({...newRuleTag(),key,value:item as string})))
}
export function sceneTagRows(value:unknown):SceneTagDraft[]{return Object.entries(sceneTags(value)).map(([key,item])=>({...newRuleTag(),key,value:item,...(item===''?{originalEmptyKey:key}:{})}))}
export function exactObject(value:unknown):value is Record<string,ExactJson>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&!(value instanceof ExactDecimal)}
/** 原配置数值始终保留精确值，不经过浮点JSON往返。 */
export function cloneSceneValue<T>(value:T):T{return parsePreprocessJson(writePreprocessJson(value as ExactJson)) as T}
export function sceneNodeList(value:unknown):SceneNode[]{
 if(!Array.isArray(value)||value.length>1000)throw new Error('场景完整操作或条件无法读取。')
 for(const node of value)if(!exactObject(node)||Object.keys(node).sort().join(',')!=='config,nodeType'||typeof node.nodeType!=='string'||!node.nodeType||!exactObject(node.config))throw new Error('场景原有操作或条件不完整，请重新读取。')
 return cloneSceneValue(value)
}
export function scenePropertyConfig(node:SceneNode):{purpose:ScenePropertyPurpose;deviceId:string;properties:Record<string,ExactJson>}|undefined{
 const value=node.config
 if(node.nodeType!==scenePropertyNode&&node.nodeType!==sceneCloudNode||!exactObject(value)||Object.keys(value).sort().join(',')!=='deviceId,properties'||typeof value.deviceId!=='string'||!definitionUuid(value.deviceId)||!exactObject(value.properties)||!Object.keys(value.properties).length)return
 return {purpose:node.nodeType===sceneCloudNode?'cloud-update':'downlink',deviceId:value.deviceId,properties:value.properties}
}
function sceneTransformScalar(value:unknown):boolean{
 if(typeof value==='string')return validUnicode(value)&&!value.includes('\0')&&new TextEncoder().encode(value).length<=65536
 if(typeof value==='boolean')return true
 let number:ExactDecimal
 try{if(value instanceof ExactDecimal)number=value;else if(typeof value==='number'&&Number.isFinite(value))number=new ExactDecimal(JSON.stringify(value));else return false}catch{return false}
 const integer=BigInt(number.digits.length)+number.exponent,scale=number.exponent<0n?-number.exponent:0n
 return integer<=131072n&&scale<=16383n&&(integer>1n?integer:1n)+scale+(scale>0n?1n:0n)+1n<=65536n
}
/** 仅共用无权限含义的精确配置形状；公开wrapper保持各自节点与引用版本闭集。 */
function sceneTransformConfiguration(node:SceneNode,expectedNode:string,referencesAllowed:boolean):{deviceId:string;operations:SceneCloudOperation[]}|undefined{
 const value=node.config
 if(node.nodeType!==expectedNode||!exactObject(value)||Object.keys(value).sort().join(',')!=='deviceId,operations,schemaVersion'||typeof value.deviceId!=='string'||!definitionUuid(value.deviceId)||(value.schemaVersion instanceof ExactDecimal?!['1','2'].includes(value.schemaVersion.canonical()):(value.schemaVersion as unknown)!==1&&(value.schemaVersion as unknown)!==2)||!Array.isArray(value.operations)||!value.operations.length||value.operations.length>32)return
 const schema=value.schemaVersion instanceof ExactDecimal?value.schemaVersion.canonical():String(value.schemaVersion),keys=new Set<string>();if(!referencesAllowed&&schema!=='1')return;let nonSet=false,reference=false
 for(const item of value.operations){
  if(!exactObject(item)||typeof item.propertyKey!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(item.propertyKey)||keys.has(item.propertyKey)||typeof item.op!=='string'||!Object.hasOwn(sceneCloudOperationLabels,item.op))return
  keys.add(item.propertyKey);if(item.op!=='set')nonSet=true
  if(item.op==='set_ref'){if(!referencesAllowed||schema!=='2'||Object.keys(item).sort().join(',')!=='op,propertyKey,refDeviceId,refPropertyKey'||typeof item.refDeviceId!=='string'||!definitionUuid(item.refDeviceId)||typeof item.refPropertyKey!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(item.refPropertyKey))return;reference=true}
  else if(item.op==='toggle'||item.op==='clear'){if(Object.keys(item).sort().join(',')!=='op,propertyKey')return}
  else{if(Object.keys(item).sort().join(',')!=='op,propertyKey,value')return;const scalar=sceneTransformScalar(item.value);if(!scalar||item.op!=='set'&&!(item.value instanceof ExactDecimal)&&typeof item.value!=='number')return}
 }
 if(!nonSet||schema==='2'&&!reference)return
 try{if(new TextEncoder().encode(writePreprocessJson(value)).length>65536)return}catch{return}
 return {deviceId:value.deviceId,operations:cloneSceneValue(value.operations) as SceneCloudOperation[]}
}
/** Cloud只认自己的配置1/2，不接受下发节点。 */
export function sceneCloudTransformConfig(node:SceneNode):{purpose:'cloud-update';deviceId:string;operations:SceneCloudOperation[]}|undefined{const config=sceneTransformConfiguration(node,sceneCloudTransformNode,true);if(config)return {purpose:'cloud-update',...config}}
/** PUSH只认自己的配置1/2；配置2必须包含引用，不接受Cloud或旧未知节点。 */
export function scenePropertyTransformConfig(node:SceneNode):{purpose:'downlink';deviceId:string;operations:ScenePropertyOperation[]}|undefined{const config=sceneTransformConfiguration(node,scenePropertyTransformNode,true);if(config)return {purpose:'downlink',deviceId:config.deviceId,operations:config.operations as ScenePropertyOperation[]}}
/** 全set仍提交旧literal，非set只用独立下发节点。 */
export function scenePropertyAction(deviceId:string,operations:ScenePropertyOperation[]):SceneNode{
 if(!definitionUuid(deviceId)||!operations.length||new Set(operations.map(row=>row.propertyKey)).size!==operations.length)throw new Error('请选择有效且不重复的属性')
 if(operations.every(row=>row.op==='set'))return {nodeType:scenePropertyNode,config:{deviceId,properties:Object.fromEntries(operations.map(row=>[row.propertyKey,(row as Extract<ScenePropertyOperation,{op:'set'|'inc'|'dec'|'inc_pct'|'dec_pct'}>).value]))}}
 const node:SceneNode={nodeType:scenePropertyTransformNode,config:{schemaVersion:operations.some(row=>row.op==='set_ref')?2:1,deviceId,operations:cloneSceneValue(operations)}}
 if(!scenePropertyTransformConfig(node))throw new Error('请设置1至32个有效下发属性操作')
 return node
}
/** 只有混合非set才用新节点；全set沿原literal，调用者显式保存才建立新版本。 */
export function sceneCloudAction(deviceId:string,operations:SceneCloudOperation[]):SceneNode{
 if(!definitionUuid(deviceId)||!operations.length||new Set(operations.map(row=>row.propertyKey)).size!==operations.length)throw new Error('请选择有效且不重复的属性')
 if(operations.every(row=>row.op==='set'))return {nodeType:sceneCloudNode,config:{deviceId,properties:Object.fromEntries(operations.map(row=>[row.propertyKey,(row as Extract<SceneCloudOperation,{op:'set'|'inc'|'dec'|'inc_pct'|'dec_pct'}>).value]))}}
 const node:SceneNode={nodeType:sceneCloudTransformNode,config:{schemaVersion:operations.some(row=>row.op==='set_ref')?2:1,deviceId,operations:cloneSceneValue(operations)}}
 if(!sceneCloudTransformConfig(node))throw new Error('请设置1至32个有效属性操作')
 return node
}
/** Source数值步进仍使用精确十进制；不能经Number舍入用户输入。 */
export function stepSceneDecimal(raw:string,direction:1|-1):string{
 const value=parsePreprocessJson(raw.trim()||'0');if(!(value instanceof ExactDecimal))throw new Error('请填写有效数值')
 const exponent=value.exponent<0n?value.exponent:0n,digits=BigInt(value.digits.length)+value.exponent-exponent,unitDigits=1n-exponent
 if(digits>1000n||unitDigits>1000n)throw new Error('数值步进结果超过当前精确输入范围')
 const coefficient=BigInt(value.digits)*(value.negative?-1n:1n)*10n**(value.exponent-exponent),step=(direction===1?1n:-1n)*10n**(-exponent)
 return new ExactDecimal(`${coefficient+step}e${exponent}`).expanded()
}
export function sceneCloudOperationText(row:SceneCloudOperation,display:(value:ExactJson)=>string=(value)=>typeof value==='string'?value:writePreprocessJson(value,true),deviceName:(id:string)=>string=id=>id):string{return `${row.propertyKey} ${sceneCloudOperationLabels[row.op]}${row.op==='set_ref'?' '+deviceName(row.refDeviceId)+'.'+row.refPropertyKey:'value' in row?' '+display(row.value):''}`}
/** 任务用途只认可明确新node和原设备/任务两键，不给旧未知节点编辑资格。 */
export function sceneTaskConfig(node:SceneNode):{deviceId:string;taskId:string}|undefined{
 const value=node.config
 if(node.nodeType!==sceneTaskNode||!exactObject(value)||Object.keys(value).sort().join(',')!=='deviceId,taskId'||typeof value.deviceId!=='string'||!definitionUuid(value.deviceId)||typeof value.taskId!=='string'||!definitionUuid(value.taskId))return
 return {deviceId:value.deviceId,taskId:value.taskId}
}
/** 仅显式 V2 策略可进入新内核；缺省及 null 保留旧版本语义。 */
export function sceneExecutionPolicy(value:unknown):ScenePolicyDraft|undefined{
 if(value===undefined||value===null)return
 const runtime:unknown=exactObject(value)?value.runtimeVersion:undefined
 if(!exactObject(value)||Object.keys(value).sort().join(',')!=='actionFailPolicy,concurrencyPolicy,runtimeVersion'||(runtime instanceof ExactDecimal?runtime.canonical()!=='2':runtime!==2)||!['skip_current','terminate_prev'].includes(String(value.concurrencyPolicy))||!['continue','stop'].includes(String(value.actionFailPolicy)))throw new Error('场景执行策略无法完整读取。')
 return {runtimeVersion:2,concurrencyPolicy:value.concurrencyPolicy as ScenePolicyDraft['concurrencyPolicy'],actionFailPolicy:value.actionFailPolicy as ScenePolicyDraft['actionFailPolicy']}
}
export function sceneDelayConfig(node:SceneNode):{durationSeconds:number}|undefined{
 const value=node.config
 if(node.nodeType!==sceneDelayNode||!exactObject(value)||Object.keys(value).join(',')!=='durationSeconds')return
 if(value.durationSeconds instanceof ExactDecimal&&value.durationSeconds.exponent<0n)return
 const seconds=value.durationSeconds instanceof ExactDecimal?Number(value.durationSeconds.canonical()):value.durationSeconds
 if(typeof seconds!=='number'||!Number.isSafeInteger(seconds)||seconds<1||seconds>86400)return
 return {durationSeconds:seconds}
}
/** 旧未知动作/条件只保留原语义；兼容固定版本只在本地草稿预填策略，保存才建立新版本。 */
function supportsSceneV2(actions:SceneNode[],conditions:SceneNode[]):boolean{
 return actions.every(node=>!!(scenePropertyConfig(node)||scenePropertyTransformConfig(node)||sceneCloudTransformConfig(node)||sceneTaskConfig(node)||sceneDelayConfig(node)))&&conditions.every(node=>node.nodeType==='payload-property-compare')
}
export function newSceneDraft():SceneDraft{return {name:'',description:'',enabled:true,tags:[],conditions:[],actions:[],deviceScope:{kind:'LEGACY_PROJECT',referenceId:null},executionPolicy:newScenePolicy()}}
export function loadedSceneDraft(scene:Schema<'RuleSceneView'>,version:Schema<'RuleSceneVersionView'>):SceneDraft{
 if(typeof scene.name!=='string'||typeof scene.status!=='string'||!version.deviceScope)throw new Error('场景原定义不完整。')
 const description=scene.description??'',actions=sceneNodeList(version.actions),conditions=sceneNodeList(version.conditions),policy=sceneExecutionPolicy((version as {executionPolicy?:unknown}).executionPolicy)
 return {name:scene.name,description,originalName:scene.name,originalDescription:description,enabled:scene.status==='ACTIVE',tags:sceneTagRows((scene as {tags?:unknown}).tags),conditions,actions:actions.map(node=>({key:crypto.randomUUID(),node})),deviceScope:cloneSceneValue(version.deviceScope),executionPolicy:policy??(actions.every(node=>!!(scenePropertyConfig(node)||sceneTaskConfig(node)))&&supportsSceneV2(actions,conditions)?newScenePolicy():undefined)}
}
/** 新字段按原站限制；未改的旧长名称/描述原样保留，不因动作修订截断。 */
export function sceneDraftBody(draft:SceneDraft):SceneBody{
 const name=draft.name.trim(),description=draft.description.trim()
 if(!name||!validUnicode(name)||(draft.name!==draft.originalName&&[...name].length>40)||(draft.description!==draft.originalDescription&&[...description].length>200)||!validUnicode(description))throw new Error('请填写有效名称（最多40字）和描述（最多200字）。')
 if(!draft.actions.length)throw new Error('请至少添加 1 个动作')
 const executionPolicy=sceneExecutionPolicy(draft.executionPolicy)
 if(!executionPolicy&&draft.actions.some(row=>row.node.nodeType===sceneCloudTransformNode||row.node.nodeType===scenePropertyTransformNode))throw new Error('属性操作需要完整执行策略，请重新读取场景。')
 if(executionPolicy&&!supportsSceneV2(draft.actions.map(row=>row.node),draft.conditions))throw new Error('当前动作或条件不支持所选执行策略，请重新读取原场景。')
 return {name,description:description||undefined,tags:sceneTagInputValue(draft.tags,draft.originalName!==undefined),conditions:sceneNodeList(draft.conditions),actions:sceneNodeList(draft.actions.map(row=>row.node)),deviceScope:cloneSceneValue(draft.deviceScope),...(executionPolicy?{executionPolicy}:{})}
}
/** 对象字段顺序无关，动作和条件顺序及所有精确数值保持有意义。 */
export function sceneSignature(value:unknown):string{
 if(value instanceof ExactDecimal)return value.canonical()
 if(Array.isArray(value))return '['+value.map(sceneSignature).join(',')+']'
 if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>(value as Record<string,unknown>)[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+sceneSignature((value as Record<string,unknown>)[k])).join(',')+'}'
 return JSON.stringify(value)
}
export function assertSceneContent(body:SceneBody,scene:Schema<'RuleSceneView'>,version:Schema<'RuleSceneVersionView'>){
 if(sceneSignature(sceneExecutionPolicy((version as {executionPolicy?:unknown}).executionPolicy))!==sceneSignature(sceneExecutionPolicy(body.executionPolicy))||sceneSignature(sceneTags((scene as {tags?:unknown}).tags))!==sceneSignature(sceneTags(body.tags))||scene.name!==body.name||(scene.description??'')!==(body.description??'')||sceneSignature(sceneNodeList(version.conditions))!==sceneSignature(body.conditions)||sceneSignature(sceneNodeList(version.actions))!==sceneSignature(body.actions)||sceneSignature(version.deviceScope)!==sceneSignature(body.deviceScope))throw new Error('当前场景与原保存意图尚未一致；未重复提交。')
}
export function moveSceneAction(rows:SceneActionDraft[],from:number,to:number){if(from<0||to<0||from>=rows.length||to>=rows.length)return rows;const next=rows.slice(),row=next.splice(from,1)[0]!;next.splice(to,0,row);return next}
/** 只将元信息CAS转为已知精确整数，其它配置已经是精确树。 */
export function sceneWriteText(body:SceneBody,expectedVersion?:number,enabled?:Schema<'ReviseSceneRequest'>['enabled']){
 const wire:Record<string,ExactJson>={name:body.name,conditions:body.conditions as unknown as ExactJson,actions:body.actions as unknown as ExactJson,deviceScope:body.deviceScope as unknown as ExactJson}
 const policy=sceneExecutionPolicy(body.executionPolicy)
 if(policy)wire.executionPolicy={runtimeVersion:new ExactDecimal('2'),concurrencyPolicy:policy.concurrencyPolicy,actionFailPolicy:policy.actionFailPolicy}
 if(body.description!==undefined)wire.description=body.description
 if(expectedVersion===undefined&&body.tags!==undefined)wire.tags=sceneTags(body.tags)
 if(expectedVersion!==undefined)wire.expectedVersion=new ExactDecimal(String(cas(expectedVersion)))
 if(enabled!==undefined){if(expectedVersion===undefined||enabled!==null&&typeof enabled!=='boolean')throw new Error('场景状态只允许随内容修订明确保存');wire.enabled=enabled}
 return writePreprocessJson(wire)
}
