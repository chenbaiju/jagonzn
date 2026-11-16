import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {effectScope,ref,type EffectScope} from 'vue'
import {flushPromises} from '@vue/test-utils'
import {session} from '../../src/core/session'
import {ApiError,changeIdentity} from '../../src/core/http'
import {useDeviceBatchActions} from '../../src/features/devices/use-device-batch-actions'
const mock=vi.hoisted(()=>({device:vi.fn(),access:vi.fn(),prepare:vi.fn(),write:vi.fn(),observe:vi.fn(),groupList:vi.fn(),decodeGroups:vi.fn(),candidates:vi.fn()}))
vi.mock('../../src/features/devices/device-batch-api',async original=>({...await original<typeof import('../../src/features/devices/device-batch-api')>(),readBatchDevice:mock.device,readBatchAccess:mock.access,prepareBatchRow:mock.prepare,writeBatchRow:mock.write,observeBatchRow:mock.observe}))
vi.mock('../../src/features/devices/static-group-membership-api',()=>({readStaticGroups:mock.groupList,decodeStaticGroups:mock.decodeGroups}))
vi.mock('../../src/features/devices/user-associations-api',()=>({readUserCandidates:mock.candidates}))
const p='00000000-0000-0000-0000-000000000001',a='00000000-0000-0000-0000-000000000002',b='00000000-0000-0000-0000-000000000003',g='00000000-0000-0000-0000-000000000004',u='00000000-0000-0000-0000-000000000005'
let scope:EffectScope,state:ReturnType<typeof useDeviceBatchActions>,ids=ref([a,b]),selectedGroup=ref<string>(),disabled=ref(false)
let changed=vi.fn(),cleared=vi.fn(),locked=vi.fn()
function user(role='OWNER',permissions=['device:read','device:update','device:delete','enduser:read','enduser:manage']){session.user={currentProjectId:p,permissions} as never;session.projects=[{id:p,status:'ACTIVE',myRole:role}];session.ready=true;session.transitioning=false}
async function setup(values=[a,b]){ids.value=values;scope=effectScope();state=scope.run(()=>useDeviceBatchActions({deviceIds:()=>ids.value,selectedGroupId:()=>selectedGroup.value,disabled:()=>disabled.value,changed,cleared,locked}))!;await flushPromises()}
beforeEach(()=>{Object.values(mock).forEach(fn=>fn.mockReset());changed=vi.fn();cleared=vi.fn();locked=vi.fn();selectedGroup.value=undefined;disabled.value=false;changeIdentity();user();mock.device.mockImplementation(async(_p,id)=>({id,name:'设备'+id.slice(-1)}));mock.access.mockImplementation(async(_p,id)=>({enabled:id===a}));mock.prepare.mockImplementation(async(_p,id)=>({id,name:'设备'+id.slice(-1),status:'READY',detail:'待确认'}));mock.write.mockResolvedValue(undefined);mock.observe.mockResolvedValue('已读取当前事实');mock.decodeGroups.mockReturnValue({items:[{groupId:g,name:'组'}],hasMore:false,nextAfterGroupId:null});mock.candidates.mockResolvedValue({items:[{appUserId:u,username:'account',displayName:'用户'}],nextCursor:null,hasMore:false})})
afterEach(()=>{scope?.stop();session.user=null;session.projects=[]})
it('只在完整读取所有当前设备后公开真实启用/停用计数',async()=>{await setup();expect(state.counts.value).toEqual({enable:1,disable:1});expect(mock.access).toHaveBeenCalledTimes(2);expect(locked).toHaveBeenLastCalledWith(false)})
it('超96或重复身份拒绝整个选择，不读取不截断',async()=>{await setup(Array(97).fill(a));expect(state.error.value).toContain('不会截断');expect(mock.device).not.toHaveBeenCalled();expect(state.selection.value).toEqual([])})
it('读取任一失败时不以部分结果或零值代替计数',async()=>{mock.access.mockRejectedValueOnce(new Error('读失败'));await setup();expect(state.metadata.value).toEqual([]);expect(state.error.value).toContain('读失败')})
it.each(['VIEWER','OPERATOR'])('%s不可执行管理员批量操作，即使误带菜单权限',async role=>{user(role);await setup();state.start('remove');expect(state.shown.value).toBe(false);expect(mock.prepare).not.toHaveBeenCalled()})
it('ACTIVE和具体动作权限均需满足；禁用父层也不能开始',async()=>{user('ADMIN',['device:read','device:update']);await setup();state.start('remove');expect(state.shown.value).toBe(false);disabled.value=true;state.start('disable');expect(state.shown.value).toBe(false)})
it('预检后的取消零写，清除选择只发事件',async()=>{await setup();state.start('remove');await flushPromises();expect(state.phase.value).toBe('confirm');expect(mock.prepare).toHaveBeenCalledTimes(2);state.close();state.clear();expect(mock.write).not.toHaveBeenCalled();expect(cleared).toHaveBeenCalledTimes(1)})
it('正常批次严格逐行执行，全部结果保留，不并行写',async()=>{await setup();state.start('remove');await flushPromises();let resolve!:()=>void;mock.write.mockImplementationOnce(()=>new Promise<void>(r=>resolve=r));const run=state.confirm.value();await flushPromises();expect(mock.write).toHaveBeenCalledTimes(1);resolve();await run;expect(mock.write).toHaveBeenCalledTimes(2);expect(state.rows.value.map(r=>r.status)).toEqual(['SUCCESS','SUCCESS']);expect(changed).toHaveBeenCalledTimes(1)})
it('已满足状态跳过不写；每行沿用自己的预检结果',async()=>{mock.prepare.mockImplementation(async(_p,id)=>({id,name:id,status:id===a?'NOOP':'READY',detail:'已满足',access:{configVersion:id}}));await setup();state.start('enable');await flushPromises();await state.confirm.value();expect(mock.write).toHaveBeenCalledTimes(1);expect(mock.write.mock.calls[0]![1]).toMatchObject({id:b,access:{configVersion:b}});expect(state.rows.value[0]?.status).toBe('NOOP')})
it('预检一台失败整批零写，保留错误可重新准备',async()=>{mock.prepare.mockRejectedValueOnce(new ApiError('无权',403));await setup();state.start('remove');await flushPromises();expect(state.denied.value).toBe(true);expect(state.rows.value).toEqual([]);await state.confirm.value();expect(mock.write).not.toHaveBeenCalled()})
it('未知写只发送首行并停队列；关闭/重开/再次确认均不重放',async()=>{mock.write.mockRejectedValueOnce(new ApiError('未知',0,undefined,undefined,true));await setup();state.start('remove');await flushPromises();await state.confirm.value();expect(state.rows.value.map(r=>r.status)).toEqual(['UNKNOWN','NOTRUN']);expect(state.locked.value).toBe(true);state.close();expect(state.unknown.value).toBe(true);state.start('enable');expect(state.shown.value).toBe(false);state.reopen();await state.confirm.value();expect(mock.write).toHaveBeenCalledTimes(1);state.clear();expect(cleared).not.toHaveBeenCalled()})
it('三行批次保留首行成功，第二行写后读取未知阻止第三行且核对不重放',async()=>{
 const actual=await vi.importActual<typeof import('../../src/features/devices/device-batch-api')>('../../src/features/devices/device-batch-api')
 const {devicesApi}=await import('../../src/features/devices/api')
 const third='00000000-0000-0000-0000-000000000006',selected=[a,b,third]
 const facts=new Map(selected.map((id,index)=>[id,{protocol:'MQTT' as const,enabled:true,configVersion:String(index+7),credentialVersion:'2',configured:true,allowedProtocols:['MQTT' as const],canManage:true}]))
 const observed:string[]=[],submitted:string[]=[]
 let rejectSecondRead=true
 const read=vi.spyOn(devicesApi,'read').mockImplementation(async(_project,id)=>({id,name:'设备'+id.slice(-1)} as Awaited<ReturnType<typeof devicesApi.read>>))
 const access=vi.spyOn(devicesApi,'access').mockImplementation(async(_project,id)=>{
  observed.push(id)
  if(id===b&&submitted.includes(b)&&rejectSecondRead){rejectSecondRead=false;throw new ApiError('写后读取连接中断',0,undefined,undefined,true)}
  return {...facts.get(id)!,allowedProtocols:['MQTT']}
 })
 const change=vi.spyOn(devicesApi,'changeAccess').mockImplementation(async(_project,id,body)=>{
  // 真实逐行适配器已完成全量预检；写回执本身有效，第二行只在后继GET失去确认。
  expect(observed.slice(0,3)).toEqual(selected)
  const before=facts.get(id)!
  expect(body).toEqual({protocol:'MQTT',enabled:false,expectedConfigVersion:before.configVersion})
  submitted.push(id)
  const after={...before,enabled:false,configVersion:String(BigInt(before.configVersion)+1n)}
  facts.set(id,after);return {...after}
 })
 try{
  mock.prepare.mockImplementation(actual.prepareBatchRow);mock.write.mockImplementation(actual.writeBatchRow);mock.observe.mockImplementation(actual.observeBatchRow)
  await setup(selected);state.start('disable');await flushPromises()
  expect(change).not.toHaveBeenCalled()
  await state.confirm.value()
  expect(submitted).toEqual([a,b]);expect(facts.get(third)?.enabled).toBe(true)
  expect(state.rows.value.map(r=>r.status)).toEqual(['SUCCESS','UNKNOWN','NOTRUN'])
  expect(changed).toHaveBeenCalledTimes(1);expect(state.locked.value).toBe(true);expect(state.canFinish.value).toBe(false)
  state.close();expect(state.shown.value).toBe(false);expect(state.locked.value).toBe(true)
  state.reopen();await state.confirm.value();state.clear()
  expect(submitted).toEqual([a,b]);expect(cleared).not.toHaveBeenCalled()
  await state.verify()
  expect(mock.observe).toHaveBeenCalledTimes(1);expect(mock.observe.mock.calls[0]![1].id).toBe(b)
  expect(state.rows.value.map(r=>r.status)).toEqual(['SUCCESS','UNKNOWN','NOTRUN'])
  expect(state.rows.value[1]?.observation).toContain('配置版本9');expect(state.rows.value[1]?.observation).toContain('原请求结果仍未确认')
  expect(state.locked.value).toBe(true);expect(state.canFinish.value).toBe(true)
  state.finish();await flushPromises()
  expect(state.locked.value).toBe(false);expect(change).toHaveBeenCalledTimes(2);expect(submitted).toEqual([a,b])
 }finally{read.mockRestore();access.mockRestore();change.mockRestore()}
})
it('核对仅读原行，读成功仍需显式结束，不自动续写剩余设备',async()=>{mock.write.mockRejectedValueOnce(new Error('回执坏'));await setup();state.start('disable');await flushPromises();await state.confirm.value();expect(state.canFinish.value).toBe(false);await state.verify();expect(mock.observe).toHaveBeenCalledTimes(1);expect(mock.observe.mock.calls[0]![1].id).toBe(a);expect(state.rows.value[0]?.status).toBe('UNKNOWN');expect(state.canFinish.value).toBe(true);expect(mock.write).toHaveBeenCalledTimes(1);state.finish();await flushPromises();expect(state.unknown.value).toBe(false);expect(mock.write).toHaveBeenCalledTimes(1)})
it('核对失败不能结束保护，也不能报告成功',async()=>{mock.write.mockRejectedValueOnce(new Error('失联'));mock.observe.mockRejectedValueOnce(new ApiError('读取失败',500));await setup();state.start('remove');await flushPromises();await state.confirm.value();await state.verify();expect(state.canFinish.value).toBe(false);expect(state.rows.value[0]?.status).toBe('UNKNOWN')})
it('上一确认回调不能提交后来打开的新批次',async()=>{await setup();state.start('remove');await flushPromises();const old=state.confirm.value;state.close();state.start('enable');await flushPromises();await old();expect(mock.write).not.toHaveBeenCalled();await state.confirm.value();expect(mock.write).toHaveBeenCalledTimes(2)})
it('选择变化使已打开确认失效；未知批次保留原操作核对',async()=>{await setup();state.start('remove');await flushPromises();const old=state.confirm.value;ids.value=[b];await flushPromises();await old();expect(mock.write).not.toHaveBeenCalled();state.start('remove');await flushPromises();mock.write.mockRejectedValueOnce(new Error('未知'));await state.confirm.value();ids.value=[a];await flushPromises();expect(state.unknown.value).toBe(true);expect(state.staleSelection.value).toBe(true);await state.verify();expect(mock.observe.mock.calls[0]![1].id).toBe(b)})
it('写中身份切换清旧结果，迟到成功不触发changed也不写下一行',async()=>{await setup();state.start('remove');await flushPromises();let resolve!:()=>void;mock.write.mockImplementationOnce(()=>new Promise<void>(r=>resolve=r));const run=state.confirm.value();await flushPromises();changeIdentity();resolve();await run;await flushPromises();expect(mock.write).toHaveBeenCalledTimes(1);expect(changed).not.toHaveBeenCalled();expect(state.rows.value).toEqual([])})
it('写中权限撤销不推进下一设备，保留新拒绝作用域',async()=>{await setup();state.start('remove');await flushPromises();let resolve!:()=>void;mock.write.mockImplementationOnce(()=>new Promise<void>(r=>resolve=r));const run=state.confirm.value();await flushPromises();user('VIEWER',['device:read']);resolve();await run;expect(mock.write).toHaveBeenCalledTimes(1);expect(state.shown.value).toBe(false)})
it('用户选择合并每台设备真实候选，首台已关联不会挡住其它设备候选',async()=>{mock.candidates.mockImplementation(async(_p,id)=>({items:id===a?[]:[{appUserId:u,displayName:null,username:'user'}],hasMore:false,nextCursor:null}));await setup();state.start('associate');await flushPromises();expect(state.choices.value.map(r=>r.appUserId)).toEqual([u]);expect(mock.candidates).toHaveBeenCalledTimes(2);state.user.value=u;await state.prepare();expect(mock.prepare).toHaveBeenCalledWith(p,a,'associate',u,expect.any(AbortSignal));expect(mock.write).not.toHaveBeenCalled()})
it('旧搜索迟到不覆盖新搜索候选',async()=>{await setup();state.start('associate');await flushPromises();let resolve!:(v:unknown)=>void;mock.candidates.mockImplementationOnce(()=>new Promise(r=>resolve=r));const old=state.loadUsers('旧',false);await flushPromises();mock.candidates.mockResolvedValue({items:[],hasMore:false,nextCursor:null});await state.loadUsers('新',false);resolve({items:[{appUserId:u,username:'旧',displayName:null}],hasMore:false,nextCursor:null});await old;expect(state.choices.value).toEqual([])})
it('从当前组移除绑定原组选项，未选组不能开始',async()=>{await setup();state.start('remove-group');expect(state.shown.value).toBe(false);selectedGroup.value=g;await flushPromises();state.start('remove-group');await flushPromises();expect(mock.prepare).toHaveBeenCalledWith(p,a,'remove-group',g,expect.any(AbortSignal))})
it('父层中途禁用时已发送行结束后停止，后续设备不发送',async()=>{await setup();state.start('remove');await flushPromises();let resolve!:()=>void;mock.write.mockImplementationOnce(()=>new Promise<void>(r=>resolve=r));const run=state.confirm.value();await flushPromises();disabled.value=true;resolve();await run;expect(mock.write).toHaveBeenCalledTimes(1);expect(state.rows.value[1]?.status).toBe('NOTRUN')})
it('重复核对失败时清除上次核对资格，不能按旧观察结束',async()=>{mock.write.mockRejectedValueOnce(new Error('未知'));await setup();state.start('remove');await flushPromises();await state.confirm.value();await state.verify();expect(state.canFinish.value).toBe(true);mock.observe.mockRejectedValueOnce(new Error('本次读取失败'));await state.verify();expect(state.canFinish.value).toBe(false);expect(state.rows.value[0]?.observation).toBeUndefined()})
it('候选跨多次加载形成游标循环时拒绝，不把重复页当完整集合',async()=>{await setup([a]);let n=0;mock.candidates.mockImplementation(async()=>({items:[],hasMore:true,nextCursor:++n===1?'A':n===2?'B':'A'}));state.start('associate');await flushPromises();await state.loadMore();await state.loadMore();expect(state.optionError.value).toContain('位置');expect(state.more.value).toBe(false)})
it('Source单次分组提交先完整预检再写，成功关闭且无第二次确认',async()=>{await setup();state.start('add-group');await flushPromises();state.group.value=g;const order:string[]=[];mock.prepare.mockImplementation(async(_p,id)=>{order.push('read'+id);return{id,name:id,status:'READY',detail:'待确认'}});mock.write.mockImplementation(async(_p,row)=>{order.push('write'+row.id)});await state.submit.value();expect(order).toEqual(['read'+a,'read'+b,'write'+a,'write'+b]);expect(state.shown.value).toBe(false);expect(state.locked.value).toBe(false);expect(state.notice.value).toBe('添加成功')})
it('单次用户提交预检拒绝时零写；旧submit不能操作新选择弹窗',async()=>{await setup();state.start('associate');await flushPromises();state.user.value=u;const old=state.submit.value;state.close();state.start('associate');await flushPromises();state.user.value=u;await old();expect(mock.prepare).not.toHaveBeenCalled();mock.prepare.mockRejectedValueOnce(new Error('当前用户已失效'));await state.submit.value();expect(mock.write).not.toHaveBeenCalled();expect(state.error.value).toContain('当前用户已失效');expect(state.phase.value).toBe('choose')})
it('旧候选错误不泄漏到后来移除确认',async()=>{await setup();state.start('associate');await flushPromises();await state.loadUsers('过'.repeat(129),false);expect(state.optionError.value).not.toBe('');state.close();state.start('remove');await flushPromises();expect(state.optionError.value).toBe('');expect(state.phase.value).toBe('confirm')})
it('一次关联提交全部已满足时零写且结束弹窗，不假报发生了修改',async()=>{await setup();state.start('associate');await flushPromises();state.user.value=u;mock.prepare.mockImplementation(async(_p,id)=>({id,name:id,status:'NOOP',detail:'已关联'}));await state.submit.value();expect(mock.write).not.toHaveBeenCalled();expect(changed).not.toHaveBeenCalled();expect(state.shown.value).toBe(false);expect(state.notice.value).toBe('当前已符合目标状态')})
