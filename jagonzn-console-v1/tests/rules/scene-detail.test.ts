import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {DOMWrapper,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory,createRouter,RouterView} from 'vue-router'
import ElementPlus,{ElMessageBox} from 'element-plus'
import {h,onMounted,ref} from 'vue'
import SceneDetailPage from '../../src/features/rules/SceneDetailPage.vue'
import {ApiError} from '../../src/core/http'
const project='10000000-0000-4000-8000-000000000001',scene='20000000-0000-4000-8000-000000000001',version='30000000-0000-4000-8000-000000000001',device='40000000-0000-4000-8000-000000000001',other='50000000-0000-4000-8000-000000000001'
const state=vi.hoisted(()=>({manage:null as any,project:null as any,current:null as any,read:vi.fn(),latest:vi.fn(),version:vi.fn(),write:vi.fn(),names:vi.fn(),typeDevices:vi.fn()}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');state.manage=ref(true);state.project=ref('10000000-0000-4000-8000-000000000001');state.current=ref({status:'ACTIVE'});return {session:{ready:true,transitioning:false,user:{accountId:'00000000-0000-4000-8000-0000000000aa'},projects:[],menus:[]},can:()=>state.manage.value,projectId:state.project,currentProject:state.current}})
vi.mock('../../src/features/rules/scene-editor-api',()=>({readScene:state.read,readSceneLatest:state.latest,readSceneVersion:state.version}))
vi.mock('../../src/features/rules/task-choices',()=>({selectedTaskChoices:state.names}))
vi.mock('../../src/features/device-types/type-devices-api',()=>({readTypeDevices:state.typeDevices}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.write}))
let wrapper:VueWrapper|undefined
const definition={id:scene,name:'多设备场景',status:'ACTIVE',activeVersionId:version,version:4,createdAt:'2026-11-02T01:00:00Z',updatedAt:'2026-11-02T01:00:00Z'}
beforeEach(()=>{
 vi.clearAllMocks();state.manage.value=true;state.current.value={status:'ACTIVE'};state.project.value=project
 state.read.mockResolvedValue(definition);state.version.mockResolvedValue({id:version,versionNumber:1,deviceScope:{kind:'DEVICE',referenceId:device},conditions:[],actions:[{nodeType:'scene-device-property-set-action',config:{deviceId:other,properties:{power:true}}}]});state.names.mockResolvedValue([{id:other,label:'另一台设备'}])
})
afterEach(()=>{wrapper?.unmount();document.body.innerHTML=''})
async function setup(){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/rules/scenes/:id',component:SceneDetailPage},{path:'/away',component:{template:'<p>已离开</p>'}}]});await router.push(`/rules/scenes/${scene}`);await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus],stubs:{TaskChoiceSelect:{props:['loader'],emits:['update:modelValue'],setup(props,{emit}){const candidate=ref('');onMounted(async()=>{const page=await props.loader(undefined,new AbortController().signal);candidate.value=page.options[0]?.id||''});return ()=>h('button',{'aria-label':'选择类型设备',onClick:()=>emit('update:modelValue',[candidate.value])},'选择类型设备')}}}}});await flushPromises();return router}
it('详情显示冻结动作独立目标；未知停用仅只读核对，不重POST，恢复权限后仍持有原意图',async()=>{
 const router=await setup();expect(wrapper!.text()).toContain('另一台设备');expect(wrapper!.text()).toContain('power：true')
 state.write.mockRejectedValue(new ApiError('请求结果未知',0,undefined,undefined,true))
 await wrapper!.findComponent({name:'ElSwitch'}).vm.$emit('change',false);await flushPromises()
 expect(state.write).toHaveBeenCalledWith(`/api/v1/projects/${project}/scenes/${scene}/pause`,{method:'post',query:{expectedVersion:4}})
 expect(await router.push('/away')).toBeTruthy()
 state.manage.value=false;await flushPromises();expect(wrapper!.text()).not.toContain('多设备场景')
 state.manage.value=true;await flushPromises();expect(await router.push('/away')).toBeTruthy()
 state.read.mockResolvedValue({...definition,version:5,status:'PAUSED'})
 const verify=wrapper!.findAll('button').find(button=>button.text()==='重新读取核对')!;await verify.trigger('click');await flushPromises()
 expect(state.write).toHaveBeenCalledTimes(1);expect(await router.push('/away')).toBeUndefined()
})
it('运行未知后丢权清画面但保持原执行键，恢复后只GET同键核对',async()=>{
 const router=await setup();state.write.mockRejectedValue(new ApiError('未知',0,undefined,undefined,true))
 await wrapper!.get('[aria-label="运行场景"]').trigger('click');await flushPromises()
 expect(state.write).toHaveBeenCalledTimes(1);const key=state.write.mock.calls[0]![1].headers['Idempotency-Key']
 state.manage.value=false;await flushPromises();expect(wrapper!.text()).not.toContain('多设备场景')
 state.manage.value=true;await flushPromises();expect(await router.push('/away')).toBeTruthy()
 state.write.mockResolvedValue({id:'60000000-0000-4000-8000-000000000001',sceneId:scene,deviceId:device,sceneVersionId:version,idempotencyKey:key,trigger:'MANUAL',status:'DISPATCHED'})
 await wrapper!.findAll('button').find(button=>button.text()==='重新读取核对')!.trigger('click');await flushPromises()
 expect(state.write).toHaveBeenCalledTimes(2);expect(state.write.mock.calls[1]![1].method).toBeUndefined();expect(state.write.mock.calls[1]![1].query).toEqual({key})
 expect(await router.push('/away')).toBeUndefined()
})
it('类型范围先选择真实类型设备，独立动作目标不能冒原执行设备',async()=>{
 const type='70000000-0000-4000-8000-000000000001'
 state.version.mockResolvedValue({id:version,versionNumber:1,deviceScope:{kind:'DEVICE_TYPE',referenceId:type},conditions:[],actions:[{nodeType:'scene-device-property-set-action',config:{deviceId:other,properties:{power:true}}}]})
 state.typeDevices.mockResolvedValue({items:[{id:device,name:'类型中的设备'}],total:'1'})
 await setup();expect(wrapper!.get('[aria-label="运行场景"]').attributes('disabled')).toBeDefined()
 expect(state.typeDevices).toHaveBeenCalledWith(project,type,{page:1,limit:24},expect.any(AbortSignal))
 await wrapper!.get('[aria-label="选择类型设备"]').trigger('click');await flushPromises()
 state.write.mockRejectedValue(new ApiError('明确拒绝',400))
 await wrapper!.get('[aria-label="运行场景"]').trigger('click');await flushPromises()
 expect(state.write.mock.calls[0]![1].body.deviceId).toBe(device);expect(wrapper!.text()).toContain('另一台设备')
})
it('名称信息独立弹窗取消零写；未知保存失权恢复保原意图且只读核对',async()=>{
 const router=await setup();await wrapper!.get('[aria-label="编辑场景信息"]').trigger('click');await flushPromises()
 let dialog=new DOMWrapper(document.querySelector('[role="dialog"]')!)
 await dialog.get('[aria-label="场景名称"]').setValue('取消草稿')
 await dialog.findAll('button').find(button=>button.text()==='取消')!.trigger('click');await flushPromises();expect(state.write).not.toHaveBeenCalled()
 await wrapper!.get('[aria-label="编辑场景信息"]').trigger('click');await flushPromises();dialog=new DOMWrapper(document.querySelector('[role="dialog"]')!)
 expect((dialog.get('[aria-label="场景名称"]').element as HTMLInputElement).value).toBe('多设备场景')
 await dialog.get('[aria-label="场景名称"]').setValue('修订后的名称');await dialog.get('[aria-label="场景描述"]').setValue('只修订信息')
 state.write.mockRejectedValue(new ApiError('未知',0,undefined,undefined,true));await dialog.findAll('button').find(button=>button.text()==='保存')!.trigger('click');await flushPromises()
 expect(state.write).toHaveBeenCalledWith(`/api/v1/projects/${project}/scenes/${scene}/information`,{method:'put',body:{name:'修订后的名称',description:'只修订信息',expectedVersion:4}})
 state.manage.value=false;await flushPromises();expect(wrapper!.text()).not.toContain('多设备场景')
 state.manage.value=true;await flushPromises();expect(await router.push('/away')).toBeTruthy()
 state.read.mockResolvedValue({...definition,name:'修订后的名称',description:'只修订信息',version:5})
 await wrapper!.findAll('button').find(button=>button.text()==='重新读取核对')!.trigger('click');await flushPromises()
 expect(state.write).toHaveBeenCalledTimes(1);expect(wrapper!.text()).toContain('修订后的名称');expect(await router.push('/away')).toBeUndefined()
})

it('运行任务动作详情读取真实任务名称，原执行来源仍独立于动作设备',async()=>{
 const task='80000000-0000-4000-8000-000000000001'
 state.version.mockResolvedValue({id:version,versionNumber:1,deviceScope:{kind:'DEVICE',referenceId:device},conditions:[],actions:[{nodeType:'scene-task-run-action',config:{deviceId:other,taskId:task}}]})
 state.write.mockResolvedValue({id:task,name:'目标设备的真实任务',status:'PAUSED',version:7})
 await setup();expect(wrapper!.text()).toContain('执行任务');expect(wrapper!.text()).toContain('设备：另一台设备');expect(wrapper!.text()).toContain('任务：目标设备的真实任务')
 expect(state.write).toHaveBeenCalledOnce();expect(state.write).toHaveBeenCalledWith(`/api/v1/projects/${project}/task-jobs/${task}`,{signal:expect.any(AbortSignal)})
 state.write.mockRejectedValue(new ApiError('明确拒绝',400))
 await wrapper!.get('[aria-label="运行场景"]').trigger('click');await flushPromises()
 expect(state.write.mock.lastCall![1].body.deviceId).toBe(device)
})

it('场景标签独立取消和未知只读恢复；设置删除确认取消不发送请求',async()=>{
 const before={...definition,tags:{'部门':'生产',empty:''}},wanted={'部门':'研发',empty:''}
 state.read.mockResolvedValue(before);const router=await setup();await router.push(`/rules/scenes/${scene}?tab=settings`);await flushPromises()
 await wrapper!.get('[aria-label="编辑场景标签"]').trigger('click');await flushPromises()
 let dialog=new DOMWrapper(document.querySelector('[role="dialog"][aria-label="编辑标签"]')!)
 await dialog.get('[aria-label="标签 1 值"]').setValue('取消草稿');await dialog.findAll('button').find(b=>b.text()==='取消')!.trigger('click');await flushPromises();expect(state.write).not.toHaveBeenCalled()
 await wrapper!.get('[aria-label="编辑场景标签"]').trigger('click');await flushPromises();dialog=new DOMWrapper(document.querySelector('[role="dialog"][aria-label="编辑标签"]')!)
 expect((dialog.get('[aria-label="标签 1 值"]').element as HTMLInputElement).value).toBe('生产');expect((dialog.get('[aria-label="标签 2 值"]').element as HTMLInputElement).value).toBe('')
 await dialog.get('[aria-label="标签 1 值"]').setValue('前项')
 await dialog.findAll('button').find(b=>b.text()==='添加标签')!.trigger('click');await dialog.get('[aria-label="标签 3 名称"]').setValue('部门');await dialog.get('[aria-label="标签 3 值"]').setValue('研发')
 await dialog.findAll('button').find(b=>b.text()==='添加标签')!.trigger('click');await dialog.get('[aria-label="标签 4 名称"]').setValue('新增空值应省略')
 state.write.mockRejectedValue(new ApiError('未知',0,undefined,undefined,true))
 await dialog.findAll('button').find(b=>b.text()==='保存')!.trigger('click');await flushPromises()
 expect(state.write).toHaveBeenCalledWith(`/api/v1/projects/${project}/scenes/${scene}/tags`,{method:'put',body:{expectedVersion:4,tags:wanted}})
 state.manage.value=false;await flushPromises();expect(wrapper!.text()).not.toContain('多设备场景')
 state.manage.value=true;await flushPromises();expect(await router.push('/away')).toBeTruthy()
 state.write.mockResolvedValue({sceneId:scene,version:5,tags:wanted});state.read.mockResolvedValue({...before,version:5,tags:wanted})
 await wrapper!.findAll('button').find(b=>b.text()==='重新读取标签核对')!.trigger('click');await flushPromises()
 expect(state.write).toHaveBeenCalledTimes(2);expect(state.write.mock.calls[1]![1]).toBeUndefined();expect(wrapper!.text()).toContain('研发')
 const confirm=vi.spyOn(ElMessageBox,'confirm').mockRejectedValue('cancel')
 try{await wrapper!.get('[aria-label="删除场景"]').trigger('click');await flushPromises();expect(confirm).toHaveBeenCalledWith('确定要删除此场景吗？删除后不可恢复，请谨慎操作。','提示',{confirmButtonText:'确定',cancelButtonText:'取消',type:'warning'});expect(state.write).toHaveBeenCalledTimes(2)}finally{confirm.mockRestore()}
 expect(await router.push('/away')).toBeUndefined()
})
