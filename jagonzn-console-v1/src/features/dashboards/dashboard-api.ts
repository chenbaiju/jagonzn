import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'

export type DashboardCatalogItem=Readonly<{
  id:string
  managementName:string
  description:string
  publicAccess:boolean
  publicationRevision:string
  currentVersionId:string|null
  createdAt:string
  updatedAt:string
}>
export type DashboardPage=Readonly<{items:DashboardCatalogItem[];nextCursor:string|null;hasMore:boolean}>
export type DashboardDraft=Readonly<{
  dashboardId:string
  content:Record<string,unknown>
  revision:string
  updatedAt:string
}>
export type DashboardCreation=Readonly<{id:string;createdAt:string}>

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const revision=/^(0|[1-9][0-9]{0,18})$/
const time=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('看板响应不是完整对象')
  return value as Record<string,unknown>
}
function validTime(value:unknown):value is string{return typeof value==='string'&&time.test(value)&&Number.isFinite(Date.parse(value))}
function validName(value:unknown):value is string{return typeof value==='string'&&value.trim().length>0&&value.length<=128}
function validDescription(value:unknown):value is string{
  return typeof value==='string'&&Array.from(value).length<=1000&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value)
}
function decodeCatalogItem(item:unknown):DashboardCatalogItem{
  const row=object(item)
  // 升级窗口内旧后端可能尚未返回新增目录字段；缺省按“未填写/不公开”展示，不伪造已保存值。
  const description=row.description===undefined?'':row.description
  const publicAccess=row.publicAccess===undefined?false:row.publicAccess
  if(typeof row.id!=='string'||!uuid.test(row.id)||!validName(row.managementName)
    ||!validDescription(description)||typeof publicAccess!=='boolean'
    ||typeof row.publicationRevision!=='string'||!revision.test(row.publicationRevision)
    ||!(row.currentVersionId===null||typeof row.currentVersionId==='string'&&uuid.test(row.currentVersionId))||!validTime(row.createdAt)||!validTime(row.updatedAt))throw new Error('看板目录项不完整')
  return Object.freeze({id:row.id,managementName:row.managementName,description,publicAccess,publicationRevision:row.publicationRevision,currentVersionId:row.currentVersionId,createdAt:row.createdAt,updatedAt:row.updatedAt})
}
function page(value:unknown):DashboardPage{
  const raw=object(value)
  if(!Array.isArray(raw.items)||raw.items.length>200||typeof raw.hasMore!=='boolean'||!(raw.nextCursor===null||typeof raw.nextCursor==='string'))throw new Error('看板目录响应不完整')
  if(raw.hasMore&&(typeof raw.nextCursor!=='string'||!raw.nextCursor))throw new Error('看板目录续页游标缺失')
  const items=raw.items.map(decodeCatalogItem)
  return Object.freeze({items,nextCursor:raw.nextCursor as string|null,hasMore:raw.hasMore})
}
function draft(value:unknown):DashboardDraft{
  const raw=object(value)
  if(typeof raw.dashboardId!=='string'||!uuid.test(raw.dashboardId)||typeof raw.revision!=='string'||!revision.test(raw.revision)||!validTime(raw.updatedAt))throw new Error('看板草稿响应不完整')
  const content=object(raw.content)
  return Object.freeze({dashboardId:raw.dashboardId,content,revision:raw.revision,updatedAt:raw.updatedAt})
}
function creation(value:unknown):DashboardCreation{
  const raw=object(value)
  if(typeof raw.id!=='string'||!uuid.test(raw.id)||!validTime(raw.createdAt))throw new Error('看板创建回执不完整')
  return Object.freeze({id:raw.id,createdAt:raw.createdAt})
}
function requireProject(project:string){if(!uuid.test(project))throw new Error('请选择当前项目')}
export const dashboardApi={
  async list(project:string,cursor:string|undefined,signal?:AbortSignal){
    requireProject(project)
    const value=await api<Schema<'CursorPageDashboardCatalogResponse'>>(`/api/v1/projects/${project}/dashboards`,{query:{limit:50,...(cursor?{cursor}:{})},signal})
    return page(value)
  },
  async find(project:string,id:string,signal?:AbortSignal){
    requireProject(project)
    if(!uuid.test(id))throw new Error('看板标识无效')
    return decodeCatalogItem(await api<Schema<'DashboardCatalogResponse'>>(`/api/v1/projects/${project}/dashboards/${id}`,{signal}))
  },
  async draft(project:string,id:string,signal?:AbortSignal){
    requireProject(project)
    if(!uuid.test(id))throw new Error('看板标识无效')
    return draft(await api<Schema<'DashboardDraftResponse'>>(`/api/v1/projects/${project}/dashboards/${id}/draft`,{signal}))
  },
  async create(project:string,name:string,description:string,publicAccess:boolean,content:Record<string,unknown>,key:string,signal?:AbortSignal){
    requireProject(project)
    if(!validName(name))throw new Error('看板名称需为1至128个字符')
    if(!validDescription(description))throw new Error('看板描述最多1000个字符且不能含非法控制字符')
    if(!key)throw new Error('看板创建缺少幂等键')
    return creation(await api<Schema<'DashboardCreationResponse'>>(`/api/v1/projects/${project}/dashboards`,{method:'post',body:{managementName:name,description,publicAccess,content},headers:{'Idempotency-Key':key},signal}))
  },
  async updateMetadata(project:string,id:string,name:string,description:string,publicAccess:boolean,signal?:AbortSignal){
    requireProject(project)
    if(!uuid.test(id))throw new Error('看板标识无效')
    if(!validName(name))throw new Error('看板名称需为1至128个字符')
    if(!validDescription(description))throw new Error('看板描述最多1000个字符且不能含非法控制字符')
    return decodeCatalogItem(await api<Schema<'DashboardCatalogResponse'>>(`/api/v1/projects/${project}/dashboards/${id}/metadata`,{method:'patch',body:{managementName:name,description,publicAccess},signal}))
  },
  async saveDraft(project:string,id:string,expectedRevision:string,content:Record<string,unknown>,signal?:AbortSignal){
    requireProject(project)
    if(!uuid.test(id)||!revision.test(expectedRevision))throw new Error('看板草稿身份或修订号无效')
    return draft(await api<Schema<'DashboardDraftResponse'>>(`/api/v1/projects/${project}/dashboards/${id}/draft`,{method:'put',body:{expectedRevision,content},signal}))
  },
  async publish(project:string,id:string,expectedDraftRevision:string,expectedPublicationRevision:string,signal?:AbortSignal){
    requireProject(project)
    if(!uuid.test(id)||!revision.test(expectedDraftRevision)||!revision.test(expectedPublicationRevision))throw new Error('看板发布前提无效')
    return api<Schema<'DashboardVersionResponse'>>(`/api/v1/projects/${project}/dashboards/${id}/versions`,{method:'post',body:{expectedDraftRevision,expectedPublicationRevision},signal})
  },
  async withdraw(project:string,id:string,expectedPublicationRevision:string,signal?:AbortSignal){
    requireProject(project)
    if(!uuid.test(id)||!revision.test(expectedPublicationRevision))throw new Error('看板撤回前提无效')
    return api<void>(`/api/v1/projects/${project}/dashboards/${id}/withdraw`,{method:'post',body:{expectedPublicationRevision},signal})
  },
  async softDelete(project:string,id:string,expectedPublicationRevision:string,signal?:AbortSignal){
    requireProject(project)
    if(!uuid.test(id)||!revision.test(expectedPublicationRevision))throw new Error('看板删除前提无效')
    return api<void>(`/api/v1/projects/${project}/dashboards/${id}/soft-delete`,{method:'post',body:{expectedPublicationRevision},signal})
  }
}
