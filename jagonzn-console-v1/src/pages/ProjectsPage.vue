<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { session, switchProject } from '@/core/session'
import { api,errorMessage } from '@/core/http'
import {useResource} from '@/core/use-resource'
import type {Schema} from '@/core/contracts'
import {countText} from '@/features/overview/overview-model'

const router = useRouter()
const emptyImage = `${import.meta.env.BASE_URL}reference/empty-content.png`
const busy = ref(false), error = ref<unknown>()
const ownedProjects = computed(() => session.projects.filter(project => project.myRole === 'OWNER'))
const joinedProjects = computed(() => session.projects.filter(project => project.myRole !== 'OWNER'))
let active = true
onBeforeUnmount(() => { active = false })
const listing=useResource(signal=>api<Schema<'ProjectResponse'>[]>('/api/v1/projects',{signal}))
async function refreshList(){await listing.reload();if(active&&!session.transitioning&&listing.data.value)session.projects=listing.data.value}
onMounted(refreshList)
function projectCount(value:unknown){const text=countText(value);return text==='—'?'未统计':text}
async function open(id: string | undefined) {
  if (!id || busy.value || session.transitioning) return
  busy.value = true
  error.value = undefined
  try {
    // 已选项目直接导航，避免无因轮换令牌和清除当前会话。
    if (session.user?.currentProjectId !== id) await switchProject(id)
    if (active && session.user?.currentProjectId === id) await router.push('/overview')
  } catch (cause) { if (active) error.value = cause }
  finally { if (active) busy.value = false }
}
const sections = computed(() => [
  { key: 'owned', title: '我创建的项目', projects: ownedProjects.value, empty: '创建您的物联网项目', hint: '支持各种单片机、嵌入式设备、传感器、执行器、控制器、网关、DTU、PLC 等，支持 MQTT、HTTP、TCP 自定义协议。' },
  { key: 'joined', title: '我加入的项目', projects: joinedProjects.value, empty: '没有加入的项目', hint: '您可以作为管理员或访客，加入别人的项目。' }
])
</script>

<template>
  <main v-loading="busy" class="my-projects" :aria-busy="busy">
    <p v-if="error" class="projects-error" role="alert">{{ errorMessage(error) }}</p>
    <p v-if="listing.error.value" class="projects-error" role="alert">{{errorMessage(listing.error.value)}} <el-button size="small" @click="refreshList">重新读取项目</el-button></p>
    <section v-for="section in sections" :key="section.key" class="project-section" :aria-labelledby="`projects-${section.key}`">
      <header class="project-section__header">
        <h1 v-if="section.key === 'owned'" :id="`projects-${section.key}`">{{ section.title }}</h1>
        <h2 v-else :id="`projects-${section.key}`">{{ section.title }}</h2>
        <el-button v-if="section.key === 'owned'" type="primary" @click="router.push('/projects/create')">创建项目</el-button>
      </header>
      <div v-if="!section.projects.length" class="projects-empty">
        <img :src="emptyImage" alt="">
        <p>{{ section.empty }}</p>
        <span>{{ section.hint }}</span>
        <el-button v-if="section.key === 'owned'" type="primary" @click="router.push('/projects/create')">创建项目</el-button>
      </div>
      <div class="projects-grid">
        <button v-for="project in section.projects" :key="project.id" class="project-card" :disabled="busy || session.transitioning || !project.id" @click="open(project.id)">
          <span class="project-card__name">{{ project.name || '未命名项目' }}</span>
          <span class="project-card__bottom">
            <span class="project-card__counts"><span>{{projectCount(project.deviceCount)}} 设备</span><span>{{projectCount(project.memberCount)}} 成员</span></span>
            <span class="project-card__plan" :class="{ 'is-paid': ['STANDARD', 'ENTERPRISE', 'PROFESSIONAL'].includes(project.subscribedPlan?.code || '') }" :title="project.subscribedPlan?.name ? undefined : '未提供套餐信息'">{{ ['STANDARD', 'ENTERPRISE', 'PROFESSIONAL'].includes(project.subscribedPlan?.code || '') ? '付费版' : project.subscribedPlan?.name || '—' }}</span>
          </span>
        </button>
      </div>
    </section>

  </main>
</template>

<style scoped>
.my-projects { min-height: 100%; padding: 20px 30px 50px 30px; background: #fff; }
.projects-error { color: #f56c6c; margin: 0 0 20px; line-height: 1.6; }
.project-section + .project-section { margin-top: 50px; }
.project-section__header { position: relative; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding-bottom: 20px; }
.project-section__header h1, .project-section__header h2 { display: flex; justify-content: flex-start; gap: 10px; height: 40px; margin: 0; padding: 0; color: #1f2f3d; font-size: 28px; font-weight: 400; line-height: 40px; }
.project-section__header .el-button { height: 40px; flex: none; }
.projects-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); column-gap: 10px; align-content: start; min-height: 200px; margin-top: 10px; }
.project-card { position: relative; display: block; height: 90px; margin: 0 0 10px; padding: 20px; overflow: hidden; text-align: left; background: #fff; border: 1px solid #ebeef5; border-radius: 4px; cursor: pointer; transition: box-shadow .3s; }
.project-card:hover, .project-card:focus { box-shadow: 0 2px 12px 0 rgba(0, 0, 0, .1); }
.project-card:disabled { cursor: default; }
.project-card__name { display: block; overflow: hidden; color: #333; font-size: 16px; font-weight: 600; line-height: 22px; text-overflow: ellipsis; white-space: nowrap; }
.project-card__bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
.project-card__counts { color: #888; font-size: 13px; font-weight: 400; line-height: 20px; }
.project-card__counts > span { margin-right: 8px; }
.project-card__plan { color: #888; font-size: 13px; font-weight: 700; line-height: 20px; }
.project-card__plan.is-paid { color: #f59e0b; }
.projects-empty { padding: 60px 0; text-align: center; }
.projects-empty img { display: inline-block; width: 160px; }
.projects-empty p { margin: 20px 0 0; color: #002822; font-size: 26px; font-weight: 400; line-height: 36px; }
.projects-empty > span { display: inline-block; width: 500px; margin: 10px 0 0; padding: 0 20px; color: #909399; font-size: 14px; line-height: 22px; }
@media (max-width: 1199px) { .projects-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 991px) { .projects-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 767px) { .my-projects { padding: 25px 15px; }.projects-grid { grid-template-columns: 1fr; }.projects-empty > span { width: auto; } }
.projects-empty>.el-button{margin-top:20px}
</style>
