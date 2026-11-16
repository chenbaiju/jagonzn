import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {createMemoryHistory,createRouter,RouterView,type Router} from 'vue-router'
import ElementPlus from 'element-plus'
import Directory from '../../src/features/device-types/DeviceTypeDirectory.vue'
import {decodeDeviceTypeDirectory,type DeviceTypeDirectoryTransport} from '../../src/features/device-types/api'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'

const project='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002'
const query={page:1,limit:24}
const item=(n=1,p=project)=>({id:`00000000-0000-4000-8000-${String(n+100).padStart(12,'0')}`,projectId:p,typeKey:`type_${n}`,name:`类型${n}`,deviceKind:'DIRECT',deviceCount:'1',networkType:'WIFI',payloadProtocol:'STANDARD',status:'DRAFT',version:1,productKey:null,createdAt:'2026-10-28T01:00:00Z'})
function page(items:readonly unknown[],total=String(items.length),number=1,limit=24,p=project){return decodeDeviceTypeDirectory({items,total,page:number,limit},p,{page:number,limit})}
let wrapper:ReturnType<typeof mount>|undefined,router:Router
function button(label:string){const found=wrapper!.findAll('button').find(node=>node.text()===label);if(!found)throw new Error('缺少按钮：'+label);return found}
async function setup(transport:DeviceTypeDirectoryTransport){router=createRouter({history:createMemoryHistory(),routes:[{path:'/device-types',component:Directory,props:{transport}},{path:'/device-types/create',component:{template:'<p>创建目标</p>'}},{path:'/device-types/:id',component:{template:'<p>详情目标</p>'}}]});await router.push('/device-types');await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await flushPromises()}
beforeEach(()=>{changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:[]} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})

it('真实目录数量与类型链接，创建入口和只读成员沿当前角色开放',async()=>{
 const read=vi.fn<DeviceTypeDirectoryTransport>().mockResolvedValue(page([item()]))
 await setup(read);expect(wrapper!.get('h1').text()).toBe('设备类型(1)');expect(wrapper!.get('.type-card h2').text()).toBe('类型1');expect(wrapper!.get('.type-device-count').text()).toBe('1 设备');expect(wrapper!.get('.type-card footer').text()).toContain('直连设备');expect(wrapper!.text()).not.toContain('Wi-Fi');expect(wrapper!.text()).not.toContain('创建时间');expect(read.mock.calls[0]!.slice(0,2)).toEqual([project,query])
 await button('创建设备类型').trigger('click');await flushPromises();expect(router.currentRoute.value.path).toBe('/device-types/create')
 await router.push('/device-types');await flushPromises();session.user={...session.user!,projectRole:'VIEWER'};session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}];await flushPromises()
 expect(wrapper!.text()).toContain('类型1');expect(wrapper!.findAll('button').some(node=>node.text()==='创建设备类型')).toBe(false)
 await wrapper!.get(`a[href="/device-types/${item().id}"]`).trigger('click');await flushPromises();expect(router.currentRoute.value.path).toBe(`/device-types/${item().id}`)
})

it('真实空目录保留原站说明，错误不冒空或零数量，显式重读恢复',async()=>{
 const read=vi.fn<DeviceTypeDirectoryTransport>().mockRejectedValueOnce(new ApiError('服务暂不可用',503)).mockResolvedValue(page([]))
 await setup(read);expect(wrapper!.text()).toContain('服务暂不可用');expect(wrapper!.get('h1').text()).toBe('设备类型');expect(wrapper!.text()).not.toContain('定义设备功能和 App 界面')
 await button('重新读取').trigger('click');await flushPromises();expect(read).toHaveBeenCalledTimes(2);expect(wrapper!.get('h1').text()).toBe('设备类型(0)');expect(wrapper!.text()).toContain('定义设备功能和 App 界面');expect(wrapper!.find('[aria-label="分页"]').exists()).toBe(false)
})

it('卡片按已配置的通信方式显示图标和短标签，兼容没有可识别通信方式的记录', async () => {
 const networks = ['WIFI', 'ETHERNET', 'CELLULAR_2G', 'CELLULAR_3G', 'CELLULAR_4G', 'CELLULAR_5G', 'NB_IOT',
  'RS485', 'RS232', 'RS422', 'LORA', 'ZIGBEE', 'BLE', 'OTHER', undefined, 'constructor']
 const items = networks.map((networkType, index) => ({
  ...item(index + 1),
  deviceKind: index >= 7 && index <= 12 ? 'SUB_DEVICE' : 'DIRECT',
  networkType,
 }))
 const directory = decodeDeviceTypeDirectory({ items, total: String(items.length), ...query }, project, query)
 await setup(vi.fn<DeviceTypeDirectoryTransport>().mockResolvedValue(directory))

 const badges = wrapper!.findAll('.type-network-badge')
 expect(badges.map(badge => badge.get('.type-network-label').text())).toEqual([
  'WiFi', '以太网', '2G', '3G', '4G', '5G', 'NB-IoT', 'RS485', 'RS232', 'RS422', 'LoRa', 'Zigbee', '蓝牙/BLE', '其它',
 ])
 expect(badges[0]!.get('.reference-icon[aria-hidden="true"]').text()).toBe('\u{F05A9}')
 expect(wrapper!.findAll('.type-card')).toHaveLength(items.length)
})

