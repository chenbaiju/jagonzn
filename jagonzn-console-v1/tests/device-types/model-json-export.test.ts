import {expect,it,vi} from 'vitest'
const feedback=vi.hoisted(()=>({success:vi.fn(),error:vi.fn()}))
vi.mock('@/ui/copy-feedback',()=>({copySucceeded:feedback.success,copyFailed:feedback.error}))
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {modelSnapshotJsonFile} from '../../src/features/device-types/model-json-export'
import {decodeModelSnapshot} from '../../src/features/device-types/model-version-api'
import ModelJson from '../../src/features/device-types/DeviceTypeModelJson.vue'
import {session} from '../../src/core/session'
import {changeIdentity} from '../../src/core/http'
const project='00000000-0000-4000-8000-000000000001',type='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003'
const version={id,deviceTypeId:type,versionNumber:'1.0.0',changeLevel:'MAJOR',schemaDigest:'a'.repeat(64),digestAlgorithm:'PG_JSONB_TEXT_V1_SHA256',publishedAt:'2026-10-29T01:00:00Z'}
const bytes=new TextEncoder().encode(`{"version":${JSON.stringify(version)},"modelSnapshot":{"properties":{"n":{"dataType":"NUMBER","accessType":"REPORT","minimum":9007199254740993,"defaultValue":0.1234567890123456789,"description":"<script>not executed</script>"}},"events":{},"commands":{}}}`)
it('固定模型JSON导出保留精确数字与版本，不借当前资料且身份或文本不一致拒绝',()=>{
 const snapshot=decodeModelSnapshot(bytes,type,id),file=modelSnapshotJsonFile(snapshot)
 expect(file.content).toContain('9007199254740993');expect(file.content).toContain('0.1234567890123456789');expect(file.content).toContain(id);expect(file.name).toBe(`thingslink-model-${type}-1.0.0.json`)
 expect(()=>modelSnapshotJsonFile({...snapshot,text:snapshot.text.replace('9007199254740993','9007199254740992')})).toThrow('不一致')
})
it('页面读取固定原件后复制和下载无业务写，JSON内容作为文本而不执行',async()=>{
 changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'VIEWER',permissions:['device:read']} as never;session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}]
 const snapshot=decodeModelSnapshot(bytes,type,id),transport={latest:vi.fn().mockResolvedValue(snapshot.version),snapshot:vi.fn().mockResolvedValue(snapshot)},clipboard=vi.fn().mockResolvedValue(undefined),create=vi.fn().mockReturnValue('blob:model'),revoke=vi.fn(),click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 const descriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard');Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:clipboard}});vi.stubGlobal('URL',class extends URL{static createObjectURL=create;static revokeObjectURL=revoke})
 const wrapper=mount(ModelJson,{props:{typeId:type,typeStatus:'PUBLISHED',transport},global:{plugins:[ElementPlus]}})
 try{await flushPromises();expect(wrapper.text()).toContain('0.1234567890123456789');expect(wrapper.find('script').exists()).toBe(false)
  await wrapper.findAll('button').find(node=>node.text()==='复制 JSON')!.trigger('click');await flushPromises();expect(clipboard).toHaveBeenCalledWith(modelSnapshotJsonFile(snapshot).content);expect(feedback.success).toHaveBeenCalledWith('已复制所选固定版本模型 JSON。');expect(wrapper.text()).not.toContain('已复制')
  await wrapper.findAll('button').find(node=>node.text()==='下载 JSON')!.trigger('click');expect(create).toHaveBeenCalledTimes(1);expect(click).toHaveBeenCalledTimes(1);expect(transport.snapshot).toHaveBeenCalledWith(project,type,id,expect.any(AbortSignal),snapshot.version)
  let finish!:()=>void;clipboard.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve}));await wrapper.findAll('button').find(node=>node.text()==='复制 JSON')!.trigger('click');wrapper.unmount();finish();await flushPromises();expect(feedback.success).toHaveBeenCalledTimes(1);expect(feedback.error).not.toHaveBeenCalled()
 }finally{wrapper.unmount();click.mockRestore();if(descriptor)Object.defineProperty(navigator,'clipboard',descriptor);else delete (navigator as unknown as {clipboard?:unknown}).clipboard;vi.unstubAllGlobals();session.user=null;session.projects=[]}
})
