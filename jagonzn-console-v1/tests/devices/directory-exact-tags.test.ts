import {describe,it,expect} from 'vitest'
import {directoryQuery} from '../../src/features/devices/directory-query'
const filters={online:'',activity:'',alarm:'',enabled:'',kind:''}
const extra=(key:string,value:string)=>({groupId:'',tagKey:key,tagValue:value})
describe('目录精确标签规则消费者',()=>{
 it('原文键和值进入生成query，不能沿创建策略裁剪成另一标签',()=>{const tagKey='\u2003部门\u2003',tagValue=' 品\n控 ';expect(directoryQuery('', '',filters,'CREATED_ASC',1,24,extra(tagKey,tagValue))).toMatchObject({tagKey,tagValue});const key='😀'.repeat(64);expect(directoryQuery('', '',filters,'CREATED_ASC',1,24,extra(key,'值')).tagKey).toBe(key)})
 it('超码点、控制字符与半行不能变成有效查询或静默丢筛选',()=>{for(const [key,value] of [['😀'.repeat(65),'值'],['坏\ud800','值'],['部门','值\u0000'],['','值'],['部门','']])expect(()=>directoryQuery('','',filters,'CREATED_ASC',1,24,extra(key!,value!))).toThrow()})
 it('只有两项都未填写时省略精确标签，空白原文不会伪装未筛选',()=>{const query=directoryQuery('','',filters,'CREATED_ASC',1,24,extra('',''));expect(query.tagKey).toBeUndefined();expect(query.tagValue).toBeUndefined();expect(()=>directoryQuery('','',filters,'CREATED_ASC',1,24,extra(' ',' '))).toThrow()})
})
