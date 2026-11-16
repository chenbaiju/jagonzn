import {webcrypto} from 'node:crypto'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Component from '../../src/features/devices/DeviceDataStreamRuntime.vue'
import {dataBase64,dataBytes,dataWireDigest,decodeDataMessage,decodeDataSession,prepareDataDownlink,matchDataOriginal,type DataMessage} from '../../src/features/devices/data-stream-runtime-api'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,v7=(n:number)=>`019a0a00-0000-7000-8000-${String(n).padStart(12,'0')}`
const project=uuid(1),device=uuid(2),type=uuid(3),connection=v7(4),publication=v7(5),message=v7(6),next=uuid(7)
const pin={contract:'TL_TCP_DATA_V1',wireProfile:'TL_TCP_DATA_V1',connectionId:connection,deviceTypeId:type,generation:'1',configVersion:'0',available:true,publicationId:publication,publicationRevision:'7',publicationPublishedAt:'2026-10-29T00:00:00Z',definitionDigest:'a'.repeat(64),streamIdentifier:'raw',format:'HEX',maximumRawBytes:65504}
const wrappers:VueWrapper[]=[]
function owner(){session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update','device:control']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]}
function render(){const w=mount(Component,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(w);return w}
function button(label:string){const b=[...document.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()===label);expect(b,label).toBeDefined();return b!}
async function click(label:string){button(label).click();await flushPromises()}
const writes=()=>state.api.mock.calls.filter(([,o])=>o?.method==='post')
const originals=()=>state.api.mock.calls.filter(([p])=>p.endsWith('/data-stream-downlinks/by-key'))
async function fact(raw:Uint8Array,direction:'UP'|'DOWN'='DOWN',extras:Partial<DataMessage>={}):Promise<DataMessage>{const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),n=>n.toString(16).padStart(2,'0')).join('');return{wireProfile:'TL_TCP_DATA_V1',messageId:message,direction,connectionId:connection,publicationId:publication,streamIdentifier:'raw',format:'HEX',wireDigest:await dataWireDigest(message,publication,raw),rawDigest:digest,rawBytes:raw.length,applicationBytes:32+raw.length,decodeStatus:'DECODED',receivedAt:'2026-10-29T01:00:00.123456Z',acceptedAt:'2026-10-29T01:00:00.2Z',state:direction==='UP'?'ACCEPTED':'PENDING',sentAt:null,acknowledgedAt:null,expiresAt:direction==='UP'?null:'2026-10-29T01:01:00.123456Z',payloadBase64:dataBase64(raw),...extras}}
async function preview(w:VueWrapper,raw='00 ff'){await click('准备原字节下行');await w.get('textarea[aria-label="DATA下行原文"]').setValue(raw);await click('预览原字节下行');expect(document.body.textContent).toContain('本次原键：')}
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('crypto',webcrypto);changeIdentity();session.ready=true;session.transitioning=false;owner();state.api.mockImplementation((path:string)=>path.endsWith('/data-stream-runtime')?Promise.resolve({...pin}):Promise.resolve([]))})
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());session.user=null;session.projects=[];document.body.innerHTML='';vi.unstubAllGlobals()})

