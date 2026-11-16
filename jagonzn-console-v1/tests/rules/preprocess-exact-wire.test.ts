import {describe,expect,it} from 'vitest'
import {ExactDecimal,writePreprocessJson,type ExactJson} from '../../src/features/rules/preprocess-exact-json'

describe('自动化精确数值线格式',()=>{
  it('整数与小数不使用指数表示',()=>{
    const wire=writePreprocessJson({durationSeconds:new ExactDecimal('30'),value:new ExactDecimal('66.75')} as unknown as ExactJson,false,true)
    expect(wire).toBe('{"durationSeconds":30,"value":66.75}')
    expect(wire).not.toMatch(/e[+-]?\d/i)
  })
})
