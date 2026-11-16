import {mercatorLatitudeLimit} from './directory-map'

export type LocationMapPoint=Readonly<{longitude:number;latitude:number}>
/** 草稿只接受完整的 WGS84 数值对；极区合法坐标仍可手工保存。 */
export function locationMapPoint(longitude:unknown,latitude:unknown):LocationMapPoint|null{
 if(typeof longitude!=='number'||typeof latitude!=='number'||!Number.isFinite(longitude)||!Number.isFinite(latitude)||Math.abs(longitude)>180||Math.abs(latitude)>90)return null
 return Object.freeze({longitude,latitude})
}
export function canDisplayLocationPoint(point:LocationMapPoint|null):point is LocationMapPoint{return point!==null&&Math.abs(point.latitude)<=mercatorLatitudeLimit}
/** 只移动显示副本，保存值仍是原 WGS84 经度。 */
export function locationMapDisplayLongitude(longitude:number,center:number):number{return longitude+Math.round((center-longitude)/360)*360}
/** 底图世界副本经度归一化；只舍入新选点，不改写手填草稿。 */
export function locationMapSelection(longitude:unknown,latitude:unknown):LocationMapPoint|null{
 if(typeof longitude!=='number'||typeof latitude!=='number'||!Number.isFinite(longitude)||!Number.isFinite(latitude)||Math.abs(latitude)>mercatorLatitudeLimit)return null
 const wrapped=longitude>=-180&&longitude<=180?longitude:((longitude+180)%360+360)%360-180
 const selected=locationMapPoint(Number(wrapped.toFixed(6)),Number(latitude.toFixed(6)))
 return canDisplayLocationPoint(selected)?selected:null
}
