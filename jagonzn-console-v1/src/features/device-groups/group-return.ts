import type {LocationQuery} from 'vue-router'
import {groupUuid} from './device-group-api'

export function groupReturnPath(query:LocationQuery):string|undefined{
 const id=query.sourceGroupId
 return typeof id==='string'&&groupUuid.test(id)?`/device-groups/${id}`:undefined
}
