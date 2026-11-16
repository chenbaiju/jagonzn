import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Bulk from '../../src/features/device-groups/DeviceGroupBulk.vue'
import {decodeGroup} from '../../src/features/device-groups/device-group-api'
import {groupExportQuery,decodeGroupMemberExport,groupMemberExportCsv,type GroupExportTransport,type GroupMemberExport} from '../../src/features/device-groups/group-member-export'
import {session} from '../../src/core/session'
import {ApiError,changeIdentity} from '../../src/core/http'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=id(100),root=id(1),type=id(300)
const group=()=>decodeGroup({id:root,name:'园区',type:'STATIC',rule:null,description:null,createdAt:'2026-10-29T00:00:00Z',parentId:null,color:null,tags:{},sortOrder:0,revision:'0'})
const item=(n:number)=>({deviceId:id(n+10),name:n===1?' =SUM(1,2)':'设备',referenceKey:n===1?'business-1':null,deviceTypeId:type,deviceTypeName:'类型',status:'INACTIVE',enabled:true,lastDataReportAt:null})
const payload=()=>({groupId:root,groupName:'园区',scope:'SUBTREE',keyword:'设备',snapshotAt:'2026-10-29T00:00:00Z',total:'2',maximumRows:500,items:[item(1),item(2)]})
let wrapper:VueWrapper|undefined
beforeEach(()=>{changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'VIEWER',permissions:['device:read']} as never;session.projects=[{id:project,myRole:'VIEWER',status:'ARCHIVED'}]})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks();vi.unstubAllGlobals()})
it('完整条件单快照精确核范围/关键词/数量，公开CSV与413零部分文件且晚回不跨条件下载',async()=>{
 const query=groupExportQuery(project,root,'SUBTREE',' 设备 '),snapshot=decodeGroupMemberExport(payload(),query),csv=groupMemberExportCsv(snapshot,query);expect(csv.text).toContain('数据库快照时间');expect(csv.text).toContain('business-1');expect(csv.text).toContain('"\' =SUM(1,2)"');expect(csv.filename).toContain('完整条件-2台')
 expect(()=>decodeGroupMemberExport({...payload(),groupId:id(2)},query)).toThrow();expect(()=>decodeGroupMemberExport({...payload(),scope:'DIRECT'},query)).toThrow();expect(()=>decodeGroupMemberExport({...payload(),keyword:'另条件'},query)).toThrow();expect(()=>decodeGroupMemberExport({...payload(),total:'3'},query)).toThrow();expect(()=>decodeGroupMemberExport({...payload(),total:'501'},query)).toThrow();expect(()=>decodeGroupMemberExport({...payload(),items:[item(1),item(1)]},query)).toThrow();expect(()=>decodeGroupMemberExport({...payload(),items:[{...item(1),deviceSecret:'not-allowed'},item(2)]},query)).toThrow()
 const empty=decodeGroupMemberExport({...payload(),keyword:null,total:'0',items:[]},groupExportQuery(project,root,'SUBTREE',''));expect(empty.items).toHaveLength(0)
 const create=vi.fn(()=> 'blob:complete-group'),revoke=vi.fn(),OriginalURL=URL;vi.stubGlobal('URL',class extends OriginalURL{static createObjectURL=create;static revokeObjectURL=revoke});const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{}),transport=vi.fn<GroupExportTransport>().mockResolvedValue(snapshot)
 wrapper=mount(Bulk,{props:{group:group(),scope:'SUBTREE',keyword:' 设备 ',exportTransport:transport},attachTo:document.body,global:{plugins:[ElementPlus]}})
 const exportButton=()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('导出当前完整条件'))!
 exportButton().click();await flushPromises();expect(transport).toHaveBeenCalledTimes(1);expect(transport.mock.calls[0]![0]).toEqual(query);expect(create).toHaveBeenCalledTimes(1);expect(click).toHaveBeenCalledTimes(1);expect(revoke).toHaveBeenCalledWith('blob:complete-group')
 transport.mockRejectedValueOnce(new ApiError('当前范围超过500台，未生成部分文件',413,10013));exportButton().click();await flushPromises();expect(document.querySelector('.el-message--error')?.textContent).toContain('导出未生成');expect(create).toHaveBeenCalledTimes(1)
 let done!:(value:GroupMemberExport)=>void;transport.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve}));exportButton().click();await flushPromises();const signal=transport.mock.calls[2]![1];await wrapper.setProps({keyword:'其它'});expect(signal.aborted).toBe(true);done(snapshot);await flushPromises();expect(create).toHaveBeenCalledTimes(1);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(transport).toHaveBeenCalledTimes(3)
})
