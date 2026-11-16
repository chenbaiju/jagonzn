/**
 * tc.dashboard/v1 的最小构造器：只使用已冻结的模型引用、设备变量和当前值/历史绑定，
 * 不解析或重写既有组件的未知字段。原站历史/时序入口的时间窗口语义未取证，history
 * 模式暂只提供构造能力，不接入页面入口。
 */
export type DashboardAddTarget=Readonly<{
  deviceId:string
  deviceName:string
  propertyKey:string
  propertyName:string
  dataType:string
  modelVersionId:string
  modelDigest:string
  modelDigestAlgorithm?:string
}>
export type DashboardAddMode='current'|'history'
/** 当前值属性对应的最小内置组件；不支持的类型返回undefined，不猜组件。 */
export function dashboardPropertyKind(dataType:string):'VALUE_CARD'|'JSON_VIEW'|undefined{
  if(valueCardTypes.has(dataType))return 'VALUE_CARD'
  if(jsonViewTypes.has(dataType))return 'JSON_VIEW'
  return undefined
}

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sha256=/^[0-9a-f]{64}$/i
const propertyKeyPattern=/^[A-Za-z0-9_-]{1,64}$/
const valueCardTypes=new Set(['NUMBER','TEXT','SWITCH','ENUM'])
const jsonViewTypes=new Set(['OBJECT','LIST','DAILY_TIMER','DAILY_TIMER_RANGE','DAILY_TIMER_DURATION','DAILY_TIMER_INTERVAL','DAILY_TIMER_LIST','DAILY_TIMER_RANGE_LIST','DAILY_TIMER_DURATION_LIST','DAILY_TIMER_INTERVAL_LIST'])

