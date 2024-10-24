export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      meta: {
        single: true,
      },
      component: Layouts,
      redirect: "/pcd",
      children: [
        {
          path: "/pcd",
          name: "PCD",
          meta: {
            title: "PCDLoader",
          },
          component: () => import("@/views/Pcd/index.vue"),
        },
      ],
    },
    {
      path: "/potree-index",
      meta: {
        single: true,
      },
      component: Layouts,
      redirect: "/potree",
      children: [
        {
          path: "/potree",
          name: "Potree",
          meta: {
            title: "Potree",
          },
          component: () => import("@/views/Potree/index.vue"),
        },
      ],
    },
  ],
});
