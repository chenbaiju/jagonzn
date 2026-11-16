import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const time=(value:StrictJsonValue|undefined):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))
function object(value:StrictJsonValue|undefined):StrictJsonObject{
 if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))throw new Error('当前属性响应不是完整对象')
 return value as StrictJsonObject
}
function closed(value:StrictJsonObject,fields:readonly string[]){
 if(Object.keys(value).length!==fields.length||fields.some(field=>!Object.hasOwn(value,field)))throw new Error('当前属性响应字段不符合合同')
}
/** 将原始属性正文绑定到打开编辑时的真实模型；不经JSON.parse转换数字。 */
export function preparePlatformPropertyBody(model:string,input:string,capabilityId?:string){
 if(!uuid.test(model))throw new Error('设备模型不可用，请刷新后重试')
 const properties=parseDashboardRuntimeResponse(new TextEncoder().encode(input)),keys=Object.keys(properties)
 if(!keys.length||keys.length>50||keys.some(key=>!/^[_a-zA-Z0-9-]{1,64}$/.test(key)||properties[key]===null))throw new Error('请填写1至50个有效属性，属性值不能为null')
 if(capabilityId!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(capabilityId))throw new Error('请选择当前连接的原声明')
 const body=`{"expectedModelVersionId":${JSON.stringify(model)},"properties":${input}${capabilityId===undefined?'':`,"expectedDownlinkCapabilityId":${JSON.stringify(capabilityId)}`}}`
 if(new TextEncoder().encode(body).byteLength>1048576)throw new Error('属性正文超过允许大小')
 return {body,keys,properties}
}
/** 单属性只包装固定键和原始JSON值，再复用唯一严格解析器；禁止注入其它顶层键。 */
export function prepareSinglePlatformPropertyBody(model:string,key:string,value:string,capabilityId?:string){
 const prepared=preparePlatformPropertyBody(model,`{${JSON.stringify(key)}:${value}}`,capabilityId)
 if(prepared.keys.length!==1||prepared.keys[0]!==key)throw new Error('只能提交当前选定属性的一个 JSON 值')
 return prepared
}
/** 显式平台来源与设备来源保留不同时间和身份；任何坏来源使整批不可展示。 */
export function decodePlatformCurrent(bytes:Uint8Array,project:string,device:string,model:string,keys:readonly string[]){
 const response=parseDashboardRuntimeResponse(bytes);closed(response,['projectId','deviceId','modelVersionId','values'])
 if(response.projectId!==project||response.deviceId!==device||response.modelVersionId!==model)throw new Error('当前属性项目、设备或模型身份不匹配')
 if(!keys.length||keys.length>50||new Set(keys).size!==keys.length||!Array.isArray(response.values)||response.values.length!==keys.length)throw new Error('当前属性响应不完整')
 const values:Record<string,StrictJsonValue>=Object.create(null),updatedAt:Record<string,string>=Object.create(null),operations:Record<string,string>=Object.create(null),sources:Record<string,string>=Object.create(null)
 for(let index=0;index<keys.length;index++){
  const item=object(response.values[index]),key=keys[index]!
  closed(item,['propertyKey','state','sourceKind','value','modelVersionId','occurredAt','updatedAt','operationId','reportedRevision'])
  if(item.propertyKey!==key)throw new Error('当前属性身份或顺序不匹配')
  if(item.state!=='VALUE'){
   if(!['NO_VALUE','SOURCE_VERSION_UNKNOWN','SOURCE_MODEL_MISMATCH','CONTRACT_MISMATCH'].includes(String(item.state)))throw new Error('当前属性状态不合法')
   if(['sourceKind','value','modelVersionId','occurredAt','updatedAt','operationId','reportedRevision'].some(field=>item[field]!==null))throw new Error('空状态夹带未证明的当前值')
   if(item.state!=='NO_VALUE')throw new Error('当前属性来源或数据合同不匹配，请刷新设备信息')
   continue
  }
  if(item.modelVersionId!==model||item.value===null)throw new Error('当前属性实际来源模型不匹配')
  if(item.sourceKind==='DEVICE_REPORT'){
   if(!time(item.occurredAt)||item.updatedAt!==null||item.operationId!==null||!(item.reportedRevision===null||typeof item.reportedRevision==='string'&&/^[1-9][0-9]{0,18}$/.test(item.reportedRevision)&&BigInt(item.reportedRevision)<=9223372036854775807n))throw new Error('设备属性来源或采集时间不完整')
   updatedAt[key]=item.occurredAt
  }else if(item.sourceKind==='PLATFORM_DOWNLINK'||item.sourceKind==='PLATFORM_CLOUD_UPDATE'){
   if(!time(item.updatedAt)||item.occurredAt!==null||item.reportedRevision!==null||typeof item.operationId!=='string'||!uuid.test(item.operationId))throw new Error('平台属性来源或更新时间不完整')
   updatedAt[key]=item.updatedAt;operations[key]=item.operationId
  }else throw new Error('当前属性来源不合法')
  values[key]=item.value!;sources[key]=item.sourceKind
 }
 return {values,updatedAt,operations,sources}
}
/** 核对同一操作原件及精确值，不把别次同值操作当成本次成功。 */
export function samePlatformCurrent(current:ReturnType<typeof decodePlatformCurrent>,operation:string,kind:'DOWNLINK'|'CLOUD_UPDATE',properties:StrictJsonObject){
 const source=kind==='DOWNLINK'?'PLATFORM_DOWNLINK':'PLATFORM_CLOUD_UPDATE'
 return Object.entries(properties).every(([key,value])=>current.operations[key]===operation&&current.sources[key]===source&&current.values[key]!==undefined&&equalValue(current.values[key]!,value))
}
/** JSONB会重排对象键及数字词法；确认只比较精确十进制值，数组仍按顺序。 */
function equalValue(left:StrictJsonValue,right:StrictJsonValue):boolean{
 if(isStrictJsonNumber(left)||isStrictJsonNumber(right))return isStrictJsonNumber(left)&&isStrictJsonNumber(right)&&decimalIdentity(left.lexical)===decimalIdentity(right.lexical)
 if(left===null||right===null||typeof left!=='object'||typeof right!=='object')return left===right
 if(Array.isArray(left)||Array.isArray(right))return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((item,index)=>equalValue(item,right[index]!))
 const a=left as StrictJsonObject,b=right as StrictJsonObject,keys=Object.keys(a)
 return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&equalValue(a[key]!,b[key]!))
}
/** 仅规范严格解析器已接受的数值token作相等比较，不转换或展开任意精度数值。 */
function decimalIdentity(raw:string){
 const negative=raw.startsWith('-'),[coefficient,exponent='0']=raw.replace(/^-/,'').toLowerCase().split('e'),[integer,fraction='']=coefficient!.split('.')
 let digits=(integer!+fraction).replace(/^0+/,'');if(!digits)return '0'
 const trimmed=digits.replace(/0+$/,'').length,removed=digits.length-trimmed;digits=digits.slice(0,trimmed)
 return `${negative?'-':''}${digits}e${BigInt(exponent)-BigInt(fraction.length)+BigInt(removed)}`
}

/** 两种下发共用精确JSON相等规则，不将大数转JS浮点或以对象顺序判不等。 */
export function equalDeviceJsonValues(left:StrictJsonValue,right:StrictJsonValue){return equalValue(left,right)}
