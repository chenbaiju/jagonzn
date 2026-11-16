import {decodeModelSnapshot,type ModelSnapshot} from './model-version-api'
import {equalDeviceJsonValues} from '../devices/platform-properties-json'

/** 导出既有固定版本合同；正文数值沿精确词法，不生成另一套TSL解释。 */
export function modelSnapshotJsonFile(snapshot:ModelSnapshot){
 const content=`{\n  "version": ${JSON.stringify(snapshot.version,null,2)},\n  "modelSnapshot": ${snapshot.text}\n}\n`
 const verified=decodeModelSnapshot(new TextEncoder().encode(content),snapshot.version.deviceTypeId,snapshot.version.id,snapshot.version)
 if(!equalDeviceJsonValues(verified.modelSnapshot,snapshot.modelSnapshot))throw new Error('导出内容与所选冻结版本不一致，请重新读取')
 return Object.freeze({name:`thingslink-model-${snapshot.version.deviceTypeId}-${snapshot.version.versionNumber}.json`,mime:'application/json;charset=utf-8',content})
}
