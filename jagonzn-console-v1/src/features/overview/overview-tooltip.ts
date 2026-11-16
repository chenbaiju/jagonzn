export type TooltipPoint=Readonly<{x:number;y:number}>
export type TooltipBounds=Readonly<{left:number;top:number;right:number;bottom:number}>
export type TooltipRow=Readonly<{label:string;value:string;color:string}>
/** 环图沿原站 ECharts 的 20px 偏移翻边；曲线沿 ChartJS 的居中上移 14px，贴近视口边界时避让。 */
export function tooltipPosition(point:TooltipPoint,size:Readonly<{width:number;height:number}>,bounds:TooltipBounds,kind:'item'|'trend'):TooltipPoint{
  let x=kind==='trend'?point.x-size.width/2:point.x+20
  let y=kind==='trend'?point.y-size.height-14:point.y+20
  if(kind==='item'){
    if(point.x+size.width+22>bounds.right)x=point.x-size.width-20
    if(point.y+size.height+20>bounds.bottom)y=point.y-size.height-20
  }else{
    if(y<bounds.top+4)y=point.y+14
    return {x:Math.max(bounds.left+4,Math.min(x,bounds.right-size.width-4)),y:Math.max(bounds.top+4,Math.min(y,bounds.bottom-size.height-4))}
  }
  // 原站 HTML tooltip 默认 confine=false，换边后不再强制夹进160px图高。
  return {x,y}
}
