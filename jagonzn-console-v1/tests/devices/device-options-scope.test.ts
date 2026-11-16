import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {defineComponent} from 'vue'
import {mount,flushPromises} from '@vue/test-utils'
import {useDeviceOptions} from '../../src/features/devices/use-options'
import {session} from '../../src/core/session'
import {changeIdentity} from '../../src/core/http'
const mock=vi.hoisted(()=>({types:vi.fn(),groups:vi.fn()}))
vi.mock('../../src/features/devices/api',()=>({devicesApi:mock}))
const project='00000000-0000-4000-8000-000000000001',second='00000000-0000-4000-8000-000000000002'
let w:ReturnType<typeof mount>|undefined,options:ReturnType<typeof useDeviceOptions>
const Host=defineComponent({setup(){options=useDeviceOptions();return()=>null}})
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.user={currentProjectId:project,accountId:project} as never;session.transitioning=false;mock.types.mockResolvedValue({items:[{id:project,name:'首类型'}],nextCursor:'next',hasMore:true});mock.groups.mockResolvedValue([])})
afterEach(()=>{w?.unmount();session.user=null})
it('当前身份分页选项明确追加；身份失效清allTypes/cursor，人工重读回首页',async()=>{w=mount(Host);await flushPromises();mock.types.mockResolvedValueOnce({items:[{id:second,name:'第二页类型'}],hasMore:false});options.moreTypes();await flushPromises();expect(options.allTypes.value.map(x=>x.id)).toEqual([project,second]);expect(mock.types.mock.lastCall?.[1]).toBe('next');changeIdentity();expect(options.allTypes.value).toEqual([]);expect(options.types.data.value).toBeUndefined();await options.types.reload();await flushPromises();expect(mock.types.mock.lastCall?.[1]).toBeUndefined();expect(options.allTypes.value).toHaveLength(1)})
it('同project账号变化清追加页，晚到旧分页不能混入新scope',async()=>{w=mount(Host);await flushPromises();let done!:(v:unknown)=>void;mock.types.mockReturnValueOnce(new Promise(r=>{done=r}));options.moreTypes();mock.types.mockResolvedValue({items:[{id:second,name:'新身份类型'}],hasMore:false});session.user={...session.user!,accountId:second};await flushPromises();done({items:[{id:project,name:'旧身份迟到'}],hasMore:false});await flushPromises();expect(options.allTypes.value.map(x=>x.name)).toEqual(['新身份类型']);expect(mock.types.mock.lastCall?.[1]).toBeUndefined()})
