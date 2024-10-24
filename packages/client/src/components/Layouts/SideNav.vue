<template>
  <t-menu v-model:expanded="expanded" :collapsed="collapse" :value="active">
    <template #logo>
      <span @click="router.push('/')">LOGO</span>
    </template>
    <menu-content :nav-data="router.options.routes"></menu-content>
    <template #operations>
      <t-button variant="text" shape="square" @click="collapse = !collapse">
        <template #icon><t-icon name="view-list"></t-icon></template>
      </t-button>
    </template>
  </t-menu>
</template>
<script lang="ts" setup>
const route = useRoute();
const router = useRouter();

const active = computed(() => route.path);

const expanded = ref<string[]>([]);

const collapse = ref(false);

watch(
  () => route.matched,
  (matched) => {
    matched.forEach((item) => {
      if (expanded.value.indexOf(item.path) === -1) {
        expanded.value.push(item.path);
      }
    });
  },
  {
    immediate: true,
  },
);
</script>
