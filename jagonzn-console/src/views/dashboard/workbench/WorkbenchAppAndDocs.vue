<template>
  <section class="workbench-support-card" aria-labelledby="workbench-app-heading">
    <div class="workbench-support-card__heading">
      <h2 id="workbench-app-heading">JAGONZN App</h2>
      <span>移动应用</span>
    </div>
    <div class="workbench-app-downloads">
      <button
        type="button"
        class="workbench-app-download workbench-app-download--ios"
        aria-disabled="true"
      >
        <ArtSvgIcon icon="tl:smartphone" />
        <span>iOS App</span>
      </button>
      <button
        type="button"
        class="workbench-app-download workbench-app-download--android"
        aria-disabled="true"
      >
        <ArtSvgIcon icon="tl:bot" />
        <span>Android App</span>
      </button>
    </div>
  </section>

  <section class="workbench-support-card" aria-labelledby="workbench-docs-heading">
    <div class="workbench-support-card__heading">
      <h2 id="workbench-docs-heading">文档</h2>
      <a
        :href="docsBase"
        target="_blank"
        rel="noopener noreferrer"
        class="workbench-docs-more"
        aria-label="更多文档"
      >
        更多 <ArtSvgIcon icon="tl:chevron-right" />
      </a>
    </div>
    <ul class="workbench-docs-links">
      <li v-for="doc in docs" :key="doc.path">
        <a :href="`${docsBase}/${doc.path}`" target="_blank" rel="noopener noreferrer">{{
          doc.label
        }}</a>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
  import { WEB_LINKS } from '@/utils/constants'

  const docsBase = WEB_LINKS.DOCS.replace(/\/+$/, '')
  // 摘要与路径来自 things-link-platform/src/content/docs，沿用官网的真实文档路由。
  const docs = [
    { path: 'getting-started', label: '如何接入第一台设备？' },
    { path: 'device/thing-model', label: '如何定义设备类型与物模型？' },
    { path: 'device/mqtt', label: '设备如何通过 MQTT 连接平台？' },
    { path: 'device/management', label: '如何管理设备与调试消息？' },
    { path: 'device/telemetry', label: '如何查看属性、事件和历史数据？' },
    { path: 'device/commands', label: '如何下发命令与属性设置？' },
    { path: 'device/gateway', label: '如何配置网关与 Modbus 点位？' },
    { path: 'business/automation', label: '如何配置自动化与手动场景？' },
    { path: 'business/dashboards', label: '如何设计并发布看板？' },
    { path: 'business/applications', label: '如何发布应用并配置终端访问？' }
  ]
</script>

<style lang="scss" scoped>
  .workbench-support-card {
    min-width: 0;
    padding: 20px;
    background: var(--el-bg-color);
    border: 1px solid var(--console-line);
    border-radius: 4px;
  }
  .workbench-support-card__heading {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .workbench-support-card__heading h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    line-height: 24px;
  }
  .workbench-support-card__heading > span {
    font-size: 14px;
    color: var(--el-text-color-secondary);
  }
  .workbench-app-downloads {
    display: grid;
    gap: 8px;
  }
  .workbench-app-download {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 36px;
    padding: 6px 12px;
    font-size: 14px;
    font-weight: 500;
    line-height: 22px;
    color: #fff;
    cursor: default;
    border: 0;
    border-radius: 4px;
  }
  .workbench-app-download svg {
    font-size: 18px;
  }
  .workbench-app-download--ios {
    background: #111827;
  }
  .workbench-app-download--android {
    background: var(--el-color-primary);
  }
  .workbench-app-download:focus-visible,
  .workbench-support-card a:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 3px;
  }
  .workbench-docs-more {
    display: inline-flex;
    flex-shrink: 0;
    gap: 4px;
    align-items: center;
    font-size: 14px;
    line-height: 24px;
    color: var(--el-color-primary);
  }
  .workbench-docs-links {
    display: grid;
    gap: 4px;
    padding: 0;
    margin: 0;
    list-style: none;
  }
  .workbench-docs-links a {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    font-size: 14px;
    line-height: 22px;
    color: var(--el-color-primary);
    overflow-wrap: anywhere;
  }
  .workbench-support-card a:hover {
    color: var(--el-color-primary-dark-2);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
