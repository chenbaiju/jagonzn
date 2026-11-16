import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { taskRelatedDevicesTransport } from '../../src/features/rules/task-related-devices-transport'
import { getConsoleTaskDeviceSchedules, setConsoleTaskDeviceSchedule } from '../../src/features/rules/api'
import { changeIdentity } from '../../src/core/http'
import { session } from '../../src/core/session'
const job='00000000-0000-4000-8000-000000000099',device='00000000-0000-4000-8000-000000000044'
const row={deviceId:device,name:'设备甲',allowed:false,version:3,lastRunAt:null},page={items:[row],hasMore:false,nextCursor:null,definitionVersion:9}
const control={deviceId:device,allowed:true,version:4,definitionVersion:9}
const fetcher=vi.fn(),response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
const signal=()=>new AbortController().signal
function request(index=0){const [url,init]=fetcher.mock.calls[index];return {url:new URL(url,'http://fixture.test'),init}}
beforeEach(()=>{changeIdentity('fixture-token-never-sent');session.user={currentProjectId:'p',permissions:['task:read','task:manage','task:run','device:read']};fetcher.mockReset();vi.stubGlobal('fetch',fetcher)})
afterEach(()=>{vi.unstubAllGlobals();session.user=null;changeIdentity()})
it('正式GET使用保存范围及独立父定义CAS、24行和真实opaque游标，不写虚拟默认值',async()=>{
 fetcher.mockResolvedValue(response({...page,hasMore:true,nextCursor:'opaque.next'}));const abort=new AbortController();expect(await taskRelatedDevicesTransport.readRows('p',job,9,'opaque.previous',abort.signal)).toEqual({rows:[{key:device,label:'设备甲',href:'/devices/'+device,scheduled:false,lastRunAt:null,writeToken:3}],definitionToken:9,continuation:'opaque.next'});expect(request().url.pathname).toBe(`/api/v1/projects/p/task-jobs/${job}/device-schedules`);expect(Object.fromEntries(request().url.searchParams)).toEqual({expectedDefinitionVersion:'9',cursor:'opaque.previous',limit:'24'});expect(request().init.method).toBe('GET');expect(request().init.body).toBeUndefined();expect(request().init.headers.get('Authorization')).toBe('Bearer fixture-token-never-sent');abort.abort();expect(request().init.signal.aborted).toBe(true)
})
it('正式PUT仅三个必填值；手动只提交冻结子集，永不以空集合回退全体',async()=>{
 fetcher.mockResolvedValueOnce(response(control)).mockResolvedValueOnce(response({id:'accepted'},202));expect(await taskRelatedDevicesTransport.changeSchedule('p',job,device,9,3,true)).toEqual({key:device,scheduled:true,writeToken:4,definitionToken:9});expect(request().url.pathname).toBe(`/api/v1/projects/p/task-jobs/${job}/device-schedules/${device}`);expect(JSON.parse(request().init.body)).toEqual({allowed:true,expectedVersion:3,expectedDefinitionVersion:9});await taskRelatedDevicesTransport.runRows('p',job,9,[device]);expect(request(1).url.searchParams.get('requireEnabled')).toBe('true');expect(JSON.parse(request(1).init.body)).toEqual({deviceIds:[device],expectedVersion:9});await expect(taskRelatedDevicesTransport.runRows('p',job,9,[])).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(2)
})
it('缺少设备菜单权限只去链接，最后运行沿正式字段且不读取受理时刻或epoch',async()=>{
 session.user={...session.user!,permissions:['task:read']};fetcher.mockResolvedValue(response({...page,items:[{...row,lastRunAt:'2026-10-24T00:00:00Z',acceptedAt:'2026-10-24T00:00:01Z',epoch:77}]}));const value=await taskRelatedDevicesTransport.readRows('p',job,9,undefined,signal());expect(value.rows[0]).toEqual({key:device,label:'设备甲',href:undefined,scheduled:false,lastRunAt:'2026-10-24T00:00:00Z',writeToken:3});expect(value.rows[0]).not.toHaveProperty('acceptedAt')
})
it.each([null,{}, {...page,items:null},{...page,items:Array(25).fill(row)},{...page,hasMore:true},{...page,hasMore:null},{...page,items:[],hasMore:true,nextCursor:'next'},{...page,nextCursor:'next'},{...page,hasMore:true,nextCursor:123},{...page,hasMore:true,nextCursor:'x'.repeat(8193)},{...page,definitionVersion:8},{...page,definitionVersion:Number.MAX_SAFE_INTEGER},{...page,items:[row,row]},{...page,items:[{...row,deviceId:'bad'}]},{...page,items:[{...row,name:' '}]},{...page,items:[{...row,allowed:null}]},{...page,items:[{...row,lastRunAt:undefined}]},{...page,items:[{...row,lastRunAt:'not-a-date'}]},{...page,items:[{...row,lastRunAt:'2026-11-02T01:00:00'}]},{...page,items:[{...row,version:0}]},{...page,items:[{...row,version:Number.MAX_SAFE_INTEGER}]}])('坏正式页整体拒绝，不当成默认允许或空范围 %#',async(value)=>{
 fetcher.mockResolvedValue(response(value));await expect(taskRelatedDevicesTransport.readRows('p',job,9,undefined,signal())).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1)
})
it.each([null,{}, {...control,deviceId:'bad'},{...control,deviceId:'00000000-0000-4000-8000-000000000045'},{...control,allowed:null},{...control,allowed:false},{...control,version:3},{...control,version:Number.MAX_SAFE_INTEGER},{...control,definitionVersion:8}])('坏正式写响应整体拒绝，状态机保留未知锁 %#',async(value)=>{
 fetcher.mockResolvedValue(response(value));await expect(taskRelatedDevicesTransport.changeSchedule('p',job,device,9,3,true)).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1)
})
it('非法CAS、布尔值和游标在网络前拒绝，8192边界允许',async()=>{
 expect(()=>getConsoleTaskDeviceSchedules('p',job,0)).toThrow();expect(()=>getConsoleTaskDeviceSchedules('p',job,9,'')).toThrow();expect(()=>getConsoleTaskDeviceSchedules('p',job,9,'x'.repeat(8193))).toThrow();expect(()=>setConsoleTaskDeviceSchedule('p',job,device,9,Number.MAX_SAFE_INTEGER,true)).toThrow();expect(()=>setConsoleTaskDeviceSchedule('p',job,device,9,3,'true' as unknown as boolean)).toThrow();expect(fetcher).not.toHaveBeenCalled();fetcher.mockResolvedValue(response(page));await getConsoleTaskDeviceSchedules('p',job,9,'x'.repeat(8192));expect(request().url.searchParams.get('cursor')).toHaveLength(8192)
})
it('409及网络中断各一次，不改用全任务run或其它偏好接口',async()=>{
 fetcher.mockResolvedValueOnce(response({message:'状态变化'},409));await expect(taskRelatedDevicesTransport.changeSchedule('p',job,device,9,3,true)).rejects.toMatchObject({status:409});expect(fetcher).toHaveBeenCalledTimes(1);fetcher.mockReset().mockRejectedValueOnce(new TypeError('offline'));await expect(taskRelatedDevicesTransport.runRows('p',job,9,[device])).rejects.toMatchObject({outcomeUnknown:true,status:0});expect(fetcher).toHaveBeenCalledTimes(1)
})
