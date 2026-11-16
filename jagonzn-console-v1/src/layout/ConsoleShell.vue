<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, UserFilled } from '@element-plus/icons-vue'
import { hasMenu, currentProject, needsLogin, session, switchProject, logout } from '@/core/session'
import { errorMessage, IdentityChanged } from '@/core/http'
import { ElMessage } from 'element-plus'
import BrandMark from '@/ui/BrandMark.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
const sparkleImage=`${import.meta.env.BASE_URL}reference/sparkles.svg`, aiImage=`${import.meta.env.BASE_URL}reference/ai-line.svg`
const router=useRouter(),route=useRoute(),collapsed=ref(false),switching=ref(false),pending=ref('')
const globalPage=computed(()=>route.path==='/projects'||route.path==='/projects/create'||route.path==='/account-settings')
const projectGroups=computed(()=>[
 {label:'我创建的项目',options:session.projects.filter(p=>p.myRole==='OWNER')},
 {label:'我加入的项目',options:session.projects.filter(p=>p.myRole!=='OWNER')}
])
const groups=[
 {title:'',items:[{name:'概要',path:'/overview',glyph:'󰨝',menu:''}]},
 {title:'可视化',items:[{name:'看板',path:'/dashboards',glyph:'󱒉',menu:'DashboardDesigner'},{name:'大屏',path:'/screens',glyph:'󰔂',menu:''}]},
 {title:'设备',items:[{name:'所有设备',path:'/devices',glyph:'󰾰',menu:'Devices'},{name:'设备类型',path:'/device-types',glyph:'󰆧',menu:'DeviceTypes'},{name:'设备组',path:'/device-groups',glyph:'󱏒',menu:'DeviceGroups'},{name:'设备查询',path:'/device-queries',glyph:'󰍉',menu:'Devices'}]},
 {title:'告警',items:[{name:'告警规则',path:'/alarm-rules',glyph:'󰗖',menu:'AlarmRules'},{name:'告警历史',path:'/alarm-history',glyph:'󰂞',menu:'AlarmHistory'},{name:'通知组',path:'/notification-groups',glyph:'󰂟',menu:'AlarmNotificationGroups'}]},
 {title:'应用',items:[{name:'项目应用',path:'/applications',glyph:'󰣆',menu:'ApplicationManager'},{name:'用户应用',path:'/user-applications',glyph:'󰄜',menu:'ApplicationManager'},{name:'管理员',path:'/admins',glyph:'󰡉',menu:''},{name:'用户',path:'/end-users',glyph:'󰀎',menu:'ProjectEndUsers'}]},
 {title:'自动化',items:[{name:'自动化',path:'/rules/automations',glyph:'󱙺',menu:'RuleAutomations'},{name:'场景',path:'/rules/scenes',glyph:'󰐋',menu:'RuleScenes'}]},
 {title:'规则',items:[{name:'消息规则',path:'/rules/messages',glyph:'󰆍',menu:'MessageRules'},{name:'规则日志',path:'/rules/executions',glyph:'󰧮',menu:'RuleExecutions'}]},
 {title:'任务',items:[{name:'所有任务',path:'/tasks/jobs',glyph:'󱏁',menu:'TaskJobs'},{name:'任务日志',path:'/task-runs',glyph:'󱋢',menu:'TaskJobs'}]},
 {title:'调试',items:[{name:'消息日志',path:'/message-logs',glyph:'󱲃',menu:''}]},
 {title:'维护',items:[{name:'OTA版本',path:'/ota-versions',glyph:'󰦗',menu:'OtaFirmwares'}]},
 {title:'物联卡',items:[{name:'卡概览',path:'/sim-overview',glyph:'󰄪',menu:''},{name:'SIM卡',path:'/sim-cards',glyph:'󰒧',menu:''}]},
 {title:'项目',items:[{name:'项目成员',path:'/project-members',glyph:'󰀄',menu:''},{name:'设置',path:'/project-settings',glyph:'󰏗',menu:'ProjectSettings'}]}
]
async function selectProject(id:string){
 if(switching.value)return
 if(id===currentProject.value?.id){await router.push('/overview');return}
 switching.value=true
 try{await switchProject(id);await router.push('/overview')}catch(error){ElMessage.error(errorMessage(error))}finally{switching.value=false}
}
async function accountCommand(command:string){
 if(command==='settings'){await router.push('/account-settings');return}
 if(command!=='logout')return
 try{await logout()}catch(error){if(!(error instanceof IdentityChanged))ElMessage.error(`本页会话已清除，服务端退出未确认：${errorMessage(error)}`)}finally{if(needsLogin())await router.replace('/login')}
}
</script>
<template>
 <div class="tl-console" :class="{'is-collapsed':collapsed,'is-global':globalPage}">
  <header class="tl-topbar">
   <button v-if="!globalPage" class="tl-topbar__menu" :aria-label="collapsed?'展开菜单':'收起菜单'" :aria-expanded="!collapsed" @click="collapsed=!collapsed"><ReferenceIcon :glyph="collapsed?'󰍜':'󰮫'"/></button>
   <a href="http://localhost:4321/" target="_blank" rel="noopener" class="tl-brand" aria-label="ThingsLink 官网"><BrandMark/></a>
   <button class="tl-region" @click="pending='项目区域'">{{currentProject?.region||'项目区域'}}<el-icon><ArrowDown/></el-icon></button>
   <router-link to="/projects" class="tl-topbar__projects">我的项目</router-link>
   <div class="tl-topbar__right">
    <router-link to="/release-notes" class="topbar-news"><img :src="sparkleImage" class="news-spark" alt=""> 新功能</router-link>
    <a href="http://localhost:4321/docs/" target="_blank" rel="noopener">API</a>
    <router-link to="/blog">博客</router-link>
    <el-dropdown trigger="hover" popper-class="tl-support-popper"><button class="tl-header-action"><ReferenceIcon glyph="󰘥"/>支持<el-icon><ArrowDown/></el-icon></button><template #dropdown><el-dropdown-menu><el-dropdown-item @click="pending='教程'"><ReferenceIcon glyph="󰑴"/>教程</el-dropdown-item><el-dropdown-item @click="pending='文档'"><ReferenceIcon glyph="󱔗"/>文档</el-dropdown-item><el-dropdown-item @click="pending='常见问题'"><ReferenceIcon glyph="󰋗"/>常见问题</el-dropdown-item><el-dropdown-item @click="pending='AI 助手'"><img :src="aiImage" class="support-ai-icon" alt="">AI 助手</el-dropdown-item><el-dropdown-item @click="pending='人工技术支持'"><ReferenceIcon glyph="󰍪"/>人工技术支持</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
    <el-dropdown trigger="hover"><button class="tl-header-action"><ReferenceIcon glyph="󰖟"/>简体中文<el-icon><ArrowDown/></el-icon></button><template #dropdown><el-dropdown-menu><el-dropdown-item @click="pending='English'">English</el-dropdown-item><el-dropdown-item disabled>简体中文</el-dropdown-item><el-dropdown-item @click="pending='繁體中文'">繁體中文</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
    <el-dropdown trigger="hover" popper-class="tl-account-popper" @command="accountCommand"><button class="tl-account" :aria-label="`用户菜单：${session.user?.displayName||session.user?.email||'账号'}`"><el-avatar :size="30" :icon="UserFilled"/><el-icon class="account-chevron"><ArrowDown/></el-icon></button><template #dropdown><el-dropdown-menu><el-dropdown-item command="settings">账号设置</el-dropdown-item><el-dropdown-item command="logout">退出</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
   </div>
  </header>
  <aside v-if="!globalPage" class="tl-sidebar">
   <div class="tl-project-select"><el-select :model-value="currentProject?.id" filterable placeholder="请选择项目" size="small" :loading="switching" aria-label="搜索并选择项目" popper-class="tl-project-popper" @update:model-value="selectProject"><el-option-group v-for="group in projectGroups" :key="group.label" :label="group.label"><el-option v-for="project in group.options" :key="project.id" :value="project.id||''" :label="project.name||project.id||''"><span class="project-option"><span>{{project.name}}</span><small :class="{'is-paid':['STANDARD','ENTERPRISE','PROFESSIONAL'].includes(project.subscribedPlan?.code||'')}">{{['STANDARD','ENTERPRISE','PROFESSIONAL'].includes(project.subscribedPlan?.code||'')?'付费版':project.subscribedPlan?.name||'—'}}</small></span></el-option></el-option-group></el-select></div>
   <nav aria-label="控制台导航"><template v-for="group in groups" :key="group.title"><div v-if="group.items.some(item=>!item.menu||hasMenu(item.menu))" class="tl-nav-section"><div v-if="group.title" class="tl-nav-group">{{group.title}}</div><template v-for="item in group.items" :key="item.path"><router-link v-if="!item.menu||hasMenu(item.menu)" :to="item.path" class="tl-nav-item" :class="{'is-overview':!group.title,'is-section-active':route.path.startsWith(item.path+'/')}" :title="item.name"><ReferenceIcon :glyph="item.glyph"/><span>{{item.name}}</span></router-link></template></div></template></nav>
  </aside>
  <main class="tl-main"><router-view v-if="session.user||(route.path==='/projects'&&session.transitioning)" :key="route.path==='/projects'?'projects':session.user?.currentProjectId"/><div v-else class="tl-page" role="status">正在切换项目…</div></main>
  <el-dialog :model-value="!!pending" :title="pending" width="min(480px,94vw)" @update:model-value="pending='' "><p>本模块尚未接入，实施状态请查看对应执行文档</p><template #footer><el-button @click="pending=''">关闭</el-button></template></el-dialog>
 </div>
