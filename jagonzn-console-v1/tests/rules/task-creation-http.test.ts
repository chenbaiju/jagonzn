import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {setAccessToken} from '../../src/core/http'
import {deviceTaskDefinitionApi as transport} from '../../src/features/rules/device-task-definition-api'
import {saveTask} from '../../src/features/rules/api'
const project='10000000-0000-4000-8000-000000000001',device='20000000-0000-4000-8000-000000000001',job='30000000-0000-4000-8000-000000000001'
const body={name:'采样',commandKey:'sample',input:{},scheduleType:'MANUAL' as const,timezone:'Asia/Shanghai',targetType:'EXPLICIT_DEVICES' as const,targetDeviceIds:[device],enabled:false}
const fetcher=vi.fn(async()=>new Response('{}',{headers:{'Content-Type':'application/json'}}))
beforeEach(()=>{fetcher.mockClear();vi.stubGlobal('fetch',fetcher);setAccessToken('closed-fixture')})
afterEach(()=>{vi.unstubAllGlobals();setAccessToken('')})
it('正式582原键创建和只读核对使用各自header，URL无原键且只一次写',async()=>{
 const key='one.original:request-1';await transport.create!(project,device,body,key);await transport.creation!(project,key,new AbortController().signal);expect(fetcher).toHaveBeenCalledTimes(2)
 const [post,lookup]=fetcher.mock.calls as unknown as [URL,RequestInit][];expect(String(post![0])).toBe(`http://localhost:3000/api/v1/projects/${project}/task-jobs`);expect(post![1].method).toBe('POST');expect(new Headers(post![1].headers).get('Idempotency-Key')).toBe(key);expect(JSON.parse(String(post![1].body))).toEqual(body)
 const url=new URL(String(lookup![0]));expect(url.pathname).toBe(`/api/v1/projects/${project}/task-job-creations/by-key`);expect(url.search).toBe('');expect(lookup![1].method).toBe('GET');expect(new Headers(lookup![1].headers).get('Original-Request-Key')).toBe(key);expect(new Headers(lookup![1].headers).has('Idempotency-Key')).toBe(false)
})
it('非法显式原键不降级无键请求，更新也不吞原键',async()=>{
 for(const key of ['', ' bad','a,b','a\nb','a'.repeat(129),'中文']){await expect(transport.create!(project,device,body,key)).rejects.toThrow('原请求键无效');await expect(transport.creation!(project,key,new AbortController().signal)).rejects.toThrow('原请求键无效')}
 expect(()=>saveTask(project,job,{...body,expectedVersion:1},'valid')).toThrow('仅适用于任务创建');expect(fetcher).not.toHaveBeenCalled()
})
it('旧调用无原键仍为原POST，网络失败不自动重放键控创建',async()=>{
 await transport.create!(project,device,body);expect(new Headers((fetcher.mock.calls as unknown as [URL,RequestInit][])[0]![1].headers).has('Idempotency-Key')).toBe(false);fetcher.mockClear();fetcher.mockRejectedValueOnce(new TypeError('lost'));await expect(transport.create!(project,device,body,'stable-key')).rejects.toThrow('请求未完成');expect(fetcher).toHaveBeenCalledTimes(1)
})

it('三目标HTTP消费者只接成熟三类目标，非法集合或ACTIVE/定时在网络前拒绝',async()=>{
 const typeId='40000000-0000-4000-8000-000000000001';await transport.createTargets!(project,{...body,targetType:'DEVICE_TYPE',targetDeviceIds:undefined,targetDeviceTypeId:typeId},'one');expect(JSON.parse(String((fetcher.mock.calls as unknown as [URL,RequestInit][])[0]![1].body))).toMatchObject({targetType:'DEVICE_TYPE',targetDeviceTypeId:typeId});fetcher.mockClear()
 for(const delta of [{targetType:'ALL_DEVICES' as const},{targetDeviceIds:[]},{targetType:'DEVICE_TYPE' as const,targetDeviceTypeId:'bad'},{targetType:'DEVICE_GROUPS' as const,targetGroupIds:[]},{scheduleType:'CRON' as const}])await expect(transport.createTargets!(project,{...body,...delta},'one')).rejects.toThrow()
 expect(fetcher).not.toHaveBeenCalled();await expect(transport.create!(project,device,{...body,targetDeviceIds:[job]},'one')).rejects.toThrow('创建范围无效');expect(fetcher).not.toHaveBeenCalled()
})
