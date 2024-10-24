import "vue-router";

declare module "vue-router" {
  interface RouteMeta {
    title?: string;
    icon?: string | Component;
    hidden?: boolean;
    single?: boolean;
    keepAlive?: boolean;
  }
}
