import { describe, expect, it } from 'vitest'
import { emailEditRequest, emailOptionSnapshot } from '../../src/features/alarms/model'
const snapshot=[{ id:'r1',groupId:'g',channel:'EMAIL' as const,target:'a***@example.invalid',enabled:true,version:7 },{id:'r2',groupId:'g',channel:'EMAIL' as const,target:'b***@example.invalid',enabled:false,version:11}]
describe('原站邮箱回填安全兼容',()=>{
 it('不变的脱敏行只发送既有身份，新增行才提交真实地址',()=>{expect(emailEditRequest('a***@example.invalid\nnew@example.invalid',snapshot)).toEqual({addedEmails:['new@example.invalid'],retainedRecipientIds:['r1'],expectedRecipients:[{id:'r1',version:7},{id:'r2',version:11}]})})
 it('不存在或重复的脱敏占位不得变为新邮件地址',()=>{expect(()=>emailEditRequest('missing***@example.invalid',snapshot)).toThrow();expect(()=>emailEditRequest('a***@example.invalid\na***@example.invalid',snapshot)).toThrow()})
 it('空邮箱或重复真实地址明确拒绝，不静默去重',()=>{expect(()=>emailEditRequest('\n',snapshot)).toThrow();expect(()=>emailEditRequest('n@example.invalid\nn@example.invalid',snapshot)).toThrow()})
 it('跨组或版本不完整的响应不回填',()=>{expect(()=>emailOptionSnapshot({recipients:snapshot},'other')).toThrow();expect(()=>emailOptionSnapshot({recipients:[{...snapshot[0],version:undefined}]},'g')).toThrow();expect(emailOptionSnapshot({recipients:snapshot},'g')).toEqual(snapshot)})
 it('相同脱敏地址可完整保留但不能猜测部分删除了哪个身份',()=>{const same=[snapshot[0],{...snapshot[0],id:'r3',version:19}];expect(emailEditRequest('a***@example.invalid\na***@example.invalid',same).retainedRecipientIds).toEqual(['r1','r3']);expect(()=>emailEditRequest('a***@example.invalid',same)).toThrow('多个邮箱脱敏后相同');expect(emailEditRequest('replacement@example.invalid',same).retainedRecipientIds).toEqual([])})
 it('重复的收件人身份响应明确拒绝',()=>{expect(()=>emailOptionSnapshot({recipients:[snapshot[0],snapshot[0]]},'g')).toThrow()})
})
