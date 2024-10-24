<template>
  <template v-for="item in menuList" :key="item.path">
    <t-menu-item
      v-if="!item.children?.length"
      :name="item.name || item.path"
      :value="item.path"
      :to="{ path: item.path }"
    >
      <template #icon>
        <template v-if="item.meta?.icon">
          <t-icon
            v-if="typeof item.meta.icon === 'string'"
            :name="item.meta.icon"
          ></t-icon>
          <component :is="item.meta.icon" v-else></component>
        </template>
      </template>
      {{ item.meta?.title }}
    </t-menu-item>
    <t-submenu
      v-else
      :name="item.name || item.path"
      :value="item.path"
      :title="item.meta?.title"
    >
      <template #icon>
        <template v-if="item.meta?.icon">
          <t-icon
            v-if="typeof item.meta.icon === 'string'"
            :name="item.meta.icon"
          ></t-icon>
          <component :is="item.meta.icon" v-else></component>
        </template>
      </template>
      <menu-content
        v-if="item.children"
        :nav-data="item.children"
      ></menu-content>
    </t-submenu>
  </template>
</template>
<script lang="ts" setup>
const props = defineProps<{
  navData: readonly RouteRecordRaw[];
}>();

const getMenuList = (list?: readonly RouteRecordRaw[]) => {
  if (!list?.length) return [];
  return list
    .filter((item) => item.meta?.hidden !== true)
    .map((item) => {
      if (item.meta?.single) {
        const singleRoute = item.children![0];
        return singleRoute;
      }
      return item;
    });
};

const menuList = computed(() => getMenuList(props.navData));
</script>
