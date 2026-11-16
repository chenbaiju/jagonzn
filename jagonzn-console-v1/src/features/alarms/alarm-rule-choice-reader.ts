import {assertIdentity,identityEpoch,IdentityChanged,onIdentityChange} from '../../core/http'
import type {AlarmRuleConfiguration} from './alarm-rule-management-api'
import type {AlarmRuleEditorChoices} from './alarm-rule-editor-draft'
import {readAlarmRuleChoicePage,type AlarmRuleChoicePage,type AlarmRuleChoiceCatalogKind} from './alarm-rule-choice-catalog'
export type AlarmRuleChoiceCategory='sources'|'groups'|'applications'
export type AlarmRulePagedEditorChoices=AlarmRuleEditorChoices&{pages:Record<AlarmRuleChoiceCategory,{previous:boolean;next:boolean}>}
/** 是编辑资料port，不是HTTP DTO；实际模型适配器需另行消费正式生成Schema。 */
export type AlarmRuleSourceChoices=Pick<AlarmRuleEditorChoices,'sources'|'properties'>
type Source=AlarmRuleConfiguration['source']
type Bucket={cursors:(string|undefined)[];index:number;next:string|null}
const blank=():Bucket=>({cursors:[undefined],index:0,next:null})
export function createAlarmRuleChoiceReader(readMetadata:(project:string,source:Source,signal:AbortSignal)=>Promise<AlarmRuleSourceChoices>,readPage=readAlarmRuleChoicePage){
 let project='',kind:Source['kind']='DEVICE',query='',revision=0
 let buckets:Record<AlarmRuleChoiceCategory,Bucket>={sources:blank(),groups:blank(),applications:blank()}
 function clear(){revision++;project='';query='';buckets={sources:blank(),groups:blank(),applications:blank()}}
 const disposeIdentity=onIdentityChange(clear)
 function move(category:AlarmRuleChoiceCategory,direction:'previous'|'next'){
  const bucket=buckets[category]
  if(direction==='previous'){if(!bucket.index)return false;bucket.index--}
  else{if(!bucket.next)return false;bucket.cursors.splice(bucket.index+1);bucket.cursors.push(bucket.next);bucket.index++}
  bucket.next=null;revision++;return true
 }
 async function load(nextProject:string,source:Source,keyword:string,signal:AbortSignal):Promise<AlarmRulePagedEditorChoices>{
  if(nextProject!==project){clear();project=nextProject;kind=source.kind;query=keyword}
  if(source.kind!==kind||keyword!==query){buckets.sources=blank();kind=source.kind;query=keyword;revision++}
  const expected=++revision,epoch=identityEpoch(),requested={kind:source.kind,ids:[...source.ids]},categories=['sources','groups','applications'] as const
  const observations=Object.fromEntries(categories.map(category=>[category,{index:buckets[category].index,cursor:buckets[category].cursors[buckets[category].index]}])) as Record<AlarmRuleChoiceCategory,{index:number;cursor:string|undefined}>
  const catalogKinds:Record<AlarmRuleChoiceCategory,AlarmRuleChoiceCatalogKind>={sources:requested.kind,groups:'GROUP',applications:'APPLICATION'}
  const [metadata,...pages]=await Promise.all([
   requested.ids.length?readMetadata(nextProject,requested,signal):Promise.resolve({sources:[],properties:[]} as AlarmRuleSourceChoices),
   ...categories.map(category=>readPage(nextProject,catalogKinds[category],category==='sources'?keyword:'',observations[category].cursor,signal)),
  ]) as [AlarmRuleSourceChoices,AlarmRuleChoicePage,AlarmRuleChoicePage,AlarmRuleChoicePage]
  assertIdentity(epoch);signal.throwIfAborted();if(expected!==revision||nextProject!==project)throw new IdentityChanged()
  if(metadata.sources.length!==requested.ids.length||metadata.sources.some((item,index)=>item.id!==requested.ids[index]))throw new Error('当前模型资料与来源身份不一致')
  for(let i=0;i<categories.length;i++){const category=categories[i]!,next=pages[i]!.nextCursor;if(next&&buckets[category].cursors.slice(0,observations[category].index+1).includes(next))throw new Error('规则选项目录游标重复，请重新读取')}
  for(let i=0;i<categories.length;i++)buckets[categories[i]!].next=pages[i]!.nextCursor
  // 明确选中来源的批量当前名称比目录页旧名称优先，最多1000+200项，不逐个GET补标签。
  const selected=new Set(metadata.sources.map(item=>item.id)),sources=[...metadata.sources,...pages[0].items.filter(item=>!selected.has(item.id))]
  return {projectId:nextProject,source:requested,sources,properties:metadata.properties,groups:pages[1].items,applications:pages[2].items,pages:Object.fromEntries(categories.map(category=>[category,{previous:observations[category].index>0,next:buckets[category].next!==null}])) as AlarmRulePagedEditorChoices['pages']}
 }
 return {load,move,clear,dispose(){clear();disposeIdentity()}}
}
