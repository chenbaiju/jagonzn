/** 固定内缘和交界角，只改变扇区外半径，避免圆形虚线缩放时重算接缝。 */
export function ringSectorPath(offset:number,length:number,outer:number,progress=1){
 const sweep=Math.max(0,Math.min(100,length*progress))
 if(!sweep)return ''
 const point=(radius:number,percent:number)=>{const angle=(percent/100-.25)*Math.PI*2;return `${+(80+radius*Math.cos(angle)).toFixed(6)} ${+(80+radius*Math.sin(angle)).toFixed(6)}`}
 const start=offset*progress,end=start+sweep
 if(sweep>=100)return `M ${point(outer,start)} A ${outer} ${outer} 0 1 1 ${point(outer,start+50)} A ${outer} ${outer} 0 1 1 ${point(outer,end)} L ${point(32,end)} A 32 32 0 1 0 ${point(32,start+50)} A 32 32 0 1 0 ${point(32,start)} Z`
 const large=sweep>50?1:0
 return `M ${point(outer,start)} A ${outer} ${outer} 0 ${large} 1 ${point(outer,end)} L ${point(32,end)} A 32 32 0 ${large} 0 ${point(32,start)} Z`
}