</template>
<style scoped>
.tl-topbar .tl-header-action:focus,.tl-topbar .tl-header-action:focus-visible,.tl-topbar .tl-account:focus,.tl-topbar .tl-account:focus-visible{outline:none;outline-offset:0;box-shadow:none}
.tl-console{--sidebar-width:200px;--topbar-height:50px}
.tl-topbar{height:50px;position:fixed;inset:0 0 auto;z-index:100;background:rgba(255,255,255,.9);box-shadow:0 1px 4px 1px #0000001a;display:flex;align-items:center;padding:0 15px;user-select:none}
.tl-topbar__menu{display:flex;align-items:center;justify-content:center;border:0;background:none;margin:5px 0;width:30px;height:40px;color:#999;cursor:pointer;border-radius:50%;padding:0;flex:none}.tl-topbar__menu .reference-icon{font-size:24px}.tl-topbar__menu:hover{color:#111}.tl-topbar__menu:active{background:#eee}
.tl-brand{margin:0 20px 0 15px;display:block;flex:none}.tl-region{display:flex;align-items:center;gap:5px;padding:0;margin:0 0 0 20px;height:50px;font-size:14px;color:#606266;border:0;background:none;cursor:pointer;white-space:nowrap}.tl-region .el-icon{font-size:12px}
.tl-topbar__projects{color:#444;font-size:14px;margin:0 10px 0 20px;line-height:50px;white-space:nowrap}
.tl-topbar__right{margin-left:auto;display:flex;align-items:center;gap:25px;font-size:14px;line-height:50px}.tl-topbar__right>a{color:#444;white-space:nowrap}.tl-topbar__right>a:hover{color:#1e88e5}.news-spark{width:16px;height:16px;vertical-align:-3px;margin-right:4px}
.tl-header-action{display:flex;align-items:center;gap:5px;color:#606266;border:0;background:none;height:50px;padding:0;cursor:pointer}.tl-header-action .reference-icon{font-size:18px}.tl-header-action .el-icon{font-size:12px}
.tl-account{display:flex;align-items:center;gap:5px;height:50px;border:0;background:none;padding:0 10px 0 0;cursor:pointer;color:#909399}.tl-account :deep(.el-avatar){font-size:18px;background:#c0c4cc}.account-chevron{font-size:12px}
.tl-sidebar{position:fixed;top:50px;bottom:0;left:0;width:var(--sidebar-width);border-right:1px solid #ebeef5;background:#fff;overflow-y:auto;overflow-x:hidden;z-index:10;transition:all .5s ease}.tl-sidebar::-webkit-scrollbar{width:6px;display:none}.tl-sidebar:hover::-webkit-scrollbar{display:block}.tl-sidebar::-webkit-scrollbar-track{background:#fff}.tl-sidebar::-webkit-scrollbar-thumb{background:#eee;border-radius:20px}
.tl-project-select{padding:20px 10px}.tl-project-select .el-select{width:180px}.tl-project-select :deep(.el-select__wrapper){height:32px;min-height:32px;font-size:13px;font-weight:400;line-height:30px;padding:0 5px 0 15px;gap:4px;border:1px solid #dcdfe6;border-radius:4px;box-shadow:none;transition:border-color .2s cubic-bezier(.645,.045,.355,1)}.tl-project-select :deep(.el-select__wrapper:hover){border-color:#c0c4cc}.tl-project-select :deep(.el-select__wrapper.is-focused){border-color:#409eff}.tl-project-select :deep(.el-select__input){height:30px;line-height:30px}.tl-project-select :deep(.el-select__placeholder){color:#606266}.tl-project-select :deep(.el-select__placeholder.is-transparent){color:#c0c4cc}.tl-project-select :deep(.el-select__suffix){width:25px;height:30px;justify-content:center}.tl-project-select :deep(.el-select__caret){color:#c0c4cc;font-size:14px;transition:transform .3s}
.tl-sidebar nav{padding:0 0 8px;overflow-y:auto;overflow-x:hidden;position:relative;transition:all .3s ease}.tl-nav-section{margin-bottom:4px}.tl-nav-section:first-child{margin-bottom:0}.tl-nav-group{padding:12px 20px 8px;font-size:12px;font-weight:500;color:#909399;letter-spacing:.5px;white-space:nowrap;transition:all .3s ease}.tl-nav-item{position:relative;display:flex;align-items:center;padding:0 20px;height:40px;color:#606266;font-size:14px;white-space:nowrap;transition:all .2s ease}.tl-nav-item>span:not(.reference-icon){transition:all .3s ease}.tl-nav-item .reference-icon{margin-right:10px;color:#909399;font-size:18px;transition:all .2s ease}.tl-nav-item.is-overview{height:44px}.tl-nav-item.is-overview .reference-icon{font-size:20px;margin-right:12px}.tl-nav-item:hover{background:#f5f7fa;color:#409eff}.tl-nav-item:hover .reference-icon{color:#409eff}.tl-nav-item:is(.router-link-active,.is-section-active){background:#ecf5ff;color:#409eff;font-weight:500}.tl-nav-item:is(.router-link-active,.is-section-active) .reference-icon{color:#409eff}.tl-nav-item:is(.router-link-active,.is-section-active):before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:#409eff;border-radius:0 2px 2px 0}
.tl-main{margin:50px 0 0 var(--sidebar-width);min-height:calc(100vh - 50px);background:#fff;transition:all .5s ease}.is-global .tl-main{margin-left:0;padding:20px 0}.is-collapsed{--sidebar-width:64px}.is-collapsed .tl-sidebar{z-index:5}.is-collapsed .tl-project-select{display:none}.is-collapsed .tl-nav-item span:not(.reference-icon),.is-collapsed .tl-nav-group{opacity:0;width:0;padding:0;overflow:hidden}.is-collapsed .tl-nav-item .reference-icon{margin-right:0}.is-collapsed .tl-sidebar:hover{width:200px;box-shadow:2px 0 12px #00000026}.is-collapsed .tl-sidebar:hover nav{width:auto;min-width:200px;background:#fff}.is-collapsed .tl-sidebar:hover .tl-project-select{display:block}.is-collapsed .tl-sidebar:hover .tl-nav-group{opacity:1;width:auto;padding:12px 20px 8px}.is-collapsed .tl-sidebar:hover .tl-nav-item span:not(.reference-icon){opacity:1;width:auto}.is-collapsed .tl-sidebar:hover .tl-nav-item .reference-icon{margin-right:10px}.is-collapsed .tl-sidebar:hover .tl-nav-item.is-overview .reference-icon{margin-right:12px}
@media(max-width:1000px){.tl-topbar__right{gap:14px}.topbar-news{display:none}.tl-topbar__projects{margin-left:14px}}
@media(max-width:760px){.tl-console{--sidebar-width:64px}.tl-sidebar:hover{width:200px;box-shadow:2px 0 12px #00000026}.tl-sidebar:not(:hover) .tl-project-select,.tl-sidebar:not(:hover) .tl-nav-item span:not(.reference-icon),.tl-sidebar:not(:hover) .tl-nav-group{display:none}.tl-region,.tl-topbar__projects,.tl-header-action{display:none}.tl-topbar__right{gap:12px}.tl-brand{margin-left:10px}.tl-topbar__right>a{font-size:12px}}
@media(prefers-reduced-motion:reduce){.tl-sidebar,.tl-main,.tl-nav-item{transition:none}}
</style>
<style>
.tl-support-popper .support-ai-icon{width:18px;height:18px;margin-right:8px}.tl-support-popper .el-dropdown-menu__item .reference-icon{font-size:18px;margin-right:8px}.tl-project-popper{min-width:180px!important;border:1px solid #e4e7ed!important;border-radius:4px!important;background:#fff;box-shadow:0 2px 12px 0 #0000001a!important;color:#606266;font-weight:400}.tl-project-popper .el-select-group__wrap:not(:last-of-type){padding-bottom:24px}.tl-project-popper .el-select-group__wrap:not(:last-of-type):after{content:"";position:absolute;display:block;left:20px;right:20px;bottom:12px;height:1px;background:#e4e7ed}.tl-project-popper .el-select-dropdown__list{padding:6px 0}.tl-project-popper .el-select-dropdown__item.is-selected{color:#409eff;font-weight:700}.tl-project-popper .el-select-dropdown__item.is-hovering{background:#f5f7fa}.tl-project-popper .el-select-group__title{height:30px;line-height:30px;font-size:12px;color:#909399;padding:0 20px}.tl-project-popper .el-select-dropdown__item{height:34px;line-height:34px;padding:0 20px;font-size:14px}.project-option{display:flex;align-items:center;justify-content:space-between;gap:16px}.project-option>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.project-option small{color:#888;font-size:12px;flex:none}.project-option small.is-paid{color:#f59e0b}.tl-account-popper .el-dropdown-menu__item{font-size:14px;line-height:36px;padding:0 20px;color:#606266}
</style>
