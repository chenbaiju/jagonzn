import type {ScenePropertyPurpose} from './scene-editor-draft'
import {readDevicePropertyChoices,type DevicePropertyChoice} from './device-property-choices'
export type ScenePropertyChoice=DevicePropertyChoice
/** Scene用途保持原闭集；中性目录复用不把Scene入口授予其它用途。 */
export async function readScenePropertyChoices(project:string,device:string,purpose:ScenePropertyPurpose,signal?:AbortSignal):Promise<ScenePropertyChoice[]>{
 if(purpose!=='downlink'&&purpose!=='cloud-update')throw new Error('场景属性动作用途无效')
 return readDevicePropertyChoices(project,device,purpose==='cloud-update'?['CLOUD_PRIVATE']:['DOWNLINK','SHARED'],signal)
}
