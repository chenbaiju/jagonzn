import {describe,it,expect} from 'vitest'
import {tagKeyError,tagValueError,validateTagRows} from '../../src/features/devices/tag-rules'
describe('可信设备标签规则',()=>{
 it('中文键、内部空格与旧ASCII键均保留原文且不改写大小写',()=>{for(const key of ['部门','服务 商','acceptance_batch','A-01','__proto__'])expect(validateTagRows([{key,value:'品控部'}])).toEqual([{key,value:'品控部'}])})
 it('键按Unicode码点而不是UTF16误截断，64个完整符号允许，65个拒绝',()=>{expect(tagKeyError('😀'.repeat(64))).toBeUndefined();expect(tagKeyError('😀'.repeat(65))).toBeDefined()})
 it('不可见空白、首尾ASCII空格、控制符与坏代理项拒绝',()=>{for(const key of ['', ' ', '\u00a0','\ufeff',' 部门','部门 ','a\n','a\u007f','a\u0085','a\ud800'])expect(tagKeyError(key)).toBeDefined()})
 it('值保持128UTF16现行边界，空白/NUL/坏代理拒绝，换行内容不伪改',()=>{expect(tagValueError('😀'.repeat(64))).toBeUndefined();expect(tagValueError('😀'.repeat(65))).toBeDefined();for(const value of ['', '\u00a0','\ufeff','\u001c','a\u0000','\udc00'])expect(tagValueError(value)).toBeDefined();expect(validateTagRows([{key:'部门',value:' 品\n控 '}])[0]!.value).toBe(' 品\n控 ')})
 it('完整表单先拒重复与半行，不将重复键覆盖或把用户填写行吞掉',()=>{expect(()=>validateTagRows([{key:'部门',value:'一'},{key:'部门',value:'二'}])).toThrow('重复');expect(()=>validateTagRows([{key:'',value:'已填写'}])).toThrow();expect(validateTagRows([{key:'',value:''}])).toEqual([])})
 it('20项数量边界且返回新行，不修改调用者编辑草稿',()=>{const rows=Array.from({length:20},(_,i)=>({key:`标签${i}`,value:'值'}));const result=validateTagRows(rows);result[0]!.value='新';expect(rows[0]!.value).toBe('值');expect(()=>validateTagRows([...rows,{key:'第21',value:'值'}])).toThrow('20')})
})