type JsonObject=Record<string,unknown>
function object(value:unknown,message:string):JsonObject{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(message)
  return value as JsonObject
}
function array(value:unknown,message:string):unknown[]{
  if(!Array.isArray(value))throw new Error(message)
  return value
}
/** 看板Title闭集为1至80码点；设备/属性组合超长时按码点截断，不把后端拒绝留到保存时。 */
function title(value:string){return Array.from(value).slice(0,80).join('')}
function requireTarget(target:DashboardAddTarget){
  if(!uuid.test(target.deviceId)||!uuid.test(target.modelVersionId))throw new Error('设备或模型身份无效')
  if(!sha256.test(target.modelDigest))throw new Error('当前模型摘要不完整，无法加入看板')
  if(target.modelDigestAlgorithm&&target.modelDigestAlgorithm!=='PG_JSONB_TEXT_V1_SHA256')throw new Error('当前模型摘要算法不受支持')
  if(!propertyKeyPattern.test(target.propertyKey))throw new Error('属性标识符无效')
  if(!target.deviceName.trim()||!target.propertyName.trim())throw new Error('设备或属性名称不完整')
}
function nextKey(used:Set<string>,prefix:string){
  let index=1
  while(used.has(`${prefix}_${index}`))index++
  return `${prefix}_${index}`
}
function usedModelKeys(models:unknown[]){return new Set(models.map(item=>String(object(item,'看板模型引用不完整').key||'')))}
function usedVariableKeys(variables:unknown[]){return new Set(variables.map(item=>String(object(item,'看板变量不完整').key||'')))}
function usedComponentIds(components:unknown[]){return new Set(components.map(item=>String(object(item,'看板组件不完整').id||'')))}
function componentLayout(mode:string,components:unknown[]){
  const responsive=mode==='RESPONSIVE_GRID'
  let nextY=0
  for(const item of components){
    const layout=object(object(item,'看板组件不完整').layout,'看板组件布局不完整')
    const y=typeof layout.y==='number'?layout.y:0,height=typeof layout.h==='number'?layout.h:0
    if(Number.isFinite(y+height))nextY=Math.max(nextY,y+height)
  }
  const width=responsive?6:400,height=responsive?12:300
  if(nextY+height>(responsive?1000:1080))throw new Error('看板画布已无可用纵向空间')
  return {x:0,y:nextY,w:width,h:height}
}
function ensureBase(content:JsonObject|undefined):{content:JsonObject;mode:string;models:unknown[];variables:unknown[];pages:unknown[];page:JsonObject;components:unknown[]}{
  if(!content)return (()=>{
    const base=emptyDashboardContent()
    const models=array(base.models,'看板模型引用不完整'),variables=array(base.variables,'看板变量不完整'),pages=array(base.pages,'看板页面不完整')
    const page=object(pages[0],'看板主页面不完整')
    return {content:base,mode:'RESPONSIVE_GRID',models,variables,pages,page,components:array(page.components,'看板组件不完整')}
  })()
  if(content.schemaVersion!=='tc.dashboard/v1')throw new Error('既有看板不是 tc.dashboard/v1，暂不能追加组件')
  const presentation=object(content.presentation,'既有看板缺少画布设置')
  if(presentation.mode!=='RESPONSIVE_GRID'&&presentation.mode!=='FIXED_SCREEN')throw new Error('既有看板画布模式不受支持')
  const models=array(content.models,'既有看板模型引用不完整')
  const variables=array(content.variables,'既有看板变量不完整')
  const pages=array(content.pages,'既有看板页面不完整')
  if(!pages.length)throw new Error('既有看板没有页面')
  const page=object(pages[0],'既有看板主页面不完整')
  return {content,mode:presentation.mode,models,variables,pages,page,components:array(page.components,'既有看板组件不完整')}
}
function ensureModel(base:ReturnType<typeof ensureBase>,target:DashboardAddTarget){
  const key=`${target.modelVersionId}`
  for(const item of base.models){
    const row=object(item,'看板模型引用不完整')
    if(row.versionId===target.modelVersionId){
      if(row.digest!==target.modelDigest||row.digestAlgorithm!=='PG_JSONB_TEXT_V1_SHA256'||row.profile!=='TC_PROPERTY_COMPOSITE_V1')throw new Error('既有看板中的模型摘要与当前设备不一致')
      return String(row.key)
    }
  }
  if(base.models.length>=20)throw new Error('看板模型引用已达到20项上限')
  const modelKey=nextKey(usedModelKeys(base.models),'model')
  base.models.push({key:modelKey,versionId:target.modelVersionId,digestAlgorithm:'PG_JSONB_TEXT_V1_SHA256',digest:target.modelDigest,profile:'TC_PROPERTY_COMPOSITE_V1'})
  return modelKey
}
function ensureDeviceVariable(base:ReturnType<typeof ensureBase>,target:DashboardAddTarget,modelKey:string){
  for(const item of base.variables){
    const row=object(item,'看板变量不完整')
    if(row.type==='DEVICE_SINGLE'&&row.modelKey===modelKey&&row.defaultDeviceId===target.deviceId)return String(row.key)
  }
  if(base.variables.length>=20)throw new Error('看板变量已达到20项上限')
  const variableKey=nextKey(usedVariableKeys(base.variables),'device')
  base.variables.push({key:variableKey,type:'DEVICE_SINGLE',title:title(target.deviceName),required:true,modelKey,defaultDeviceId:target.deviceId})
  return variableKey
}
function ensureTimeRange(base:ReturnType<typeof ensureBase>){
  for(const item of base.variables){
    const row=object(item,'看板变量不完整')
    if(row.type==='TIME_RANGE')return String(row.key)
  }
  if(base.variables.length>=20)throw new Error('看板变量已达到20项上限')
  const key=nextKey(usedVariableKeys(base.variables),'period')
  base.variables.push({key,type:'TIME_RANGE',title:'时间范围',required:true,defaultPreset:'LAST_24_HOURS',allowedPresets:['LAST_1_HOUR','LAST_24_HOURS','LAST_7_DAYS']})
  return key
}
function bindingValue(variableKey:string,propertyKey:string){
  return {source:'CURRENT_VALUE',device:{variableKey},propertyKey}
}
export function emptyDashboardContent():JsonObject{
  return {
    schemaVersion:'tc.dashboard/v1',
    presentation:{mode:'RESPONSIVE_GRID',theme:'LIGHT',columns:24,rowHeight:8,gap:8},
    models:[],
    variables:[],
    pages:[{id:'main',title:'主页面',components:[]}]
  }
}
/** 第二步组件选项：只允许当前属性类型已有的内置kind。 */
export type DashboardAddOptions=Readonly<{kind?:'VALUE_CARD'|'JSON_VIEW';title?:string}>
/** 在既有草稿或新草稿中追加一个当前值组件；返回同一内容对象的新克隆。 */
export function addPropertyToDashboard(source:JsonObject|undefined,target:DashboardAddTarget,mode:DashboardAddMode='current',options:DashboardAddOptions={}):JsonObject{
  requireTarget(target)
  if(mode==='history'&&target.dataType!=='NUMBER')throw new Error('只有数值属性可以加入历史曲线看板')
  if(mode==='current'&&!valueCardTypes.has(target.dataType)&&!jsonViewTypes.has(target.dataType))throw new Error('当前属性类型暂不支持加入看板')
  const content=structuredClone(source??emptyDashboardContent())
  const base=ensureBase(content)
  if(base.components.length>=50)throw new Error('看板主页面组件已达到50项上限')
  const modelKey=ensureModel(base,target)
  const deviceKey=ensureDeviceVariable(base,target,modelKey)
  const componentId=nextKey(usedComponentIds(base.components),'component')
  const layout=componentLayout(base.mode,base.components)
  const label=title(options.title?.trim()||`${target.deviceName} · ${target.propertyName}`)
  if(mode==='current'){
    const kind=options.kind||(valueCardTypes.has(target.dataType)?'VALUE_CARD':'JSON_VIEW')
    if(kind==='VALUE_CARD'&&!valueCardTypes.has(target.dataType))throw new Error('数值卡片只接受数值、文本、开关或枚举属性')
    if(kind==='JSON_VIEW'&&!jsonViewTypes.has(target.dataType))throw new Error('JSON 视图只接受对象或列表属性')
    base.components.push({id:componentId,kind,componentVersion:'1.0.0',layout,props:{title:label},bindings:{value:bindingValue(deviceKey,target.propertyKey)}})
  }else{
    const timeKey=ensureTimeRange(base)
    // 序列id是LocalKey，不能用可能含大写或连字符的物模型属性键。
    const seriesKey='series_1'
    base.components.push({id:componentId,kind:'LINE_CHART',componentVersion:'1.0.0',layout,props:{title:label,series:[{id:seriesKey,label:title(target.propertyName)}]},bindings:{series:[{id:seriesKey,value:{source:'HISTORY_SERIES',device:{variableKey:deviceKey},propertyKey:target.propertyKey,timeRangeVariableKey:timeKey,granularity:'RAW',aggregation:'AVG'}}]}})
  }
  return content
}
/** 在既有草稿中追加静态文本组件；TEXT不写title，正文按4096码点合同校验。 */
export function addTextToDashboard(source:JsonObject|undefined,text:string):JsonObject{
  const content=structuredClone(source??emptyDashboardContent())
  const base=ensureBase(content)
  if(base.components.length>=50)throw new Error('看板主页面组件已达到50项上限')
  const componentId=nextKey(usedComponentIds(base.components),'component')
  const layout=componentLayout(base.mode,base.components)
  base.components.push({id:componentId,kind:'TEXT',componentVersion:'1.0.0',layout,
    props:{content:textContent(text),align:'LEFT',size:'MEDIUM',tone:'REGULAR'},bindings:{}})
  return content
}
/** 回读校验：确认草稿中存在指向该设备默认变量和属性的组件。 */
export function hasPropertyDashboardBinding(content:JsonObject,deviceId:string,propertyKey:string){
  const variables=array(content.variables,'看板变量不完整')
  const deviceKeys=new Set<string>()
  for(const item of variables){
    const row=object(item,'看板变量不完整')
    if(row.type==='DEVICE_SINGLE'&&row.defaultDeviceId===deviceId)deviceKeys.add(String(row.key))
  }
  if(!deviceKeys.size)return false
  const pages=array(content.pages,'看板页面不完整')
  for(const page of pages){
    for(const item of array(object(page,'看板页面不完整').components,'看板组件不完整')){
      const bindings=object(object(item,'看板组件不完整').bindings,'看板绑定不完整')
      const candidates=[bindings.value,...(Array.isArray(bindings.series)?bindings.series.map(entry=>object(entry,'看板序列绑定不完整').value):[])]
      for(const binding of candidates){
        if(!binding||typeof binding!=='object'||Array.isArray(binding))continue
        const row=binding as JsonObject
        const device=row.device&&typeof row.device==='object'&&!Array.isArray(row.device)?row.device as JsonObject:undefined
        if((row.source==='CURRENT_VALUE'||row.source==='HISTORY_SERIES')&&row.propertyKey===propertyKey&&device&&deviceKeys.has(String(device.variableKey)))return true
      }
    }
  }
  return false
}
/** 编辑既有组件的公共标题；TEXT没有title字段，必须改正文而不是偷偷写入title。 */
export function renameDashboardComponent(content:JsonObject,pageId:string,componentId:string,nextTitle:string):JsonObject{
  const detail=dashboardComponentDetail(content,pageId,componentId)
  if(!detail)throw new Error('看板组件不存在')
  if(detail.kind==='TEXT')throw new Error('TEXT组件没有标题字段')
  return updateDashboardComponent(content,pageId,componentId,{title:nextTitle,layout:detail.layout,props:{}})
}

