import {describe,it,expect,vi,beforeEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Commands from '../../src/features/devices/DeviceCommands.vue'
import type {CommandRow} from '../../src/features/devices/command-records-api'
import {ApiError,invalidateIdentity} from '../../src/core/http'
const state=vi.hoisted(()=>({api:vi.fn(),permission:null as any,project:null as any}))
vi.mock('../../src/core/session',async()=>{const{ref}=await import('vue');state.permission=ref(true);state.project=ref('project');return{projectId:state.project,can:()=>state.permission.value}})
vi.mock('../../src/core/http',async()=>({...await vi.importActual('../../src/core/http'),api:state.api}))
const device='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003'
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
const item=(key='reboot',itemId=id):CommandRow=>({id:itemId,deviceId:device,operationType:'COMMAND',commandKey:key,status:'ACCEPTED',attemptCount:1,maxAttempts:3,acceptedAt:'2026-10-24T01:00:00Z',completedAt:null,dispatchedAt:null,repliedAt:null,currentDefinitionName:null})
const detail=(key='reboot',itemId=id)=>({id:itemId,deviceId:device,connectionDeviceId:device,commandKey:key,input:{text:'<img src=x onerror=alert(1)>'},output:null,status:'FAILED',attemptCount:1,maxAttempts:3,timeoutSeconds:30,failureCode:'DISPATCH_RETRY_EXHAUSTED',failureMessage:'派发失败',acceptedAt:'2026-10-24T01:00:00Z',dispatchedAt:null,repliedAt:null,acknowledgedAt:null,completedAt:'2026-10-24T01:00:10Z',attempts:[{id:device,attemptNo:1,status:'FAILED',createdAt:'2026-10-24T01:00:00Z',deadlineAt:null,topic:null}],currentDefinitionName:null})
function render(deviceId=device){return mount(Commands,{props:{deviceId},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{DeviceStateControls:{template:'<button @click="$emit(\'saved\')">模拟既有受理</button>'}}}})}
function button(w:ReturnType<typeof render>,label:string){return w.findAll('button').find(b=>b.text()===label)!}
const page=(items=[item()],_legacyCursor:string|null=null,position=1)=>encode({items,page:position,limit:24})
function deferred(){let resolve!:(value:Uint8Array)=>void;const promise=new Promise<Uint8Array>(r=>resolve=r);return{promise,resolve}}
describe('真实ElementPlus命令记录和结果',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.api.mockReset();state.project.value='project';state.permission.value=true;state.api.mockImplementation((p:string)=>Promise.resolve(p.endsWith('/command-pages')?page():encode(detail())))})
 it('非空摘要点击真实GET详情，回复缺失不冒称成功，内容不执行HTML',async()=>{
  const w=render();await flushPromises();expect(w.text()).toContain('reboot');await button(w,'查看').trigger('click');await flushPromises()
  expect(state.api.mock.calls[1]![0]).toBe(`/api/v1/projects/project/devices/${device}/commands/${id}`);expect(state.api.mock.calls[1]![1]).toMatchObject({responseType:'bytes',maxResponseBytes:4194304})
  expect(w.findAll('th').map(x=>x.text())).toEqual(['命令标识符','命令名称','命令下发时间','命令回复时间','查看命令']);expect(w.text()).not.toContain('派发尝试');expect(w.text()).not.toContain('设备确认收到时间');expect(w.text()).not.toContain('DISPATCH_RETRY_EXHAUSTED');expect(w.text()).toContain('命令回复时间');expect(w.text()).not.toContain('2026-10-24 09:00:10');expect(w.text()).not.toContain('刷新结果');expect(w.find('img').exists()).toBe(false);expect(w.text()).toContain('<img src=x onerror=alert(1)>');w.unmount()
 })
 it('VIEWER既不读取摘要/载荷也没有下发入口，不显示假空态',async()=>{state.permission.value=false;const w=render();await flushPromises();expect(state.api).not.toHaveBeenCalled();expect(w.text()).toContain('没有命令记录的读取权限');expect(w.text()).not.toContain('暂无数据');expect(w.find('button').exists()).toBe(false);w.unmount()})
 it('Source空表保留五列、原生空文本与双箭头，不换成图片空态或额外分页控件',async()=>{
  state.api.mockResolvedValueOnce(page([]));const w=render();await flushPromises();expect(w.findAll('th').map(x=>x.text())).toEqual(['命令标识符','命令名称','命令下发时间','命令回复时间','查看命令']);expect(w.text()).toContain('暂无数据');expect(w.find('.el-empty').exists()).toBe(false);expect(w.find('.tl-pager .el-select').exists()).toBe(false);expect(w.find('.tl-pager__page').exists()).toBe(false);expect(w.findAll('.tl-pager button').map(x=>x.attributes('aria-label'))).toEqual(['上一页','下一页']);expect(w.find('.tl-learning-resource a').attributes('href')).toContain('/device-manage/device-commands.html');w.unmount()
 })
 it('实际回复保留精确数字和false，完成/ACK时间不冒称Source回复时间',async()=>{
  const value={...detail(),status:'SUCCEEDED',output:{},failureCode:null,failureMessage:null,acknowledgedAt:'2026-10-24T01:00:05Z'}
  const raw=new TextEncoder().encode(JSON.stringify(value).replace('"output":{}','"output":{"n":9007199254740995,"ok":false}'))
  state.api.mockResolvedValueOnce(page()).mockResolvedValueOnce(raw)
  const w=render();await flushPromises();await button(w,'查看').trigger('click');await flushPromises();expect(w.text()).toContain('9007199254740995');expect(w.text()).toContain('"ok": false');expect(w.text()).not.toContain('2026-10-24 09:00:05');expect(w.text()).not.toContain('2026-10-24 09:00:10');w.unmount()
 })
 it('翻页失败清除旧页与后页资格，可回上一已知页，刷新重置到首页',async()=>{
  state.api.mockResolvedValueOnce(page([item()],'opaque')).mockRejectedValueOnce(new Error('分页失败')).mockResolvedValueOnce(page()).mockResolvedValueOnce(page())
  const w=render();await flushPromises();await w.get('[aria-label="下一页"]').trigger('click');await flushPromises();expect(state.api.mock.calls[1]![1].query.page).toBe(2);expect(w.text()).toContain('分页失败');expect(w.text()).not.toContain('reboot');expect(w.get('[aria-label="下一页"]').attributes('disabled')).toBeDefined();await w.get('[aria-label="上一页"]').trigger('click');await flushPromises();expect(state.api.mock.calls[2]![1].query.page).toBe(1);await button(w,'刷新').trigger('click');await flushPromises();expect(state.api.mock.calls[3]![1].query.page).toBe(1);w.unmount()
 })
 it('刷新详情失败不展示旧回复，重试只有GET，不触发下发',async()=>{
  const w=render();await flushPromises();await button(w,'查看').trigger('click');await flushPromises();await w.get('[aria-label="Close this dialog"]').trigger('click');await flushPromises();state.api.mockRejectedValueOnce(new Error('详情读取失败'));await button(w,'查看').trigger('click');await flushPromises();expect(w.text()).toContain('详情读取失败');expect(w.text()).not.toContain('DISPATCH_RETRY_EXHAUSTED');await button(w,'重新读取').trigger('click');await flushPromises();expect(w.find('dl').text()).toContain('reboot');expect(state.api.mock.calls.every(([,o])=>!o.method||o.method==='get')).toBe(true);w.unmount()
 })
 it('同设备快速选择A/B，A迟到不能覆盖B详情',async()=>{
  const a=deferred();state.api.mockResolvedValueOnce(page([item(),item('reset',other)])).mockReturnValueOnce(a.promise).mockResolvedValueOnce(encode(detail('reset',other)))
  const w=render();await flushPromises();await w.findAll('button').filter(b=>b.text()==='查看')[0]!.trigger('click');await w.findAll('button').filter(b=>b.text()==='查看')[1]!.trigger('click');await flushPromises();a.resolve(encode(detail()));await flushPromises();expect(w.find('dl').text()).toContain(other);expect(w.find('dl').text()).not.toContain(id);w.unmount()
 })
 it('关闭详情后迟到响应不能重新打开',async()=>{const late=deferred();state.api.mockResolvedValueOnce(page()).mockReturnValueOnce(late.promise);const w=render();await flushPromises();await button(w,'查看').trigger('click');await w.get('[aria-label="Close this dialog"]').trigger('click');late.resolve(encode(detail()));await flushPromises();expect(w.find('dl').exists()).toBe(false);w.unmount()})
 it('切设备/项目后旧页迟到不能污染新页',async()=>{
  for(const mode of ['device','project']){const late=deferred();state.api.mockReset().mockReturnValueOnce(late.promise).mockResolvedValueOnce(page([]));const w=render();await flushPromises();if(mode==='device')await w.setProps({deviceId:other});else state.project.value='next';await flushPromises();late.resolve(page());await flushPromises();expect(w.text()).not.toContain('reboot');expect(w.text()).toContain('暂无数据');w.unmount();state.project.value='project'}
 })
 it('直接403关闭已读详情并收束本域入口，session还显示control也不再请求',async()=>{
  const w=render();await flushPromises();await button(w,'查看').trigger('click');await flushPromises();await w.get('[aria-label="Close this dialog"]').trigger('click');await flushPromises();state.api.mockRejectedValueOnce(new ApiError('当前权限已撤销',403));await button(w,'查看').trigger('click');await flushPromises();expect(state.permission.value).toBe(true);expect(w.text()).toContain('没有命令记录的读取权限');expect(w.find('dl').exists()).toBe(false);expect(w.findAll('button').some(b=>b.text()==='模拟既有受理')).toBe(false);w.unmount()
 })
 it('身份失效/权限撤销立即清空载荷，旧响应不显示',async()=>{
  for(const mode of ['identity','permission']){state.permission.value=true;state.api.mockReset().mockResolvedValueOnce(page()).mockResolvedValueOnce(encode(detail()));const w=render();await flushPromises();await button(w,'查看').trigger('click');await flushPromises();if(mode==='identity')invalidateIdentity();else state.permission.value=false;await flushPromises();expect(w.find('dl').exists()).toBe(false);expect(w.text()).not.toContain('reboot');w.unmount()}
 })
 it('已有下发受理事件只刷新摘要，不重复提交命令',async()=>{const w=render();await flushPromises();await button(w,'模拟既有受理').trigger('click');await flushPromises();expect(state.api).toHaveBeenCalledTimes(2);expect(state.api.mock.calls.every(([p,o])=>p.endsWith('/command-pages')&&!o.method)).toBe(true);w.unmount()})
 it('空页Next仍请求下一真实页，Prev回到前页，刷新只重置首页',async()=>{
  state.api.mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([],null,2)).mockResolvedValueOnce(page([],null,3)).mockResolvedValueOnce(page([],null,2)).mockResolvedValueOnce(page());const w=render();await flushPromises();expect(w.get('[aria-label="下一页"]').attributes('disabled')).toBeUndefined();expect(w.get('[aria-label="上一页"]').attributes('disabled')).toBeDefined();await w.get('[aria-label="下一页"]').trigger('click');await flushPromises();await w.get('[aria-label="下一页"]').trigger('click');await flushPromises();await w.get('[aria-label="上一页"]').trigger('click');await flushPromises();await button(w,'刷新').trigger('click');await flushPromises();expect(state.api.mock.calls.map(([,o])=>o.query.page)).toEqual([1,2,3,2,1]);expect(state.api.mock.calls.every(([path,o])=>path.endsWith('/command-pages')&&!Object.hasOwn(o.query,'cursor'))).toBe(true);w.unmount()
 })

 it('列表及详情读各自当前名称，保留Source列头与时钟空位，不从名称推断完成',async()=>{
  state.api.mockImplementation((p:string)=>Promise.resolve(p.endsWith('/command-pages')?encode({items:[{...item(),currentDefinitionName:'当前重启名称'}],page:1,limit:24}):encode({...detail(),currentDefinitionName:'刚改后的名称'})))
  const w=render();await flushPromises();expect(w.text()).toContain('当前重启名称');await button(w,'查看').trigger('click');await flushPromises();expect(w.find('.command-details dd').attributes('title')).toBe('当前定义名称：刚改后的名称');expect(w.findAll('th').map(x=>x.text())).toEqual(['命令标识符','命令名称','命令下发时间','命令回复时间','查看命令']);w.unmount()
 })
 it('列表和查看只绘各自权威发布/回复时钟，按东八区展示，不偷用受理或完成',async()=>{
  state.api.mockResolvedValueOnce(page([{...item(),dispatchedAt:'2026-10-24T01:00:02.123456Z',repliedAt:'2026-10-24T01:00:07.654321Z'}])).mockResolvedValueOnce(encode({...detail(),dispatchedAt:'2026-10-24T01:00:03Z',repliedAt:'2026-10-24T01:00:08Z'}));
  const w=render();await flushPromises();expect(w.findAll('.el-table__body td').slice(2,4).map(c=>c.text())).toEqual(['2026-10-24 09:00:02','2026-10-24 09:00:07']);await button(w,'查看').trigger('click');await flushPromises();expect(w.findAll('.command-details dd').slice(-2).map(c=>c.text())).toEqual(['2026-10-24 09:00:03','2026-10-24 09:00:08']);expect(w.text()).not.toContain('2026-10-24 09:00:10');w.unmount()
 })
 it('派发凭据失败/仅ACK无最终回复仍显示两个未知时钟，不把平台超时填进去',async()=>{
  state.api.mockResolvedValueOnce(page([{...item(),status:'TIMED_OUT',completedAt:'2026-10-24T01:00:10Z'}])).mockResolvedValueOnce(encode({...detail(),status:'TIMED_OUT',acknowledgedAt:'2026-10-24T01:00:05Z'}));const w=render();await flushPromises();expect(w.findAll('.el-table__body td').slice(2,4).map(c=>c.text())).toEqual(['—','—']);await button(w,'查看').trigger('click');await flushPromises();expect(w.findAll('.command-details dd').slice(-2).map(c=>c.text())).toEqual(['—','—']);w.unmount()
 })

 it.each(['device','refresh','project'] as const)('%s后旧行回调不得启动详情读取，新行仍可读',async mode=>{
  let w=render()
  try{
   await flushPromises()
   const stale=w.findAllComponents({name:'ElButton'}).find(b=>b.text()==='查看')!.vm.$.vnode.props!.onClick as ()=>void
   const target=mode==='device'?other:device
   state.api.mockImplementation((p:string)=>Promise.resolve(p.endsWith('/command-pages')?page([{...item(),deviceId:target}]):encode({...detail(),deviceId:target,connectionDeviceId:target})))
   if(mode==='device'){w.unmount();w=render(target)}
   else if(mode==='refresh')await button(w,'刷新').trigger('click')
   else {state.project.value='next';stale()}
   await flushPromises();expect(state.api).toHaveBeenCalledTimes(2)
   stale();await flushPromises();expect(state.api).toHaveBeenCalledTimes(2);expect(w.find('dl').exists()).toBe(false)
   await button(w,'查看').trigger('click');await flushPromises()
   expect(state.api).toHaveBeenCalledTimes(3);expect(state.api.mock.calls[2]![0]).toBe(`/api/v1/projects/${mode==='project'?'next':'project'}/devices/${target}/commands/${id}`);expect(w.find('dl').exists()).toBe(true)
  }finally{w.unmount()}
 })

})
