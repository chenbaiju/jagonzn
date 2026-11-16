import {confirmRuleContent,type RuleContentDraft,type RuleContentSnapshot} from './message-rule-content-api'
import type {ActionDraft} from './RuleActionsEditor.vue'
import {parsePreprocessJson,writePreprocessJson} from './preprocess-exact-json'

export type RuleContentRecovery={before:RuleContentSnapshot;draft:RuleContentDraft;urls:readonly {index:number;digest:string;ref?:string}[]}
/** 复用服务端既有targetDigest：已验证原URL的UTF8 SHA256，无规范化重排。 */
async function urlDigest(value:string):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('')}
function privateFreeAction(row:ActionDraft):ActionDraft{
 const config=parsePreprocessJson(writePreprocessJson(row.config)) as ActionDraft['config'];if(row.nodeType==='external-url-forward-action')delete config.url
 return {...row,config,...(row.credential?.mode==='REPLACE'?{credential:{mode:'REPLACE' as const,writeId:row.credential.writeId,value:''}}:row.credential?{credential:{...row.credential}}:{})}
}
export function privateFreeContent(snapshot:RuleContentSnapshot):RuleContentSnapshot{return {...snapshot,actions:snapshot.actions.map(privateFreeAction)}}
/** 必须在原PUT前冻结；不保存密码或URL原文，也不从后来的GET反造原意图。 */
export async function freezeRuleContentRecovery(before:RuleContentSnapshot,draft:RuleContentDraft):Promise<RuleContentRecovery>{
 const urls:RuleContentRecovery['urls'][number][]=[]
 for(let index=0;index<draft.actions.length;index++){
  const row=draft.actions[index]!;if(row.nodeType!=='external-url-forward-action')continue
  if(typeof row.config.url!=='string')throw new Error('外部URL原意图不完整，请重新配置')
  urls.push({index,digest:await urlDigest(row.config.url),...(typeof row.config.targetRef==='string'?{ref:row.config.targetRef}:{})})
 }
 return {before:privateFreeContent(before),draft:{...draft,source:{...draft.source},actions:draft.actions.map(privateFreeAction)},urls}
}
/** GET只与写前固定摘要、已知引用及完整版本事实比较；临时URL不进入恢复意图。 */
export async function confirmRuleContentRecovery(recovery:RuleContentRecovery,fresh:RuleContentSnapshot,knownVersionId?:string):Promise<void>{
 const actions=recovery.draft.actions.map(privateFreeAction)
 for(const anchor of recovery.urls){
  const actual=fresh.actions[anchor.index],wanted=actions[anchor.index]
  if(!actual||!wanted||actual.nodeType!=='external-url-forward-action'||actual.config.targetDigest!==anchor.digest||typeof actual.config.url!=='string'||await urlDigest(actual.config.url)!==anchor.digest||anchor.ref!==undefined&&actual.config.targetRef!==anchor.ref)throw new Error('原URL保存结果尚未完整核对，请勿重复保存')
  wanted.config.url=actual.config.url;wanted.config.targetDigest=anchor.digest
 }
 confirmRuleContent({...recovery.draft,actions},fresh,recovery.before)
 if(knownVersionId&&fresh.versionId!==knownVersionId)throw new Error('当前版本不是原保存版本')
}
