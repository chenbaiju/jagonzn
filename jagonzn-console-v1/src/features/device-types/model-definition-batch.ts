import {propertyTransport,preparePropertyDelete,type PropertyTransport} from './property-definition-api'
import {eventDefinitionTransport,prepareEventDelete,type EventDefinitionTransport} from './event-definition-api'
import {commandTransport,prepareCommandDelete,type CommandTransport} from './command-definition-api'

export type DefinitionBatchKind='property'|'event'|'command'
export type DefinitionBatchRow=Readonly<{id:string;kind:DefinitionBatchKind;name:string;identifier:string;fingerprint:string}>
export type DefinitionBatchIntent=Readonly<{row:DefinitionBatchRow;key:string;remove:(signal:AbortSignal)=>Promise<unknown>;read:(signal:AbortSignal)=>Promise<readonly DefinitionBatchRow[]>}>
export type DefinitionBatchTransport={load:(project:string,type:string,signal:AbortSignal)=>Promise<readonly DefinitionBatchRow[]>;prepare:(project:string,type:string,row:DefinitionBatchRow)=>DefinitionBatchIntent}
type Transports={properties:PropertyTransport;events:EventDefinitionTransport;commands:CommandTransport}
const fingerprint=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item)
/** 仅编排已有单条删除，选择范围是明确的定义ID，不能把三路请求解释为原子模型操作。 */
export function definitionBatchTransport(ports:Transports={properties:propertyTransport,events:eventDefinitionTransport,commands:commandTransport}):DefinitionBatchTransport{
 const rows=async(project:string,type:string,kind:DefinitionBatchKind,signal:AbortSignal):Promise<readonly DefinitionBatchRow[]>=>{
  const values=kind==='property'?await ports.properties.list(project,type,signal):kind==='event'?await ports.events.list(project,type,signal):await ports.commands.list(project,type,signal)
  return values.map(value=>({id:value.id,kind,name:value.name,identifier:'propertyKey'in value?value.propertyKey:'eventKey'in value?value.eventKey:value.commandKey,fingerprint:fingerprint(value)}))
 }
 return {
  async load(project,type,signal){return(await Promise.all((['property','event','command']as const).map(kind=>rows(project,type,kind,signal)))).flat()},
  prepare(project,type,row){
   // 原删除适配器只取身份与名称；先用实际已读定义构造原键，所有HTTP仍走既有正式合同。
   const actual=JSON.parse(row.fingerprint)
   const read=(signal:AbortSignal)=>rows(project,type,row.kind,signal)
   if(row.kind==='property'){const intent=preparePropertyDelete(project,type,actual);return Object.freeze({row,key:intent.key,read,remove:(signal:AbortSignal)=>ports.properties.write(intent,signal)})}
   if(row.kind==='event'){const intent=prepareEventDelete(project,type,actual);return Object.freeze({row,key:intent.key,read,remove:(signal:AbortSignal)=>ports.events.write(intent,signal)})}
   const intent=prepareCommandDelete(project,type,actual);return Object.freeze({row,key:intent.key,read,remove:(signal:AbortSignal)=>ports.commands.write(intent,signal)})
  }
 }
}