export type DashboardComponentLayout=Readonly<{x:number;y:number;w:number;h:number}>
export type DashboardComponentDetail=Readonly<{
  pageId:string
  id:string
  kind:string
  componentVersion:string
  title:string
  layout:DashboardComponentLayout
  props:JsonObject
  bindings:JsonObject
}>
export type DashboardComponentEdit=Readonly<{
  title:string
  layout:DashboardComponentLayout
  props:Readonly<Record<string,unknown>>
}>
function integer(value:unknown,label:string,min:number,max:number){
  if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)throw new Error(`${label}需为${min}至${max}的整数`)
  return value
}
function layoutBounds(content:JsonObject){
  const presentation=object(content.presentation,'看板缺少画布设置')
  return presentation.mode==='FIXED_SCREEN'
    ?{maxX:1919,maxY:1079,maxW:1920,maxH:1080}
    :{maxX:23,maxY:999,maxW:24,maxH:1000}
}
function validateLayout(content:JsonObject,layout:DashboardComponentLayout,page:JsonObject,componentId:string){
  const bounds=layoutBounds(content)
  const x=integer(layout.x,'横坐标',0,bounds.maxX),y=integer(layout.y,'纵坐标',0,bounds.maxY)
  const w=integer(layout.w,'宽度',1,bounds.maxW),h=integer(layout.h,'高度',1,bounds.maxH)
  if(x+w>bounds.maxW||y+h>bounds.maxH)throw new Error('组件矩形越过画布边界')
  for(const item of array(page.components,'看板组件不完整')){
    const row=object(item,'看板组件不完整')
    const id=String(row.id||'')
    if(id===componentId)continue
    const other=object(row.layout,'看板组件布局不完整')
    const ox=Number(other.x),oy=Number(other.y),ow=Number(other.w),oh=Number(other.h)
    if(x<ox+ow&&ox<x+w&&y<oy+oh&&oy<y+h)throw new Error('组件矩形不能与其他组件重叠')
  }
  return {x,y,w,h}
}
function codePoints(value:string){return Array.from(value).length}
function textContent(value:unknown){
  if(typeof value!=='string'||codePoints(value)>4096||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value))throw new Error('文本最多4096码点且不能含非法控制字符')
  return value
}
function shortText(value:unknown,label:string){
  if(typeof value!=='string'||codePoints(value)>256||/[\u0000-\u001f\u007f-\u009f]/.test(value))throw new Error(`${label}最多256码点且不能含控制字符`)
  return value
}
function booleanValue(value:unknown,label:string){
  if(typeof value!=='boolean')throw new Error(`${label}需为布尔值`)
  return value
}
function enumValue(value:unknown,label:string,allowed:readonly string[]){
  if(typeof value!=='string'||!allowed.includes(value))throw new Error(`${label}不在支持范围`)
  return value
}
function finiteNumber(value:unknown,label:string){
  if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e12)throw new Error(`${label}需为有限数值`)
  return value
}
function validateKindProps(kind:string,props:JsonObject){
  if('title' in props&&props.title!==undefined){
    const titleText=String(props.title).trim()
    if(!titleText||codePoints(titleText)>80)throw new Error('组件标题需为1至80个码点')
  }
  switch(kind){
    case 'TEXT':
      if('content' in props)textContent(props.content)
      if('align' in props)enumValue(props.align,'文本对齐',['LEFT','CENTER','RIGHT'])
      if('size' in props)enumValue(props.size,'文本字号',['SMALL','MEDIUM','LARGE'])
      if('tone' in props)enumValue(props.tone,'文本色调',['REGULAR','SECONDARY','PRIMARY'])
      break
    case 'VALUE_CARD':
      if('precision' in props)integer(props.precision,'显示精度',0,6)
      if('unitMode' in props)enumValue(props.unitMode,'单位模式',['MODEL','NONE'])
      break
    case 'STATUS':
      if('showLastOnlineAt' in props)booleanValue(props.showLastOnlineAt,'显示最后在线时间')
      break
    case 'GAUGE':{
      const scaleMode='scaleMode' in props?enumValue(props.scaleMode,'量程模式',['MODEL','EXPLICIT']):'MODEL'
      if('precision' in props)integer(props.precision,'显示精度',0,6)
      if('unitMode' in props)enumValue(props.unitMode,'单位模式',['MODEL','NONE'])
      if(scaleMode==='MODEL'&&('min' in props||'max' in props))throw new Error('模型量程不能填写最小或最大值')
      if(scaleMode==='EXPLICIT'){
        const min=finiteNumber(props.min,'最小值'),max=finiteNumber(props.max,'最大值')
        if(min>=max)throw new Error('最小值需小于最大值')
      }
      break
    }
    case 'LINE_CHART':
      if('showLegend' in props)booleanValue(props.showLegend,'显示图例')
      break
    case 'TABLE':
      if('rowLimit' in props)integer(props.rowLimit,'表格行数',1,256)
      if('mode' in props)enumValue(props.mode,'表格模式',['LIST_VALUE','DEVICE_VALUES'])
      break
    case 'JSON_VIEW':
      if('initialExpandDepth' in props)integer(props.initialExpandDepth,'展开深度',0,2)
      break
    case 'ALARM_LIST':
      if('pageSize' in props)integer(props.pageSize,'分页大小',1,50)
      if('showClearedAt' in props)booleanValue(props.showClearedAt,'显示清除时间')
      break
    case 'DEVICE_SELECTOR':
      if('placeholder' in props)shortText(props.placeholder,'占位文本')
      if('pageSize' in props)integer(props.pageSize,'分页大小',1,50)
      break
    case 'IMAGE':
      if('alt' in props)shortText(props.alt,'替代文本')
      if('fit' in props)enumValue(props.fit,'图片填充',['CONTAIN','COVER'])
      break
  }
}
/** 读取可编辑组件事实；找不到时返回undefined，不创建影子组件。 */
export function dashboardComponentDetail(content:JsonObject,pageId:string,componentId:string):DashboardComponentDetail|undefined{
  const pages=array(content.pages,'看板页面不完整')
  const page=pages.map(item=>object(item,'看板页面不完整')).find(item=>String(item.id||'')===pageId)
  if(!page)return undefined
  const component=array(page.components,'看板组件不完整').map(item=>object(item,'看板组件不完整'))
    .find(item=>String(item.id||'')===componentId)
  if(!component)return undefined
  const props=object(component.props,'看板组件属性不完整'),layout=object(component.layout,'看板组件布局不完整')
  const x=Number(layout.x),y=Number(layout.y),w=Number(layout.w),h=Number(layout.h)
  return Object.freeze({pageId,id:componentId,kind:String(component.kind||''),componentVersion:String(component.componentVersion||''),
    title:typeof props.title==='string'?props.title:'',layout:Object.freeze({x,y,w,h}),props:{...props},bindings:{...object(component.bindings,'看板组件绑定不完整')}})
}
/** 编辑既有组件的标题、画布矩形和kind允许的props；bindings与未知字段保持原样。 */
export function updateDashboardComponent(content:JsonObject,pageId:string,componentId:string,edit:DashboardComponentEdit):JsonObject{
  const cloned=structuredClone(content)
  const pages=array(cloned.pages,'看板页面不完整')
  const page=pages.map(item=>object(item,'看板页面不完整')).find(item=>String(item.id||'')===pageId)
  if(!page)throw new Error('看板页面不存在')
  const components=array(page.components,'看板组件不完整')
  const component=components.map(item=>object(item,'看板组件不完整')).find(item=>String(item.id||'')===componentId)
  if(!component)throw new Error('看板组件不存在')
  const kind=String(component.kind||'')
  const titleText=edit.title.trim()
  if(kind!=='TEXT'&&(!titleText||codePoints(titleText)>80))throw new Error('组件标题需为1至80个码点')
  const layout=validateLayout(cloned,edit.layout,page,componentId)
  const bindings=object(component.bindings,'看板组件绑定不完整')
  if(kind==='TEXT'&&'text' in bindings&&'content' in edit.props)throw new Error('动态文本不能同时编辑静态正文')
  const props:JsonObject={...object(component.props,'看板组件属性不完整'),...edit.props}
  if(kind==='TEXT')delete props.title
  else props.title=titleText
  if(kind==='GAUGE'&&props.scaleMode==='MODEL'){delete props.min;delete props.max}
  validateKindProps(kind,props)
  component.layout={...layout}
  component.props=props
  return cloned
}

