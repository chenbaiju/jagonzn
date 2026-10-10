<template>
  <main class="test-page">
    <header class="brand">
      <span class="brand-mark" aria-hidden="true">J</span>
      <span>Jagonzn Console</span>
    </header>

    <section class="test-card" aria-labelledby="page-title">
      <div class="status-label">
        <span class="status-dot" aria-hidden="true"></span>
        本地测试页面
      </div>
      <h1 id="page-title">页面已加载</h1>
      <p class="description">Jagonzn Console 前端测试页</p>
      <div class="page-details">
        <div>
          <span class="detail-label">页面类型</span>
          <span>静态展示</span>
        </div>
        <div>
          <span class="detail-label">前端框架</span>
          <span>Vue 3 / Vite</span>
        </div>
        <div>
          <span class="detail-label">访问方式</span>
          <span>直接访问</span>
        </div>
      </div>
      <p class="note">此页面用于前端访问测试，后端连接状态尚未检测。</p>
    </section>

    <footer>Jagonzn · 测试环境</footer>
  </main>
</template>

<!-- 本页只显示前端自身状态，不以静态文案冒充后端健康或完整验收结果。 -->
