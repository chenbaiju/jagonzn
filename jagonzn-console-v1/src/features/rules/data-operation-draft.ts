import {normalizeDataOperations,type DataOperation,type DataOperations} from './data-operations-api'
import type {TypePreprocessEditDraft} from './preprocess-version-editor'

export type DataOperationCommand={token:string;kind:'ADD'|'SORT'}|{token:string;kind:'EDIT'|'REMOVE';id:string}
/** 旧单操作只作只读/编辑投影，临时ID不写入旧版本，也不据此切换字节输入合同。 */
export function dataOperationView(value:TypePreprocessEditDraft):DataOperations{
 if(value.dataOperations)return normalizeDataOperations(value.dataOperations)
 let operation:DataOperation
 if(value.subdeviceNativeParser)operation={id:'legacy-single',kind:'MODBUS_RTU',subdeviceNativeParser:value.subdeviceNativeParser}
 else if(value.nativeParser)operation={id:'legacy-single',kind:'MODBUS_RTU',nativeParser:value.nativeParser}
 else if(value.gatewayParser)operation={id:'legacy-single',kind:'GATEWAY_PROPERTY',gatewayParser:value.gatewayParser}
 else if(value.dataDownlink)operation={id:'legacy-single',kind:'DATA_DOWNLINK',dataDownlink:value.dataDownlink,transportTarget:'ORIGINAL_PHYSICAL_DEVICE'}
 else{if(value.functions.length!==1||value.functions[0]!.format!=='COMMON_JS')throw new Error('DATA操作资料不完整，请重新读取');operation={id:'legacy-single',kind:'PROPERTY',function:{format:'COMMON_JS',source:value.functions[0]!.source}}}
 return Object.freeze({profile:'DATA_OPERATIONS_V1',operations:Object.freeze([operation])}) as DataOperations
}
/** 旧单项原位编辑保原格式；明确新增组合才采用已有组合合同，排序只保存展示序。 */
export function applyDataOperationDraft(before:TypePreprocessEditDraft,value:DataOperations,upgrade:boolean):TypePreprocessEditDraft{
 const checked=before.dataOperations||upgrade?normalizeDataOperations(value):value,next:TypePreprocessEditDraft={...before,functions:[]}
 delete next.nativeParser;delete next.subdeviceNativeParser;delete next.gatewayParser;delete next.dataDownlink
 if(before.dataOperations||upgrade)return {...next,dataOperations:checked}
 if(checked.operations.length!==1)throw new Error('旧单操作不能在原格式中保存多项配置')
 const row=checked.operations[0]!;delete next.dataOperations
 if(row.kind==='MODBUS_RTU'){if(row.subdeviceNativeParser)next.subdeviceNativeParser=row.subdeviceNativeParser;else next.nativeParser=row.nativeParser}
 else if(row.kind==='GATEWAY_PROPERTY')next.gatewayParser=row.gatewayParser
 else if(row.kind==='DATA_DOWNLINK')next.dataDownlink=row.dataDownlink
 else{if(!row.function||!before.functions[0])throw new Error('原属性解析函数资料不完整');next.functions=[{...before.functions[0],format:'COMMON_JS',source:row.function.source}]}
 return next
}
