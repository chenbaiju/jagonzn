import {expect,it,vi} from 'vitest'
const feedback=vi.hoisted(()=>({success:vi.fn(),error:vi.fn()}))
vi.mock('@/ui/copy-feedback',()=>({copySucceeded:feedback.success,copyFailed:feedback.error}))
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {thingsCloudTslFile} from '../../src/features/device-types/things-cloud-tsl-export'
import {decodeTslSource} from '../../src/features/device-types/tsl-source-api'
import TslView from '../../src/features/device-types/DeviceTypeTslView.vue'
import {session} from '../../src/core/session'
import {changeIdentity} from '../../src/core/http'
const project='00000000-0000-4000-8000-000000000001',type='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003'
const source=(extra='')=>decodeTslSource(new TextEncoder().encode(`{"deviceTypeId":"${type}","name":"当前类型","description":"<script>not executed</script>","properties":[{"id":"${id}","deviceTypeId":"${type}","name":"温度","propertyKey":"temperature","accessType":"REPORT","dataType":"NUMBER","sortOrder":0,"minimumValue":9007199254740993,"maximumValue":9007199254740994${extra}}],"events":[],"commands":[]}`),type)
it('当前三表TSL采用Source字段、字符串数值保精度且不冒充冻结版本JSON',()=>{
 const value=source(',"defaultValue":0.1234567890123456789,"decimalPlaces":1,"numericStep":0.50000000000000000001'),result=thingsCloudTslFile(value),json=JSON.parse(result.file!.content)
 expect(result.issues).toEqual([]);expect(result.warnings).toHaveLength(1)
 expect(json).toMatchObject({name:'当前类型',descr:'<script>not executed</script>',icon:'mdi-cube-outline',attributes:[{identifier:'temperature',name:'温度',attributeType:'report',dataType:'number',options:{min:'9007199254740993',max:'9007199254740994',default:'0.1234567890123456789'}}],events:[],commands:[]})
 expect(json).not.toHaveProperty('modelSnapshot');expect(json).not.toHaveProperty('version');expect(result.file!.content).toContain('0.1234567890123456789');expect(json.attributes[0].options.step).toBe('0.50000000000000000001')
 const text={...value,properties:[{...value.properties[0]!,dataType:'TEXT' as const,defaultValue:undefined,minimumValue:undefined,maximumValue:undefined,numericStep:undefined,decimalPlaces:undefined,textDefaultValue:'  hello\n中文  '}]},exported=thingsCloudTslFile(text);expect(JSON.parse(exported.file!.content).attributes[0].options.default).toBe('  hello\n中文  ');expect(exported.warnings).toEqual([])
 expect(JSON.parse(thingsCloudTslFile({...text,properties:[{...text.properties[0]!,textDefaultValue:''}]}).file!.content).attributes[0].options.default).toBe('')
 expect(()=>decodeTslSource(new TextEncoder().encode(JSON.stringify({deviceTypeId:type,name:'n',description:null,properties:[],events:[],commands:[],secret:'not allowed'})),type)).toThrow()
})
it('事件和命令使用实取params/sendParams/replyParams形状并保留真实参数名称说明',()=>{
 const value=decodeTslSource(new TextEncoder().encode(JSON.stringify({deviceTypeId:type,name:'参数类型',description:null,properties:[],events:[{id,deviceTypeId:type,eventKey:'tag_detected',name:'标签检测',level:'INFO',description:'检测新的RFID标签',sortOrder:0,createdAt:'2026-10-29T01:00:00Z',parameters:[{id:project,parameterKey:'tag_id',name:'标签ID',dataType:'TEXT',required:false,sortOrder:0,description:'唯一标识'}]}],commands:[{id,deviceTypeId:type,commandKey:'write_tag',name:'写入标签',description:'向指定标签写入',timeoutSeconds:30,sortOrder:0,inputSchema:'{"type":"object","properties":{"tag_id":{"type":"string","title":"目标标签ID","description":"要写入的标签"}}}',outputSchema:'{"type":"object","properties":{"success":{"type":"boolean","title":"是否成功","description":"写入操作是否成功"}}}'}]})),type)
 const result=thingsCloudTslFile(value),json=JSON.parse(result.file!.content)
 expect(result.issues).toEqual([]);expect(result.warnings.some(row=>row.message.includes('超时'))).toBe(true)
 expect(json.events).toEqual([{identifier:'tag_detected',name:'标签检测',descr:'检测新的RFID标签',params:[{identifier:'tag_id',name:'标签ID',dataType:'string',descr:'唯一标识'}],level:'info'}])
 expect(json.commands).toEqual([{identifier:'write_tag',name:'写入标签',descr:'向指定标签写入',sendParams:[{identifier:'tag_id',name:'目标标签ID',dataType:'string',descr:'要写入的标签'}],replyParams:[{identifier:'success',name:'是否成功',dataType:'boolean',descr:'写入操作是否成功'}]}])
 for(const[level,expected]of[['INFO','info'],['SUCCESS','success'],['WARNING','warning'],['ERROR','fault']] as const){const exported=thingsCloudTslFile({...value,events:[{...value.events[0]!,level}]});expect(exported.issues).toEqual([]);expect(JSON.parse(exported.file!.content).events[0].level).toBe(expected)}
})
it('六种属性类型、四个流向和对象子字段按真实Source形状导出，额外约束单独说明',()=>{
 const presentation={iconId:null,color:null,enumDescriptions:{},objectFields:{child:{name:'子字段名称',description:'子字段说明'}}}
 const properties=[{propertyKey:'report_number',name:'Number',dataType:'NUMBER',accessType:'REPORT'},{propertyKey:'share_switch',name:'Switch',dataType:'SWITCH',accessType:'SHARED',switchEncoding:'BOOLEAN',onLabel:'开',offLabel:'关'},{propertyKey:'report_enum',name:'Enum',dataType:'ENUM',accessType:'REPORT',enumOptions:['a','b'],presentation:{...presentation,enumDescriptions:{a:'甲',b:'乙'},objectFields:{}}},{propertyKey:'push_text',name:'Text',dataType:'TEXT',accessType:'DOWNLINK'},{propertyKey:'cloud_object',name:'Object',dataType:'OBJECT',accessType:'CLOUD_PRIVATE',schema:'{"type":"object","properties":{"child":{"type":"number"}},"required":["child"],"additionalProperties":false}',presentation},{propertyKey:'report_list',name:'List',dataType:'LIST',accessType:'REPORT',schema:'{"type":"array","items":{"type":"number"},"maxItems":10}'}].map((row,index)=>({...row,id:`00000000-0000-4000-8000-00000000000${index+3}`,deviceTypeId:type,sortOrder:index}))
 const value=decodeTslSource(new TextEncoder().encode(JSON.stringify({deviceTypeId:type,name:'六类型',description:null,properties,events:[],commands:[]})),type),result=thingsCloudTslFile(value),json=JSON.parse(result.file!.content)
 expect(result.issues).toEqual([]);expect(json.attributes.map((row:{dataType:string})=>row.dataType)).toEqual(['number','boolean','enum','string','object','list'])
 expect(json.attributes.map((row:{attributeType:string})=>row.attributeType)).toEqual(['report','share','report','push','cloud','report'])
 expect(json.attributes[2].options.enumMap).toEqual({a:'甲',b:'乙'});expect(json.attributes[4].options.children).toEqual([{identifier:'child',name:'子字段名称',dataType:'number',descr:'子字段说明',required:true}]);expect(json.attributes[5].options).toEqual({})
 expect(result.warnings.some(row=>row.message.includes('对象闭集'))).toBe(true);expect(result.warnings.some(row=>row.message.includes('TSL列表'))).toBe(true)
 for(const[encoding,expected]of[['BOOLEAN','boolean'],['NUMBER','number'],['TEXT','text']] as const){const exported=thingsCloudTslFile({...value,properties:[{...value.properties[1]!,switchEncoding:encoding}]});expect(exported.issues).toEqual([]);expect(JSON.parse(exported.file!.content).attributes[0].options.valueType).toBe(expected)}
 const unsupported=thingsCloudTslFile({...value,properties:[{...value.properties[0]!,accessType:'UNDEFINED'}]});expect(unsupported.file).toBeUndefined();expect(unsupported.issues[0]!.path).toBe('$.attributes[0].attributeType')
})
it('TSL弹窗复制和Blob下载真实文本，切换类型立即清除旧资料且拒绝旧出口',async()=>{
 changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'VIEWER',permissions:['device:read']} as never;session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}]
 const value=source(),transport={read:vi.fn().mockResolvedValue(value)},clipboard=vi.fn().mockResolvedValue(undefined),create=vi.fn().mockReturnValue('blob:tsl'),revoke=vi.fn(),click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 const descriptor=Object.getOwnPropertyDescriptor(navigator,'clipboard');Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:clipboard}});vi.stubGlobal('URL',class extends URL{static createObjectURL=create;static revokeObjectURL=revoke})
 const wrapper=mount(TslView,{props:{typeId:type,transport},global:{plugins:[ElementPlus]}})
 try{await flushPromises();expect(wrapper.find('script').exists()).toBe(false);expect(wrapper.get('pre').text()).toContain('9007199254740993')
  await wrapper.findAll('button').find(node=>node.text()==='复制 TSL')!.trigger('click');await flushPromises();expect(clipboard).toHaveBeenCalledWith(thingsCloudTslFile(value).file!.content);expect(feedback.success).toHaveBeenCalledWith('已复制 TSL');expect(wrapper.text()).not.toContain('已复制')
  await wrapper.findAll('button').find(node=>node.text()==='下载 TSL')!.trigger('click');expect(create).toHaveBeenCalledTimes(1);expect(create.mock.calls[0]![0]).toBeInstanceOf(Blob);expect(click).toHaveBeenCalledTimes(1)
  let finish!:()=>void;clipboard.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve}));await wrapper.findAll('button').find(node=>node.text()==='复制 TSL')!.trigger('click');transport.read.mockImplementation(()=>new Promise(()=>{}));await wrapper.setProps({typeId:project});finish();await flushPromises();expect(feedback.success).toHaveBeenCalledTimes(1);expect(feedback.error).not.toHaveBeenCalled();await flushPromises();expect(wrapper.find('pre').exists()).toBe(false);expect(wrapper.text()).not.toContain('已复制');expect(clipboard).toHaveBeenCalledTimes(2)
 }finally{wrapper.unmount();click.mockRestore();if(descriptor)Object.defineProperty(navigator,'clipboard',descriptor);else delete (navigator as unknown as {clipboard?:unknown}).clipboard;vi.unstubAllGlobals();session.user=null;session.projects=[]}
})
