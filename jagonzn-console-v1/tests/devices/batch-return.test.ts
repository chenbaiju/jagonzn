import {describe,expect,it} from 'vitest'
import {rememberBatchReturn,takeBatchReturn} from '../../src/features/devices/batch-return'
const account='00000000-0000-4000-8000-000000000001',project='00000000-0000-4000-8000-000000000002',device='00000000-0000-4000-8000-000000000003',path='/devices?groupId=x'
function storage(){const values=new Map<string,string>();return{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)}} as Storage}
describe('设备批量关联返回快照',()=>{
 it('同账号项目路径一次性恢复并去重',()=>{
  const s=storage();rememberBatchReturn(account,project,path,[device,device],s)
  expect(takeBatchReturn(account,project,path,Date.now(),s)).toEqual([device])
  expect(takeBatchReturn(account,project,path,Date.now(),s)).toEqual([])
 })
 it('账号项目路径变化或过期不恢复',()=>{
  const s=storage();rememberBatchReturn(account,project,path,[device],s)
  expect(takeBatchReturn('00000000-0000-4000-8000-000000000009',project,path,Date.now(),s)).toEqual([])
  rememberBatchReturn(account,project,path,[device],s)
  expect(takeBatchReturn(account,project,'/devices',Date.now(),s)).toEqual([])
  rememberBatchReturn(account,project,path,[device],s)
  expect(takeBatchReturn(account,project,path,Date.now()+31*60*1000,s)).toEqual([])
 })
 it('无选择或坏存储不写不抛',()=>{
  const s=storage();rememberBatchReturn(account,project,path,[],s)
  expect(takeBatchReturn(account,project,path,Date.now(),s)).toEqual([])
  s.setItem('thingslink:device-batch-return:v1','not-json')
  expect(takeBatchReturn(account,project,path,Date.now(),s)).toEqual([])
 })
})
