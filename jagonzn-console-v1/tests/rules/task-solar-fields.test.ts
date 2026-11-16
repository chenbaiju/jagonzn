import { expect,it } from 'vitest'
import { solarFields,solarPosition,solarBeforeMinutes,type SolarFieldsDraft } from '../../src/features/rules/task-solar-fields'
const draft=(patch:Partial<SolarFieldsDraft>={}):SolarFieldsDraft=>({event:'SUNRISE',beforeMinutes:0,position:{latitude:31.2304,longitude:121.4737},...patch})
it.each(solarBeforeMinutes)('只接已观察的前后%d分钟',beforeMinutes=>{expect(solarFields(draft({beforeMinutes})).beforeMinutes).toBe(beforeMinutes)})
it.each([-15,1,15,61,5.1,NaN,Infinity])('偏移%s不隐式取整/扩充为未知列表',beforeMinutes=>{expect(()=>solarFields(draft({beforeMinutes}))).toThrow('前后偏移')})
it('日落保持已有地点且冻结独立副本',()=>{const input=draft({event:'SUNSET'}),value=solarFields(input);expect(value.event).toBe('SUNSET');expect(value.position).toEqual(input.position);expect(value.position).not.toBe(input.position)})
it('无位置不推断零坐标且零坐标本身有效',()=>{expect(()=>solarFields(draft({position:undefined}))).toThrow('配置');expect(solarPosition({latitude:0,longitude:0})).toEqual({latitude:0,longitude:0});expect(Object.is(solarPosition({latitude:-0,longitude:-0}).latitude,-0)).toBe(false)})
it.each([{latitude:90,longitude:180},{latitude:-90,longitude:-180},{latitude:0.00000001,longitude:-0.00000001},{latitude:31.12345678,longitude:121.12345678}])('有限坐标预算保留%o',position=>{expect(solarPosition(position)).toEqual(position)})
it.each([{latitude:91,longitude:0},{latitude:0,longitude:181},{latitude:NaN,longitude:0},{latitude:Infinity,longitude:0},{latitude:0.000000001,longitude:0},{latitude:1.0000000000000002,longitude:0},{latitude:'31.2',longitude:0},{latitude:0,longitude:null}])('坏坐标不默认/舍入%o',position=>{expect(()=>solarPosition(position)).toThrow('坐标')})
it('缺失坐标或额外位置权限/SDK字段整体拒绝',()=>{expect(()=>solarPosition({latitude:0})).toThrow('配置');expect(()=>solarPosition({latitude:0,longitude:0,locationPermission:true})).toThrow('配置')})
it('未知太阳事件和内部游标不能进入展示草稿',()=>{expect(()=>solarFields(draft({event:'TWILIGHT' as never}))).toThrow('事件');expect(()=>solarFields({...draft(),consumedThrough:'2026-10-24'} as SolarFieldsDraft)).toThrow('事件')})
