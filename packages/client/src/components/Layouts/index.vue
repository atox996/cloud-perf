<template>
  <t-layout class="app-layout">
    <t-aside width="auto">
      <side-nav></side-nav>
    </t-aside>
    <t-layout class="main-layout">
      <t-header><Header /></t-header>
      <t-content class="content-wrapper">
        <router-view v-slot="{ Component, route }">
          <keep-alive v-if="route.meta.keepAlive">
            <component :is="Component" :key="route.path" />
          </keep-alive>
          <component :is="Component" v-else :key="route.path" />
        </router-view>
      </t-content>
    </t-layout>
  </t-layout>
</template>
<style lang="less" scoped>
.app-layout {
  width: 100%;
  height: 100%;

  .main-layout {
    overflow: hidden;

    .content-wrapper {
      overflow: hidden;
    }
  }
}
</style>
