<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { api, ApiError, errorMessage } from '@/core/http'
import type { Schema } from '@/core/contracts'
import { useResource } from '@/core/use-resource'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import { payAsYouGoRates, payAsYouGoEntitlements, previewFeatures, projectPlanPreviews, catalogQuotaFeatures, capabilityName, proposedPlanFeatures } from '@/features/projects/project-plan-preview'

const router = useRouter(), formRef = ref<FormInstance>()
const form = reactive({ name: '', region: '', description: '' })
const areaCode = ref(''), submitting = ref(false), saved = ref(false), uncertain = ref(false), submitError = ref('')
const attempted = ref(false)
const nameError = computed(() => attempted.value && !form.name.trim() ? '请填写' : '')
function back() {
  if (router.options.history.state.back) router.back()
  else void router.push('/projects')
}
const detail = ref(''), catalog = useResource(async signal => {
  const [regions, plans, projects] = await Promise.all([
    api<Schema<'ProjectRegionResponse'>[]>('/api/v1/project-regions', { signal }),
    api<Schema<'PlanResponse'>[]>('/api/v1/plans', { signal }),
    api<Schema<'ProjectResponse'>[]>('/api/v1/projects', { signal })
  ])
  return { regions, plans, projects }
})
let active = true
onBeforeUnmount(() => { active = false })
const regions = computed(() => (catalog.data.value?.regions || []).filter(r => r.enabled && r.code && r.name && r.areaCode && r.areaName).sort((a,b) => (a.displayOrder || 0) - (b.displayOrder || 0)))
const areas = computed(() => [...new Map(regions.value.map(r => [r.areaCode!, { code: r.areaCode!, name: r.areaName! }])).values()])
const zones = computed(() => regions.value.filter(r => r.areaCode === areaCode.value))
const creatable = computed(() => zones.value.some(r => r.code === form.region && r.projectCreationEnabled))
const currentPlan = computed(() => catalog.data.value?.projects.find(p => p.myRole === 'OWNER' && p.subscribedPlan?.code)?.subscribedPlan)
const detailPlan = computed(() => projectPlanPreviews.find(p => p.code === detail.value))
const catalogPlan = (code: string) => catalog.data.value?.plans.find(p => p.code === code)
const livePlan = computed(() => catalogPlan(detail.value))
const quotaFeatures = (plan: typeof projectPlanPreviews[number]) => {
  const current = catalogPlan(plan.code)
  return current?.quotaDimensions?.length ? catalogQuotaFeatures(current) : previewFeatures(plan)
}
const rules: FormRules = {
  name: [{ required: true, whitespace: true, message: '请填写', trigger: 'blur' }, { max: 128, message: '项目名称不能超过 128 个字符', trigger: 'blur' }],
  description: [{ max: 1000, message: '项目描述不能超过 1000 个字符', trigger: 'blur' }]
}
function chooseArea(code: string) {
  areaCode.value = code
  form.region = zones.value.find(r => r.projectCreationEnabled)?.code || ''
}
async function load() {
  await catalog.reload()
  if (!active || !catalog.data.value) return
  const initial = regions.value.find(r => r.code === 'sh-1' && r.projectCreationEnabled) || regions.value.find(r => r.projectCreationEnabled)
  if (!regions.value.some(r => r.code === form.region && r.projectCreationEnabled)) {
    areaCode.value = initial?.areaCode || areas.value[0]?.code || ''
    form.region = initial?.code || ''
  }
}
async function submit() {
  if (submitting.value || uncertain.value || saved.value || !creatable.value || !formRef.value) return
  submitting.value = true
  attempted.value = true
  submitError.value = ''
  try {
    if (!form.name.trim()) return
    if (!await formRef.value.validate().catch(() => false)) return
    const body: Schema<'CreateProjectRequest'> = { name: form.name.trim(), region: form.region, description: form.description.trim() || undefined }
    await api<Schema<'ProjectResponse'>>('/api/v1/projects', { method: 'post', body })
    if (!active) return
    // 成功后立即锁定；目录刷新/导航失败不能再次发送创建请求。
    saved.value = true
    await router.push('/projects')
  } catch (error) {
    if (!active) return
    uncertain.value = error instanceof ApiError && error.outcomeUnknown
    submitError.value = saved.value ? '项目已创建，请返回我的项目查看。' : errorMessage(error)
  } finally { if (active) submitting.value = false }
}
onMounted(load)
</script>

