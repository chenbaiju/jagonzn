import type {LocationQuery} from 'vue-router'

/** 仅接受站内消息规则详情，保留其原有来源和标签参数。 */
export function ruleDetailReturnPath(query:LocationQuery):string|undefined{
 const value=query.returnRule
 if(typeof value!=='string'||!value.startsWith('/rules/messages/'))return undefined
 try{
  const parsed=new URL(value,'https://thingslink.invalid')
  if(parsed.origin!=='https://thingslink.invalid'||!/^\/rules\/messages\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(parsed.pathname))return undefined
  return parsed.pathname+parsed.search+parsed.hash
 }catch{return undefined}
}
