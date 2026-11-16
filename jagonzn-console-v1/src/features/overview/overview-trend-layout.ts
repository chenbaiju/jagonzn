/** ChartJS 未旋转标签：Y 最宽文本加 padding10，首末 X 文本各留半宽及 3px。 */
export function trendLayout(width:number,height:number,yLabelWidth:number,firstLabelWidth:number,lastLabelWidth:number){
 const left=Math.max(yLabelWidth+10,firstLabelWidth/2+3),right=lastLabelWidth/2+3,top=6.6,bottom=21.2
 return {left,right,top,bottom,width:Math.max(1,width-left-right),height:Math.max(1,height-top-bottom)}
}
export function trendEntrance(elapsed:number){return 1-Math.pow(1-Math.max(0,Math.min(1,elapsed/1000)),4)}
