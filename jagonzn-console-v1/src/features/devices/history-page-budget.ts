/** 与独立Console页码合同相同的有限跳过预算；空页本身不判定末页。 */
export function canReadNextHistoryPage(page:number,limit:number){return Number.isSafeInteger(page)&&page>=1&&Number.isSafeInteger(limit)&&limit>=1&&page*limit<=10000}
export function assertHistoryPageLocation(page:number,limit:number,maxLimit:number){if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(limit)||limit<1||limit>maxLimit||(page-1)*limit>10000)throw new Error('请求页码超出当前查询范围。')}
