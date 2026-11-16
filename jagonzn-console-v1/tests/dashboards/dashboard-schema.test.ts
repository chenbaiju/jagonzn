import {describe,expect,it} from 'vitest'
import {addPropertyToDashboard,addTextToDashboard,dashboardComponentCount,dashboardComponentDetail,dashboardComponentSummaries,dashboardPropertyKind,dashboardRenderComponents,dashboardVariableDevices,duplicateDashboardComponent,emptyDashboardContent,hasPropertyDashboardBinding,removeDashboardComponent,renameDashboardComponent,updateDashboardComponent} from '../../src/features/dashboards/dashboard-schema'

const device='00000000-0000-4000-8000-000000000001'
const model='00000000-0000-4000-8000-000000000002'
const digest='a'.repeat(64)
const target={deviceId:device,deviceName:'泵站设备',propertyKey:'temperature',propertyName:'温度',dataType:'NUMBER',modelVersionId:model,modelDigest:digest,modelDigestAlgorithm:'PG_JSONB_TEXT_V1_SHA256'}

describe('看板属性构造',()=>{
 it('空看板草稿包含冻结版本、画布和主页面',()=>{
  const content=emptyDashboardContent()
  expect(content.schemaVersion).toBe('tc.dashboard/v1')
  expect(content.presentation).toMatchObject({mode:'RESPONSIVE_GRID'})
  expect(Array.isArray(content.pages)).toBe(true)
  expect(dashboardComponentSummaries(content)).toEqual([])
 })
 it('当前数值属性生成VALUE_CARD、设备默认变量和精确当前值绑定',()=>{
  const content=addPropertyToDashboard(undefined,target)
  const models=content.models as any[],variables=content.variables as any[],pages=content.pages as any[]
  expect(models).toHaveLength(1)
  expect(models[0]).toMatchObject({versionId:model,digestAlgorithm:'PG_JSONB_TEXT_V1_SHA256',digest,profile:'TC_PROPERTY_COMPOSITE_V1'})
  expect(variables[0]).toMatchObject({type:'DEVICE_SINGLE',modelKey:models[0].key,defaultDeviceId:device})
  const component=pages[0].components[0]
  expect(component).toMatchObject({kind:'VALUE_CARD',componentVersion:'1.0.0',bindings:{value:{source:'CURRENT_VALUE',propertyKey:'temperature',device:{variableKey:variables[0].key}}}})
  expect(hasPropertyDashboardBinding(content,device,'temperature')).toBe(true)
  expect(dashboardComponentSummaries(content)[0]).toMatchObject({kind:'VALUE_CARD',propertyKey:'temperature',source:'CURRENT_VALUE'})
 })
 it('复杂属性使用JSON_VIEW，不可支持类型拒绝',()=>{
  const content=addPropertyToDashboard(undefined,{...target,propertyKey:'payload',propertyName:'载荷',dataType:'OBJECT'})
  expect((content.pages as any[])[0].components[0].kind).toBe('JSON_VIEW')
  expect(dashboardPropertyKind('OBJECT')).toBe('JSON_VIEW')
  expect(dashboardPropertyKind('NUMBER')).toBe('VALUE_CARD')
  expect(dashboardPropertyKind('DATE')).toBeUndefined()
  expect(()=>addPropertyToDashboard(undefined,{...target,dataType:'DATE'})).toThrow('暂不支持')
 })
 it('既有看板追加时复用模型并按最大y值错开布局，未知字段保留',()=>{
  const first=addPropertyToDashboard(undefined,target)
  ;(first.pages as any[])[0].components[0].layout={x:0,y:0,w:6,h:6}
  ;(first as any).custom='keep'
  const second=addPropertyToDashboard(first,{...target,propertyKey:'humidity',propertyName:'湿度'})
  const pages=second.pages as any[]
  expect(pages[0].components).toHaveLength(2)
  expect(pages[0].components[1].layout).toMatchObject({x:0,y:6,w:6,h:12})
  expect((second.models as any[])).toHaveLength(1)
  expect((second.variables as any[])).toHaveLength(1)
  expect((second as any).custom).toBe('keep')
  expect(hasPropertyDashboardBinding(second,device,'humidity')).toBe(true)
 })
 it('历史数值属性生成LINE_CHART和时间范围变量',()=>{
  const content=addPropertyToDashboard(undefined,target,'history')
  const variables=content.variables as any[],component=(content.pages as any[])[0].components[0]
  expect(variables.some(row=>row.type==='TIME_RANGE')).toBe(true)
  expect(component.kind).toBe('LINE_CHART')
  expect(component.bindings.series[0].value).toMatchObject({source:'HISTORY_SERIES',propertyKey:'temperature',granularity:'RAW',aggregation:'AVG'})
  expect(hasPropertyDashboardBinding(content,device,'temperature')).toBe(true)
  expect(()=>addPropertyToDashboard(undefined,{...target,dataType:'TEXT'},'history')).toThrow('数值属性')
 })
 it('历史序列id使用LocalKey且标题按80码点截断',()=>{
  const propertyName='温度'.repeat(50)
  const content=addPropertyToDashboard(undefined,{...target,propertyKey:'Temp-A1',propertyName},'history')
  const component=(content.pages as any[])[0].components[0]
  expect(component.props.series[0].id).toBe('series_1')
  expect(component.bindings.series[0].id).toBe('series_1')
  expect(component.bindings.series[0].value.propertyKey).toBe('Temp-A1')
  expect([...component.props.series[0].label]).toHaveLength(80)
  expect([...component.props.title]).toHaveLength(80)
  expect(hasPropertyDashboardBinding(content,device,'Temp-A1')).toBe(true)
 })
 it('组件标题编辑只改props.title并保留未知字段与绑定',()=>{
  const content=addPropertyToDashboard(undefined,target)
  ;(content as any).custom='keep'
  const page=(content.pages as any[])[0],component=page.components[0]
  const renamed=renameDashboardComponent(content,page.id,component.id,'  泵站温度  ')
  const updated=(renamed.pages as any[])[0].components[0]
  expect(updated.props.title).toBe('泵站温度')
  expect(updated.bindings).toEqual(component.bindings)
  expect((renamed as any).custom).toBe('keep')
  expect(()=>renameDashboardComponent(content,page.id,component.id,'')).toThrow('组件标题')
  expect(()=>renameDashboardComponent(content,page.id,component.id,'温'.repeat(81))).toThrow('组件标题')
  expect(()=>renameDashboardComponent(content,'missing',component.id,'标题')).toThrow('组件不存在')
 })
 it('组件编辑合并kind允许props并校验矩形边界与重叠',()=>{
  const content=addPropertyToDashboard(undefined,target)
  const page=(content.pages as any[])[0],component=page.components[0]
  const edited=updateDashboardComponent(content,page.id,component.id,{title:'温度卡片',layout:{x:0,y:0,w:8,h:6},props:{precision:1,unitMode:'NONE'}})
  const detail=dashboardComponentDetail(edited,page.id,component.id)!
  expect(detail.title).toBe('温度卡片');expect(detail.layout).toEqual({x:0,y:0,w:8,h:6})
  expect(detail.props).toMatchObject({precision:1,unitMode:'NONE'});expect(detail.bindings).toEqual(component.bindings)
  expect(()=>updateDashboardComponent(edited,page.id,component.id,{title:'温度',layout:{x:24,y:0,w:1,h:1},props:{}})).toThrow('横坐标')
  const second=addPropertyToDashboard(edited,{...target,propertyKey:'humidity',propertyName:'湿度'})
  const secondPage=(second.pages as any[])[0]
  expect(()=>updateDashboardComponent(second,secondPage.id,secondPage.components[0].id,{title:'温度',layout:{x:0,y:6,w:8,h:6},props:{}})).toThrow('重叠')
 })
 it('组件编辑拒绝kind属性越界与模型量程混用',()=>{
  const content=addPropertyToDashboard(undefined,target)
  const page=(content.pages as any[])[0],component=page.components[0]
  expect(()=>updateDashboardComponent(content,page.id,component.id,{title:'温度',layout:component.layout,props:{precision:7}})).toThrow('显示精度')
  expect(()=>updateDashboardComponent(content,page.id,component.id,{title:'温度',layout:component.layout,props:{unitMode:'BAD'}})).toThrow('单位模式')
  const gauge=structuredClone(content);(gauge.pages as any[])[0].components[0].kind='GAUGE';(gauge.pages as any[])[0].components[0].props={title:'温度'}
  const modelScale=updateDashboardComponent(gauge,page.id,component.id,{title:'温度',layout:component.layout,props:{scaleMode:'MODEL',min:0,max:10}})
  expect(dashboardComponentDetail(modelScale,page.id,component.id)!.props).not.toHaveProperty('min')
  expect(dashboardComponentDetail(modelScale,page.id,component.id)!.props).not.toHaveProperty('max')
 })
 it('新增静态文本不写title并按既有组件错开布局',()=>{
  const first=addTextToDashboard(undefined,'第一段')
  const second=addTextToDashboard(first,'第二段')
  const components=(second.pages as any[])[0].components
  expect(components).toHaveLength(2)
  expect(components[0]).toMatchObject({kind:'TEXT',componentVersion:'1.0.0',props:{content:'第一段',align:'LEFT',size:'MEDIUM',tone:'REGULAR'},bindings:{}})
  expect(components[0].props.title).toBeUndefined()
  expect(components[1].layout).toMatchObject({x:0,y:12,w:6,h:12})
  expect(()=>addTextToDashboard(undefined,'\u0000')).toThrow('控制字符')
 })
 it('静态文本编辑保留绑定且动态文本拒绝写正文',()=>{
  const text=emptyDashboardContent()
  ;(text.pages as any[])[0].components.push({id:'text_1',kind:'TEXT',componentVersion:'1.0.0',layout:{x:0,y:0,w:6,h:2},props:{content:'原文本',align:'LEFT',size:'MEDIUM',tone:'REGULAR'},bindings:{}})
  const page=(text.pages as any[])[0]
  const edited=updateDashboardComponent(text,page.id,'text_1',{title:'说明',layout:{x:0,y:0,w:6,h:2},props:{content:'新文本',align:'CENTER'}})
  expect(dashboardComponentDetail(edited,page.id,'text_1')!.props).toMatchObject({content:'新文本',align:'CENTER'})
  expect(dashboardComponentDetail(edited,page.id,'text_1')!.props.title).toBeUndefined()
  const dynamic=structuredClone(text);(dynamic.pages as any[])[0].components[0].bindings={text:{source:'ENUM_TEXT',variable:{variableKey:'mode'}}}
  expect(()=>updateDashboardComponent(dynamic,page.id,'text_1',{title:'说明',layout:{x:0,y:0,w:6,h:2},props:{content:'不能写'}})).toThrow('动态文本')
 })
 it('模型摘要算法必须与冻结合同一致',()=>{
  expect(()=>addPropertyToDashboard(undefined,{...target,modelDigestAlgorithm:'OTHER'})).toThrow('摘要算法')
 })
 it('模型摘要缺失或非规范身份拒绝构造',()=>{
  expect(()=>addPropertyToDashboard(undefined,{...target,modelDigest:'bad'})).toThrow('模型摘要')
  expect(()=>addPropertyToDashboard(undefined,{...target,deviceId:'bad'})).toThrow('设备或模型身份')
 })
 it('画布渲染投影、组件数、变量设备和复制/移除保持绑定',()=>{
  const content=addPropertyToDashboard(undefined,target)
  const page=(content.pages as any[])[0],component=page.components[0]
  expect(dashboardComponentCount(content)).toBe(1)
  expect(dashboardVariableDevices(content)).toEqual({[component.bindings.value.device.variableKey]:device})
  expect(dashboardRenderComponents(content)[0]).toMatchObject({id:component.id,kind:'VALUE_CARD',title:'泵站设备 · 温度',layout:{x:0,y:0,w:6,h:12}})
  const duplicated=duplicateDashboardComponent(content,page.id,component.id)
  const copy=(duplicated.pages as any[])[0].components[1]
  expect(copy.id).not.toBe(component.id);expect(copy.bindings).toEqual(component.bindings);expect(copy.layout.y).toBe(12)
  const removed=removeDashboardComponent(duplicated,page.id,component.id)
  expect((removed.pages as any[])[0].components).toHaveLength(1)
  expect(()=>removeDashboardComponent(content,page.id,'missing')).toThrow('组件不存在')
 })
})
