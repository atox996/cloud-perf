<template>
  <router-view v-slot="{ Component, route }">
    <keep-alive v-if="route.meta.single">
      <component :is="Component" :key="route.path" />
    </keep-alive>
    <component :is="Component" v-else :key="route.path" />
  </router-view>
</template>
<style lang="less">
@import "@/styles/index.less";
</style>
