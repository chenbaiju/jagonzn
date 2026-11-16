import {expect,it} from 'vitest'
import raw from './fixtures/things-cloud-numeric-functions.json?raw'
import {convertThingsCloudFunctionTsl,convertThingsCloudNumberFunctionTsl} from '../../src/features/device-types/things-cloud-tsl'
import {functionTslMaterialFormat,numericFunctionTslMaterialFormat,decodeMaterialEvents,decodeMaterialCommands} from '../../src/features/device-types/function-material-values'
import {prepareTslMaterial,decodeTslMaterialPreview,prepareTslMaterialConfirmation,decodeTslMaterialReceipt} from '../../src/features/device-types/tsl-material-import-api'
import {parseDashboardRuntimeResponse} from '@things-link/client-contracts/dashboard/v1'
const encode=(value:unknown)=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value))
const project='10000000-0000-4000-8000-000000000001',target='20000000-0000-4000-8000-000000000001'
it('V4数值事件与双向命令参数明确平台规则，V3仍整份拒绝',()=>{
 const old=convertThingsCloudFunctionTsl(encode(raw));expect(old.issues.length).toBeGreaterThan(0);expect(old.events).toEqual([]);expect(old.commands).toEqual([])
 const value=convertThingsCloudNumberFunctionTsl(encode(raw));expect(value.issues).toEqual([]);expect(value.events[0]!.parameters[0]!.dataType).toBe('NUMBER')
 const command=value.commands[0]!,input=JSON.parse(command.inputSchema!),output=JSON.parse(command.outputSchema!);
 expect(input.properties.threshold).toEqual({type:'number',title:'阈值',description:'目标阈值'});expect(output.properties.measured.type).toBe('number');expect(output.properties.accepted.type).toBe('boolean');expect(input.required).toBeUndefined();expect(input.additionalProperties).toBeUndefined();
 expect(value.adaptationDecisions).toHaveLength(4);expect(value.adaptationDecisions[0]!.message).toContain('最多38');expect(value.adaptationDecisions[2]!.message).toContain('COMMAND_COMPAT');
})
it('只有显式V4解码接受NUMBER，未知参数和源约束不静默丢弃',()=>{
 const value=convertThingsCloudNumberFunctionTsl(encode(raw)),wire=parseDashboardRuntimeResponse(encode({events:value.events,commands:value.commands}));
 expect(()=>decodeMaterialEvents(wire.events as never)).toThrow();expect(()=>decodeMaterialCommands(wire.commands as never)).toThrow();
 expect(decodeMaterialEvents(wire.events as never,numericFunctionTslMaterialFormat)).toHaveLength(1);expect(decodeMaterialCommands(wire.commands as never,numericFunctionTslMaterialFormat)).toHaveLength(1);
 for(const change of ['enum','object','list']){const source=JSON.parse(raw);source.events[0].params[0].dataType=change;expect(convertThingsCloudNumberFunctionTsl(encode(source)).events).toEqual([])}
 const source=JSON.parse(raw);source.commands[0].sendParams[0].minimum=0;expect(convertThingsCloudNumberFunctionTsl(encode(source)).issues.length).toBeGreaterThan(0)
})
it('V4预览及原件绑定独立摘要格式，不能混用V3算法或原意图',async()=>{
 const rows=convertThingsCloudNumberFunctionTsl(encode(raw)),candidate=await prepareTslMaterial(project,target,raw,numericFunctionTslMaterialFormat),old=await prepareTslMaterial(project,target,raw,functionTslMaterialFormat);
 expect(candidate.sourceDigest).not.toBe(old.sourceDigest);
 const wire={targetDeviceTypeId:target,sourceFormat:numericFunctionTslMaterialFormat,sourceName:'合成',sourceDescription:'',sourceIcon:'',properties:[],events:rows.events,commands:rows.commands,adaptationDecisions:rows.adaptationDecisions,issues:[],sourceDigest:candidate.sourceDigest,targetDigest:'b'.repeat(64),previewDigest:'c'.repeat(64),digestAlgorithm:'DEVICE_TYPE_DEFINITION_MATERIAL_IMPORT_V4_SHA256'};
 expect(()=>decodeTslMaterialPreview(encode({...wire,digestAlgorithm:'DEVICE_TYPE_DEFINITION_MATERIAL_IMPORT_V3_SHA256'}),candidate)).toThrow();
 const preview=decodeTslMaterialPreview(encode(wire),candidate),intent=prepareTslMaterialConfirmation(candidate,preview);
 const receipt={targetDeviceTypeId:target,sourceFormat:numericFunctionTslMaterialFormat,sourceDigest:candidate.sourceDigest,targetDigest:wire.targetDigest,previewDigest:wire.previewDigest,items:[{kind:'EVENT',sourcePointer:'$.events[0]',targetId:'30000000-0000-4000-8000-000000000001',key:'numeric_event'},{kind:'COMMAND',sourcePointer:'$.commands[0]',targetId:'30000000-0000-4000-8000-000000000002',key:'numeric_command'}],createdAt:'2026-10-29T11:00:00Z',properties:[],events:rows.events,commands:rows.commands,adaptationDecisions:rows.adaptationDecisions};
 expect(decodeTslMaterialReceipt(encode(receipt),intent).events?.[0]?.parameters[0]?.dataType).toBe('NUMBER');expect(()=>decodeTslMaterialReceipt(encode({...receipt,sourceFormat:functionTslMaterialFormat}),intent)).toThrow()
})
