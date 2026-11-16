import {beforeEach,describe,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('@/core/http',()=>({api:state.api,IdentityChanged:class IdentityChanged extends Error{},ApiError:class ApiError extends Error{constructor(message:string,public status=0,public code?:number,public traceId?:string,public outcomeUnknown=false){super(message)}}}))
import {ApiError} from '@/core/http'
import {decodeUserAssociations,decodeUserCandidates,prepareAssociationOperation,applyAssociationOperation,recoverAssociationOperation,readUserCandidates} from '@/features/devices/user-associations-api'
const project='11111111-1111-4111-8111-111111111111',device='22222222-2222-4222-8222-222222222222',user='33333333-3333-4333-8333-333333333333',binding='44444444-4444-4444-8444-444444444444'
const bytes=(value:unknown)=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value))
const row=()=>({bindingId:binding,appUserId:user,displayName:null,username:'login',lastVisitedAt:null})
const page=(items:unknown[],nextCursor:string|null=null)=>bytes({items,nextCursor,hasMore:!!nextCursor})
const response=(operation:ReturnType<typeof prepareAssociationOperation>)=>({operationId:operation.operationId,deviceId:device,action:operation.action,targetIds:operation.targetIds,bindingIds:operation.action==='REMOVE'?operation.targetIds:[binding],completedAt:'2026-10-24T01:00:00Z'})
beforeEach(()=>state.api.mockReset())
describe('Source用户关联的独立读取与持久操作字节合同',()=>{
 it('保留原名称/访问空值，拒绝重复身份、坏时间、缺字段和坏UTF8',()=>{
  expect(decodeUserAssociations(page([row()]),50).items[0]).toEqual(row())
  for(const data of [page([row(),row()]),page([{...row(),bindingId:user},{...row()}]),page([{...row(),lastVisitedAt:'2026-02-30T00:00:00Z'}]),page([{...row(),username:5}]),new Uint8Array([255])])expect(()=>decodeUserAssociations(data,50)).toThrow()
  expect(()=>decodeUserAssociations(bytes('{"items":[],"items":[],"nextCursor":null,"hasMore":false}'),50)).toThrow()
 })
 it('候选页完整校验cursor一致性和非空预算，不从名称猜账号',()=>{
  expect(decodeUserCandidates(page([{appUserId:user,displayName:'😀'.repeat(128),username:'actual'}]),50).items[0]!.username).toBe('actual')
  for(const data of [bytes({items:[],nextCursor:'next',hasMore:true}),bytes({items:[],nextCursor:null,hasMore:true}),page([{appUserId:user,displayName:null,username:null}])])expect(()=>decodeUserCandidates(data,50)).toThrow()
 })
 it('完整目标排序并冻结原操作/body/key，超过二百或重复不截断',()=>{
  const op=prepareAssociationOperation(project,device,'REMOVE',[binding,user]);expect(op.targetIds).toEqual([user,binding]);expect(Object.isFrozen(op)).toBe(true);expect(Object.isFrozen(op.targetIds)).toBe(true)
  for(const targets of [[],[user,user.toUpperCase()],Array.from({length:201},(_,i)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`)])expect(()=>prepareAssociationOperation(project,device,'ADD',targets)).toThrow()
  expect(state.api).not.toHaveBeenCalled()
 })
 it('正常批量只POST一次，原件身份与目标必须完全一致',async()=>{
  const op=prepareAssociationOperation(project,device,'ADD',[user]);state.api.mockResolvedValueOnce(bytes(response(op)));expect((await applyAssociationOperation(op,new AbortController().signal)).bindingIds).toEqual([binding]);expect(state.api).toHaveBeenCalledTimes(1)
  expect(state.api.mock.calls[0]![1]).toMatchObject({method:'post',rawBody:op.rawBody,headers:{'Idempotency-Key':op.key}})
 })
 it('公共完成墓碑只GET本账号原操作恢复，绝不第二次POST',async()=>{
  const op=prepareAssociationOperation(project,device,'REMOVE',[binding]);state.api.mockRejectedValueOnce(new ApiError('墓碑',409,10014)).mockResolvedValueOnce(bytes(response(op)))
  await applyAssociationOperation(op,new AbortController().signal);expect(state.api).toHaveBeenCalledTimes(2);expect(state.api.mock.calls[1]![0]).toBe(`/api/v1/projects/${project}/devices/${device}/user-association-operations/${op.operationId}`);expect(state.api.mock.calls[1]![1].method).toBeUndefined()
 })
 it('未知POST而原件尚不可见仍冻结为未知，不误判失败或换key自动重写',async()=>{
  const op=prepareAssociationOperation(project,device,'ADD',[user]);state.api.mockRejectedValueOnce(new ApiError('断连',0,undefined,undefined,true)).mockRejectedValueOnce(new ApiError('未出现',404))
  await expect(applyAssociationOperation(op,new AbortController().signal)).rejects.toMatchObject({outcomeUnknown:true});expect(state.api.mock.calls.filter(([,o])=>o.method==='post')).toHaveLength(1);expect(state.api.mock.calls[0]![1].headers['Idempotency-Key']).toBe(op.key)
 })
 it('坏成功回执按未知处理，读取恢复不能接另一device/action/目标',async()=>{
  const op=prepareAssociationOperation(project,device,'REMOVE',[binding]);state.api.mockResolvedValueOnce(bytes({...response(op),bindingIds:[user]})).mockRejectedValueOnce(new ApiError('未确认',404));await expect(applyAssociationOperation(op,new AbortController().signal)).rejects.toMatchObject({outcomeUnknown:true})
  for(const change of [{deviceId:user},{action:'ADD'},{targetIds:[user]}]){state.api.mockResolvedValueOnce(bytes({...response(op),...change}));await expect(recoverAssociationOperation(op,new AbortController().signal)).rejects.toThrow()}
 })
 it('候选续读保留原query和cursor，不接受服务端返回条件替换原请求',async()=>{
  state.api.mockResolvedValueOnce(page([{appUserId:user,displayName:null,username:'x'}],'next'))
  await readUserCandidates(project,device,' a%_ ','original',new AbortController().signal)
  expect(state.api.mock.calls[0]![1].query).toEqual({query:' a%_ ',cursor:'original',limit:50})
 })
})