/** 目录卡片按原站展示“N 组件”，统计全部页面的真实组件数。 */
export function dashboardComponentCount(content:JsonObject):number{
  let count=0
  for(const page of array(content.pages,'看板页面不完整'))count+=array(object(page,'看板页面不完整').components,'看板组件不完整').length
  return count
}

/** 把草稿组件投影为画布渲染所需的最小事实；不推断未知kind的视觉。 */
export type DashboardRenderComponent=Readonly<{
  pageId:string
  pageTitle:string
  id:string
  kind:string
  componentVersion:string
  title:string
  layout:DashboardComponentLayout
  props:JsonObject
  bindings:JsonObject
}>
export function dashboardRenderComponents(content:JsonObject):DashboardRenderComponent[]{
  const result:DashboardRenderComponent[]=[]
  for(const page of array(content.pages,'看板页面不完整')){
    const row=object(page,'看板页面不完整'),pageId=String(row.id||''),pageTitle=String(row.title||'')
    for(const item of array(row.components,'看板组件不完整')){
      const component=object(item,'看板组件不完整')
      const props=component.props&&typeof component.props==='object'&&!Array.isArray(component.props)?component.props as JsonObject:{}
      const bindings=component.bindings&&typeof component.bindings==='object'&&!Array.isArray(component.bindings)?component.bindings as JsonObject:{}
      const layout=object(component.layout,'看板组件布局不完整')
      result.push(Object.freeze({pageId,pageTitle,id:String(component.id||''),kind:String(component.kind||''),
        componentVersion:String(component.componentVersion||''),title:typeof props.title==='string'?props.title:'',
        layout:Object.freeze({x:Number(layout.x),y:Number(layout.y),w:Number(layout.w),h:Number(layout.h)}),props,bindings}))
    }
  }
  return result
}

