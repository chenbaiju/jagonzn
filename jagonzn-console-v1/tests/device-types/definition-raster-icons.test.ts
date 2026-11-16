import {webcrypto} from 'node:crypto'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {reactive} from 'vue'
import ElementPlus from 'element-plus'
import Picker from '../../src/features/device-types/DefinitionRasterIconPicker.vue'
import {decodeDefinitionRasterIcon,previewDefinitionRasterIcon,type DefinitionRasterIcon,type RasterIconPreviewTransport} from '../../src/features/device-types/definition-raster-icon'
import {decodeProperty,propertyDraft,copyPropertyDraft,prepareProperty,propertyMatches} from '../../src/features/device-types/property-definition-api'
import {decodeCommand,commandDraft,commandCopyDraft,prepareCommand,commandMatches} from '../../src/features/device-types/command-definition-api'
import {decodeEventDefinitions,eventDraft,eventCopyDraft,prepareEvent,eventMatches} from '../../src/features/device-types/event-definition-api'
import {session} from '../../src/core/session'
import * as http from '../../src/core/http'
const project='00000000-0000-4000-8000-000000000001',type='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003'
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'),base64=bytes.toString('base64')
let icon:DefinitionRasterIcon,wrapper:VueWrapper|undefined
const encoded=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
async function settle(){await new Promise(resolve=>setTimeout(resolve,10));await flushPromises()}
async function select(){const file=new File([bytes],'private-icon.png',{type:'image/png'});const input=wrapper!.get('input[type=file]');Object.defineProperty(input.element,'files',{configurable:true,value:[file]});await input.trigger('change');await settle()}
beforeEach(async()=>{vi.stubGlobal('crypto',webcrypto);http.changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:[]} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}];const sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');icon=decodeDefinitionRasterIcon({mediaType:'image/png',width:1,height:1,sha256,base64})!})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];vi.restoreAllMocks();vi.unstubAllGlobals();document.body.innerHTML=''})
it('图标纯预览核对实际摘要，三类读取复制和完整回执比较都保留PNG原件',async()=>{
 const spy=vi.spyOn(http,'api').mockResolvedValue(encoded(icon));expect(await previewDefinitionRasterIcon(project,type,base64,new AbortController().signal)).toEqual(icon);expect(spy.mock.calls[0]![1]).toMatchObject({method:'post',body:{base64}})
 spy.mockResolvedValueOnce(encoded({...icon,sha256:'a'.repeat(64)}));await expect(previewDefinitionRasterIcon(project,type,base64,new AbortController().signal)).rejects.toThrow()
 const style={iconId:null,color:null,iconRaster:icon},property=decodeProperty(encoded({id,deviceTypeId:type,name:'图标属性',propertyKey:'p',accessType:'REPORT',dataType:'TEXT',unit:null,decimalPlaces:null,minimumValue:null,maximumValue:null,defaultValue:null,enumOptions:null,onLabel:null,offLabel:null,schema:null,sortOrder:0,createdAt:'2026-10-29T00:00:00Z',description:null,presentation:{...style,enumDescriptions:{},objectFields:{}}}),type)
 expect(propertyMatches(property,prepareProperty(project,type,propertyDraft(property),property))).toBe(true);const pd=copyPropertyDraft(property);pd.propertyKey='p_copy';expect(prepareProperty(project,type,pd).body?.presentation?.iconRaster).toEqual(icon)
 const command=decodeCommand(encoded({id,deviceTypeId:type,name:'图标命令',commandKey:'c',description:null,inputSchema:null,outputSchema:null,timeoutSeconds:30,sortOrder:0,createdAt:'2026-10-29T00:00:00Z',presentation:style}),type);expect(commandMatches(command,prepareCommand(project,type,commandDraft(command),command))).toBe(true);const cd=commandCopyDraft(command);cd.commandKey='c_copy';expect(prepareCommand(project,type,cd).body?.presentation?.iconRaster).toEqual(icon)
 const event=decodeEventDefinitions([{id,deviceTypeId:type,name:'图标事件',eventKey:'e',level:'INFO',description:null,sortOrder:0,parameters:[],createdAt:'2026-10-29T00:00:00Z',presentation:style}],type)[0]!;expect(eventMatches(event,prepareEvent(project,type,eventDraft(event),event))).toBe(true);const ed=eventCopyDraft(event);ed.eventKey='e_copy';expect(prepareEvent(project,type,ed).body?.presentation?.iconRaster).toEqual(icon)
 expect(()=>decodeDefinitionRasterIcon({...icon,width:2})).toThrow();expect(()=>decodeDefinitionRasterIcon({...icon,url:'https://invalid/icon.svg'})).toThrow()
})
it('选择图标只产生预览且仍待保存，取消中止迟到原图，失权后不能再读私有文件',async()=>{
 let finish!:(value:DefinitionRasterIcon)=>void;const transport=vi.fn<RasterIconPreviewTransport>().mockResolvedValueOnce(icon).mockImplementation(()=>new Promise(resolve=>{finish=resolve}));wrapper=mount(Picker,{props:{typeId:type,transport},attachTo:document.body,global:{plugins:[ElementPlus]}})
 await select();expect(transport).toHaveBeenCalledTimes(1);expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([icon]);expect(wrapper.emitted('busy')?.at(-1)).toEqual([false]);expect(wrapper.text()).toContain('选择后仍需保存')
 await select();const signal=transport.mock.calls[1]![3];await wrapper.setProps({active:false});expect(signal.aborted).toBe(true);finish(icon);await settle();expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
 session.user={...session.user!,projectRole:'VIEWER'};session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}];await wrapper.setProps({active:true});await select();expect(transport).toHaveBeenCalledTimes(2);expect(wrapper.get('button').attributes('disabled')).toBeDefined()
})

