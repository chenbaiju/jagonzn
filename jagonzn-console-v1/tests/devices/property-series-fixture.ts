import type {SeriesQuery} from '../../src/features/devices/property-series-json'
export const seriesProject='00000000-0000-4000-8000-000000000010',seriesDevice='00000000-0000-4000-8000-000000000011',seriesModel='00000000-0000-4000-8000-000000000012'
export function seriesQuery(overrides:Partial<SeriesQuery>={}):SeriesQuery{return{project:seriesProject,device:seriesDevice,model:seriesModel,property:'n',from:'2026-10-24T00:00:00Z',to:'2026-10-24T01:00:00Z',granularity:'RAW',aggregation:'AVG',...overrides}}
export function seriesWire(query:SeriesQuery,values=['1','2','3'],overrides:Record<string,unknown>={},pointOverrides:Record<string,unknown>={}):Uint8Array{
 const value={projectId:query.project,deviceId:query.device,modelVersionId:query.model,propertyKey:query.property,requestedFrom:query.from,requestedTo:query.to,requestedGranularity:query.granularity,actualGranularity:query.granularity,aggregation:query.aggregation,bucketPolicy:query.granularity==='RAW'?'RAW_VISIBLE_POINTS':'VISIBLE_WINDOW_BUCKETS',reportedWindow:{from:query.from,to:query.to},platformWindow:{from:query.from,to:query.to},points:values.map((_value,index)=>({sourceKind:'DEVICE_REPORT',timeKind:'DEVICE_OCCURRED',precision:query.granularity!=='RAW'&&query.aggregation==='COUNT'?'EXACT_COUNT':'LEGACY_DOUBLE_SOURCE',ts:new Date(Date.parse(query.from)+(index+1)*60000).toISOString(),value:`__number_${index}__`,sampleCount:query.granularity==='RAW'?'1':'4',sourceModelVersionId:seriesModel,modelVersion:'1.0.0',...pointOverrides})),...overrides}
 let text=JSON.stringify(value)
 values.forEach((value,index)=>text=text.replace(`"__number_${index}__"`,value))
 return new TextEncoder().encode(text)
}
