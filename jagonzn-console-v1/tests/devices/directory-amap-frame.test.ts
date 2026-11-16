import {reactive} from 'vue'
import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import DirectoryAmapFrame from '../../src/features/devices/DirectoryAmapFrame.vue'
import {frameChannel} from '../../src/features/devices/directory-amap-protocol'
const api=vi.hoisted(()=>({read:vi.fn()}))
vi.mock('../../src/features/devices/directory-amap-context-api',()=>({readDirectoryMapContext:api.read}))
const pid='00000000-0000-4000-8000-000000000001',cid='a'.repeat(43),row={deviceId:'a',name:'设备a',longitude:0,latitude:0,online:true,version:'0'}
let wrapper:VueWrapper|undefined
const config=(id=cid)=>({contextId:id,serviceHost:`/api/v1/projects/${pid}/directory-map-contexts/${id}/_AMapService`,publicKey:'test-public',jsApiVersion:'2.0',expiresAt:new Date(Date.now()+60000).toISOString()})
beforeEach(()=>{vi.useFakeTimers();api.read.mockReset();api.read.mockImplementation(async()=>config())})
afterEach(()=>{try{wrapper?.unmount()}finally{wrapper=undefined;vi.restoreAllMocks();vi.clearAllTimers();vi.useRealTimers();document.body.innerHTML=''}})
async function render(){wrapper=mount(DirectoryAmapFrame,{props:{projectId:pid,scopeKey:'actor1:g1',rows:[row],selected:'',baseMap:'vector'},attachTo:document.body});await flushPromises();return wrapper}
function current(){const iframe=wrapper!.get('iframe').element as HTMLIFrameElement;return {iframe,nonce:iframe.getAttribute('src')!.split('#')[1]!,peer:iframe.contentWindow!}}
function message(kind:string,extra={},generation=1,serial=1,source?:Window){const c=current();window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:source??c.peer,data:{channel:frameChannel,nonce:c.nonce,generation,serial,kind,...extra}}))}
it('初始load早于子文档握手时，合法hello重新交接且ready后不重发init',async()=>{
 await render();const c=current(),post=vi.spyOn(c.peer,'postMessage')
 await wrapper!.get('iframe').trigger('load');expect(post).toHaveBeenCalledTimes(1)
 message('hello',{},0,1);expect(post).toHaveBeenCalledTimes(2)
 expect(post.mock.calls[1]![0]).toMatchObject({kind:'init',nonce:c.nonce,generation:1,serial:2})
 message('ready',{},1,2);message('hello',{},0,3);expect(post).toHaveBeenCalledTimes(2)
 expect(wrapper!.emitted('ready')!.at(-1)).toEqual([true])
})
it('Bearer只在父api wrapper，子只接公开配置/当前页，不接受外窗口或旧nonce',async()=>{await render();const c=current(),post=vi.spyOn(c.peer,'postMessage');await wrapper!.get('iframe').trigger('load');expect(post.mock.calls[0][0]).toMatchObject({kind:'init',rows:[row],configuration:config()});expect(JSON.stringify(post.mock.calls[0][0])).not.toMatch(/Bearer|securityJsCode|accessToken/);message('navigate',{deviceId:'a'},1,2,window);expect(wrapper!.emitted('navigate')).toBeUndefined();message('navigate',{deviceId:'outside'},1,3);expect(wrapper!.emitted('navigate')).toBeUndefined();message('navigate',{deviceId:'a'},1,4);expect(wrapper!.emitted('navigate')).toEqual([['a']])})
it('项目主体scope变更销毁旧文档并换nonce，迟到原件不接受',async()=>{await render();const old=current();await wrapper!.setProps({scopeKey:'actor2:g1'});await flushPromises();expect(current().nonce).not.toBe(old.nonce);window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:old.peer,data:{channel:frameChannel,nonce:old.nonce,generation:1,serial:20,kind:'navigate',deviceId:'a'}}));expect(wrapper!.emitted('navigate')).toBeUndefined()})
it('查询换代后拒绝旧代次与重放serial，保当前页设备闭集',async()=>{await render();await wrapper!.get('iframe').trigger('load');await wrapper!.setProps({rows:[{...row,name:'新名字',version:'1'}]});message('navigate',{deviceId:'a'},1,1);expect(wrapper!.emitted('navigate')).toBeUndefined();message('navigate',{deviceId:'a'},2,2);message('navigate',{deviceId:'a'},2,2);expect(wrapper!.emitted('navigate')).toEqual([['a']])})
it('续期同host保单SDK文档，不同derived路径必拆旧文档换新nonce',async()=>{await render();await wrapper!.get('iframe').trigger('load');message('ready');const first=current().nonce;await vi.advanceTimersByTimeAsync(45000);await flushPromises();expect(current().nonce).toBe(first);api.read.mockResolvedValueOnce(config('b'.repeat(43)));await vi.advanceTimersByTimeAsync(45000);await flushPromises();expect(current().nonce).not.toBe(first)})
it('续期失败清空iframe且不自动重试或保留已过期地图',async()=>{await render();await wrapper!.get('iframe').trigger('load');message('ready');api.read.mockRejectedValue(new Error('private-cookie-url'));await vi.advanceTimersByTimeAsync(45000);await flushPromises();expect(wrapper!.find('iframe').exists()).toBe(false);expect(wrapper!.emitted('error')!.at(-1)).toEqual(['地图授权续期未完成，请明确重新读取地图。']);await vi.advanceTimersByTimeAsync(120000);expect(api.read).toHaveBeenCalledTimes(2);expect(wrapper!.text()).not.toContain('private-cookie-url')})
it('disabled立即拆文档，旧bootstrap晚到不复活，解锁才新建',async()=>{let resolve!:(v:unknown)=>void;api.read.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));await render();await wrapper!.setProps({disabled:true});resolve(config());await flushPromises();expect(wrapper!.find('iframe').exists()).toBe(false);await wrapper!.setProps({disabled:false});await flushPromises();expect(wrapper!.find('iframe').exists()).toBe(true)})
it('过期前1秒收口，即使renew在途也不会保留可用点位',async()=>{await render();await wrapper!.get('iframe').trigger('load');message('ready');api.read.mockImplementationOnce(()=>new Promise(()=>{}));await vi.advanceTimersByTimeAsync(59000);await flushPromises();expect(wrapper!.find('iframe').exists()).toBe(false);expect(wrapper!.emitted('error')!.at(-1)![0]).toContain('到期')})