it('拖入单张图标走原预览，拒绝多文件和失权后的拖入',async()=>{
 const transport=vi.fn<RasterIconPreviewTransport>().mockResolvedValue(icon)
 wrapper=mount(Picker,{props:{typeId:type,transport},attachTo:document.body,global:{plugins:[ElementPlus]}})
 const target=wrapper.get('.raster-drop-area'),file=new File([bytes],'icon.png',{type:'image/png'})
 await target.trigger('drop',{dataTransfer:{files:[file,file]}})
 expect(wrapper.get('[role=alert]').text()).toBe('请一次选择一张图片');expect(transport).not.toHaveBeenCalled()
 await target.trigger('drop',{dataTransfer:{files:[file]}})
 await vi.waitFor(()=>expect(wrapper!.emitted('update:modelValue')).toEqual([[icon]]))
 expect(transport).toHaveBeenCalledExactlyOnceWith(project,type,base64,expect.any(AbortSignal))
 session.user={...session.user!,projectRole:'VIEWER'};session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}]
 await target.trigger('drop',{dataTransfer:{files:[file]}});await settle()
 expect(transport).toHaveBeenCalledTimes(1)
})

it('正常64x32 PNG未注入transport的Picker走真实预览并能准备响应式mixed属性保存',async()=>{
 const sourceBase64='iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAXElEQVR4nO3QMREAIBDAsPeCTBSiCmRkoEP2Xmftc382OkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAK0BOkBrgA7QGqADtAboAO0Bp3cxHpykWSYAAAAASUVORK5CYII='
 // 同149B正常样本经已编译生产Normalizer/DTO得到的规范回执，非原图或浏览器alt推断。
 const canonical={mediaType:'image/png',width:64,height:32,sha256:'129b9bccdbffd6619e4a616f685544360f2a54ba6d3705b4faa5561b5bf40797',base64:'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAVUlEQVR4Xu3QMQEAIBCAwO9iTBN+Kt2pAMMtjMy5+8yGwaYBDDYNYLBpAINNAxhsGsBg0wAGmwYw2DSAwaYBDDYNYLBpAINNAxhsGsBg0wAGmwYw2HyndzEe1fpoUwAAAABJRU5ErkJggg=='}
 const spy=vi.spyOn(http,'api').mockResolvedValue(encoded(canonical)),existing=decodeProperty(encoded({id,deviceTypeId:type,name:'混合列表验收1029',propertyKey:'mixed_values_1029',accessType:'CLOUD_PRIVATE',dataType:'LIST',compositeProfile:'BASIC_MIXED_LIST_V1',schema:'{"type": "array", "maxItems": 12, "minItems": 1}',sortOrder:0,description:'精确混合基本值，1至12项，云端私有验收',presentation:null}),type)
 const draft=reactive(propertyDraft(existing));wrapper=mount(Picker,{props:{typeId:type,'onUpdate:modelValue':(value:DefinitionRasterIcon|null)=>{draft.iconRaster=value;draft.iconId='';draft.color='';draft.presentationMode='replace'}},attachTo:document.body,global:{plugins:[ElementPlus]}})
 const file=new File([Buffer.from(sourceBase64,'base64')],'normal-icon.png',{type:'image/png'}),input=wrapper.get('input[type=file]');Object.defineProperty(input.element,'files',{configurable:true,value:[file]});await input.trigger('change');await settle()
 expect(spy).toHaveBeenCalledTimes(1);expect(spy.mock.calls[0]![1]).toMatchObject({method:'post',body:{base64:sourceBase64}});expect(draft.iconRaster).toEqual(canonical)
 const prepared=prepareProperty(project,type,draft,existing);expect(prepared.body?.presentation?.iconRaster).toEqual(canonical);expect(prepared.rawBody).toContain(canonical.base64)
})
