import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElSelect,ElTable,ElDialog,ElMessageBox,ElMessage,type TableInstance} from 'element-plus'
import Users from '@/features/devices/DeviceUserAssociations.vue'
import {defineComponent} from 'vue'
import {useDeviceUserAssociations} from '@/features/devices/use-device-user-associations'
import {ApiError,invalidateIdentity} from '@/core/http'
const state=vi.hoisted(()=>({read:vi.fn(),candidates:vi.fn(),apply:vi.fn(),recover:vi.fn(),project:null as any,allowed:null as any,manage:null as any,status:null as any}))
vi.mock('@/core/session',async()=>{const{ref}=await import('vue');state.project=ref('11111111-1111-4111-8111-111111111111');state.allowed=ref(true);state.manage=ref(true);state.status=ref('ACTIVE');return{projectId:state.project,currentProject:ref({get status(){return state.status.value}}),can:(permission:string)=>permission==='enduser:read'?state.allowed.value:permission==='enduser:manage'?state.manage.value:false}})
vi.mock('@/features/devices/user-associations-api',async()=>({...await vi.importActual('@/features/devices/user-associations-api'),readUserAssociations:state.read,readUserCandidates:state.candidates,applyAssociationOperation:state.apply,recoverAssociationOperation:state.recover}))
const device='22222222-2222-4222-8222-222222222222',user='33333333-3333-4333-8333-333333333333',binding='44444444-4444-4444-8444-444444444444',other='55555555-5555-4555-8555-555555555555'
const row=()=>({bindingId:binding,appUserId:user,displayName:'显示名',username:'login',lastVisitedAt:null})
const page=(items:any[]=[],nextCursor:string|null=null)=>({items,nextCursor,hasMore:!!nextCursor})
function deferred(){let resolve!:(value:any)=>void,reject!:(cause:unknown)=>void;const promise=new Promise<any>((r,j)=>{resolve=r;reject=j});return{promise,resolve,reject}}
let mounted:VueWrapper[]=[]
function render(){const wrapper=mount(Users,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus]}});mounted.push(wrapper);return wrapper}
function button(wrapper:VueWrapper,label:string){return wrapper.findAll('button').find(value=>value.text().trim()===label)!}
async function open(wrapper:VueWrapper){await button(wrapper,'添加关联用户').trigger('click');await flushPromises()}
async function choose(wrapper:VueWrapper){wrapper.findComponent(ElSelect).vm.$emit('update:modelValue',[other]);await flushPromises()}
beforeEach(()=>{
 state.project.value='11111111-1111-4111-8111-111111111111';state.allowed.value=true;state.manage.value=true;state.status.value='ACTIVE'
 state.read.mockReset().mockResolvedValue(page());state.candidates.mockReset().mockResolvedValue(page([{appUserId:other,displayName:'候选',username:'candidate'}]));state.apply.mockReset().mockResolvedValue({});state.recover.mockReset().mockResolvedValue({})
 vi.spyOn(ElMessage,'success').mockImplementation(()=>({close(){}} as any))
})
afterEach(()=>{mounted.forEach(wrapper=>wrapper.unmount());mounted=[];ElMessageBox.close();vi.restoreAllMocks();document.body.innerHTML=''})
describe('真实ElementPlus设备关联用户',()=>{
 it('续读尚未返回时全选hook立即结束且保留原页游标和已选项',async()=>{
  const pending=deferred();state.read.mockResolvedValueOnce(page([row()],'next')).mockReturnValueOnce(pending.promise)
  let hook!:ReturnType<typeof useDeviceUserAssociations>
  const wrapper=mount(defineComponent({setup(){hook=useDeviceUserAssociations(()=>device);return()=>null}}));mounted.push(wrapper)
  await flushPromises();hook.setSelection([hook.rows.value[0]!])
  const selected=hook.selected.value,rows=hook.rows.value,request=hook.load(false)
  const signal=state.read.mock.calls[1]![3] as AbortSignal
  let finished=false;const collecting=hook.collectAllSelection().then(value=>{finished=true;return value})
  try{
   for(let step=0;step<12;step++)await Promise.resolve()
   expect(finished).toBe(true)
   expect(hook.selectingAll.value).toBe(false);expect(hook.loading.value).toBe(true)
   expect(hook.rows.value).toBe(rows);expect(hook.selected.value).toBe(selected);expect(hook.nextCursor.value).toBe('next')
   expect(signal.aborted).toBe(false);expect(state.read).toHaveBeenCalledTimes(2)
  }finally{
   pending.resolve(page([{...row(),bindingId:other,appUserId:other,username:'second'}]));await request;await collecting
  }
  const all=await hook.collectAllSelection();expect(all?.map(item=>item.bindingId)).toEqual([binding,other])
  expect(state.read).toHaveBeenCalledTimes(2);expect(state.apply).not.toHaveBeenCalled()
 })

 it('续读尚未返回时全选有界拒绝，不自旋或重置在途分页',async()=>{
  const pending=deferred();state.read.mockResolvedValueOnce(page([row()],'next')).mockReturnValueOnce(pending.promise)
  const wrapper=render();await flushPromises();expect(state.read).toHaveBeenCalledTimes(2)
  const table=wrapper.findComponent(ElTable),signal=state.read.mock.calls[1]![3] as AbortSignal
  expect(table.findComponent({name:'ElTableColumn'}).props('selectable')()).toBe(true)
  table.vm.$emit('select-all',[row()])
  try{
   // 有界微任务屏障：旧循环也必须在finally中收到真实续页结果，不运行挂死/超时型反例。
   for(let step=0;step<12;step++)await Promise.resolve()
   expect(wrapper.text()).toContain('关联列表正在加载，请加载完成后重新全选。')
   expect(state.read).toHaveBeenCalledTimes(2);expect(signal.aborted).toBe(false)
   expect(wrapper.text()).toContain('login');expect(state.apply).not.toHaveBeenCalled()
  }finally{
   pending.resolve(page([{...row(),bindingId:other,appUserId:other,username:'second'}]));await flushPromises()
  }
  expect(wrapper.findAll('tbody tr')).toHaveLength(2);expect(state.read).toHaveBeenCalledTimes(2)
  expect(wrapper.text()).not.toContain('关联列表正在加载，请加载完成后重新全选。')
  ;(table.vm as unknown as TableInstance).toggleAllSelection()
  await vi.waitFor(()=>expect((table.vm as unknown as TableInstance).getSelectionRows()).toHaveLength(2))
  expect(state.apply).not.toHaveBeenCalled()
 })

 it.each([401,403])('核对原件%s撤销关联页私有状态和管理入口',async status=>{
  state.read.mockResolvedValue(page([row()]));state.apply.mockRejectedValue(new ApiError('未知',0,undefined,undefined,true));state.recover.mockRejectedValue(new ApiError('原件失权',status));const w=render();await flushPromises();await open(w);await choose(w);await button(w,'添加').trigger('click');await flushPromises();await button(w,'重新核对').trigger('click');await flushPromises();expect(button(w,'添加关联用户')).toBeUndefined();expect(w.text()).not.toContain('login');expect(w.findComponent(ElDialog).props('modelValue')).toBe(false);expect(state.apply).toHaveBeenCalledTimes(1)
 })

 it('空表保留Source四列和无关联用户，无可见pager或旧角色/JSON查看',async()=>{
  const wrapper=render();await flushPromises();expect(wrapper.findAll('th').map(value=>value.text())).toEqual(['','用户名称','登录名','最后访问时间']);expect(wrapper.text()).toContain('无关联用户');expect(wrapper.find('.el-empty').exists()).toBe(false);expect(wrapper.find('.el-pagination').exists()).toBe(false);expect(wrapper.find('.tl-pager').exists()).toBe(false);expect(wrapper.text()).not.toContain('关系角色');expect(wrapper.text()).not.toContain('查看 JSON')
  await button(wrapper,'所有用户').trigger('click');await button(wrapper,'管理应用').trigger('click');expect(wrapper.emitted('open-users')).toHaveLength(1);expect(wrapper.emitted('manage-apps')).toHaveLength(1)
 })
 it('添加弹窗500px/多选，按appUserIds只写一次，成功关闭后真实重读',async()=>{
  const wrapper=render();await flushPromises();await open(wrapper);expect(wrapper.findComponent(ElDialog).props('width')).toBe('min(500px,94vw)');expect(wrapper.text()).toContain('您可以将设备关联到多个用户');expect(wrapper.findComponent(ElSelect).props('multiple')).toBe(true);await choose(wrapper);await button(wrapper,'添加').trigger('click');await flushPromises()
  expect(state.apply).toHaveBeenCalledTimes(1);expect(state.apply.mock.calls[0]![0]).toMatchObject({action:'ADD',targetIds:[other],device});expect(wrapper.findComponent(ElDialog).props('modelValue')).toBe(false);expect(state.read).toHaveBeenCalledTimes(2)
 })
 it('移除确认冻结精确bindingIds，选择后才显示按钮，不按用户自然键写',async()=>{
  state.read.mockResolvedValueOnce(page([row()])).mockResolvedValue(page());vi.spyOn(ElMessageBox,'confirm').mockResolvedValue('confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>);const wrapper=render();await flushPromises();expect(button(wrapper,'移除关联用户')).toBeUndefined()
  ;(wrapper.findComponent(ElTable).vm as unknown as TableInstance).toggleRowSelection(row(),true);await flushPromises();await button(wrapper,'移除关联用户').trigger('click');await flushPromises()
  expect(ElMessageBox.confirm).toHaveBeenCalledWith('确认移除关联用户吗？','提示',expect.any(Object));expect(state.apply.mock.calls[0]![0]).toMatchObject({action:'REMOVE',targetIds:[binding]});expect(state.apply).toHaveBeenCalledTimes(1)
 })
 it('网络未知冻结原选择，只读核对原件，不生成第二次写',async()=>{
  state.apply.mockRejectedValue(new ApiError('结果未知',0,undefined,undefined,true));const wrapper=render();await flushPromises();await open(wrapper);await choose(wrapper);await button(wrapper,'添加').trigger('click');await flushPromises();expect(wrapper.text()).toContain('结果未知');expect(button(wrapper,'添加').attributes('disabled')).toBeDefined();expect(wrapper.findComponent(ElSelect).props('modelValue')).toEqual([other]);await button(wrapper,'重新核对').trigger('click');await flushPromises();expect(state.recover).toHaveBeenCalledTimes(1);expect(state.apply).toHaveBeenCalledTimes(1);expect(wrapper.findComponent(ElDialog).props('modelValue')).toBe(false)
 })
 it('取消正在提交的等待保留未知，旧finally不能解除后来核对的busy',async()=>{
  const write=deferred(),read=deferred();state.apply.mockReturnValue(write.promise);state.recover.mockReturnValue(read.promise);const wrapper=render();await flushPromises();await open(wrapper);await choose(wrapper);await button(wrapper,'添加').trigger('click');await flushPromises();const signal=state.apply.mock.calls[0]![1] as AbortSignal;await button(wrapper,'取消').trigger('click');await flushPromises();expect(signal.aborted).toBe(true);expect(wrapper.text()).toContain('操作结果未确认');await button(wrapper,'重新核对').trigger('click');write.resolve({});await flushPromises();expect(button(wrapper,'重新核对').attributes('disabled')).toBeDefined();expect(state.apply).toHaveBeenCalledTimes(1);read.resolve({});await flushPromises();expect(wrapper.text()).not.toContain('操作结果未确认')
 })
 it('切设备撤销旧写资格，迟到成功不刷新新设备或显示成功',async()=>{
  const late=deferred();state.apply.mockReturnValue(late.promise);const wrapper=render();await flushPromises();await open(wrapper);await choose(wrapper);await button(wrapper,'添加').trigger('click');await wrapper.setProps({deviceId:other});await flushPromises();late.resolve({});await flushPromises();expect(state.read).toHaveBeenCalledTimes(2);expect(ElMessage.success).not.toHaveBeenCalled();expect(wrapper.findComponent(ElDialog).props('modelValue')).toBe(false)
 })
 it('候选搜索A/B迟到不串，创建新用户只发跨P6事件并关闭关联框',async()=>{
  const old=deferred();state.candidates.mockResolvedValueOnce(page()).mockReturnValueOnce(old.promise).mockResolvedValueOnce(page([{appUserId:other,displayName:'新候选',username:'new'}]));const wrapper=render();await flushPromises();await open(wrapper);const search=wrapper.findComponent(ElSelect).props('remoteMethod')!;search('A');search('B');await flushPromises();old.resolve(page([{appUserId:user,displayName:'旧候选',username:'old'}]));await flushPromises();expect(wrapper.findAllComponents({name:'ElOption'}).map(option=>option.props('label'))).toEqual(['新候选 (new)']);await button(wrapper,'创建新用户').trigger('click');await flushPromises();expect(wrapper.emitted('create-user')).toHaveLength(1);expect(wrapper.findComponent(ElDialog).props('modelValue')).toBe(false);expect(state.apply).not.toHaveBeenCalled()
 })
 it('内部续读不加pager，公开名称按文本且空访问不以创建时间补值',async()=>{
  state.read.mockResolvedValueOnce(page([{...row(),displayName:'<img src=x onerror=alert(1)>'}],'next')).mockResolvedValueOnce(page([{...row(),bindingId:other,appUserId:other,displayName:null,username:'second'}]));const wrapper=render();await flushPromises();await flushPromises();expect(state.read).toHaveBeenCalledTimes(2);expect(state.read.mock.calls[1]![2]).toBe('next');expect(wrapper.findAll('tbody tr')).toHaveLength(2);expect(wrapper.find('img').exists()).toBe(false);expect(wrapper.find('.tl-pager').exists()).toBe(false);expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>');expect(wrapper.text()).not.toContain('2026-')
 })
 it('只有读取权限时隐藏添加且无候选/写请求，权限收回清旧关联',async()=>{
  state.manage.value=false;state.read.mockResolvedValueOnce(page([row()]));const wrapper=render();await flushPromises();expect(button(wrapper,'添加关联用户')).toBeUndefined();expect(state.candidates).not.toHaveBeenCalled();expect(state.apply).not.toHaveBeenCalled();state.allowed.value=false;await flushPromises();expect(wrapper.text()).not.toContain('login');expect(state.read).toHaveBeenCalledTimes(1)
 })
 it('缺少读取权限即使管理位仍在也不开放新增或请求候选',async()=>{
  state.allowed.value=false
  const wrapper=render();await flushPromises()
  expect(wrapper.text()).toContain('当前角色无权查看关联用户')
  expect(button(wrapper,'添加关联用户')).toBeUndefined()
  expect(wrapper.findComponent(ElTable).exists()).toBe(false)
  expect(state.read).not.toHaveBeenCalled();expect(state.candidates).not.toHaveBeenCalled();expect(state.apply).not.toHaveBeenCalled()
 })
 it('同项目撤读权且管理位保留时关闭新增，恢复后必须重新读取候选',async()=>{
  const late=deferred();state.read.mockResolvedValue(page([row()]));state.candidates.mockReturnValueOnce(late.promise).mockResolvedValue(page([{appUserId:other,displayName:'新候选',username:'new'}]))
  const wrapper=render();await flushPromises();await open(wrapper)
  const signal=state.candidates.mock.calls[0]![4] as AbortSignal
  state.allowed.value=false;await flushPromises()
  expect(state.manage.value).toBe(true);expect(signal.aborted).toBe(true)
  expect(wrapper.findComponent(ElDialog).props('modelValue')).toBe(false)
  expect(button(wrapper,'添加关联用户')).toBeUndefined()
  expect(wrapper.text()).not.toContain('login')
  late.resolve(page([{appUserId:user,displayName:'旧候选',username:'old'}]));await flushPromises()
  expect(wrapper.text()).not.toContain('旧候选');expect(state.apply).not.toHaveBeenCalled()
  state.allowed.value=true;await flushPromises();await open(wrapper)
  expect(state.read).toHaveBeenCalledTimes(2);expect(state.candidates).toHaveBeenCalledTimes(2)
  expect(wrapper.findAllComponents({name:'ElOption'}).map(option=>option.props('label'))).toEqual(['新候选 (new)'])
  expect(wrapper.findComponent(ElSelect).props('modelValue')).toEqual([]);expect(state.apply).not.toHaveBeenCalled()
 })
 it('续读server403清除已呈现账号和后继资格，不把旧页当当前授权',async()=>{
  const next=deferred();state.read.mockResolvedValueOnce(page([row()],'cursor')).mockReturnValueOnce(next.promise);const wrapper=render();await flushPromises();expect(wrapper.text()).toContain('login');next.reject(new ApiError('当前范围已失权',403));await flushPromises();expect(wrapper.text()).not.toContain('login');expect(wrapper.text()).toContain('当前范围已失权');expect(state.apply).not.toHaveBeenCalled();expect(button(wrapper,'添加关联用户')).toBeUndefined()
 })
 it('确认期间切设备，迟到确认不能向新设备发旧绑定删除',async()=>{
  const confirmation=deferred();state.read.mockResolvedValueOnce(page([row()])).mockResolvedValue(page());vi.spyOn(ElMessageBox,'confirm').mockReturnValue(confirmation.promise);const wrapper=render();await flushPromises();(wrapper.findComponent(ElTable).vm as unknown as TableInstance).toggleRowSelection(row(),true);await flushPromises();await button(wrapper,'移除关联用户').trigger('click');await wrapper.setProps({deviceId:other});confirmation.resolve('confirm');await flushPromises();expect(state.apply).not.toHaveBeenCalled();expect(state.read).toHaveBeenCalledTimes(2)
 })
 it('超过完整批量预算只拒绝，不截成二百条或自动分两次POST',async()=>{
  const values=Array.from({length:201},(_,i)=>({...row(),bindingId:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,appUserId:`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`}));state.read.mockReset();for(let offset=0;offset<values.length;offset+=50)state.read.mockResolvedValueOnce(page(values.slice(offset,offset+50),offset+50<values.length?`cursor-${offset+50}`:null));vi.spyOn(ElMessageBox,'confirm').mockResolvedValue('confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>);const wrapper=render();for(let i=0;i<6;i++)await flushPromises();expect(state.read).toHaveBeenCalledTimes(5);expect(wrapper.findAll('tbody tr')).toHaveLength(201);(wrapper.findComponent(ElTable).vm as unknown as TableInstance).toggleAllSelection();await vi.waitFor(()=>expect((wrapper.findComponent(ElTable).vm as unknown as TableInstance).getSelectionRows()).toHaveLength(201));await flushPromises();await button(wrapper,'移除关联用户').trigger('click');await flushPromises();expect(wrapper.text()).toContain('不会截断或自动拆批');expect(state.apply).not.toHaveBeenCalled()
 })
 it('已经未知后取消与尝试重开仍保留同一操作，只允许读取原件',async()=>{
  state.apply.mockRejectedValue(new ApiError('结果未知',0,undefined,undefined,true));state.recover.mockRejectedValue(new ApiError('原件不可见',404));const wrapper=render();await flushPromises();await open(wrapper);await choose(wrapper);await button(wrapper,'添加').trigger('click');await flushPromises();const original=state.apply.mock.calls[0]![0];await button(wrapper,'取消').trigger('click');await flushPromises();expect(wrapper.findComponent(ElDialog).props('modelValue')).toBe(false);expect(button(wrapper,'添加关联用户').attributes('disabled')).toBeDefined();await button(wrapper,'添加关联用户').trigger('click');await flushPromises();expect(wrapper.findComponent(ElDialog).props('modelValue')).toBe(false);await button(wrapper,'重新核对').trigger('click');await flushPromises();expect(state.recover.mock.calls[0]![0]).toBe(original);expect(state.apply).toHaveBeenCalledTimes(1);expect(wrapper.text()).toContain('结果仍未确认');expect(button(wrapper,'添加关联用户').attributes('disabled')).toBeDefined()
 })
 it.each([401,403,404])('候选读取%s撤销当前资格并清私有选择/列表，不等菜单更新',async status=>{
  state.read.mockResolvedValue(page([row()]));const wrapper=render();await flushPromises();await open(wrapper);await choose(wrapper);state.candidates.mockRejectedValueOnce(new ApiError('候选资格已失效',status));wrapper.findComponent(ElSelect).props('remoteMethod')!('changed');await flushPromises();expect(wrapper.findComponent(ElDialog).props('modelValue')).toBe(false);expect(wrapper.findComponent(ElSelect).props('modelValue')).toEqual([]);expect(wrapper.text()).not.toContain('login');expect(button(wrapper,'添加关联用户')).toBeUndefined();expect(state.apply).not.toHaveBeenCalled()
 })
 it.each([403,404])('明确写%s清私有草稿和入口，不能沿旧资格再次提交',async status=>{
  state.read.mockResolvedValue(page([row()]));state.apply.mockRejectedValue(new ApiError('当前写资格已失效',status));const wrapper=render();await flushPromises();await open(wrapper);await choose(wrapper);await button(wrapper,'添加').trigger('click');await flushPromises();expect(wrapper.findComponent(ElDialog).props('modelValue')).toBe(false);expect(wrapper.findComponent(ElSelect).props('modelValue')).toEqual([]);expect(wrapper.text()).not.toContain('login');expect(button(wrapper,'添加关联用户')).toBeUndefined();expect(state.apply).toHaveBeenCalledTimes(1)
 })
 it('身份epoch改变即使设备权限相同也销毁原确认，迟到确认无写入',async()=>{
  const confirmation=deferred();state.read.mockResolvedValue(page([row()]));vi.spyOn(ElMessageBox,'confirm').mockReturnValue(confirmation.promise);const close=vi.spyOn(ElMessageBox,'close');const wrapper=render();await flushPromises();(wrapper.findComponent(ElTable).vm as unknown as TableInstance).toggleRowSelection(row(),true);await flushPromises();await button(wrapper,'移除关联用户').trigger('click');invalidateIdentity();await flushPromises();expect(close).toHaveBeenCalled();confirmation.resolve('confirm');await flushPromises();expect(state.apply).not.toHaveBeenCalled()
 })

 it('归档新增：初始归档仅保留读取和精确移除，不请求新增候选',async()=>{
  state.status.value='ARCHIVED';state.read.mockResolvedValueOnce(page([row()])).mockResolvedValue(page());vi.spyOn(ElMessageBox,'confirm').mockResolvedValue('confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>)
  const wrapper=render();await flushPromises();expect(wrapper.text()).toContain('login');expect(button(wrapper,'添加关联用户')).toBeUndefined();expect(state.candidates).not.toHaveBeenCalled()
  ;(wrapper.findComponent(ElTable).vm as unknown as TableInstance).toggleRowSelection(row(),true);await flushPromises();await button(wrapper,'移除关联用户').trigger('click');await flushPromises();expect(state.apply).toHaveBeenCalledTimes(1);expect(state.apply.mock.calls[0]![0]).toMatchObject({action:'REMOVE',targetIds:[binding]})
 })
 it('归档新增：打开中转归档关闭草稿并废弃旧候选，恢复后只读新候选',async()=>{
  const late=deferred();state.candidates.mockReturnValueOnce(late.promise).mockResolvedValue(page([{appUserId:other,displayName:'新候选',username:'new'}]));const wrapper=render();await flushPromises();await open(wrapper);const signal=state.candidates.mock.calls[0]![4] as AbortSignal
  state.status.value='ARCHIVED';await flushPromises();expect(wrapper.findComponent(ElDialog).props('modelValue')).toBe(false);expect(signal.aborted).toBe(true);expect(button(wrapper,'添加关联用户')).toBeUndefined()
  late.resolve(page([{appUserId:user,displayName:'旧候选',username:'old'}]));await flushPromises();expect(wrapper.text()).not.toContain('旧候选');expect(state.apply).not.toHaveBeenCalled()
  state.status.value='ACTIVE';await flushPromises();await open(wrapper);expect(wrapper.findAllComponents({name:'ElOption'}).map(option=>option.props('label'))).toEqual(['新候选 (new)']);expect(wrapper.findComponent(ElSelect).props('modelValue')).toEqual([]);expect(state.apply).not.toHaveBeenCalled()
 })
 it('归档期间未知新增保留原操作，仅GET核对，不误清未知或再次POST',async()=>{
  state.apply.mockRejectedValue(new ApiError('结果未知',0,undefined,undefined,true));state.recover.mockRejectedValueOnce(new ApiError('暂不可见',404)).mockResolvedValue({});const wrapper=render();await flushPromises();await open(wrapper);await choose(wrapper);await button(wrapper,'添加').trigger('click');await flushPromises();const original=state.apply.mock.calls[0]![0]
  state.status.value='ARCHIVED';await flushPromises();expect(wrapper.findComponent(ElDialog).props('modelValue')).toBe(false);expect(button(wrapper,'添加关联用户')).toBeUndefined();expect(wrapper.emitted('busy')!.at(-1)).toEqual([true]);await button(wrapper,'重新核对').trigger('click');await flushPromises();expect(wrapper.text()).toContain('结果仍未确认');await button(wrapper,'重新核对').trigger('click');await flushPromises();expect(state.recover.mock.calls.map(call=>call[0])).toEqual([original,original]);expect(state.apply).toHaveBeenCalledTimes(1);expect(wrapper.emitted('busy')!.at(-1)).toEqual([false]);expect(button(wrapper,'添加关联用户')).toBeUndefined()
 })

})
