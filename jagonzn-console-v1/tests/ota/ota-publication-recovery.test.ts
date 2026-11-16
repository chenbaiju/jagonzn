import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElSelect} from 'element-plus'
import Publication from '../../src/features/ota/OtaFirmwarePublication.vue'
import {session} from '../../src/core/session'
import {ApiError,changeIdentity} from '../../src/core/http'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=id(1),firmware=id(2),uploadId=id(3),model=id(4),type=id(5)
const fw={id:firmware,projectId:project,deviceTypeId:type,thingModelVersionId:model,firmwareVersion:'1.0.0',productKey:'test',schemaDigestAlgorithm:'PG_JSONB_TEXT_V1_SHA256',schemaDigest:'a'.repeat(64),schemaProfile:'TC_PROPERTY_COMPOSITE_V1',status:'DRAFT',revision:'9007199254740993',createdAt:'2026-10-29T03:00:00Z',cancelledAt:null}
const upload={id:uploadId,projectId:project,firmwareId:firmware,status:'VERIFIED',revision:'1',expectedLength:4,expectedSha256:'b'.repeat(64),failureCode:null,createdAt:'2026-10-29T03:00:00Z',expiresAt:'2026-10-30T03:00:00Z',cancelRequestedAt:null,cleanupCompletedAt:null}
const manifest={contractVersion:'tc-ota-manifest/v1',firmwareId:firmware,firmwareVersion:'1.0.0',trustDomain:'test',deviceTypeId:type,productKey:'test',hardware:{model:'test',boardRevisionMin:0,boardRevisionMax:1},bootloaderMinimumVersion:'1.0',artifactSize:4,artifactSha256:'b'.repeat(64),compression:'NONE',delta:{mode:'NONE'},securityVersion:1,thingModelVersionId:model,thingModelSchemaDigestAlgorithm:fw.schemaDigestAlgorithm,thingModelSchemaDigest:fw.schemaDigest,allowedSourceThingModelVersionIds:[model],requirements:{profile:'TC_PROPERTY_COMPOSITE_V1',minimumRamBytes:0,minimumFlashBytes:0,requiresAbSlots:false,requiresRangeDownload:false,requiresProtectedSecurityCounter:true},signatureProfile:'TC_OTA_ED25519_V1',signingKeyFingerprint:'c'.repeat(64),minimumTrustBundleVersion:1}
const publication={id:id(6),firmwareId:firmware,uploadSessionId:uploadId,status:'PREPARED',revision:'1',failureCode:null,createdAt:'2026-10-29T03:00:00Z',updatedAt:'2026-10-29T03:00:00Z'}
let wrapper:VueWrapper|undefined
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
const button=(name:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===name)!
async function click(name:string){button(name).click();await flushPromises()}
beforeEach(()=>{changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:id(9),currentProjectId:project,projectRole:'OWNER',permissions:['ota:deploy']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})
it('10014及网络失联无ID仅原键GET恢复，404保持锁且取回后只读原ID',async()=>{
 for(const cause of [new ApiError('不可回放',409,10014),new TypeError('网络失联')]){
  state.api.mockReset().mockRejectedValueOnce(cause).mockRejectedValueOnce(new ApiError('无映射',404)).mockResolvedValueOnce(bytes(publication));
  if(cause instanceof ApiError)state.api.mockResolvedValueOnce(bytes({...publication,status:'REJECTED',revision:'3'}));else state.api.mockRejectedValueOnce(new ApiError('读取被拒绝',403));
  wrapper=mount(Publication,{props:{firmware:fw,uploads:[upload]},global:{plugins:[ElementPlus]},attachTo:document.body});wrapper.findComponent(ElSelect).vm.$emit('update:model-value',uploadId);await wrapper.find('textarea[aria-label="OTA发布清单"]').setValue(JSON.stringify(manifest));await click('提交发布');
  const post=state.api.mock.calls[0]!,key=post[1].headers['Idempotency-Key'],raw=post[1].rawBody;expect(post[1].method).toBe('post');expect(raw).toContain(JSON.stringify(manifest));expect(wrapper.text()).toContain(key);expect(button('提交发布')).toBeUndefined();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);
  await click('按原请求键读取发布记录');expect(wrapper.text()).toContain('原结果仍未知');expect(wrapper.text()).toContain(key);expect(wrapper.emitted('changed')).toBeUndefined();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);
  await click('按原请求键读取发布记录');expect(wrapper.text()).toContain('PREPARED');expect(wrapper.text()).toContain(key);expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);
  for(const [path,options] of state.api.mock.calls.slice(1,3)){expect(path).toBe(`/api/v1/projects/${project}/ota/firmwares/${firmware}/publications/by-key`);expect(options.headers).toEqual({'Original-Request-Key':key});expect(options.method).toBeUndefined();expect(options.rawBody).toBeUndefined()}
  {const prior=state.api.mock.calls.slice();state.api.mockReset().mockResolvedValue(bytes({...publication,status:'COMMITTED'}));state.api.mock.calls.push(...prior)}await click('读取原发布记录');expect(state.api.mock.calls.at(-1)?.[0]).toBe(`/api/v1/projects/${project}/ota/firmwares/${firmware}/publications/${publication.id}`);expect(state.api.mock.calls.filter(([,options])=>options.method==='post')).toHaveLength(1);expect(post[1].rawBody).toBe(raw);expect(wrapper.emitted('changed')).toHaveLength(1);await vi.waitFor(()=>expect(wrapper!.emitted('locked')?.at(-1)).toEqual([false]));wrapper.unmount();wrapper=undefined;document.body.innerHTML=''
 }
})
