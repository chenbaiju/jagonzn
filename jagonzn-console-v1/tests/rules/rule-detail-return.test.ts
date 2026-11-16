import {expect,it} from 'vitest'
import {ruleDetailReturnPath} from '../../src/features/rules/rule-detail-return'

it('只返回原消息规则详情并保留入口参数',()=>{
 const path='/rules/messages/01a1ac08-fba7-7a6a-a6fc-7ab292d774ae?origin=directory&source=device-type&tab=rule'
 expect(ruleDetailReturnPath({returnRule:path})).toBe(path)
 expect(ruleDetailReturnPath({returnRule:'//example.com/rules/messages/01a1ac08-fba7-7a6a-a6fc-7ab292d774ae'})).toBeUndefined()
 expect(ruleDetailReturnPath({returnRule:'/rules/messages/../devices'})).toBeUndefined()
 expect(ruleDetailReturnPath({returnRule:['/rules/messages/01a1ac08-fba7-7a6a-a6fc-7ab292d774ae']})).toBeUndefined()
 expect(ruleDetailReturnPath({})).toBeUndefined()
})