<template>
  <main class="project-create" v-loading="catalog.loading.value">
    <el-page-header title="返回" content="创建项目" @back="back" />
    <p v-if="catalog.error.value" class="create-error" role="alert">{{ errorMessage(catalog.error.value) }} <el-button size="small" @click="load">重新读取</el-button></p>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" :disabled="submitting || uncertain || saved" @submit.prevent="submit">
      <el-form-item prop="name" :error="nameError">
        <template #label>项目名称<p class="field-help">项目是指您在 ThingsLink 上创建的物联网平台。详情请浏览 <a href="https://www.thingscloud.xyz/docs/guide/about-project/project.html" target="_blank" rel="noopener noreferrer">什么是项目？ <ReferenceIcon glyph="󰏌" /></a></p></template>
        <el-input v-model="form.name" class="short-field" maxlength="128" aria-label="项目名称" />
      </el-form-item>
      <el-form-item>
        <template #label>选择地域<p class="field-help">ThingsLink 公有云在全球范围支持多个数据中心接入点，详情请浏览 <a href="https://www.thingscloud.xyz/docs/guide/about-project/region.html" target="_blank" rel="noopener noreferrer">项目所在区域 <ReferenceIcon glyph="󰏌" /></a> 。</p></template>
        <el-radio-group :model-value="areaCode" aria-label="选择地域" @update:model-value="chooseArea(String($event))">
          <el-radio-button v-for="area in areas" :key="area.code" :value="area.code">{{ area.name }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="选择可用区" prop="region">
        <el-radio-group v-model="form.region" aria-label="选择可用区">
          <el-radio-button v-for="zone in zones" :key="zone.code" :value="zone.code" :disabled="!zone.projectCreationEnabled">{{ zone.name }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <section class="version-section" aria-label="项目版本">
        <h2>项目版本</h2>
        <p class="field-help">项目不同版本的功能详情，请浏览 <button class="text-link" type="button" @click="detail='comparison'">版本介绍及价格 <ReferenceIcon glyph="󰏌" /></button> 。如需升级到付费版，请咨询技术支持。</p>
        <div class="version-cards">
          <article v-for="plan in projectPlanPreviews" :key="plan.code" class="version-card" :class="{ 'is-current':currentPlan?.code===plan.code, 'is-reference':plan.code!=='FREE' && currentPlan?.code!==plan.code }" :aria-label="plan.name">
            <span v-if="currentPlan?.code===plan.code" class="card-badge">当前套餐</span>
            <span v-else-if="plan.code==='FREE'" class="card-badge">快速体验</span>
            <span v-else class="card-badge is-unreleased">未开售</span>
            <button type="button" class="card-open" :aria-label="`查看${plan.name}方案`" @click="detail=plan.code"></button>
            <header><h3>{{ plan.name }}</h3><p class="plan-price"><small>¥</small><strong>{{plan.price}}</strong><span v-if="plan.price">/年</span></p></header>
            <div class="card-body"><p class="plan-description">{{plan.description}}</p>
              <h4 class="rights-heading">资源额度</h4>
              <ul class="quota-features"><li v-for="feature in quotaFeatures(plan)" :key="feature"><span aria-hidden="true">✓</span>{{feature}}</li></ul>
              <h4 class="rights-heading">目录包含功能</h4>
              <ul class="capability-features"><li v-for="capability in catalogPlan(plan.code)?.entitlements?.filter(c=>c.enabled===true) || []" :key="capability.code"><span aria-hidden="true">✓</span>{{capabilityName(capability.code)}}</li></ul>
              <p v-if="!catalogPlan(plan.code)?.entitlements?.length" class="rights-note">功能目录尚未提供，请稍后重新读取。</p>
              <h4 class="rights-heading">目录未包含功能</h4>
              <ul class="excluded-features"><li v-for="capability in catalogPlan(plan.code)?.entitlements?.filter(c=>c.enabled===false) || []" :key="capability.code"><span aria-hidden="true">—</span>{{capabilityName(capability.code)}}</li></ul>
              <ul class="excluded-features"><li v-for="capability in catalogPlan(plan.code)?.entitlements?.filter(c=>c.enabled!==true && c.enabled!==false) || []" :key="capability.code"><span aria-hidden="true">?</span>{{capabilityName(capability.code)}}（状态待确认）</li></ul>
              <p class="rights-note">实际可用功能以当前有效订阅、服务开通及权限为准。</p>
              <h4 class="rights-heading">新增方案权益 · 开发中</h4>
              <ul class="proposed-features"><li v-for="feature in proposedPlanFeatures(plan)" :key="feature"><span aria-hidden="true">○</span>{{feature}}</li></ul>
              <p class="rights-note">以上新增方案尚未上线；资源由同一所有者的套餐项目共享，通知短信、语音及平台代发业务邮件不包含在年费中。</p>
            </div>
            <footer><p class="card-note">{{plan.code==='FREE'?'免费版可随时升级至付费版':'已确认方案参考价，非成交价'}}</p><button type="button" class="detail-button" @click="detail=plan.code">了解功能详情 <span class="detail-arrow">↗</span></button></footer>
          </article>
          <article class="version-card payg-card" aria-label="预充值按量付费" data-selectable="false">
            <span class="card-badge is-unreleased">未上线</span>
            <header aria-disabled="true"><h3>预充值按量付费</h3><p class="payg-price">按实际用量计费</p></header>
            <div class="card-body"><p class="plan-description">无固定月租，预充值按实际用量计费。以下为已确认设计价，尚不可选择。</p><h4 class="rights-heading">按量计费标准</h4><ul><li v-for="rate in payAsYouGoRates" :key="rate[0]"><span aria-hidden="true">✓</span><div class="rate-line"><span>{{rate[0]}}</span><strong>{{rate[1]}}</strong></div></li></ul><h4 class="rights-heading">方案权限及资源边界 · 未上线</h4><ul class="payg-entitlements"><li v-for="feature in payAsYouGoEntitlements" :key="feature"><span aria-hidden="true">○</span>{{feature}}</li></ul></div>
            <footer><p class="card-note">仅展示计费方案，暂不开放创建</p><button type="button" class="detail-button" @click="detail='PAYG'">了解计费标准 <span class="detail-arrow">↗</span></button></footer>
          </article>
        </div>
      </section>
      <el-form-item label="项目描述" prop="description"><el-input v-model="form.description" class="short-field" type="textarea" :rows="5" maxlength="1000" aria-label="项目描述" /></el-form-item>
    </el-form>
      <p v-if="submitError" class="create-error" role="alert">{{submitError}}</p>
      <p v-if="uncertain" class="create-error">创建结果尚未确认，请先返回我的项目核对；本页不会重复提交。</p>
      <div class="create-actions"><el-button type="primary" @click="submit" :loading="submitting" :disabled="!creatable || !!catalog.error.value || uncertain || saved">创建项目</el-button><el-button :disabled="submitting" @click="uncertain || saved ? router.push('/projects') : back()">{{uncertain||saved?'返回我的项目':'取消'}}</el-button></div>
    <el-dialog :model-value="!!detail" :title="detail==='PAYG'?'预充值按量付费 · 未上线': detailPlan?`${detailPlan.name} · 版本方案`:'版本介绍及价格'" width="760px" class="project-plan-dialog" @update:model-value="!$event && (detail='')">
      <template v-if="detail==='PAYG'">
        <p>以下是已确认设计标准，尚未上线，不开放选择或扣费。无固定月租；实时预占，每 5 分钟结算，赠款先用。</p>
        <table><thead><tr><th>服务</th><th>单价</th><th>计量方式</th></tr></thead><tbody><tr v-for="rate in payAsYouGoRates" :key="rate[0]"><td>{{rate[0]}}</td><td>{{rate[1]}}</td><td>{{rate[2]}}</td></tr></tbody></table>
        <p>符合资格的新账户一次赠送 ¥10；所有者钱包合计可用余额不少于 ¥10 才可新建，这不是创建费用，也不是每项目赠款。所有者最多 ¥1 信用；短信、语音、平台代发邮件须单独开通，只用正充值余额。</p>
        <p>基础规则、站内告警、普通管理与账户提醒不单独收费；仍有有限资源和速率边界。低于 ¥10 仅阻止新建；资金不足时停止新增收费业务。以上均为未上线方案。</p>
      </template>
      <template v-else>
        <p>新项目使用{{ currentPlan?.name ? `当前套餐（${currentPlan.name}）` : '所有者当前套餐（创建时由服务端核定）' }}。付费新品尚未开售；四档属于所有者订阅，所有套餐项目共享资源；创建项目沿用当前有效套餐，不会购买或切换版本。下表为已确认方案参考，新增权益仍在开发，实际权益和准入以服务端当前有效订阅为准。</p>
        <table><thead><tr><th>版本</th><th>方案年价</th><th>上行 / 下行日池</th><th>自有项目 / 协作者</th></tr></thead><tbody><tr v-for="plan in projectPlanPreviews" :key="plan.code"><td>{{plan.name}}</td><td>¥{{plan.price.toLocaleString()}}</td><td>{{plan.uplink.toLocaleString()}} / {{plan.downlink.toLocaleString()}}</td><td>{{plan.projects}} / {{plan.members}}</td></tr></tbody></table>
        <p>上行、下行是独立 UTC 日池，不能互借；当前基线按条计量。新修订的 4 KiB 单位不改写已有订阅。查询窗口不等于无限存储或物理保留保证，业务历史池为新方案权益。</p>
        <p v-if="livePlan">当前目录：{{livePlan.name}} / {{livePlan.revision}}；{{livePlan.saleStatus==='ON_SALE'?'可售':'未开售'}}<template v-if="livePlan.referencePriceCents!=null">，目录参考价 ¥{{livePlan.referencePriceCents/100}}</template><template v-if="livePlan.priceCents!=null">，目录成交价 ¥{{livePlan.priceCents/100}}</template>。与新品方案分开展示。</p>
        <p v-if="detailPlan">{{detailPlan.name}}新方案：业务历史逻辑池 {{detailPlan.historyPool}}，对象文件容量 {{detailPlan.objects}}；新权益仍在开发，不能替代当前订阅。</p>
        <p v-if="detailPlan?.code==='PROFESSIONAL'">专业版新品方案年价 ¥19,980，不覆盖旧目录 ¥11,980 参考价或现有订阅快照。</p>
      </template>
      <template #footer><el-button @click="detail=''">关闭</el-button></template>
    </el-dialog>
  </main>
</template>

<style scoped>
.project-create{min-height:100%;padding:20px 30px 50px;background:#fff;color:#4a4a4a;font-size:16px;line-height:1.5}
.project-create :deep(.el-page-header){margin-bottom:40px;line-height:27px}.project-create :deep(.el-page-header__content){font-size:18px;font-weight:400;line-height:27px;color:#303133}.project-create :deep(.el-page-header__title){font-size:14px;font-weight:500}.project-create :deep(.el-page-header__icon){font-size:18px;margin-right:6px}
.project-create :deep(.el-form-item){margin-bottom:22px}.project-create :deep(.el-form-item__label){display:block;height:auto;margin:0;padding:0;font-size:14px;line-height:32px;font-weight:700;color:#606266}.project-create :deep(.el-form-item__label:before){display:none}.project-create :deep(.el-form-item__content){font-size:14px;line-height:24px}
.project-create :deep(.el-radio-button__inner){padding:12px 20px;font-size:14px;font-weight:500;height:40px;line-height:14px;transition:all .3s cubic-bezier(.645,.045,.355,1)}.project-create :deep(.el-radio-button.is-disabled .el-radio-button__inner){color:#c0c4cc;background:#fff;border-color:#ebeef5;box-shadow:none}
.short-field{width:450px;max-width:100%}.project-create :deep(.el-textarea__inner){font-size:14px;line-height:1.5;padding:5px 15px}
.field-help{margin:0 0 10px;font-size:14px;line-height:18px;color:#909399;font-weight:400}.field-help a,.text-link{display:inline-flex;align-items:center;gap:4px;vertical-align:top;font-weight:700;color:#1e88e5}.field-help a:hover,.text-link:hover{color:#51bbff}.field-help .reference-icon{font-size:14px;vertical-align:baseline}.text-link{border:0;background:none;padding:0;cursor:pointer;font:inherit;font-weight:700;color:#1e88e5}
.version-section{margin:0 0 22px}.version-section h2{margin:0;font-size:14px;line-height:32px;font-weight:700;color:#606266}
.version-cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:stretch;gap:16px;font-size:14px;line-height:24px}.version-card{position:relative;display:flex;flex-direction:column;min-width:0;padding:0;border:2px solid #e4e7ed;border-radius:8px;overflow:hidden;background:#fff;transition:all .3s}
.version-card:not(.payg-card):hover{border-color:#c0c4cc;transform:translateY(-2px);box-shadow:0 4px 12px #0000001a}.version-card.is-current{border-color:#409eff;box-shadow:0 0 0 3px #409eff26}.version-card.is-current:hover{border-color:#409eff}.version-card.is-reference,.payg-card{opacity:.85}
.card-open{position:absolute;inset:0;z-index:1;padding:0;border:0;background:transparent;cursor:pointer}.card-open:focus-visible{outline:2px solid #409eff;outline-offset:-5px;border-radius:6px}
.version-card>header{padding:16px 16px 12px;border-bottom:1px solid #f0f0f0;background:linear-gradient(180deg,#f9fafb,#fff)}.version-card h3{margin:0 0 6px;font-size:15px;font-weight:700;line-height:24px;color:#303133}.plan-price{display:flex;align-items:baseline;line-height:1;margin:0}.plan-price small{font-size:13px;font-weight:500;color:#f56c6c;margin-right:2px}.plan-price strong{font-size:22px;font-weight:700;color:#f56c6c}.plan-price>span{color:#909399;font-size:12px;font-weight:400;margin-left:2px}
.card-badge{position:absolute;top:0;right:0;z-index:2;padding:3px 10px;font-size:11px;font-weight:700;color:#fff;background:linear-gradient(135deg,#409eff,#66b1ff);border-bottom-left-radius:8px;line-height:24px;pointer-events:none}.card-badge.is-unreleased{background:#909399}
.card-body{padding:12px 16px 0;flex:1}.rights-heading{margin:12px 0 6px;font-size:12px;font-weight:700;line-height:24px;color:#606266}.rights-note{font-size:12px;color:#909399;line-height:18px;margin:8px 0}.version-card .excluded-features li,.version-card .excluded-features li>span{color:#909399}.version-card .proposed-features li>span,.version-card .payg-entitlements li>span{color:#409eff}.plan-description{min-height:54px;margin:0 0 12px;font-size:12px;line-height:1.5;color:#606266}.version-card ul{list-style:none;padding:0;margin:0}.version-card li{display:flex;align-items:flex-start;gap:6px;padding:3px 0;line-height:24px;margin:0;font-size:12px;color:#606266}.version-card li>span{color:#67c23a;font-size:12px;font-weight:700;flex:none}
.version-card footer{text-align:center;margin-top:auto;padding:0 16px 16px}.card-note{margin:8px 0 16px;padding:5px 10px;font-size:11px;line-height:1.4;color:#409eff;background:#409eff14;border-radius:6px}.detail-button{position:relative;z-index:2;display:inline-flex;align-items:center;gap:6px;padding:8px 20px;border:2px solid transparent;border-radius:20px;line-height:1.4;color:#fff;font-size:13px;font-weight:700;cursor:pointer;background:linear-gradient(135deg,#409eff,#66b1ff);box-shadow:0 2px 8px #409eff40;transition:all .25s ease}.detail-button:hover{background:linear-gradient(135deg,#66b1ff,#409eff);box-shadow:0 4px 12px #409eff59;transform:translateY(-1px)}.detail-arrow{font-size:13px;transition:transform .25s ease}.detail-button:hover .detail-arrow{transform:translate(2px,-1px)}
.payg-price{font-size:18px;line-height:22px;color:#f56c6c;font-weight:700;margin:0}.payg-card li{padding:3px 0;line-height:24px}.quota-features li,.rate-line{overflow-wrap:normal}.rate-line{display:flex;flex:1;min-width:0;justify-content:space-between;gap:8px}.rate-line>span,.rate-line>strong{white-space:nowrap}.payg-card strong{font-weight:400;color:#909399}
.create-actions{margin-top:50px;display:flex;gap:10px}.create-actions .el-button+.el-button{margin-left:0}.create-error{color:#f56c6c;margin:16px 0;font-size:14px;line-height:22px}
:deep(.project-plan-dialog){max-width:calc(100vw - 32px)}.project-plan-dialog p{line-height:1.8}.project-plan-dialog table{border-collapse:collapse;width:100%;font-size:12px}.project-plan-dialog td,.project-plan-dialog th{padding:10px 8px;border:1px solid #ebeef5;text-align:left}.project-plan-dialog th{background:#fafafa}.project-plan-dialog td:nth-child(2){min-width:130px}
@media(max-width:1559px){.version-cards{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:1099px){.version-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:767px){.project-create{padding:25px 15px}.version-cards{gap:12px}.project-plan-dialog table{font-size:11px}.project-plan-dialog td:nth-child(2){min-width:0}}
@media(max-width:639px){.version-cards{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.version-card,.detail-button,.detail-arrow{transition:none}}
</style>
