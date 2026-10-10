import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

// 仅挂载公开静态测试页，不初始化会话、路由或业务 API 客户端。
createApp(App).mount('#app')
