import {copySucceeded,copyFailed} from '../../src/ui/copy-feedback'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Component from '../../src/features/devices/DeviceConnectionAccess.vue'
import {decodeConnectionAccess,decodeConnectionEndpoints,connectionEndpoint,type DeviceConnectionAccess} from '../../src/features/devices/connection-access-api'
vi.mock('../../src/ui/copy-feedback',()=>({copySucceeded:vi.fn(),copyFailed:vi.fn()}))
const state=vi.hoisted(()=>({project:null as any,role:null as any,read:null as any,update:null as any,status:null as any,account:null as any,publicKey:null as any,profile:vi.fn(),load:vi.fn(),credentials:vi.fn(),endpoints:vi.fn(),locator:vi.fn(),metadata:vi.fn(),copy:vi.fn()}))
vi.mock('../../src/core/session',async()=>{const {ref,computed}=await import('vue');state.project=ref('00000000-0000-4000-8000-000000000001');state.role=ref('OWNER');state.read=ref(true);state.update=ref(true);state.status=ref('ACTIVE');state.account=ref('account-a');state.publicKey=ref('xftfoajl');return {projectId:state.project,currentProject:computed(()=>({status:state.status.value,projectCode:state.publicKey.value})),session:{get user(){return {projectRole:state.role.value,accountId:state.account.value}}},can:(permission:string)=>permission==='device:read'?state.read.value:permission==='device:update'?state.update.value:false}})
vi.mock('../../src/features/devices/connection-access-api',async original=>({...await original<typeof import('../../src/features/devices/connection-access-api')>(),readConnectionAccess:state.load,readConnectionEndpoints:state.endpoints}))
vi.mock('../../src/features/devices/api',async original=>{const source=await original<typeof import('../../src/features/devices/api')>();return {...source,devicesApi:{...source.devicesApi,credentials:state.credentials,profile:state.profile}}})
vi.mock('../../src/features/devices/application-mqtt-locator-api',async original=>({...await original<typeof import('../../src/features/devices/application-mqtt-locator-api')>(),readApplicationMqttLocator:state.locator}))
vi.mock('../../src/features/projects/application-connection-api',async original=>({...await original<typeof import('../../src/features/projects/application-connection-api')>(),readApplicationConnection:state.metadata}))
const id='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003'
const access:DeviceConnectionAccess={deviceId:id,accessToken:'a'.repeat(64),projectKey:`tlp1.routing.${'A'.repeat(43)}`,mqtt:'mqtt://localhost:1883',mqttTls:null,http:null,https:null,tcp:null}
function endpointValues(value:typeof access){return {deviceId:value.deviceId,mqtt:value.mqtt,mqttTls:value.mqttTls,http:value.http,https:value.https,tcp:value.tcp}}
function resolveAccess(value:typeof access){state.load.mockResolvedValue(value);state.endpoints.mockImplementation((_project:string,deviceId:string)=>Promise.resolve({...endpointValues(value),deviceId}))}
const mounted:ReturnType<typeof mount>[]=[]
function render(){const w=mount(Component,{props:{deviceId:id},global:{plugins:[ElementPlus],stubs:{RouterLink:{template:'<a href="/project-settings?tab=mqtt_sub"><slot/></a>'}}}});mounted.push(w);return w}
describe('稳定连接参数',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.project.value='00000000-0000-4000-8000-000000000001';state.account.value='account-a';state.role.value='OWNER';state.read.value=true;state.update.value=true;state.status.value='ACTIVE';resolveAccess(access);state.metadata.mockResolvedValue({projectId:state.project.value,api:{endpoint:null,enabled:false,writesEnabled:false},mqtt:{endpoint:null,enabled:false}});state.locator.mockImplementation((_project:string,deviceId:string)=>Promise.resolve({deviceId,deviceViewToken:deviceId===id?'tlv1_AAAAAAAAQACAAAAAAAAAAg':'tlv1_AAAAAAAAQACAAAAAAAAAAw'}));state.credentials.mockImplementation((_project:string,deviceId:string)=>Promise.resolve([{id:'00000000-0000-4000-8000-000000000004',deviceId,authType:'ACCESS_TOKEN',expiresAt:null}]));state.profile.mockImplementation((_project:string,deviceId:string)=>Promise.resolve({deviceId,deviceKey:'80456b2b2c74',businessKey:null}));state.copy.mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:state.copy}})})
 afterEach(()=>mounted.splice(0).forEach(w=>w.unmount()))
 it('秘密不进入DOM属性、标题或正文；单次明确点击才复制对应原文',async()=>{const w=render();await flushPromises();expect(w.html()).not.toContain(access.accessToken);expect(w.html()).not.toContain(access.projectKey);expect(state.copy).not.toHaveBeenCalled();await w.findAll('button').find(b=>b.text()==='复制 AccessToken')!.trigger('click');await flushPromises();expect(state.copy).toHaveBeenLastCalledWith(access.accessToken);expect(copySucceeded).toHaveBeenCalledTimes(1);expect(w.find('.copy-notice').exists()).toBe(false);await w.findAll('button').find(b=>b.text()==='复制 ProjectKey')!.trigger('click');expect(state.copy).toHaveBeenLastCalledWith(access.projectKey);expect(w.html()).not.toContain(access.projectKey)})
 it('设备证书复制两个凭据，MQTT接入点只复制ProjectCode和DeviceKey',async()=>{const w=render();await flushPromises();expect(w.text()).not.toContain('设备身份（公开，不是密码）');expect(w.text()).not.toContain('projectCode 填项目标识');expect(w.text()).not.toContain('MQTT 协议映射');expect(w.text()).not.toContain('xftfoajl');expect(w.text()).not.toContain('80456b2b2c74');expect(w.html()).not.toContain(access.accessToken);expect(w.html()).not.toContain(access.projectKey);const mqttTable=w.get('.endpoint .parameters');const row=(name:string)=>mqttTable.findAll('tr').find(item=>item.find('th').text()===name)!;expect(row('ProjectCode:')).toBeDefined();expect(row('DeviceKey:')).toBeDefined();expect(mqttTable.findAll('tr').some(item=>['AccessToken:','ProjectKey:'].includes(item.find('th').text()))).toBe(false);for(const [name,value] of [['ProjectCode:','xftfoajl'],['DeviceKey:','80456b2b2c74']] as const){expect(row(name).text()).not.toContain(value);expect(row(name).text()).toContain('<点此复制>')}await row('ProjectCode:').find('button').trigger('click');await flushPromises();expect(state.copy).toHaveBeenLastCalledWith('xftfoajl');await row('DeviceKey:').find('button').trigger('click');expect(state.copy).toHaveBeenLastCalledWith('80456b2b2c74')})
 it('原站表格中的主机、端口也是可操作复制控件，未配置时不生成假端口行',async()=>{const w=render();await flushPromises();await w.findAll('button').find(b=>b.text()==='localhost')!.trigger('click');await flushPromises();expect(state.copy).toHaveBeenLastCalledWith('localhost');await w.findAll('button').find(b=>b.text()==='1883')!.trigger('click');expect(state.copy).toHaveBeenLastCalledWith('1883')})
 it('缺更新/读权限、非O/A、归档均零请求；撤权立即清除可复制控件',async()=>{for(const [target,value] of [[state.role,'OPERATOR'],[state.read,false],[state.update,false],[state.status,'ARCHIVED']] as const){target.value=value;const w=render();await flushPromises();expect(state.load).not.toHaveBeenCalled();expect(state.endpoints).not.toHaveBeenCalled();expect(w.find('.certificate-actions').exists()).toBe(false);w.unmount();state.role.value='OWNER';state.read.value=true;state.update.value=true;state.status.value='ACTIVE'}const w=render();await flushPromises();state.role.value='VIEWER';await flushPromises();expect(w.find('.certificate-actions').exists()).toBe(false);expect(state.load).toHaveBeenCalledTimes(1)})
 it('同身份切换设备、账号后旧响应不能恢复旧秘密的复制入口',async()=>{let resolve!:(v:unknown)=>void;state.load.mockReturnValueOnce(new Promise(r=>{resolve=r}));const w=render();await flushPromises();resolveAccess({...access,deviceId:other});await w.setProps({deviceId:other});await flushPromises();resolve(access);await flushPromises();await w.findAll('button').find(b=>b.text()==='复制 AccessToken')!.trigger('click');expect(state.load.mock.lastCall?.[1]).toBe(other);state.load.mockReturnValue(new Promise(()=>{}));state.account.value='account-b';await flushPromises();expect(w.find('.certificate-actions').exists()).toBe(false)})
 it('复制完成前撤权，不产生晚到成功提示；旧GET 409只读重试不生成',async()=>{let done!:()=>void;state.copy.mockReturnValueOnce(new Promise<void>(r=>{done=r}));const w=render();await flushPromises();await w.findAll('button').find(b=>b.text()==='复制 AccessToken')!.trigger('click');state.update.value=false;await flushPromises();done();await flushPromises();expect(copySucceeded).not.toHaveBeenCalled();state.load.mockRejectedValue(new Error('存量凭据没有可恢复材料'));state.update.value=true;await flushPromises();expect(w.text()).toContain('存量凭据没有可恢复材料');expect(state.load).toHaveBeenCalledTimes(2)})
 it('接入点缺失保持明确未配置，不从当前站点猜测协议地址',async()=>{resolveAccess({...access,mqtt:null});const w=render();await flushPromises();expect(w.find('.code').exists()).toBe(false);expect(w.text()).toContain('尚未配置接入点');expect(w.find('.endpoint .parameters').exists()).toBe(false)})
 it('TCP接入点从原配置显示地址及端口，明确点击只复制对应值',async()=>{resolveAccess({...access,tcp:'tcp://tcp.example.test:28801'});const w=render();await flushPromises();expect(w.find('.tcp-parameters').exists()).toBe(true);expect(state.copy).not.toHaveBeenCalled();await w.find('[aria-label="复制 TCP 地址"]').trigger('click');await flushPromises();expect(state.copy).toHaveBeenLastCalledWith('tcp.example.test');await w.find('[aria-label="复制 TCP 端口"]').trigger('click');expect(state.copy).toHaveBeenLastCalledWith('28801');expect(state.copy).toHaveBeenCalledTimes(2);expect(w.html()).not.toContain(access.accessToken);expect(w.html()).not.toContain(access.projectKey)})
 it('TCP注册包仅明确点击复制已有两段原文，不进入DOM或额外读取签发',async()=>{
  resolveAccess({...access,tcp:'tcp://tcp.example.test:28801'});const w=render();await flushPromises()
  const packet=`${access.projectKey}&${access.accessToken}`
  expect(w.find('.tcp-parameters').text()).toContain('注册包:');expect(w.get('[aria-label="复制 TCP 注册包"]').text()).toBe('<点此复制>');expect(w.html()).not.toContain(packet);expect(w.html()).not.toContain(access.projectKey);expect(w.html()).not.toContain(access.accessToken);expect(state.copy).not.toHaveBeenCalled()
  await w.get('[aria-label="复制 TCP 注册包"]').trigger('click');await flushPromises();expect(state.copy).toHaveBeenCalledExactlyOnceWith(packet);expect(state.load).toHaveBeenCalledTimes(1);expect(state.endpoints).toHaveBeenCalledTimes(1);expect(state.credentials).not.toHaveBeenCalled();expect(w.html()).not.toContain(packet)
  state.update.value=false;await flushPromises();expect(w.find('[aria-label="复制 TCP 注册包"]').exists()).toBe(false)
 })
 it('TCP端口未显式配置时不猜默认值，接入点空时不生成参数表',async()=>{resolveAccess({...access,tcp:'tcp://tcp.example.test'});const w=render();await flushPromises();expect(w.find('[aria-label="复制 TCP 地址"]').exists()).toBe(true);expect(w.find('[aria-label="复制 TCP 端口"]').exists()).toBe(false);resolveAccess({...access,tcp:null});await w.setProps({deviceId:other});await flushPromises();expect(w.find('.tcp-parameters').exists()).toBe(false);expect(w.text()).not.toContain('28801');expect(state.copy).not.toHaveBeenCalled()})
 it('解码精确校验真实身份、项目秘密格式和必需空值，错误不带秘密',()=>{expect(decodeConnectionAccess(access,id)).toEqual(access);for(const value of [{...access,deviceId:other},{...access,projectKey:'routing'},{...access,mqtt:'mqtt://user:pass@broker:1883'},{...access,https:undefined},{...access,extra:true}]){let error;try{decodeConnectionAccess(value,id)}catch(e){error=e}expect(error).toBeTruthy();expect(String(error)).not.toContain(access.accessToken);expect(String(error)).not.toContain(access.projectKey)}expect(()=>connectionEndpoint('https://host/ingest','http')).toThrow();expect(connectionEndpoint('https://host/ingest','https')?.pathname).toBe('/ingest')})
 it('缺少原文副本的新提示仍核对有效凭据，且保留独立接入点',async()=>{state.load.mockRejectedValue(new Error('当前凭据未保存可重复读取的原文副本；本次未重新签发'));state.credentials.mockResolvedValue([{id:'credential',deviceId:id,authType:'ACCESS_TOKEN',expiresAt:null}]);const w=render();await flushPromises();expect(w.text()).toContain('当前已有有效的 AccessToken');expect(w.text()).toContain('设备端 MQTT 接入点');expect(state.copy).not.toHaveBeenCalled();expect(w.find('.certificate-actions').exists()).toBe(false)})
 it('旧连接秘密409时公开定位符仍独立读取及明确复制',async()=>{state.load.mockRejectedValue(new Error('原设备秘密暂不可读409'));const w=render();await flushPromises();expect(w.text()).toContain('原设备秘密暂不可读409');expect(w.text()).toContain('应用端 MQTT 订阅');expect(state.copy).not.toHaveBeenCalled();await w.findAll('button').find(b=>b.text()==='复制 DeviceViewToken')!.trigger('click');await flushPromises();expect(state.copy).toHaveBeenLastCalledWith('tlv1_AAAAAAAAQACAAAAAAAAAAg')})
 it('定位符503不遮蔽旧秘密及设备接入点',async()=>{state.locator.mockRejectedValue(new Error('公开定位符暂不可读503'));const w=render();await flushPromises();expect(w.text()).toContain('公开定位符暂不可读503');expect(w.text()).toContain('mqtt://localhost:1883');expect(w.findAll('button').some(b=>b.text()==='复制 AccessToken')).toBe(true);expect(w.findAll('button').find(b=>b.text()==='复制 DeviceViewToken')!.attributes('disabled')).toBeDefined();expect(w.findAll('a').some(a=>(a.attributes('href')||'').includes('mqtt_sub'))).toBe(true)})
 it('只有read而无秘密update权限时，公开定位符仍可读取',async()=>{state.update.value=false;const w=render();await flushPromises();expect(state.load).not.toHaveBeenCalled();expect(state.locator).toHaveBeenCalledTimes(1);expect(w.findAll('button').some(b=>b.text()==='复制 DeviceViewToken')).toBe(true);expect(w.find('.certificate-actions').exists()).toBe(false)})

 it('设备凭据409不遮蔽独立MQTT和TCP端点，只能复制公开地址不能复制秘密',async()=>{
  state.load.mockRejectedValue(new Error('当前凭据不支持重复读取，请由管理员重新签发后核对'))
  state.endpoints.mockResolvedValue({...endpointValues(access),tcp:'tcp://tcp.example.test:28801'})
  const w=render();await flushPromises()
  expect(w.text()).toContain('当前已有有效的 AccessToken');expect(w.text()).toContain('无需更换');expect(w.text()).toContain('旧值将失效');expect(w.find('.credential-note').attributes('role')).toBe('note');expect(w.find('.connection-access > .tl-async[role=alert]').exists()).toBe(false)
  expect(w.text()).toContain('mqtt://localhost:1883');expect(w.text()).toContain('tcp://tcp.example.test:28801')
  expect(w.find('.certificate-actions').exists()).toBe(false);expect(w.find('.secret-copy').exists()).toBe(false)
  expect(w.findAll('.unavailable-secret')).toHaveLength(1);expect(w.text()).toContain('未获取设备证书');expect(w.find('[aria-label="复制 TCP 注册包"]').exists()).toBe(false);expect(state.copy).not.toHaveBeenCalled()
  await w.find('[aria-label="复制 TCP 地址"]').trigger('click');await flushPromises();expect(state.copy).toHaveBeenLastCalledWith('tcp.example.test')
  expect(state.load).toHaveBeenCalledTimes(1);expect(state.endpoints).toHaveBeenCalledTimes(1);expect(state.credentials).toHaveBeenCalledTimes(1)
 })
 it('项目秘密或密钥环缺失时按旧凭据状态说明而不是原始错误',async()=>{
  state.load.mockRejectedValue(new Error('设备连接凭据暂不可读取，请联系管理员检查连接凭据配置'))
  state.credentials.mockResolvedValue([{id:'credential',deviceId:id,authType:'ACCESS_TOKEN',expiresAt:null}])
  const w=render();await flushPromises()
  expect(w.text()).toContain('当前已有有效的 AccessToken');expect(w.find('.credential-note').attributes('role')).toBe('note')
  expect(w.find('.connection-access > .tl-async[role=alert]').exists()).toBe(false)
 })
 it('端点读取失败不遮蔽证书，端点独立重试不重读或重置凭据',async()=>{
  state.endpoints.mockRejectedValueOnce(new Error('接入点读取暂不可用'))
  const w=render();await flushPromises();expect(w.text()).toContain('接入点读取暂不可用');expect(w.find('.certificate-actions').exists()).toBe(true)
  state.endpoints.mockResolvedValue(endpointValues(access))
  await w.findAll('button').find(b=>b.text()==='重新读取')!.trigger('click');await flushPromises()
  expect(w.text()).toContain('mqtt://localhost:1883');expect(state.endpoints).toHaveBeenCalledTimes(2);expect(state.load).toHaveBeenCalledTimes(1)
 })
 it('切换设备后迟到端点不恢复旧地址，撤权清除公开参数复制入口',async()=>{
  let done!:(v:unknown)=>void;state.endpoints.mockReturnValueOnce(new Promise(r=>{done=r}))
  const w=render();await flushPromises();state.endpoints.mockResolvedValue({...endpointValues(access),deviceId:other,mqtt:'mqtt://new.example.test:1884'})
  await w.setProps({deviceId:other});await flushPromises();done({...endpointValues(access),mqtt:'mqtt://old.example.test:1883'});await flushPromises()
  expect(w.text()).toContain('new.example.test');expect(w.text()).not.toContain('old.example.test')
  state.update.value=false;await flushPromises();expect(w.find('.parameters').exists()).toBe(false);expect(w.find('.plain-copy').exists()).toBe(false)
 })
 it('独立端点解码拒绝错误设备、漏字段、协议不符和混入秘密',()=>{
  const endpoints=endpointValues(access);expect(decodeConnectionEndpoints(endpoints,id)).toEqual(endpoints)
  for(const value of [{...endpoints,deviceId:other},{...endpoints,tcp:undefined},{...endpoints,mqtt:'https://host'},{...endpoints,accessToken:access.accessToken}])expect(()=>decodeConnectionEndpoints(value,id)).toThrow()
 })

 it.each([{rows:[]},{rows:[{id:'credential',deviceId:id,authType:'ACCESS_TOKEN',expiresAt:'2020-01-01T00:00:00Z'}]}])('没有有效AccessToken不展示可继续使用旧值的说明',async({rows})=>{
  state.load.mockRejectedValue(new Error('当前凭据不支持重复读取，请由管理员重新签发后核对'));state.credentials.mockResolvedValue(rows)
  const w=render();await flushPromises();expect(w.text()).toContain('当前未查询到有效的 AccessToken');expect(w.text()).not.toContain('无需更换');expect(w.text()).toContain('mqtt://localhost:1883')
 })
 it('状态读取失败不误报凭据有效，明确核对只重读元数据',async()=>{
  state.load.mockRejectedValue(new Error('当前凭据不支持重复读取，请由管理员重新签发后核对'));state.credentials.mockRejectedValueOnce(new Error('暂不可读'))
  const w=render();await flushPromises();expect(w.text()).toContain('凭据状态暂时无法确认');expect(w.text()).not.toContain('当前已有有效的 AccessToken')
  await w.findAll('button').find(b=>b.text()==='重新核对')!.trigger('click');await flushPromises()
  expect(w.text()).toContain('无需更换');expect(state.credentials).toHaveBeenCalledTimes(2);expect(state.load).toHaveBeenCalledTimes(1);expect(state.endpoints).toHaveBeenCalledTimes(1)
 })
 it('迟到旧设备凭据状态不恢复到新设备，撤权立即清除说明',async()=>{
  let done!:(v:unknown)=>void;state.load.mockRejectedValue(new Error('当前凭据不支持重复读取，请由管理员重新签发后核对'));state.credentials.mockReturnValueOnce(new Promise(r=>{done=r})).mockResolvedValueOnce([])
  const w=render();await flushPromises();await w.setProps({deviceId:other});await flushPromises();done([{id:'credential',deviceId:id,authType:'ACCESS_TOKEN',expiresAt:null}]);await flushPromises()
  expect(w.text()).toContain('当前未查询到有效的 AccessToken');expect(w.text()).not.toContain('无需更换');state.update.value=false;await flushPromises();expect(w.find('.credential-note').exists()).toBe(false)
 })
 it('错设备状态回执不能冒充有效旧凭据',async()=>{
  state.load.mockRejectedValue(new Error('当前凭据不支持重复读取，请由管理员重新签发后核对'));state.credentials.mockResolvedValue([{id:'credential',deviceId:other,authType:'ACCESS_TOKEN',expiresAt:null}])
  const w=render();await flushPromises();expect(w.text()).toContain('凭据状态暂时无法确认');expect(w.text()).not.toContain('无需更换')
 })

 it('保持原站连接页结构，仅说明旧凭据缺少加密副本，不新增取证书或重签控件',async()=>{state.load.mockRejectedValue(new Error('当前凭据未保存可重复读取的原文副本；本次未重新签发'));const w=render();await flushPromises();expect(w.text()).toContain('数据库中未保存对应的加密副本');expect(w.find('.connection-access > .tips').text()).toBe('每个设备拥有唯一的 AccessToken，设备连接云平台进行普通身份验证时使用 AccessToken，请妥善保管。 了解详情');expect(w.find('.connection-access > .tips').find('a').attributes('href')).toBe('https://www.thingscloud.xyz/docs/guide/connect-device/device-certificate.html');expect(w.text()).toContain('应用端 API 接入点');expect(w.text()).toContain('应用端 MQTT 订阅');expect(w.text()).not.toContain('应用端 MQTT 设备定位');expect(w.text()).not.toContain('TCP 数据流');expect(w.text()).not.toContain('MQTT 数据流');expect(state.metadata).toHaveBeenCalledTimes(1);expect(state.locator).toHaveBeenCalledTimes(1);expect(w.text()).not.toContain('ProjectKey:');expect(w.text()).not.toContain('设备动态获取证书');expect(w.find('.guide-toggle').exists()).toBe(false);expect(w.findAll('button').some(x=>x.text()==='重新读取证书')).toBe(false)})

 it('每个已配置接入点按原站地址栏完整显示协议域名路径和端口，不截断为主机',async()=>{
  const values={...endpointValues(access),mqtt:'mqtt://mqtt.example.test:1883',mqttTls:'mqtts://mqtt.example.test:8883',http:'http://device-api.example.test:8081',https:'https://device-api.example.test',tcp:'tcp://device.example.test:28801'}
  state.endpoints.mockResolvedValue(values);const w=render();await flushPromises()
  expect(w.findAll('.endpoint > pre.code').map(row=>row.text())).toEqual([values.mqtt,values.mqttTls,values.http,values.https,values.tcp])
  expect(w.findAll('.endpoint')).toHaveLength(5);expect(w.findAll('.endpoint')[4]!.text()).toContain('连接时需启用 TLS 加密');expect(w.find('.guide-toggle').exists()).toBe(false);expect(state.endpoints).toHaveBeenCalledTimes(1)
 })
 it('接入点为空时保持未配置，不把原站或浏览器地址当作真实连接URL',async()=>{
  state.endpoints.mockResolvedValue({...endpointValues(access),mqtt:null,mqttTls:null,http:null,https:null,tcp:null})
  const w=render();await flushPromises();expect(w.findAll('.endpoint > pre.code')).toHaveLength(0);expect(w.findAll('.endpoint .unavailable')).toHaveLength(5);expect(w.text()).not.toContain('gz-5-api.iot-api.com');expect(w.text()).not.toContain('gz-5-device.iot-api.com');expect(w.text()).not.toContain(location.origin)
 })

})
