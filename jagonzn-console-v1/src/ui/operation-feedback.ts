import { ElMessage, type MessageType } from 'element-plus'

export function showOperationFeedback(message: string, type: MessageType = 'success') {
  return ElMessage({
    message,
    type,
    duration: 2500,
    offset: 64,
    grouping: true,
    showClose: false,
  })
}
