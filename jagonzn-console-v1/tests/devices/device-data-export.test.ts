import {describe,it,expect} from 'vitest'
import {tabularXlsx} from '../../src/features/devices/device-data-export'

function worksheet(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder()
 for(let offset=0;view.getUint32(offset,true)===0x04034b50;){
  const size=view.getUint32(offset+18,true),nameLength=view.getUint16(offset+26,true),extraLength=view.getUint16(offset+28,true)
  expect(view.getUint16(offset+8,true)).toBe(0)
  const start=offset+30+nameLength+extraLength,name=decoder.decode(bytes.subarray(offset+30,offset+30+nameLength))
  if(name==='xl/worksheets/sheet1.xml')return new DOMParser().parseFromString(decoder.decode(bytes.subarray(start,start+size)),'application/xml')
  offset=start+size
 }
 throw new Error('导出文件缺少工作表')
}

describe('Excel文本原件编码',()=>{
 it('真实ZIP中的工作表XML可解析，ST_Xstring解码保留控制字符、字面转义串、CRLF和Unicode',()=>{
  const original=['原文 _x0041_ / _x005F_ / _x000d_ / _x005F_x0041_ / _x005f__x005F_', '前\u0000\u0001\u000b\u000c\u001f后','前\r\n\t后','前\ufffe\uffff后','emoji😀𠮷','<tag>&"\'','9007199254740993.0000000001','=SUM(A1)']
  const xml=worksheet(tabularXlsx([original]))
  expect(xml.getElementsByTagName('parsererror')).toHaveLength(0)
  const cells=Array.from(xml.getElementsByTagName('c'))
  expect(cells.map(cell=>cell.getAttribute('t'))).toEqual(original.map(()=>'inlineStr'))
  expect(xml.getElementsByTagName('f')).toHaveLength(0)
  // 按公开ST_Xstring语义单次解码；不能递归把原文_x0041_再次解释成A。
  const decoded=cells.map(cell=>(cell.getElementsByTagName('t')[0]?.textContent||'').replace(/_x([0-9a-fA-F]{4})_/g,(_,hex:string)=>String.fromCharCode(parseInt(hex,16))))
  expect(decoded).toEqual(original)
 })
})
