import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useAlarmWorkspace } from '../../src/features/alarms/use-alarm-workspace'
import { session } from '../../src/core/session'
import { changeIdentity, ApiError } from '../../src/core/http'
import { alarmApi } from '../../src/features/alarms/api'
import { groupBody, recipientBody, versionOf } from '../../src/features/alarms/model'
vi.mock('../../src/features/alarms/api', () => ({ alarmApi: { groupDirectory: vi.fn(), groups: vi.fn(), group: vi.fn(), recipients: vi.fn(), saveGroup: vi.fn(), saveRecipient: vi.fn() } }))
const scopes: ReturnType<typeof effectScope>[] = []
function setup(id = 'g', counted = false) {
  session.user = { currentProjectId: 'p', permissions: ['alarm:read', 'alarm:manage'] }
  vi.mocked(alarmApi.groupDirectory).mockResolvedValue({items:[],total:'72'} as any)
  vi.mocked(alarmApi.groups).mockResolvedValue({ items: [], nextCursor: null })
  vi.mocked(alarmApi.group).mockResolvedValue({ id, name: '值班', version: 8, enabled: false })
  vi.mocked(alarmApi.recipients).mockResolvedValue([])
  const scope = effectScope(); scopes.push(scope)
  return scope.run(() => useAlarmWorkspace(() => id, counted))!
}
afterEach(() => { scopes.splice(0).forEach(s => s.stop()); vi.clearAllMocks(); changeIdentity(); session.user = null })
describe('通知组独立合同与受控写入', () => {
  it('深链直接GET，不扫描目录', async () => { const w = setup(); await w.reload(); expect(alarmApi.group).toHaveBeenCalledWith('p', 'g', expect.any(AbortSignal)); expect(alarmApi.groups).not.toHaveBeenCalled() })
  it('组和recipient分别提交自己的version', () => { expect(groupBody(' A ', false, { version: 8 })).toEqual({ name: 'A', enabled: false, version: 8 }); expect(recipientBody('EMAIL', ' a@b.com ', true, { version: 2 })).toEqual({ channel: 'EMAIL', target: 'a@b.com', enabled: true, version: 2 }); expect(() => versionOf({})).toThrow() })
  it('取消再打开回填，切渠道清空旧目标', () => { const w = setup(); const row = { id: 'r', target: 'a@b.com', channel: 'EMAIL' as const, version: 2 }; w.openRecipient(row); w.target.value = 'changed'; w.resetEditor(); w.openRecipient(row); expect(w.target.value).toBe('a@b.com'); w.changeChannel('WEBHOOK'); expect(w.target.value).toBe('') })
  it('未知写结果禁止再次提交，直到关闭核对', async () => { const w = setup(); w.openGroup({ id: 'g', version: 8, name: 'A' }); vi.mocked(alarmApi.saveGroup).mockRejectedValue(new ApiError('断连', 0, undefined, undefined, true)); await w.saveGroup(); await w.saveGroup(); expect(w.needsReview.value).toBe(true); expect(alarmApi.saveGroup).toHaveBeenCalledTimes(1); expect(w.editingGroup.value).toBe(true) })

  it.each([401,403,404])('实际拒绝%d清空组及收件人输入并关闭，丢弃原编辑上下文', async status => {
    const w=setup(); w.openRecipient({id:'r',version:2,target:'private@example.com',channel:'EMAIL'}); w.name.value='私有组名'; w.description.value='私有描述'
    vi.mocked(alarmApi.saveRecipient).mockRejectedValue(new ApiError('拒绝',status)); await w.saveRecipient()
    expect(w.editingRecipient.value).toBe(false);expect(w.editingGroup.value).toBe(false);expect(w.selectedRecipient.value).toBeUndefined();expect(w.target.value).toBe('');expect(w.name.value).toBe('');expect(w.description.value).toBe('');expect(w.error.value).toBe('');expect(w.busy.value).toBe(false)
  })
  it('共享HTTP未知结果只显示一个核对提示且保留输入与锁定', async()=>{
    const w=setup();w.openGroup({id:'g',version:8,name:'值班',description:'保留描述'});vi.mocked(alarmApi.saveGroup).mockRejectedValue(new ApiError('请求未完成，请重新读取核对结果',0,undefined,undefined,true));await w.saveGroup();await w.saveGroup()
    expect(w.error.value).toBe('操作结果未知，请关闭后重新读取核对。');expect(w.name.value).toBe('值班');expect(w.description.value).toBe('保留描述');expect(w.needsReview.value).toBe(true);expect(alarmApi.saveGroup).toHaveBeenCalledTimes(1)
  })
  it('CAS冲突保留输入且只显示一条重新读取提示',async()=>{
    const w=setup();w.openGroup({id:'g',version:8,name:'值班'});vi.mocked(alarmApi.saveGroup).mockRejectedValue(new ApiError('旧版本，请重新读取',409));await w.saveGroup();expect(w.error.value).toBe('通知组已变更，请关闭后重新读取核对。');expect(w.name.value).toBe('值班');expect(w.needsReview.value).toBe(true)
  })
  it('明确参数拒绝保留可修改输入，之后仅用户主动提交一次',async()=>{
    const w=setup();w.openGroup({id:'g',version:8,name:'值班'});vi.mocked(alarmApi.saveGroup).mockRejectedValueOnce(new ApiError('名称不合法',400)).mockResolvedValueOnce({id:'g',version:9});await w.saveGroup();expect(w.error.value).toBe('名称不合法');expect(w.needsReview.value).toBe(false);expect(w.editingGroup.value).toBe(true);w.name.value='修正';await w.saveGroup();expect(alarmApi.saveGroup).toHaveBeenCalledTimes(2);expect(w.editingGroup.value).toBe(false)
  })

  it('切身份清空表单并丢弃在途写入结果', async () => { const w = setup(); let done!: (v: {}) => void; vi.mocked(alarmApi.saveGroup).mockImplementation(() => new Promise(resolve => { done = resolve })); w.openGroup(); w.name.value = 'A'; const pending = w.saveGroup(); changeIdentity(); done({}); await pending; expect(w.name.value).toBe(''); expect(w.editingGroup.value).toBe(false); expect(w.error.value).toBe('') })
  it('失去管理权限清空编辑器且拒绝提交', async () => { const w = setup(); w.openGroup(); w.name.value = 'A'; session.user = { currentProjectId: 'p', permissions: ['alarm:read'] }; await nextTick(); await w.saveGroup(); expect(w.editingGroup.value).toBe(false); expect(alarmApi.saveGroup).not.toHaveBeenCalled() })
  it('cursor续页与返回不虚构总数', async () => { const w = setup(''); vi.mocked(alarmApi.groups).mockResolvedValueOnce({ items: [], nextCursor: 'opaque' }).mockResolvedValue({ items: [], nextCursor: null }); await w.reload(); await w.move(true); expect(alarmApi.groups).toHaveBeenLastCalledWith('p', 'opaque', expect.any(AbortSignal)); await w.move(false); expect(alarmApi.groups).toHaveBeenLastCalledWith('p', undefined, expect.any(AbortSignal)) })
  it('名称/描述回填，省略启停提交不清除描述', async () => { const w=setup(); const row={id:'g',name:'值班',version:8,description:'原描述'}; w.openGroup(row); expect(w.description.value).toBe('原描述'); w.description.value='新描述'; vi.mocked(alarmApi.saveGroup).mockResolvedValue({id:'g',version:9}); await w.saveGroup(); expect(alarmApi.saveGroup).toHaveBeenCalledWith('p',{name:'值班',enabled:false,version:8,description:'新描述'},row) })
  it('详情直接启停只带组版本，保留未提交的描述', async () => { const w=setup(); const row={id:'g',name:'值班',version:8}; vi.mocked(alarmApi.saveGroup).mockResolvedValue({id:'g',version:9,enabled:true}); await w.toggleGroup(row,true); expect(alarmApi.saveGroup).toHaveBeenCalledWith('p',{name:'值班',enabled:true,version:8},row) })

  it('原站页码模式用真实total选择页，条数改变重置并只读一次', async () => { const w=setup('',true); await w.reload(); await w.selectPage(3); expect(alarmApi.groupDirectory).toHaveBeenLastCalledWith('p',3,24,expect.any(AbortSignal)); const before=vi.mocked(alarmApi.groupDirectory).mock.calls.length; await w.setLimit(96); expect(w.page.value).toBe(1); expect(alarmApi.groupDirectory).toHaveBeenCalledTimes(before+1); expect(alarmApi.groupDirectory).toHaveBeenLastCalledWith('p',1,96,expect.any(AbortSignal)); expect(alarmApi.groups).not.toHaveBeenCalled() })
  it('原站页码模式不会跳到真实total之外的页', async () => { const w=setup('',true); await w.reload(); const before=vi.mocked(alarmApi.groupDirectory).mock.calls.length; await w.selectPage(4); expect(w.page.value).toBe(1); expect(alarmApi.groupDirectory).toHaveBeenCalledTimes(before) })

})