it('已关闭对端的dispose抛错不阻断卸载、abort、文档和监听清理',async()=>{
 await render();const old=current(),signal=api.read.mock.calls[0]![2] as AbortSignal
 const remove=vi.spyOn(window,'removeEventListener'),post=vi.spyOn(old.peer,'postMessage').mockImplementation(()=>{throw new Error('closed-peer')})
 const own=wrapper!;wrapper=undefined
 expect(()=>own.unmount()).not.toThrow();expect(signal.aborted).toBe(true);expect(old.iframe.hasAttribute('src')).toBe(false)
 expect(remove).toHaveBeenCalledWith('message',expect.any(Function));expect(post).toHaveBeenCalledTimes(1);expect(post.mock.calls[0]![0]).toMatchObject({kind:'dispose',nonce:old.nonce})
 await vi.advanceTimersByTimeAsync(120000);expect(api.read).toHaveBeenCalledTimes(1)
})
it('scope换代时dispose抛错仍撤旧文档并只建立新nonce，旧消息不复活',async()=>{
 await render();const old=current(),signal=api.read.mock.calls[0]![2] as AbortSignal
 vi.spyOn(old.peer,'postMessage').mockImplementation(()=>{throw new Error('closed-peer')})
 let resolve!:(value:ReturnType<typeof config>)=>void
 api.read.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
 await wrapper!.setProps({scopeKey:'actor2:g2'});await flushPromises()
 expect(signal.aborted).toBe(true);expect(old.iframe.hasAttribute('src')).toBe(false);expect(wrapper!.find('iframe').exists()).toBe(false)
 window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:old.peer,data:{channel:frameChannel,nonce:old.nonce,generation:1,serial:50,kind:'ready'}}))
 expect(wrapper!.emitted('ready')!.at(-1)).toEqual([false]);resolve(config());await flushPromises()
 expect(current().nonce).not.toBe(old.nonce);expect(api.read).toHaveBeenCalledTimes(2)
})
it('init发送抛错只报一次通信失败并撤文档，不递归或自动重试',async()=>{
 await render();const old=current(),signal=api.read.mock.calls[0]![2] as AbortSignal
 const post=vi.spyOn(old.peer,'postMessage').mockImplementation(()=>{throw new Error('closed-peer')})
 await wrapper!.get('iframe').trigger('load');await flushPromises()
 expect(wrapper!.find('iframe').exists()).toBe(false);expect(signal.aborted).toBe(true)
 expect(wrapper!.emitted('error')!.filter(args=>args[0])).toEqual([['地图通信未完成，设备位置列表仍可查看。']])
 expect(post.mock.calls.map(args=>(args[0] as {kind:string}).kind)).toEqual(['init','dispose'])
 await vi.advanceTimersByTimeAsync(120000);expect(api.read).toHaveBeenCalledTimes(1);expect(wrapper!.emitted('ready')!.at(-1)).toEqual([false]);expect(wrapper!.emitted('loading')!.at(-1)).toEqual([false])
})
it.each(['rows','select','basemap','fit','zoom','renew'] as const)('%s发送失败立即失效且后续普通事件不恢复旧文档或重试',async kind=>{
 await render();const old=current(),post=vi.spyOn(old.peer,'postMessage').mockImplementation(()=>{})
 await wrapper!.get('iframe').trigger('load');message('ready');post.mockClear();post.mockImplementation(()=>{throw new Error('closed-peer')})
 if(kind==='rows')await wrapper!.setProps({rows:[{...row,name:'变化'}]})
 else if(kind==='select')await wrapper!.setProps({selected:'a'})
 else if(kind==='basemap')await wrapper!.setProps({baseMap:'satellite'})
 else if(kind==='fit')(wrapper!.vm as unknown as {fit():void}).fit()
 else if(kind==='zoom')(wrapper!.vm as unknown as {zoom(direction:'in'):void}).zoom('in')
 else await vi.advanceTimersByTimeAsync(45000)
 await flushPromises();expect(wrapper!.find('iframe').exists()).toBe(false)
 expect(wrapper!.emitted('error')!.filter(args=>args[0])).toEqual([['地图通信未完成，设备位置列表仍可查看。']])
 expect(post.mock.calls.map(args=>(args[0] as {kind:string}).kind)).toEqual([kind,'dispose'])
 const calls=api.read.mock.calls.length
 await wrapper!.setProps({rows:[{...row,name:'失效后的新数据'}],selected:'',baseMap:'vector'});await vi.advanceTimersByTimeAsync(120000);await flushPromises()
 expect(api.read).toHaveBeenCalledTimes(calls);expect(post).toHaveBeenCalledTimes(2);expect(wrapper!.emitted('loading')!.at(-1)).toEqual([false])
})
it('dispose抛错仍使在途renew失效，晚回执不能恢复已禁用文档',async()=>{
 await render();const old=current(),post=vi.spyOn(old.peer,'postMessage').mockImplementation(()=>{})
 await wrapper!.get('iframe').trigger('load');message('ready')
 let resolve!:(value:ReturnType<typeof config>)=>void;api.read.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
 await vi.advanceTimersByTimeAsync(45000);const renewSignal=api.read.mock.calls[1]![2] as AbortSignal
 post.mockImplementation(()=>{throw new Error('closed-peer')})
 await wrapper!.setProps({disabled:true});resolve(config());await flushPromises();expect(renewSignal.aborted).toBe(true)
 expect(wrapper!.find('iframe').exists()).toBe(false);expect(wrapper!.emitted('ready')!.at(-1)).toEqual([false]);await vi.advanceTimersByTimeAsync(120000);expect(api.read).toHaveBeenCalledTimes(2)
})

