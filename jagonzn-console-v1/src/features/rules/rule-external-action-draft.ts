import type {ActionDraft} from './RuleActionsEditor.vue'
import {definitionUuid} from './device-task-definition-port'
import {writePreprocessJson,type ExactJson} from './preprocess-exact-json'

export const externalAction=(type:string)=>type==='external-url-forward-action'||type==='external-mqtt-forward-action'
const urlFields=['url','targetRef','targetDigest','messageFormat','ignoreSslError']
const mqttFields=['host','port','clientId','username','topic','messageFormat','tls','credentialRef','credentialWriteId','targetDigest','credentialConfigured']
const bad=()=>new Error('外部转发配置回读未完整确认，请保留原草稿，不重复保存')
function exact(left:ExactJson|undefined,right:ExactJson|undefined){return left===undefined?right===undefined:right!==undefined&&writePreprocessJson(left)===writePreprocessJson(right)}
function fields(config:ActionDraft['config'],allowed:string[]){if(Object.keys(config).some(key=>!allowed.includes(key)))throw bad()}

export function validateExternalActionView(action:ActionDraft){
 if(action.credential)throw bad()
 const value=action.config
 fields(value,action.nodeType==='external-url-forward-action'?urlFields:mqttFields)
 if(!['SIMPLE','ADVANCED'].includes(String(value.messageFormat))||typeof value.targetDigest!=='string'||!/^[a-f0-9]{64}$/.test(value.targetDigest))throw bad()
 if(action.nodeType==='external-url-forward-action'){
  if(typeof value.url!=='string'||!definitionUuid(value.targetRef)||value.ignoreSslError!==false)throw bad()
 }else{
  if(value.tls!==true||typeof value.credentialConfigured!=='boolean'||value.credentialConfigured!==!!value.credentialRef||value.credentialConfigured!==!!value.credentialWriteId)throw bad()
  if(value.credentialConfigured&&(!definitionUuid(value.credentialRef)||!definitionUuid(value.credentialWriteId)))throw bad()
 }
}

/** 口令只在一次写意图中发送，管理回读的配置标记不能重新当成写权限。 */
export function externalActionBody(action:ActionDraft):string{
 fields(action.config,action.nodeType==='external-url-forward-action'?urlFields:mqttFields)
 const config=Object.fromEntries(Object.entries(action.config).filter(([key])=>key!=='credentialConfigured'))
 const credential=action.credential
 if(credential&&action.nodeType!=='external-mqtt-forward-action')throw bad()
 if(credential&&credential.mode==='REPLACE'&&(!definitionUuid(credential.writeId)||!credential.value||new TextEncoder().encode(credential.value).length>1024||credential.value.includes('\0')))throw new Error('请核对转发密码及其长度')
 return '{"nodeType":'+JSON.stringify(action.nodeType)+',"config":'+writePreprocessJson(config,true)+(credential?',"credential":'+JSON.stringify(credential):'')+'}'
}

/** 逐项核对本意图的非秘密字段与随机写入标识，不使用密码摘要证明轮转。 */
export function confirmExternalAction(wanted:ActionDraft,actual:ActionDraft){
 if(wanted.nodeType!==actual.nodeType||actual.credential)throw bad()
 validateExternalActionView(actual)
 const value=actual.config,original=wanted.config
 fields(value,wanted.nodeType==='external-url-forward-action'?urlFields:mqttFields)
 if(typeof value.targetDigest!=='string'||!/^[a-f0-9]{64}$/.test(value.targetDigest))throw bad()
 if(wanted.nodeType==='external-url-forward-action'){
  for(const key of ['url','messageFormat','ignoreSslError'])if(!exact(original[key],value[key]))throw bad()
  if(!definitionUuid(value.targetRef)||original.targetRef!==undefined&&!exact(original.targetRef,value.targetRef))throw bad()
  if(original.targetDigest!==undefined&&!exact(original.targetDigest,value.targetDigest))throw bad()
  return
 }
 for(const key of ['host','port','clientId','username','topic','messageFormat','tls'])if(!exact(original[key],value[key]))throw bad()
 if(typeof value.credentialConfigured!=='boolean')throw bad()
 if(wanted.credential?.mode==='REPLACE'){
  if(!value.credentialConfigured||!definitionUuid(value.credentialRef)||value.credentialWriteId!==wanted.credential.writeId||value.credentialRef===original.credentialRef)throw bad()
 }else if(wanted.credential?.mode==='CLEAR'){
  if(value.credentialConfigured||value.credentialRef!==undefined||value.credentialWriteId!==undefined)throw bad()
 }else{
  const configured=typeof original.credentialRef==='string'
  if(value.credentialConfigured!==configured||!exact(original.credentialRef,value.credentialRef)||!exact(original.credentialWriteId,value.credentialWriteId))throw bad()
 }
 if(original.targetDigest!==undefined&&!exact(original.targetDigest,value.targetDigest))throw bad()
}
