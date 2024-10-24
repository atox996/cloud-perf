<template>
  <section class="page-wrapper">
    <div class="tree-wrapper">
      <t-tree
        ref="tree"
        :data="treeData"
        :keys="treeKeys"
        activable
        expand-all
        expand-on-click-node
        height="100%"
        hover
        line
        @active="onActive"
      >
      </t-tree>
    </div>
    <div class="content">
      <div ref="scene" class="scene"></div>
    </div>
  </section>
</template>
<script lang="ts" setup>
import type { TdTreeProps, TreeInstanceFunctions } from "tdesign-vue-next";
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

const treeRef = useTemplateRef<TreeInstanceFunctions>("tree");
const sceneRef = useTemplateRef("scene");

const treeData = ref<FileTree[]>([]);

const treeKeys = {
  value: "path",
  label: "name",
  children: "children",
};

const validateName = (name: string) => {
  return name === "metadata.json" || name.endsWith(".js");
};

const getVersion = (name: string) => {
  if (name === "metadata.json") return "v2";
  return "v1";
};

const onActive: TdTreeProps["onActive"] = (e, { node }) => {
  const data = node.data as FileTree;
  if (!validateName(data.name)) return;
  renderer.load(
    data.name,
    data.path.replace(data.name, ""),
    getVersion(data.name),
  );
};

const setItems = (node: FileTree) => {
  if (!validateName(node.name)) {
    if ("children" in node) {
      node.children.forEach((child) => {
        setItems(child);
      });
    } else {
      treeRef.value?.setItem(node.path, {
        disabled: true,
      });
    }
  }
};

onMounted(async () => {
  const res = await fetch("/api/getAssets?type=potree")
    .then((res) => res.json())
    .then((res) => {
      if (res.code === 200) return Promise.resolve<FileTree>(res.data);
      return Promise.reject(res.message);
    });
  treeData.value = [res];
  renderer.init(sceneRef.value!);

  nextTick(() => setItems(res));
});
</script>
<style lang="less" scoped>
.page-wrapper {
  width: 100%;
  height: 100%;
  display: flex;

  .tree-wrapper {
    width: 25%;
    height: 100%;
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
