const encoder=new TextEncoder()
export function safeExportText(text:string){return /^[=+\-@\t\r\n]/.test(text)?"'"+text:text}
export function tabularCsv(rows:readonly (readonly string[])[],numericCell:(row:number,column:number)=>boolean=()=>false){
 return '\ufeff'+rows.map((row,index)=>row.map((value,column)=>`"${(numericCell(index,column)?value:safeExportText(value)).replace(/"/g,'""')}"`).join(',')).join('\r\n')+'\r\n'
}
/** ST_Xstring保留XML不可表示字符及回车；先保护原文转义串，避免Excel将字面量解释为字符。 */
function xml(text:string){
 const literal=text.replace(/_(?=x[0-9a-fA-F]{4}_)/g,'_x005F_')
 return literal.replace(/[\u0000-\u0008\u000b-\u001f\ud800-\udfff\ufffe\uffff]/gu,character=>`_x${character.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')}_`)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
}
function column(index:number){let result='';for(index++;index;index=Math.floor((index-1)/26))result=String.fromCharCode(65+(index-1)%26)+result;return result}
const crcTable=Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0})
function crc32(bytes:Uint8Array){let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]!^(value>>>8);return(value^0xffffffff)>>>0}
function header(length:number,values:ReadonlyArray<[number,number,number]>){const bytes=new Uint8Array(length),view=new DataView(bytes.buffer);for(const[offset,value,width]of values)if(width===2)view.setUint16(offset,value,true);else view.setUint32(offset,value,true);return bytes}
function join(parts:readonly Uint8Array[]){const result=new Uint8Array(parts.reduce((sum,part)=>sum+part.length,0));let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length}return result}
/** 标准无压缩ZIP/OpenXML；所有单元格用inlineStr，避免Excel十五位数限制及公式解释。 */
export function tabularXlsx(rows:readonly (readonly string[])[],sheetName="属性曲线"):Uint8Array{
 const sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+rows.map((row,index)=>`<row r="${index+1}">`+row.map((value,col)=>`<c r="${column(col)}${index+1}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('')+'</row>').join('')+'</sheetData></worksheet>'
 const files:Record<string,string>={
  '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'+xml(sheetName)+'" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml':sheet,
 }
 const local:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0
 for(const[path,content]of Object.entries(files)){
  const name=encoder.encode(path),data=encoder.encode(content),crc=crc32(data)
  const item=header(30,[[0,0x04034b50,4],[4,20,2],[6,0x800,2],[12,33,2],[14,crc,4],[18,data.length,4],[22,data.length,4],[26,name.length,2]])
  local.push(item,name,data)
  central.push(header(46,[[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0x800,2],[14,33,2],[16,crc,4],[20,data.length,4],[24,data.length,4],[28,name.length,2],[42,offset,4]]),name)
  offset+=item.length+name.length+data.length
 }
 const directory=join(central),end=header(22,[[0,0x06054b50,4],[8,5,2],[10,5,2],[12,directory.length,4],[16,offset,4]])
 return join([...local,directory,end])
}
export function downloadTabular(rows:readonly (readonly string[])[],format:'xlsx'|'csv',filename:string,numericCell?:(row:number,column:number)=>boolean,sheetName="属性曲线"){
 const content=format==='xlsx'?tabularXlsx(rows,sheetName):encoder.encode(tabularCsv(rows,numericCell))
 const url=URL.createObjectURL(new Blob([content as BlobPart],{type:format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv;charset=utf-8'})),link=document.createElement('a')
 link.href=url;link.download=`${filename}.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),0)
}
