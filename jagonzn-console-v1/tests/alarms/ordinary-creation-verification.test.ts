import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOrdinaryGroupAndVerify } from '../../src/features/alarms/ordinary-group-creation'
import { alarmApi } from '../../src/features/alarms/api'
import { ApiError, changeIdentity, identityEpoch, IdentityChanged } from '../../src/core/http'
import { session } from '../../src/core/session'
import { emptyNotificationGroupDraft, type NotificationGroupMode } from '../../src/features/alarms/notification-group-draft'
import type { Group } from '../../src/features/alarms/model'
const project='00000000-0000-0000-0000-000000000002',group='00000000-0000-0000-0000-000000000004',account='00000000-0000-0000-0000-000000000003'
const row:Group={id:group,name:'值班通知',description:'记录',enabled:true,version:0,createdAt:'2026-10-24T00:00:00Z',updatedAt:'2026-10-24T00:00:00Z'}
const members=[{accountId:account,email:'member@example.invalid',availableChannels:['EMAIL' as const]}]
const context=()=>({projectId:project,identityEpoch:identityEpoch()})
const draft=(mode:NotificationGroupMode='sms')=>({...emptyNotificationGroupDraft(mode),name:' 值班通知 ',description:' 记录\n',memberChannels:{[account]:['EMAIL' as const]},emailsText:'a@example.invalid\nb@example.invalid',smsText:'13812345678\n13812345678',voiceNumber:'0755-12345678'})
beforeEach(()=>{
 session.user={accountId:account,currentProjectId:project,displayName:'值班员',projectRole:'OWNER',permissions:['alarm:read','alarm:manage']}
 vi.spyOn(alarmApi,'createOrdinaryGroup').mockResolvedValue({...row});vi.spyOn(alarmApi,'group').mockResolvedValue({...row})
 vi.spyOn(alarmApi,'groupConfiguration').mockResolvedValue({groupId:group,configured:true,notificationType:'SMS',configurationVersion:0})
 vi.spyOn(alarmApi,'groupOrdinaryOptions').mockResolvedValue({notificationType:'SMS',version:0,members:[],numbers:['+8613812345678']})
 vi.spyOn(alarmApi,'groupEmailEditOptions').mockResolvedValue([{id:'r1',email:'b@example.invalid',enabled:true,version:0},{id:'r2',email:'a@example.invalid',enabled:true,version:0}])
})
afterEach(()=>{session.user=null;changeIdentity();vi.restoreAllMocks()})
describe('正式普通创建的写后权威核对，尚不注册完整八方式路由',()=>{
 it.each(['member','email','sms','voice']as const)('%s创建后逐项回读，通道/号码完整且不改变草稿',async mode=>{
  const options={notificationType:mode.toUpperCase()as'MEMBER'|'EMAIL'|'SMS'|'VOICE',version:0,members:mode==='member'?[{accountId:account,channels:['EMAIL' as const]}]:[],numbers:mode==='sms'?['+8613812345678']:mode==='voice'?['075512345678']:[]}
  vi.mocked(alarmApi.groupConfiguration).mockResolvedValue({groupId:group,configured:true,notificationType:options.notificationType,configurationVersion:0});vi.mocked(alarmApi.groupOrdinaryOptions).mockResolvedValue(options)
  const value=draft(mode);expect(await createOrdinaryGroupAndVerify(context(),value,members)).toEqual(row);expect(value.smsText).toBe('13812345678\n13812345678');expect(alarmApi.createOrdinaryGroup).toHaveBeenCalledTimes(1)
  const calls=[alarmApi.createOrdinaryGroup,alarmApi.group,alarmApi.groupConfiguration,alarmApi.groupOrdinaryOptions].map(call=>vi.mocked(call).mock.invocationCallOrder[0]);expect(calls).toEqual([...calls].sort((a,b)=>a-b))
  expect(alarmApi.groupEmailEditOptions).toHaveBeenCalledTimes(mode==='email'?1:0)
 })
 it('权限或项目已变在任何写入前失败',async()=>{session.user!.permissions=[];await expect(createOrdinaryGroupAndVerify(context(),draft(),members)).rejects.toBeInstanceOf(IdentityChanged);session.user={...session.user!,permissions:['alarm:manage'],currentProjectId:'other'};await expect(createOrdinaryGroupAndVerify(context(),draft(),members)).rejects.toBeInstanceOf(IdentityChanged);expect(alarmApi.createOrdinaryGroup).not.toHaveBeenCalled()})
 it('秘密方式与无效参数均不落普通POST',async()=>{await expect(createOrdinaryGroupAndVerify(context(),draft('webhook'),members)).rejects.toMatchObject({status:400});await expect(createOrdinaryGroupAndVerify(context(),{...draft(),name:''},members)).rejects.toMatchObject({status:400});expect(alarmApi.createOrdinaryGroup).not.toHaveBeenCalled()})
 it('POST后身份变化丢弃结果且不开始旧范围回读',async()=>{vi.mocked(alarmApi.createOrdinaryGroup).mockImplementationOnce(async()=>{changeIdentity();return row});await expect(createOrdinaryGroupAndVerify(context(),draft(),members)).rejects.toBeInstanceOf(IdentityChanged);expect(alarmApi.group).not.toHaveBeenCalled()})
 it('名称或描述含Java不strip的空白时不悄悄按JS trim丢字',async()=>{vi.mocked(alarmApi.createOrdinaryGroup).mockResolvedValueOnce({...row,description:'\u00a0记录\u00a0'});vi.mocked(alarmApi.group).mockResolvedValueOnce({...row,description:'\u00a0记录\u00a0'});await expect(createOrdinaryGroupAndVerify(context(),{...draft(),description:'\t\u00a0记录\u00a0\n'},members)).resolves.toMatchObject({description:'\u00a0记录\u00a0'})})
 it('已被并发改动的组、方式或配置版本不报创建核对成功',async()=>{vi.mocked(alarmApi.groupConfiguration).mockResolvedValueOnce({groupId:group,configured:true,notificationType:'VOICE',configurationVersion:0});await expect(createOrdinaryGroupAndVerify(context(),draft(),members)).rejects.toMatchObject({status:409});expect(alarmApi.groupOrdinaryOptions).not.toHaveBeenCalled();expect(alarmApi.createOrdinaryGroup).toHaveBeenCalledTimes(1)})
 it('回读断线或非完整号码不能触发第二次创建',async()=>{vi.mocked(alarmApi.groupOrdinaryOptions).mockRejectedValueOnce(new TypeError('lost'));await expect(createOrdinaryGroupAndVerify(context(),draft(),members)).rejects.toMatchObject({outcomeUnknown:true});expect(alarmApi.createOrdinaryGroup).toHaveBeenCalledTimes(1)})
 it('明确POST参数拒绝仍是400，POST连接错误成为未知而非可重放普通异常',async()=>{vi.mocked(alarmApi.createOrdinaryGroup).mockRejectedValueOnce(new ApiError('请核对',400));await expect(createOrdinaryGroupAndVerify(context(),draft(),members)).rejects.toMatchObject({status:400});vi.mocked(alarmApi.createOrdinaryGroup).mockRejectedValueOnce(new TypeError('lost'));await expect(createOrdinaryGroupAndVerify(context(),draft(),members)).rejects.toMatchObject({outcomeUnknown:true});expect(alarmApi.group).not.toHaveBeenCalled()})
 it('邮箱回读必须包含完整启用目标集合和独立recipient零版本',async()=>{vi.mocked(alarmApi.groupConfiguration).mockResolvedValueOnce({groupId:group,configured:true,notificationType:'EMAIL',configurationVersion:0});vi.mocked(alarmApi.groupOrdinaryOptions).mockResolvedValueOnce({notificationType:'EMAIL',version:0,members:[],numbers:[]});vi.mocked(alarmApi.groupEmailEditOptions).mockResolvedValueOnce([{id:'r1',email:'a@example.invalid',enabled:true,version:0}]);await expect(createOrdinaryGroupAndVerify(context(),draft('email'),members)).rejects.toMatchObject({status:409});expect(alarmApi.createOrdinaryGroup).toHaveBeenCalledTimes(1)})
 it('异步期间调用方改变草稿仍按已发请求核对，时间或配置缺失不报成功',async()=>{const value=draft();vi.mocked(alarmApi.createOrdinaryGroup).mockImplementationOnce(async()=>{value.mode='voice';return row});await expect(createOrdinaryGroupAndVerify(context(),value,members)).resolves.toEqual(row);vi.mocked(alarmApi.group).mockResolvedValueOnce({...row,updatedAt:undefined});await expect(createOrdinaryGroupAndVerify(context(),draft(),members)).rejects.toMatchObject({status:409})})
})
