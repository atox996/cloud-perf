import { defineConfig } from "vite";
import Module from "module";

export default defineConfig({
  build: {
    lib: {
      entry: "./src/index.ts",
      formats: ["cjs"],
      fileName: "index",
    },
    rollupOptions: {
      external: [...Module.builtinModules],
    },
  },
});