it('分别展示当前产品状态，已有产品密钥标识或类型版本发布不触发图标', async () => {
 const items = [
  { ...item(1), enabledProductIdentifier: 'test.sensor', publishedToProductLibrary: true },
  { ...item(2), enabledProductIdentifier: 'test.alias-only', publishedToProductLibrary: false },
  { ...item(3), enabledProductIdentifier: null, publishedToProductLibrary: true },
  { ...item(4), status: 'PUBLISHED', productKey: 'existing-product-key' },
 ]
 await setup(vi.fn<DeviceTypeDirectoryTransport>().mockResolvedValue(page(items)))

 expect(wrapper!.findAll('.type-card').map(card => card.findAll('.type-product-status-icon').map(icon => icon.attributes('aria-label')))).toEqual([
  ['已启用产品识别码', '已发布到产品库'], ['已启用产品识别码'], ['已发布到产品库'], [],
 ])
 await wrapper!.get('[aria-label="已启用产品识别码"]').trigger('mouseenter')
 await vi.waitFor(() => {
  const tooltip = document.body.querySelector('[role="tooltip"]')
  expect(tooltip?.textContent).toBe('已启用产品识别码test.sensor')
  expect(tooltip?.querySelector('br')).not.toBeNull()
 })
})

it('下一页使用真实页码，空后页仍可回上一页且不假造总数',async()=>{
 const first=Array.from({length:24},(_,i)=>item(i+1)),read=vi.fn<DeviceTypeDirectoryTransport>()
 read.mockResolvedValueOnce(page(first,'25')).mockResolvedValueOnce(page([],'24',2)).mockResolvedValueOnce(page(first,'24'))
 await setup(read);await wrapper!.get('[aria-label="下一页"]').trigger('click');await flushPromises();expect(read.mock.calls[1]![1]).toEqual({page:2,limit:24});expect(wrapper!.get('h1').text()).toBe('设备类型(24)');expect(wrapper!.text()).toContain('当前页暂无设备类型');expect(wrapper!.get('[aria-label="上一页"]').attributes('disabled')).toBeUndefined()
 await wrapper!.get('[aria-label="上一页"]').trigger('click');await flushPromises();expect(read.mock.calls[2]![1]).toEqual({page:1,limit:24});expect(wrapper!.findAll('.type-card')).toHaveLength(24)
})

it('切项目及失去成员资格同步清理旧目录，旧在途响应不能回填',async()=>{
 let finish!:(value:ReturnType<typeof page>)=>void
 const pending=new Promise<ReturnType<typeof page>>(resolve=>{finish=resolve}),read=vi.fn<DeviceTypeDirectoryTransport>().mockReturnValueOnce(pending).mockResolvedValue(page([item(2,other)],'1',1,24,other))
 await setup(read);session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'},{id:other,myRole:'VIEWER',status:'ACTIVE'}];session.user={...session.user!,currentProjectId:other,projectRole:'VIEWER'};await flushPromises()
 finish(page([item()]));await flushPromises();expect(wrapper!.text()).toContain('类型2');expect(wrapper!.text()).not.toContain('类型1');expect(read.mock.calls[1]![0]).toBe(other)
 session.user={...session.user!,projectRole:undefined};await flushPromises();expect(wrapper!.text()).not.toContain('类型2');expect(wrapper!.text()).toContain('当前账号没有此内容的读取权限');expect(wrapper!.get('h1').text()).toBe('设备类型');expect(read).toHaveBeenCalledTimes(2)
})

it('归档成员可读但没有创建入口，无成员或身份切换中不读取',async()=>{
 session.projects=[{id:project,myRole:'OWNER',status:'ARCHIVED'}];const read=vi.fn<DeviceTypeDirectoryTransport>().mockResolvedValue(page([item()]))
 await setup(read);expect(wrapper!.text()).toContain('类型1');expect(wrapper!.findAll('button').some(node=>node.text()==='创建设备类型')).toBe(false)
 session.transitioning=true;await flushPromises();expect(wrapper!.text()).not.toContain('类型1');expect(read).toHaveBeenCalledTimes(1)
})

it('坏总量、当前页缺行、跨项目或重复类型拒绝，不能成为成功空页',()=>{
 const valid={items:[item()],total:'1',page:1,limit:24}
 for(const broken of [{...valid,total:1},{...valid,items:[]},{...valid,items:[item(1,other)]},{...valid,items:[item(),item()],total:'2'},{...valid,page:2},...['01',undefined,1].map(deviceCount=>({...valid,items:[{...item(),deviceCount}]}))])expect(()=>decodeDeviceTypeDirectory(broken,project,query)).toThrow('目录资料不完整')
 expect(decodeDeviceTypeDirectory({...valid,items:[{...item(),deviceCount:'9007199254740993'}]},project,query).items[0]!.deviceCount).toBe('9007199254740993')
 expect(decodeDeviceTypeDirectory({...valid,items:[],total:'24',page:2},project,{page:2,limit:24}).total).toBe('24')
})
