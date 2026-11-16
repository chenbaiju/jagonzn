import { beforeEach,it,expect,vi } from 'vitest'
const send=vi.hoisted(()=>vi.fn())
vi.mock('../../src/core/http',async importOriginal=>({...await importOriginal<typeof import('../../src/core/http')>(),api:send}))
import {saveTaskTargets,runTaskOnDevices} from '../../src/features/rules/api'
import {taskEditor,taskSelection,selectedDeviceIds} from '../../src/features/rules/models'
import {taskChoices,selectedTaskChoices} from '../../src/features/rules/task-choices'
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002'
beforeEach(()=>send.mockReset())
it('信息编辑副本保留新增目标数组，修改草稿不能污染已读任务',()=>{
 const job={tags:{},actionType:'COMMAND' as const,name:'任务',commandKey:'key',scheduleType:'ONCE' as const,runAt:'2020-01-01T00:00:00Z',timezone:'Asia/Shanghai',status:'PAUSED' as const,version:4,targetType:'EXPLICIT_DEVICES' as const,targetDeviceIds:[a,b],targetGroupIds:[],input:{}};const draft=taskEditor(job);expect(draft.targetDeviceIds).toEqual([a,b]);draft.targetDeviceIds!.pop();expect(job.targetDeviceIds).toEqual([a,b]);expect(taskEditor({...job,targetType:'DEVICE_TYPE',targetDeviceTypeId:a}).targetDeviceTypeId).toBe(a)
})
it('保存目标只加显式targetsOnly，清理所有其它目标维度并保留CAS/隐藏定义',async()=>{
 const body={name:'名称',scheduleType:'ONCE' as const,runAt:'2020-01-01T00:00:00Z',timezone:'Asia/Shanghai',targetType:'DEVICE_TYPE' as const,targetDeviceTypeId:a,targetDeviceIds:[b],targetGroupIds:[b],targetGroupId:b,commandKey:'hidden',input:{x:1},enabled:false,expectedVersion:4};send.mockResolvedValue({});await saveTaskTargets('p','j',body);expect(send).toHaveBeenCalledWith('/api/v1/projects/p/task-jobs/j',{method:'put',query:{targetsOnly:true},body:{...body,targetGroupId:undefined,targetDeviceIds:undefined,targetGroupIds:undefined}})
})
it('指定运行只发CAS与去重子集，失败不自动重放或退回所有设备',async()=>{
 send.mockRejectedValueOnce(new Error('未知'));await expect(runTaskOnDevices('p','j',4,[a,a,b])).rejects.toThrow('未知');expect(send).toHaveBeenCalledExactlyOnceWith('/api/v1/projects/p/task-jobs/j/runs',{method:'post',query:{requireEnabled:true},body:{expectedVersion:4,deviceIds:[a,b]}})
})
it('空、非法、超界集合和未知目标类型在写前拒绝',()=>{
 for(const ids of [[],['not-an-id'],Array.from({length:10001},(_,i)=>`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`)])expect(()=>runTaskOnDevices('p','j',4,ids)).toThrow();expect(()=>taskSelection({targetType:'DEVICE_GROUPS',targetGroupIds:Array.from({length:101},(_,i)=>`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`)})).toThrow();expect(()=>taskSelection(JSON.parse('{"targetType":"FUTURE"}'))).toThrow();expect(send).not.toHaveBeenCalled();expect(selectedDeviceIds([a,a])).toEqual([a])
})
it('设备/类型使用真实游标页，完整组数组不伪造nextCursor',async()=>{
 send.mockResolvedValueOnce({items:[{id:a,name:'设备'}],hasMore:true,nextCursor:'next'});expect(await taskChoices('p','devices')).toEqual({options:[{id:a,label:'设备'}],hasMore:true,nextCursor:'next'});expect(send).toHaveBeenLastCalledWith('/api/v1/projects/p/devices/search',{query:{cursor:undefined,limit:50},signal:undefined});send.mockResolvedValueOnce([{id:b,name:'组'}]);expect(await taskChoices('p','device-groups')).toEqual({options:[{id:b,label:'组'}],hasMore:false});expect(send).toHaveBeenLastCalledWith('/api/v1/projects/p/device-groups',{signal:undefined})
})
it('缺少hasMore或下一游标不能把残页当完整设备候选',async()=>{
 send.mockResolvedValueOnce({items:[],hasMore:true});await expect(taskChoices('p','devices')).rejects.toThrow('不完整');send.mockResolvedValueOnce({items:[]});await expect(taskChoices('p','device-types')).rejects.toThrow('不完整')
})
it('已选名称补查最多20项且最多4并发，设备组只走既有列表而非不存在的GET',async()=>{
 let active=0,peak=0;send.mockImplementation(async(path:string)=>{active++;peak=Math.max(peak,active);await new Promise(done=>setTimeout(done,0));active--;return {id:path.split('/').at(-1),name:'名称'}});const ids=Array.from({length:10000},(_,i)=>`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`);expect(await selectedTaskChoices('p','devices',ids)).toHaveLength(20);expect(send).toHaveBeenCalledTimes(20);expect(peak).toBeLessThanOrEqual(4);send.mockReset().mockResolvedValue([{id:a,name:'组'}]);expect(await selectedTaskChoices('p','device-groups',[a])).toEqual([{id:a,label:'组'}]);expect(send).toHaveBeenCalledExactlyOnceWith('/api/v1/projects/p/device-groups',{signal:undefined})
})
