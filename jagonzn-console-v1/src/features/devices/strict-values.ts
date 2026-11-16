import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
export function valueText(value:StrictJsonValue):string {
 if(isStrictJsonNumber(value))return value.lexical
 if(value===null||typeof value!=='object')return JSON.stringify(value)
 if(Array.isArray(value))return `[${value.map(valueText).join(', ')}]`
 return `{${Object.entries(value).map(([key,item])=>`${JSON.stringify(key)}: ${valueText(item)}`).join(', ')}}`
}
export function reportedValues(text:string){return parseDashboardRuntimeResponse(new TextEncoder().encode(text))}
