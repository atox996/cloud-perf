import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { TDesignResolver } from "unplugin-vue-components/resolvers";

import { execSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// 获取当前分支 commitId
let commitId = "";
if (fs.existsSync(".git")) {
  try {
    commitId = execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    commitId = "";
  }
}

const buildTime = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Shanghai", // 使用中国时区
}).format(new Date());

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        chunkFileNames: "js/[name]-[hash].js",
        entryFileNames: "js/[name]-[hash].js",
        assetFileNames: "[ext]/[name]-[hash].[ext]",
      },
    },
  },
  plugins: [
    vue(),
    AutoImport({
      dirs: ["src/components/**"],
      imports: [
        "vue",
        "vue-router",
        "pinia",
        {
          from: "vue-router",
          imports: ["RouteRecordRaw"],
          type: true,
        },
        {
          "vue-router": [
            "createRouter",
            "createWebHistory",
            "createWebHashHistory",
          ],
        },
      ],
      eslintrc: {
        enabled: true,
      },
      resolvers: [
        TDesignResolver({
          library: "vue-next",
          resolveIcons: true,
          esm: true,
          exclude: ["TYPE"],
        }),
      ],
    }),
    Components({
      dirs: ["src/components"],
      include: [/\.vue$/, /\.tsx?$/, /\.vue\?vue/],
      resolvers: [
        TDesignResolver({
          library: "vue-next",
          resolveIcons: true,
          esm: true,
        }),
      ],
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    __COMMITID__: JSON.stringify(commitId),
    __BUILDTIME__: JSON.stringify(buildTime),
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        // target: "http://10.8.33.95:3000",
        changeOrigin: true,
      },
    },
  },
});