it('固定发布与真实字节预览取消零写，确认只准备一次并核原件，不把受理当应答',async()=>{
 const response=await fact(Uint8Array.of(0,255)),normal=state.api.getMockImplementation()!;state.api.mockImplementation((path,o)=>o?.method==='post'?Promise.resolve(response):normal(path,o));const w=render();await flushPromises();expect(w.text()).toContain(publication);expect(state.api.mock.calls.find(([p])=>p.endsWith('/data-stream-messages'))?.[1].query).toEqual({direction:'UP',limit:20});await preview(w);expect(writes()).toHaveLength(0);await click('取消');expect(writes()).toHaveLength(0);await preview(w);button('确认一次准备').click();button('确认一次准备').click();await vi.waitFor(()=>expect(w.text()).toContain('原下行准备身份已确认'))
 expect(writes()).toHaveLength(1);expect(writes()[0]![1].body).toEqual({connectionId:connection,publicationId:publication,payloadBase64:'AP8=',expiresInSeconds:60});expect(writes()[0]![1].headers['Idempotency-Key']).toMatch(/^[a-f0-9-]{36}$/);expect(w.text()).toContain('PENDING');expect(w.text()).toContain('设备交接应答 未确认');expect(w.emitted('locked')?.at(-1)).toEqual([false]);expect(w.emitted('changed')).toHaveLength(1)
})
it('没有协商pin的404保留真实空记录并禁下行，损坏原件哈希不冒可读字节',async()=>{
 const normal=state.api.getMockImplementation()!;state.api.mockImplementation((path,o)=>path.endsWith('/data-stream-runtime')?Promise.reject(new ApiError('不存在',404)):normal(path,o));const w=render();await flushPromises();expect(w.text()).toContain('当前没有可读的明确协商DATA会话');expect(w.text()).toContain('本次读取0条');expect(button('准备原字节下行').disabled).toBe(true);expect(writes()).toHaveLength(0);const original=await fact(Uint8Array.of(1),'UP');await expect(decodeDataMessage({...original,rawDigest:'0'.repeat(64)},'UP')).rejects.toThrow('字节与合同不符');expect(()=>dataBytes('0','HEX')).toThrow('完整双位');expect(()=>dataBytes('\ud800','UTF8')).toThrow('无效Unicode')
})
it('10014保原键未知且404不重POST，降为VIEWER归档仍按原键核已过期字节头',async()=>{
 const response=await fact(Uint8Array.of(0,255),'DOWN',{state:'SENT',sentAt:'2026-10-29T01:00:01Z',payloadBase64:null});let found=false;const normal=state.api.getMockImplementation()!;state.api.mockImplementation((path,o)=>o?.method==='post'?Promise.reject(new ApiError('不重放',409,10014)):path.endsWith('/by-key')?found?Promise.resolve(response):Promise.reject(new ApiError('未确定',404)):normal(path,o));const w=render();await flushPromises();await preview(w);await click('确认一次准备');expect(w.text()).toContain('原下行结果待核对');const key=writes()[0]![1].headers['Idempotency-Key'];await click('关闭并保留原请求');session.user={...session.user!,projectRole:'VIEWER',permissions:['device:read']};session.projects=[{id:project,myRole:'VIEWER',status:'ARCHIVED'}];await flushPromises();await click('按原键读取DATA结果');expect(w.text()).toContain('原结果仍未知');expect(w.emitted('locked')?.at(-1)).toEqual([true]);found=true;await click('按原键读取DATA结果');await vi.waitFor(()=>expect(w.text()).toContain('原下行准备身份已确认'));expect(writes()).toHaveLength(1);expect(originals()).toHaveLength(2);for(const [,o]of originals()){expect(o.headers).toEqual({'Original-Request-Key':key});expect(o.query).toBeUndefined();expect(o.method).toBeUndefined()}expect(w.text()).toContain('SENT');expect(w.emitted('locked')?.at(-1)).toEqual([false]);await click('查看本次原字节');expect(document.body.textContent).toContain('原字节已按保留策略到期')
})
it('原JSON数值与脚本文本只以原文展示，切换scope丢弃迟到字节与确认意图',async()=>{
 const raw=dataBytes('{"exact":9007199254740993.2500,"x":"<script>throw 1</script>"}','UTF8'),response=await fact(raw,'UP',{format:'JSON'});const normal=state.api.getMockImplementation()!;state.api.mockImplementation((path,o)=>path.endsWith('/data-stream-messages')?Promise.resolve([response]):normal(path,o));const w=render();await vi.waitFor(()=>expect(w.text()).toContain(message));await click('查看');expect(document.body.querySelector('[aria-label="DATA原件UTF8"]')?.textContent).toContain('9007199254740993.2500');expect(document.body.querySelector('[aria-label="DATA原件UTF8"]')?.textContent).toContain('<script>throw 1</script>');expect(document.body.querySelector('[aria-label="DATA原件UTF8"] script')).toBeNull();await preview(w);let finish!:(value:DataMessage)=>void;state.api.mockImplementation((path,o)=>o?.method==='post'?new Promise(resolve=>{finish=resolve}):path.endsWith('/data-stream-runtime')?Promise.resolve({...pin}):Promise.resolve([]));await click('确认一次准备');expect(writes()).toHaveLength(1);await w.setProps({deviceId:next});finish(await fact(Uint8Array.of(0,255)));await flushPromises();expect(w.emitted('changed')).toBeUndefined();expect(w.text()).not.toContain('原下行准备身份已确认');expect(document.body.textContent).not.toContain('9007199254740993.2500');expect(w.emitted('locked')?.at(-1)).toEqual([false]);session.user={...session.user!,permissions:[]};await flushPromises();expect(w.text()).toBe('');expect(writes()).toHaveLength(1)
})