/** 复制既有组件为同一页面的新组件；保留绑定、属性与版本，只分配新LocalKey和下方布局。 */
export function duplicateDashboardComponent(content:JsonObject,pageId:string,componentId:string):JsonObject{
  const cloned=structuredClone(content)
  const pages=array(cloned.pages,'看板页面不完整')
  const page=pages.map(item=>object(item,'看板页面不完整')).find(item=>String(item.id||'')===pageId)
  if(!page)throw new Error('看板页面不存在')
  const components=array(page.components,'看板组件不完整')
  const source=components.map(item=>object(item,'看板组件不完整')).find(item=>String(item.id||'')===componentId)
  if(!source)throw new Error('看板组件不存在')
  if(components.length>=50)throw new Error('看板主页面组件已达到50项上限')
  const copy=structuredClone(source)
  copy.id=nextKey(usedComponentIds(components),'component')
  const layout=object(source.layout,'看板组件布局不完整')
  const width=Number(layout.w),height=Number(layout.h)
  const next=componentLayout(String(object(cloned.presentation,'看板缺少画布设置').mode||'RESPONSIVE_GRID'),components)
  copy.layout={x:Number(layout.x),y:next.y,w:width,h:height}
  const validated=validateLayout(cloned,{x:Number(layout.x),y:next.y,w:width,h:height},page,String(copy.id))
  copy.layout=validated
  components.push(copy)
  return cloned
}

