<template>
  <t-head-menu>
    <t-breadcrumb :options="options" />
    <template #operations>
      <t-button variant="text" shape="square" @click="themeChange">
        <template #icon><t-icon :name="modeIcon"></t-icon></template>
      </t-button>
    </template>
  </t-head-menu>
</template>
<script lang="ts" setup>
import { useSettingStore } from "@/store";
import type { TdBreadcrumbItemProps } from "tdesign-vue-next";

const route = useRoute();
const settingStore = useSettingStore();

const options = computed<TdBreadcrumbItemProps[]>(() =>
  route.matched
    .filter((item) => !item.meta.single)
    .map((item) => ({
      content: item.meta.title,
      disabled: item.path === route.path,
      target: item.path.startsWith("http") ? "_blank" : "_self",
      to: item.path,
    })),
);

const modeIcon = computed(() =>
  settingStore.mode === "dark" ? "mode-dark" : "mode-light",
);

const themeChange = () => {
  settingStore.changeMode(settingStore.mode === "dark" ? "light" : "dark");
};

const media = window.matchMedia("(prefers-color-scheme: dark)");

const systemThemeChange = () => {
  settingStore.changeMode(media.matches ? "dark" : "light");
};

onMounted(() => {
  systemThemeChange();
  media.addEventListener("change", systemThemeChange);
});

onBeforeUnmount(() => {
  media.removeEventListener("change", systemThemeChange);
});
</script>
