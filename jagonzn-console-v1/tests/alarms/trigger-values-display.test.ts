import { afterEach, describe, expect, it, vi } from 'vitest'
import { alarmTriggerValuesDisplay } from '../../src/features/alarms/alarm-trigger-values-display'

const at='2026-10-25T03:04:05.123456Z'
const item=(extra:Record<string,unknown>={})=>({key:'temperature',dataType:'NUMBER',known:true,valueJson:'81',truncated:false,acceptedAt:at,timeBasis:'ALARM_INTAKE',...extra})
const summary=(items:unknown[]=[item()],totalProperties=items.length,truncated=false)=>({totalProperties,items,truncated})
afterEach(()=>vi.unstubAllGlobals())

describe('单事件触发值摘要的纯文本显示',()=>{
  it('六型保留精确大数、false、空字符串与复合JSON，不补当前名称或单位',()=>{
    const input=summary([
      item({key:'a-number',valueJson:'9007199254740993.1234567890123456789'}),
      item({key:'b-text',dataType:'TEXT',valueJson:'""'}),
      item({key:'c-switch',dataType:'SWITCH',valueJson:'false'}),
      item({key:'d-enum',dataType:'ENUM',valueJson:'"running"'}),
      item({key:'e-list',dataType:'LIST',valueJson:'[0,false,null,9007199254740993]'}),
      item({key:'f-object',dataType:'OBJECT',valueJson:'{"nested":[9007199254740993.123456789,null]}'}),
    ])
    const result=alarmTriggerValuesDisplay(input)
    expect(result.items.map(row=>row.value)).toEqual(['9007199254740993.1234567890123456789','""','false','running','[0,false,null,9007199254740993]','{"nested":[9007199254740993.123456789,null]}'])
    expect(result.lines[0]).toBe('a-number：9007199254740993.1234567890123456789')
    expect(result.notices).toEqual([]);expect(result.text).not.toContain('℃');expect(result.text).not.toContain('当前')
  })
  it('同一事故的81/82/79按事件自己的摘要显示，零值也不变成未知',()=>{
    const rows=['81','82','79','0'].map((raw,index)=>({eventId:`event-${index}`,instanceId:'same-cleared-instance',triggerValues:summary([item({valueJson:raw})])}))
    expect(rows.map(row=>alarmTriggerValuesDisplay(row.triggerValues).text)).toEqual(['temperature：81','temperature：82','temperature：79','temperature：0'])
  })
  it('缺类型未知与已知类型NO_VALUE都明确未知，已知值未知年龄仍保留原值',()=>{
    const result=alarmTriggerValuesDisplay(summary([
      item({key:'a',dataType:null,known:false,valueJson:null,acceptedAt:null,timeBasis:'UNKNOWN'}),
      item({key:'b',dataType:'SWITCH',known:false,valueJson:null,acceptedAt:null,timeBasis:'UNKNOWN'}),
      item({key:'c',valueJson:'0',acceptedAt:null,timeBasis:'UNKNOWN'}),
    ]))
    expect(result.lines).toEqual(['a：未知','b：未知','c：0'])
    expect(result.items[0]?.dataType).toBeNull();expect(result.items[2]).toMatchObject({known:true,value:'0',acceptedAt:null,timeBasis:'UNKNOWN'})
  })
  it('长值与未显示键分别明确说明，不以null或前缀伪造完整内容',()=>{
    const result=alarmTriggerValuesDisplay(summary([item({key:'a',dataType:'OBJECT',valueJson:null,truncated:true}),item({key:'b',valueJson:'82'})],5,true))
    expect(result.lines).toEqual(['a：内容较长','b：82']);expect(result.notices).toEqual(['另3个属性未显示','内容较长，查看详情'])
    expect(result.omittedProperties).toBe(3);expect(result.truncated).toBe(true)
  })
  it('空items整包拒绝，明确截断仍可合法只展示少于8项',()=>{
    expect(()=>alarmTriggerValuesDisplay(summary([],200,true))).toThrow()
    const partial=alarmTriggerValuesDisplay(summary([item()],200,true))
    expect(partial.items).toHaveLength(1);expect(partial.notices).toEqual(['另199个属性未显示'])
  })
  it.each(['LIST','OBJECT'])('完整%s片段容器深度16接受而17拒绝，不放宽共享parser',dataType=>{
    const fragment=(depth:number)=>dataType==='LIST'?'['.repeat(depth)+'9007199254740993'+']'.repeat(depth):'{"x":'.repeat(depth)+'9007199254740993'+'}'.repeat(depth)
    const sixteen=fragment(16)
    expect(alarmTriggerValuesDisplay(summary([item({dataType,valueJson:sixteen})])).items[0]?.value).toBe(sixteen)
    expect(()=>alarmTriggerValuesDisplay(summary([item({dataType,valueJson:fragment(17)})]))).toThrow()
  })
  it('8项完整摘要可大于4KiB且在8KiB保守wire预算内',()=>{
    const input=summary(Array.from({length:8},(_,index)=>item({key:String.fromCharCode(97+index).padEnd(64,'_'),dataType:'TEXT',valueJson:JSON.stringify('\\'.repeat(127))})))
    const wire=new TextEncoder().encode(JSON.stringify(input)).byteLength
    expect(wire).toBeGreaterThan(4*1024);expect(wire).toBeLessThanOrEqual(8*1024)
    expect(alarmTriggerValuesDisplay(input).items).toHaveLength(8)
  })
  it('不活跃附实际历史微秒平台接纳依据，未知年龄不制造设备时刻',()=>{
    const input=summary([
      item({key:'a',timeBasis:'ALARM_INTAKE'}),
      item({key:'b',acceptedAt:'2026-10-25T11:04:05.123456+08:00',timeBasis:'PLATFORM_ACCEPTED'}),
      item({key:'c',acceptedAt:null,timeBasis:'UNKNOWN'}),
    ])
    expect(alarmTriggerValuesDisplay(input,'INACTIVITY').lines).toEqual([
      'a：81（告警平台接纳时间：2026-10-25 11:04:05）',
      'b：81（平台属性接纳时间：2026-10-25 11:04:05）',
      'c：81（平台接纳时间未知）',
    ])
    expect(alarmTriggerValuesDisplay(input,'ATTRIBUTES').text).not.toContain('接纳时间')
  })
  it('不活跃Z和offset接纳时间统一东八区人类显示，模型原串与依据逐字保留',()=>{
    const offset='2026-10-25T11:04:05.123456+08:00'
    const result=alarmTriggerValuesDisplay(summary([item({key:'a'}),item({key:'b',acceptedAt:offset,timeBasis:'PLATFORM_ACCEPTED'})]),'INACTIVITY')
    expect(result.lines).toEqual(['a：81（告警平台接纳时间：2026-10-25 11:04:05）','b：81（平台属性接纳时间：2026-10-25 11:04:05）'])
    expect(result.items.map(row=>row.acceptedAt)).toEqual([at,offset])
    expect(result.items.map(row=>row.timeBasis)).toEqual(['ALARM_INTAKE','PLATFORM_ACCEPTED'])
  })
  it('公式与HTML保持纯文本，无请求；导出文件防公式规则仍由原文件层负责',()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
    const result=alarmTriggerValuesDisplay(summary([
      item({key:'a',dataType:'TEXT',valueJson:JSON.stringify('=HYPERLINK("https://example.test")')}),
      item({key:'b',dataType:'TEXT',valueJson:JSON.stringify('<img src=x onerror="alert(1)">')}),
    ]))
    const element=document.createElement('div');element.textContent=result.text
    expect(result.items[0]?.value).toBe('=HYPERLINK("https://example.test")')
    expect(element.querySelector('img')).toBeNull();expect(element.textContent).toContain('<img');expect(fetch).not.toHaveBeenCalled()
  })
  it('输入变化不污染冻结显示，所有对外集合均不可变',()=>{
    const row=item(),input=summary([row]),result=alarmTriggerValuesDisplay(input)
    row.valueJson='79';input.items.length=0
    expect(result.text).toBe('temperature：81');expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.items)).toBe(true);expect(Object.isFrozen(result.items[0])).toBe(true)
    expect(Object.isFrozen(result.lines)).toBe(true);expect(Object.isFrozen(result.notices)).toBe(true)
    expect(()=>{(result.items as unknown[]).push(item())}).toThrow()
  })
  it('256字节上限按UTF8原JSON文本计算，不能按字符或规范化后长度放宽',()=>{
    expect(alarmTriggerValuesDisplay(summary([item({dataType:'TEXT',valueJson:JSON.stringify('文'.repeat(84))})])).items[0]?.value).toBe('文'.repeat(84))
    expect(()=>alarmTriggerValuesDisplay(summary([item({dataType:'TEXT',valueJson:JSON.stringify('文'.repeat(85))})]))).toThrow()
    expect(()=>alarmTriggerValuesDisplay(summary([item({valueJson:' '.repeat(256)+'81'})]))).toThrow()
  })
  it.each([
    ['NUMBER','"81"'],['TEXT','81'],['SWITCH','0'],['ENUM','false'],['LIST','{}'],['OBJECT','[]'],['OBJECT','null'],
  ])('拒绝%s与JSON类型不符 %s',(dataType,valueJson)=>{
    expect(()=>alarmTriggerValuesDisplay(summary([item({dataType,valueJson})]))).toThrow()
  })
  it.each([
    '{"x":1,"x":2}','81 x','NaN','Infinity','01','"\\u0000"','"\\ud800"','[1,]','[',
  ])('损坏完整JSON不能变成显示文本 %s',valueJson=>{
    expect(()=>alarmTriggerValuesDisplay(summary([item({dataType:'OBJECT',valueJson})]))).toThrow()
  })
  it.each([
    {dataType:null}, {dataType:null,valueJson:null,truncated:true},
    {known:false,valueJson:'0',acceptedAt:null,timeBasis:'UNKNOWN'},
    {known:false,valueJson:null,truncated:true,acceptedAt:null,timeBasis:'UNKNOWN'},
    {known:false,valueJson:null}, {known:false,valueJson:null,acceptedAt:null,timeBasis:'ALARM_INTAKE'},
    {valueJson:null}, {truncated:true,valueJson:'81'},
    {acceptedAt:null,timeBasis:'ALARM_INTAKE'}, {acceptedAt:at,timeBasis:'UNKNOWN'},
  ])('未知/长值/时间依据不得互相冒用 %j',bad=>{
    const row=item(bad)
    expect(()=>alarmTriggerValuesDisplay(summary([row],1,row.truncated))).toThrow()
  })
  it.each(['2026-02-30T00:00:00Z','2025-02-29T00:00:00Z','2026-10-25T24:00:00Z','2026-10-25T00:00:60Z',
    '2026-10-25T00:00:00.1234567Z','2026-10-25T00:00:00','2026-10-25T00:00:00+0800','invalid'])('拒绝非真实RFC3339微秒时间 %s',acceptedAt=>{
    expect(()=>alarmTriggerValuesDisplay(summary([item({acceptedAt})]))).toThrow()
  })
  it('Gregorian闰日和微秒原文保持真实值',()=>{
    const acceptedAt='2024-02-29T00:00:00.000001Z'
    expect(alarmTriggerValuesDisplay(summary([item({acceptedAt})])).items[0]?.acceptedAt).toBe(acceptedAt)
  })
  it.each([0,201,1.5,NaN,'1'])('拒绝不存在或越界总属性数 %s',totalProperties=>{
    expect(()=>alarmTriggerValuesDisplay({...summary(),totalProperties})).toThrow()
  })
  it('最多8项与有序唯一ASCII键严格核验，不静默排序或截取',()=>{
    for(const input of [summary(Array.from({length:9},(_,index)=>item({key:`p${index}`}))),summary([item({key:'b'}),item({key:'a'})]),
      summary([item({key:'a'}),item({key:'a'})]),summary([item({key:'温度'})]),summary([item({key:'a'.repeat(65)})]),summary([item({key:''})]),
      summary([item({key:'a'}),item({key:'b'})],1)])expect(()=>alarmTriggerValuesDisplay(input)).toThrow()
  })
  it('top truncated严格等于遗漏或长值，不能掩盖不完整集合',()=>{
    for(const input of [summary([item()],2,false),summary([item()],1,true),summary([item({valueJson:null,truncated:true})],1,false)])
      expect(()=>alarmTriggerValuesDisplay(input)).toThrow()
  })
  it('根和条目缺失/扩展/非闭集拒绝，getter不执行',()=>{
    const missing={...item()} as Record<string,unknown>;delete missing.valueJson
    const getter=vi.fn(()=>1),root={...summary()};Object.defineProperty(root,'totalProperties',{get:getter,enumerable:true})
    const cases:unknown[]=[null,[],{...summary(),extra:true},{...summary(),[Symbol('extra')]:true},summary([missing]),summary([{...item(),extra:true}]),root]
    for(const input of cases)expect(()=>alarmTriggerValuesDisplay(input)).toThrow()
    expect(getter).not.toHaveBeenCalled()
  })
  it('稀疏、带扩展或getter的数组不在纯JSON合同内',()=>{
    const sparse=new Array(1),extra=[item()] as unknown[]&{extra?:boolean};extra.extra=true
    const getter=vi.fn(()=>item()),accessor=[item()];Object.defineProperty(accessor,0,{get:getter,enumerable:true})
    for(const items of [sparse,extra,accessor])expect(()=>alarmTriggerValuesDisplay({totalProperties:1,items,truncated:false})).toThrow()
    expect(getter).not.toHaveBeenCalled()
  })
})
