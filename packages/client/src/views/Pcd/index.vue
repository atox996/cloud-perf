<template>
  <section class="page-wrapper">
    <div class="tree-wrapper">
      <t-space direction="vertical">
        <span>加载方式</span>
        <t-radio-group
          v-model="loadType"
          :options="loadTypeOptions"
        ></t-radio-group>
        <span>远程数据</span>
        <t-tree
          v-model="pcdList"
          :data="treeData"
          :keys="treeKeys"
          checkable
          expand-all
          hover
          line
        >
        </t-tree>
      </t-space>
    </div>
    <div class="content">
      <div ref="scene" class="scene"></div>
    </div>
  </section>
</template>
<script lang="ts" setup>
import type { RadioOption } from "tdesign-vue-next";
import Renderer from "./renderer";

interface FileInfo {
  path: string;
  name: string;
  size: number;
  lastModified: string;
}

interface DirectoryInfo {
  path: string;
  name: string;
  children: (FileInfo | DirectoryInfo)[];
}

type FileTree = FileInfo | DirectoryInfo;

const renderer = new Renderer();

const sceneRef = useTemplateRef("scene");

const loadType = ref<"PCDLoader" | "PCDChunkLoader">("PCDChunkLoader");

const loadTypeOptions: RadioOption[] = [
  {
    label: "PCDLoader",
    value: "PCDLoader",
  },
  {
    label: "PCDChunkLoader",
    value: "PCDChunkLoader",
  },
];

const treeData = ref<FileTree[]>([]);

const treeKeys = {
  value: "path",
  label: "name",
  children: "children",
};

const pcdList = ref<string[]>([]);

watch(pcdList, () => {
  if (loadType.value === "PCDLoader") {
    renderer.loadPCD(pcdList.value);
  } else if (loadType.value === "PCDChunkLoader") {
    renderer.loadPCDByChunk(pcdList.value);
  }
});

onMounted(async () => {
  const res = await fetch("/api/getAssets?type=pcd")
    .then((res) => res.json())
    .then((res) => {
      if (res.code === 200) return Promise.resolve<FileTree>(res.data);
      return Promise.reject(res.message);
    });
  treeData.value = [res];
  renderer.init(sceneRef.value!);
});
</script>
<style lang="less" scoped>
.page-wrapper {
  width: 100%;
  height: 100%;
  display: flex;

  .tree-wrapper {
    width: 20%;
    height: 100%;
    padding: 16px;
    padding-right: 0;
    display: flex;
    flex-direction: column;
  }

  .content {
    flex: 1;
    overflow: hidden;
    position: relative;
    .scene {
      width: 100%;
      height: 100%;
    }
  }
}
</style>
