import {beforeEach,describe,expect,it,vi} from 'vitest'
import {dashboardApi} from '../../src/features/dashboards/dashboard-api'

const mock=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:mock.api}))
const project='00000000-0000-4000-8000-000000000001',dashboard='00000000-0000-4000-8000-000000000002'
const catalog={id:dashboard,managementName:'设备总览',description:'说明',publicAccess:false,publicationRevision:'0',currentVersionId:null,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'}
const draft={dashboardId:dashboard,content:{schemaVersion:'tc.dashboard/v1'},revision:'3',updatedAt:'2026-01-01T00:00:00Z'}
beforeEach(()=>mock.api.mockReset())
describe('看板管理合同消费',()=>{
 it('目录使用游标页并解码未删除项',async()=>{
  mock.api.mockResolvedValueOnce({items:[catalog],nextCursor:'next',hasMore:true})
  const page=await dashboardApi.list(project,undefined)
  expect(mock.api).toHaveBeenCalledWith(`/api/v1/projects/${project}/dashboards`,{query:{limit:50},signal:undefined})
  expect(page.items).toEqual([catalog]);expect(page.hasMore).toBe(true);expect(page.nextCursor).toBe('next')
 })
 it('创建使用幂等键并解码201回执',async()=>{
  mock.api.mockResolvedValueOnce({id:dashboard,createdAt:'2026-01-01T00:00:00Z'})
  await dashboardApi.create(project,'设备总览','说明',false,{schemaVersion:'tc.dashboard/v1'},'key-1')
  expect(mock.api).toHaveBeenCalledWith(`/api/v1/projects/${project}/dashboards`,{method:'post',body:{managementName:'设备总览',description:'说明',publicAccess:false,content:{schemaVersion:'tc.dashboard/v1'}},headers:{'Idempotency-Key':'key-1'},signal:undefined})
 })
 it('设置页一次保存名称、描述与公开开关',async()=>{
  mock.api.mockResolvedValueOnce({...catalog,managementName:'新名称',description:'新说明',publicAccess:true})
  const updated=await dashboardApi.updateMetadata(project,dashboard,'新名称','新说明',true)
  expect(mock.api).toHaveBeenCalledWith(`/api/v1/projects/${project}/dashboards/${dashboard}/metadata`,{method:'patch',body:{managementName:'新名称',description:'新说明',publicAccess:true},signal:undefined})
  expect(updated.publicAccess).toBe(true);expect(updated.description).toBe('新说明')
 })
 it('草稿读取和保存保留规范revision原文',async()=>{
  mock.api.mockResolvedValueOnce(draft)
  expect(await dashboardApi.draft(project,dashboard)).toEqual(draft)
  mock.api.mockResolvedValueOnce({...draft,revision:'4'})
  const saved=await dashboardApi.saveDraft(project,dashboard,'3',draft.content)
  expect(mock.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/dashboards/${dashboard}/draft`,{method:'put',body:{expectedRevision:'3',content:draft.content},signal:undefined})
  expect(saved.revision).toBe('4')
 })
 it('软删除使用发布修订号',async()=>{
  mock.api.mockResolvedValueOnce(undefined)
  await dashboardApi.softDelete(project,dashboard,'2')
  expect(mock.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/dashboards/${dashboard}/soft-delete`,{method:'post',body:{expectedPublicationRevision:'2'},signal:undefined})
 })
 it('升级窗口旧目录缺少新字段时按未填写/不公开兼容',async()=>{
  mock.api.mockResolvedValueOnce({items:[{...catalog,description:undefined,publicAccess:undefined}],nextCursor:null,hasMore:false})
  const page=await dashboardApi.list(project,undefined)
  expect(page.items[0]).toMatchObject({description:'',publicAccess:false})
 })
 it('不完整目录项或草稿拒绝，不把坏回执当可展示数据',async()=>{
  mock.api.mockResolvedValueOnce({items:[{id:dashboard}],nextCursor:null,hasMore:false})
  await expect(dashboardApi.list(project,undefined)).rejects.toThrow('看板目录项不完整')
  mock.api.mockResolvedValueOnce({dashboardId:dashboard,content:[],revision:'0',updatedAt:'2026-01-01T00:00:00Z'})
  await expect(dashboardApi.draft(project,dashboard)).rejects.toThrow('看板响应不是完整对象')
 })
})
