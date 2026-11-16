import {it,expect} from 'vitest'
import {canDisplayLocationPoint,locationMapDisplayLongitude,locationMapPoint,locationMapSelection} from '../../src/features/devices/location-map-draft'
it('零坐标是完整有效草稿，新选点只舍入至六位小数',()=>{
 expect(locationMapPoint(0,0)).toEqual({longitude:0,latitude:0})
 expect(locationMapSelection(12.1234564,-34.6543214)).toEqual({longitude:12.123456,latitude:-34.654321})
 expect(Object.isFrozen(locationMapSelection(0,0))).toBe(true)
})
it('地图世界副本归一化，不拒绝跨日期变更线点击',()=>{
 expect(locationMapSelection(181,1)).toEqual({longitude:-179,latitude:1})
 expect(locationMapSelection(-541,1)).toEqual({longitude:179,latitude:1})
 expect(locationMapSelection(180,1)).toEqual({longitude:180,latitude:1})
 expect(locationMapDisplayLongitude(-179,181)).toBe(181)
 expect(locationMapDisplayLongitude(179,-181)).toBe(-181)
})
it('半空、非有限、字符串及越界输入不伪造位置',()=>{
 for(const [lng,lat] of [[undefined,1],[null,0],[0,undefined],['0',0],[false,0],[NaN,0],[0,Infinity],[181,0],[0,-91]])expect(locationMapPoint(lng,lat)).toBeNull()
 expect(locationMapSelection(Infinity,0)).toBeNull();expect(locationMapSelection(0,86)).toBeNull()
 expect(locationMapSelection(0,85.0511287)).toBeNull()
})
it('极区手填值保持合法原值，只有墨卡托显示被拒绝',()=>{
 const polar=locationMapPoint(1,90);expect(polar).toEqual({longitude:1,latitude:90});expect(canDisplayLocationPoint(polar)).toBe(false)
 expect(canDisplayLocationPoint(locationMapPoint(1,85))).toBe(true);expect(canDisplayLocationPoint(null)).toBe(false)
})