/** 移除一个既有组件；不删除其模型或变量引用，避免影响其他组件。 */
export function removeDashboardComponent(content:JsonObject,pageId:string,componentId:string):JsonObject{
  const cloned=structuredClone(content)
  const pages=array(cloned.pages,'看板页面不完整')
  const page=pages.map(item=>object(item,'看板页面不完整')).find(item=>String(item.id||'')===pageId)
  if(!page)throw new Error('看板页面不存在')
  const components=array(page.components,'看板组件不完整')
  const index=components.findIndex(item=>String(object(item,'看板组件不完整').id||'')===componentId)
  if(index<0)throw new Error('看板组件不存在')
  components.splice(index,1)
  return cloned
}

/** 设备变量键到默认设备ID的只读投影，供编辑画布读取当前值。 */
export function dashboardVariableDevices(content:JsonObject):Readonly<Record<string,string>>{
  const result:Record<string,string>={}
  for(const item of array(content.variables,'看板变量不完整')){
    const row=object(item,'看板变量不完整')
    if(row.type==='DEVICE_SINGLE'&&typeof row.key==='string'&&typeof row.defaultDeviceId==='string')result[row.key]=row.defaultDeviceId
  }
  return Object.freeze(result)
}

export function dashboardComponentSummaries(content:JsonObject){
  const pages=array(content.pages,'看板页面不完整')
  const result:Array<{pageId:string;pageTitle:string;id:string;kind:string;title:string;propertyKey:string|null;source:string|null}>=[]
  for(const page of pages){
    const row=object(page,'看板页面不完整')
    const pageId=String(row.id||''),pageTitle=String(row.title||'')
    for(const item of array(row.components,'看板组件不完整')){
      const component=object(item,'看板组件不完整')
      const props=component.props&&typeof component.props==='object'&&!Array.isArray(component.props)?component.props as JsonObject:{}
      const bindings=component.bindings&&typeof component.bindings==='object'&&!Array.isArray(component.bindings)?component.bindings as JsonObject:{}
      const firstBinding=bindings.value&&typeof bindings.value==='object'&&!Array.isArray(bindings.value)?bindings.value as JsonObject:Array.isArray(bindings.series)&&bindings.series[0]&&typeof bindings.series[0]==='object'?((bindings.series[0] as JsonObject).value as JsonObject|undefined):undefined
      result.push({pageId,pageTitle,id:String(component.id||''),kind:String(component.kind||''),title:typeof props.title==='string'?props.title:'',propertyKey:firstBinding&&typeof firstBinding.propertyKey==='string'?firstBinding.propertyKey:null,source:firstBinding&&typeof firstBinding.source==='string'?firstBinding.source:null})
    }
  }
  return result
}
