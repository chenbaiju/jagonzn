import {webcrypto} from 'node:crypto'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,DOMWrapper} from '@vue/test-utils'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import ElementPlus from 'element-plus'
import Directory from '../../src/features/devices/DeviceQueryDirectory.vue'
import {decodeSavedPropertyQuery,type SavedPropertyQuery,type SavedPropertyQueryTransport} from '../../src/features/devices/device-saved-property-query-api'
import {parseDashboardRuntimeResponse} from '@things-link/client-contracts/dashboard/v1'
import {session} from '../../src/core/session'
import * as http from '../../src/core/http'
const project='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000300'
let wrapper:ReturnType<typeof mount>|undefined
async function settle(){await flushPromises();await new Promise(resolve=>setTimeout(resolve,5));await flushPromises()}
function button(text:string){const node=[...document.querySelectorAll<HTMLButtonElement>('button')].find(row=>row.textContent?.trim()===text);if(!node)throw new Error('缺少按钮：'+text);return new DOMWrapper(node)}
async function row(recordId=id,name='正式保存条件',expression='n > 1'):Promise<SavedPropertyQuery>{const digest=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(expression))).toString('hex');return decodeSavedPropertyQuery(parseDashboardRuntimeResponse(new TextEncoder().encode(JSON.stringify({id:recordId,projectId:project,revision:'1',currentRevision:'1',name,grammarVersion:'DEVICE_PROPERTY_QUERY_V1',expression,expressionDigest:digest,createdAt:'2026-10-29T00:00:00Z',versionCreatedAt:'2026-10-29T00:00:00Z',deleted:false}))),project)}
async function setup(saved:SavedPropertyQueryTransport){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/device-queries',component:Directory,props:{savedTransport:saved,queryTransport:{validate:vi.fn(),execute:vi.fn()}}},{path:'/devices',component:{template:'<p>设备目录</p>'}}]});await router.push('/device-queries');await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await settle();return router}
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);http.changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks();vi.unstubAllGlobals()})
it('独立查询目录真实列出原件并按ID打开，版本入口独立读取历史',async()=>{
 const savedRow=await row(),saved={list:vi.fn<SavedPropertyQueryTransport['list']>().mockResolvedValue([savedRow]),versions:vi.fn<SavedPropertyQueryTransport['versions']>().mockResolvedValue([savedRow]),write:vi.fn<SavedPropertyQueryTransport['write']>(),recover:vi.fn<SavedPropertyQueryTransport['recover']>(),execute:vi.fn<SavedPropertyQueryTransport['execute']>()}
 await setup(saved)
 expect(wrapper!.text()).toContain('正式保存条件')
 await button('版本').trigger('click');await settle()
 expect(saved.versions).toHaveBeenCalledWith(project,id,expect.any(AbortSignal))
 expect(document.body.textContent).toContain('查询版本');expect(document.body.textContent).toContain('保存条件')
 await button('关闭').trigger('click');await settle()
 await button('打开查询').trigger('click');await settle()
 const input=new DOMWrapper(document.querySelector<HTMLTextAreaElement>('textarea[aria-label="设备查询条件"]')!)
 expect(input.element.value).toBe('n > 1');expect(saved.write).not.toHaveBeenCalled()
})
it('目录删除按原版本提交并回读，取消零写',async()=>{
 const savedRow=await row(),saved={list:vi.fn<SavedPropertyQueryTransport['list']>().mockResolvedValue([savedRow]),versions:vi.fn<SavedPropertyQueryTransport['versions']>().mockResolvedValue([savedRow]),write:vi.fn<SavedPropertyQueryTransport['write']>().mockResolvedValue(undefined),recover:vi.fn<SavedPropertyQueryTransport['recover']>().mockResolvedValue(savedRow),execute:vi.fn<SavedPropertyQueryTransport['execute']>()}
 await setup(saved)
 await button('删除').trigger('click');await settle();await button('取消').trigger('click');await settle()
 expect(saved.write).not.toHaveBeenCalled()
 await button('删除').trigger('click');await settle();await button('确认删除').trigger('click');await settle()
 expect(saved.write).toHaveBeenCalledTimes(1)
 const intent=saved.write.mock.calls[0]![0]
 expect(intent).toMatchObject({kind:'DELETE',project,id,expectedRevision:'1'})
 expect(saved.recover).toHaveBeenCalledWith(intent,expect.any(AbortSignal))
})