it('实际TCP连接UUIDv4按连接合同读取，消息和发布仍须UUIDv7且保原摘要校验',async()=>{
 const actualConnection='fdcb29af-130e-46e4-88a5-9ba227420482',raw=Uint8Array.of(1,3,4,1,15,2,120,202,142),original=await fact(raw,'UP',{connectionId:actualConnection})
 expect(decodeDataSession({...pin,connectionId:actualConnection}).connectionId).toBe(actualConnection)
 expect((await decodeDataMessage(original,'UP')).connectionId).toBe(actualConnection)
 expect(()=>decodeDataSession({...pin,connectionId:'malformed'})).toThrow()
 await expect(decodeDataMessage({...original,connectionId:'malformed'},'UP')).rejects.toThrow()
 await expect(decodeDataMessage({...original,messageId:uuid(6)},'UP')).rejects.toThrow()
 await expect(decodeDataMessage({...original,publicationId:uuid(5)},'UP')).rejects.toThrow()
 await expect(decodeDataMessage({...original,wireDigest:'0'.repeat(64)},'UP')).rejects.toThrow()
})

it('原生旧精确响应只归一native；raw闭集按真实载荷校验且不允许伪造ACK',async()=>{
 const raw=Uint8Array.of(0,255),native=await fact(raw,'UP'),{wireProfile:legacyProfile,...legacyMessage}=native,{wireProfile:legacyPinProfile,...legacyPin}=pin
 expect(legacyProfile).toBe('TL_TCP_DATA_V1');expect(legacyPinProfile).toBe('TL_TCP_DATA_V1');expect(decodeDataSession(legacyPin).wireProfile).toBe('TL_TCP_DATA_V1');expect((await decodeDataMessage(legacyMessage,'UP')).wireProfile).toBe('TL_TCP_DATA_V1')
 const rawPin=decodeDataSession({...pin,wireProfile:'TL_TCP_RAW_V1'}),up={...native,wireProfile:'TL_TCP_RAW_V1',applicationBytes:raw.length,wireDigest:native.rawDigest}
 expect((await decodeDataMessage(up,'UP')).applicationBytes).toBe(2);expect(await dataWireDigest(message,publication,raw,'TL_TCP_RAW_V1')).toBe(native.rawDigest)
 for(const wireProfile of [null,undefined,'UNKNOWN']){expect(()=>decodeDataSession({...pin,wireProfile})).toThrow();await expect(decodeDataMessage({...up,wireProfile},'UP')).rejects.toThrow()}
 await expect(decodeDataMessage({...up,applicationBytes:34},'UP')).rejects.toThrow();await expect(decodeDataMessage({...up,wireDigest:native.wireDigest},'UP')).rejects.toThrow()
 const down=await fact(raw,'DOWN',{wireProfile:'TL_TCP_RAW_V1',applicationBytes:2,wireDigest:native.rawDigest,state:'SENT',sentAt:'2026-10-29T01:00:01Z'}),intent=prepareDataDownlink(project,device,rawPin,raw,60)
 expect((await matchDataOriginal(await decodeDataMessage(down,'DOWN'),intent)).state).toBe('SENT');await expect(decodeDataMessage({...down,state:'ACKED',acknowledgedAt:'2026-10-29T01:00:02Z'},'DOWN')).rejects.toThrow();await expect(matchDataOriginal({...down,wireProfile:'TL_TCP_DATA_V1'},intent)).rejects.toThrow();expect(()=>prepareDataDownlink(project,device,rawPin,new Uint8Array(),60)).toThrow('至少需要1字节')
})
it('raw下行预览使用原始字节数，SENT只表示网络写出且不等待虚假逐包应答',async()=>{
 const native=await fact(Uint8Array.of(0,255)),response={...native,wireProfile:'TL_TCP_RAW_V1',applicationBytes:2,wireDigest:native.rawDigest,state:'SENT',sentAt:'2026-10-29T01:00:01Z'}
 state.api.mockImplementation((path,o)=>o?.method==='post'?Promise.resolve(response):path.endsWith('/data-stream-runtime')?Promise.resolve({...pin,wireProfile:'TL_TCP_RAW_V1'}):Promise.resolve([]))
 const w=render();await flushPromises();expect(w.text()).toContain('注册包透传');await preview(w);expect(document.body.textContent).toContain('应用载荷 2 字节（原始透传字节）');expect(document.body.textContent).not.toContain('应用载荷 34');await click('确认一次准备');await vi.waitFor(()=>expect(w.text()).toContain('原下行准备身份已确认'));expect(w.text()).toContain('SENT');expect(w.text()).toContain('不提供逐包应答');expect(w.text()).not.toContain('ACKED');expect(writes()).toHaveLength(1)
})
