/// <reference types="vite/client" />

declare const __COMMITID__: string;
declare const __BUILDTIME__: string;

interface Memory {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

interface Window {
  performance: Performance & {
    memory?: Memory;
  };
}

declare module "*.vue" {
  import { ComponentOptions } from "vue";

  const component: ReturnType<ComponentOptions>;
  export default componentOptions;
}
