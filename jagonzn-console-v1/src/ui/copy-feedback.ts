import {showOperationFeedback} from './operation-feedback'

// 所有点击复制的反馈固定在顶部居中，自动消失且不占用页面布局。
export function copySucceeded(message='已复制'){
 return showOperationFeedback(message)
}

export function copyFailed(message='复制失败，请重试'){
 return showOperationFeedback(message,'error')
}