it('太阳首次blur只缓存最新查询，ready发送同代次且取消不接迟回',async()=>{
 const savedPoint=reactive({longitude:116.304825,latitude:39.991602});expect(()=>structuredClone(savedPoint)).toThrow()
 wrapper=mount(DirectoryAmapFrame,{props:{projectId:pid,scopeKey:'actor1:solar',rows:[],selected:'',baseMap:'vector',picker:savedPoint},attachTo:document.body});await flushPromises()
 const c=current(),post=vi.spyOn(c.peer,'postMessage').mockImplementation(message=>{structuredClone(message)}),control=wrapper.getComponent(DirectoryAmapFrame).vm
 control.queryPicker({kind:'name',name:'旧名称'});control.queryPicker({kind:'name',name:'最新名称'})
 expect(post).not.toHaveBeenCalled();await wrapper.get('iframe').trigger('load');expect(post.mock.calls[0]![0]).toMatchObject({kind:'picker-init',point:savedPoint});expect(wrapper.emitted('error')!.filter(args=>args[0])).toEqual([])
 message('ready',{},1,1);expect(post.mock.calls.map(call=>call[0].kind)).toEqual(['picker-init','picker-query'])
 const request=post.mock.calls[1]![0].request;expect(post.mock.calls[1]![0]).toMatchObject({query:{kind:'name',name:'最新名称'}})
 control.queryPicker({kind:'coordinates',point:reactive({longitude:0,latitude:0})});expect(post.mock.calls.at(-1)![0]).toMatchObject({kind:'picker-query',query:{kind:'coordinates',point:{longitude:0,latitude:0}}});expect(wrapper.find('iframe').exists()).toBe(true)
 control.cancelPicker();message('picker-result',{request,point:{longitude:1,latitude:1},name:'旧结果'},1,2);expect(wrapper.emitted('point')).toBeUndefined()
 await wrapper.setProps({rows:[row],selected:'a'});expect(post.mock.calls.map(call=>call[0].kind)).not.toContain('rows')
 expect(wrapper.emitted('pickerBusy')!.at(-1)).toEqual([false])
})
