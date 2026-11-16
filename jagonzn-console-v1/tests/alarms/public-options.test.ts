import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Panel from '../../src/features/alarms/NotificationGroupOptionsPanel.vue'
import { publicOrdinaryGroupOptions } from '../../src/features/alarms/notification-group-contract'
import { alarmApi } from '../../src/features/alarms/api'
import { session } from '../../src/core/session'
import { api, ApiError, changeIdentity } from '../../src/core/http'
import type { Schema, paths } from '../../src/core/contracts'
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:vi.fn()}))
const groupId='11111111-1111-4111-8111-111111111111',accountId='22222222-2222-4222-8222-222222222222'
const member=()=>({groupId,notificationType:'MEMBER',configurationVersion:4,members:[{accountId,channels:['EMAIL','WECHAT','SMS','VOICE']}],maskedNumbers:[]} satisfies Schema<'ConsoleNotificationGroupPublicOptionsResponse'>)
let wrapper:ReturnType<typeof mount>|undefined
function data(value:Schema<'ConsoleNotificationGroupPublicOptionsResponse'>=member(),kind:string=value.notificationType,version=4){
 vi.mocked(api).mockImplementation(async path=>{
  if(path.endsWith('/configuration'))return {groupId,configured:true,notificationType:kind,configurationVersion:version}
  if(path.endsWith('/configuration/options'))return value
  throw new ApiError('未配置夹具',503)
 })
}
async function setup(role='VIEWER'){
 session.user={currentProjectId:'p',projectRole:role as 'VIEWER',permissions:['alarm:read',...(['OWNER','ADMIN'].includes(role)?['alarm:manage']:[])]}
 wrapper=mount(Panel,{props:{groupId},global:{plugins:[ElementPlus]}});await flushPromises();return wrapper
}
afterEach(()=>{wrapper?.unmount();wrapper=undefined;vi.resetAllMocks();session.user=null;changeIdentity()})
describe('正式485普通公读合同与详情',()=>{
 it('使用正式路径和Schema且保留abort，不调用管理原文端点',async()=>{
  const path='/api/v1/projects/{projectId}/console/alarm-notification-groups/{groupId}/configuration/options' satisfies keyof paths
  expect(path).toContain('/configuration/options');const signal=new AbortController().signal;vi.mocked(api).mockResolvedValue(member());expect(await alarmApi.groupPublicOptions('p',groupId,signal)).toEqual(member());expect(api).toHaveBeenCalledExactlyOnceWith(`/api/v1/projects/p/console/alarm-notification-groups/${groupId}/configuration/options`,{signal})
 })
 it('公读白名单丢弃额外原文资料，不从未知字段渲染秘密或联系方式',()=>{
  const result=publicOrdinaryGroupOptions({...member(),numbers:['13812345678'],secret:'do-not-render',members:[{accountId,channels:['EMAIL'],email:'private@example.invalid'}]},groupId)
  expect(result).toEqual({...member(),members:[{accountId,channels:['EMAIL']}]});expect(JSON.stringify(result)).not.toContain('private');expect(JSON.stringify(result)).not.toContain('13812345678')
 })
 it('拒绝跨组、负版本、重复成员/渠道、缺字段、秘密方式及原号码',()=>{
  const base=member();for(const invalid of [{...base,groupId:'other'},{...base,configurationVersion:-1},{...base,configurationVersion:2147483648},{...base,members:[...base.members,...base.members]},{...base,members:[{accountId,channels:['EMAIL','EMAIL']}]},{...base,members:undefined},{...base,notificationType:'WEBHOOK'},{...base,notificationType:'SMS',members:[],maskedNumbers:['13812345678']},{...base,notificationType:'VOICE',members:[],maskedNumbers:[]}])expect(()=>publicOrdinaryGroupOptions(invalid,groupId)).toThrow()
 })
 it('脱敏碰撞不去重，11条短信与多电话旧配置完整保留',()=>{
  const value={...member(),notificationType:'SMS',members:[],maskedNumbers:Array(11).fill('+86138****5678')};expect(publicOrdinaryGroupOptions(value,groupId).maskedNumbers).toHaveLength(11);expect(publicOrdinaryGroupOptions({...value,notificationType:'VOICE',maskedNumbers:['1****5','123****7890']},groupId).maskedNumbers).toEqual(['1****5','123****7890'])
 })
 it.each(['OWNER','ADMIN','OPERATOR','VIEWER'])('%s读取已保存账号与四渠道，只读勾选不代表当前资格',async role=>{
  data();const w=await setup(role);expect(w.text()).toContain(accountId);expect(w.findAll('input[type=checkbox]')).toHaveLength(4);expect(w.findAll('input[type=checkbox]').every(input=>(input.element as HTMLInputElement).checked&&(input.element as HTMLInputElement).disabled)).toBe(true);expect(w.findAll('button').some(b=>b.text()==='编辑')).toBe(['OWNER','ADMIN'].includes(role));expect(vi.mocked(api).mock.calls.every(([path])=>!path.endsWith('/edit')&&!path.endsWith('/members'))).toBe(true)
 })
 it('短信全部11条在只读详情展示，保留脱敏碰撞',async()=>{
  data({...member(),notificationType:'SMS',members:[],maskedNumbers:Array(11).fill('+86138****5678')});const w=await setup();expect(w.find('.email-lines').text().split('\n')).toHaveLength(11);expect(w.text()).toContain('接收短信号码');expect(w.text()).not.toContain('13812345678')
 })
 it('电话旧多号码不截断且不请求管理原文',async()=>{
  data({...member(),notificationType:'VOICE',members:[],maskedNumbers:['1****5','123****7890']});const w=await setup();expect(w.find('.email-lines').text()).toBe('1****5\n123****7890');expect(api).toHaveBeenCalledTimes(2)
 })
 it.each([['SMS',4],['MEMBER',5]] as const)('分离GET的方式或版本不一致%s/%s时不展示不开放编辑',async(kind,version)=>{
  data(member(),kind,version);const w=await setup('ADMIN');expect(w.text()).toContain('通知方式已变更');expect(w.text()).not.toContain(accountId);expect(w.findAll('button').some(b=>b.text()==='编辑')).toBe(false)
 })
 it('公读403不回退管理原文或空成功',async()=>{
  data();const handler=vi.mocked(api).getMockImplementation()!;vi.mocked(api).mockImplementation(async(path,options)=>{if(path.endsWith('/options'))throw new ApiError('无权读取',403);return handler(path,options)});const w=await setup('ADMIN');expect(w.text()).toContain('无权读取');expect(w.text()).not.toContain(accountId);expect(w.findAll('button').some(b=>b.text()==='编辑')).toBe(false);expect(api).toHaveBeenCalledTimes(2)
 })
 it('项目切换清空已读内容并丢弃旧项目迟到公读结果',async()=>{
  let done!:(value:unknown)=>void;data();const handler=vi.mocked(api).getMockImplementation()!;vi.mocked(api).mockImplementation(async(path,options)=>path.includes('/projects/p/')&&path.endsWith('/options')?new Promise(resolve=>{done=resolve}):path.includes('/projects/next/')?Promise.reject(new ApiError('新项目无此组',404)):handler(path,options));const w=await setup();session.user={...session.user!,currentProjectId:'next'};await flushPromises();done(member());await flushPromises();expect(w.text()).not.toContain(accountId);expect(w.findAll('input[type=checkbox]')).toHaveLength(0)
 })
 it('旧未映射组保持真null，不调用普通公读或推断为EMAIL',async()=>{
  vi.mocked(api).mockImplementation(async path=>path.endsWith('/configuration')?{groupId,configured:false,notificationType:null,configurationVersion:null}:{activeEmails:[],recipients:[]});const w=await setup();expect(w.text()).toContain('—');expect(w.text()).not.toContain('邮箱通知');expect(vi.mocked(api).mock.calls.some(([path])=>path.endsWith('/configuration/options'))).toBe(false)
 })
 it('明确秘密方式仅显示真实方式，不误调普通公读',async()=>{
  data(member(),'WEBHOOK');const w=await setup();expect(w.text()).toContain('Webhook');expect(api).toHaveBeenCalledTimes(1);expect(w.findAll('input')).toHaveLength(0)
 })
 it.each(['OWNER','ADMIN','OPERATOR','VIEWER'])('%s秘密详情不预取原URL，仅管理者点击编辑后读取',async role=>{
  data(member(),'WEBHOOK');const previous=vi.mocked(api).getMockImplementation()!;vi.mocked(api).mockImplementation(async(path,options)=>path.endsWith('/secret/edit')?{groupId,notificationType:'WEBHOOK',configurationVersion:4,url:'https://example.invalid/notify?key=fixture',headers:[]}:previous(path,options));const w=await setup(role);expect(api).toHaveBeenCalledTimes(1);expect(w.text()).not.toContain('key=fixture');const edit=w.findAll('button').find(button=>button.text()==='编辑');expect(!!edit).toBe(['OWNER','ADMIN'].includes(role));if(edit){await edit.trigger('click');await flushPromises();expect(api).toHaveBeenCalledTimes(2);expect(w.find('input[placeholder="https://"]').element).toHaveProperty('value','https://example.invalid/notify?key=fixture')}
 })
})
