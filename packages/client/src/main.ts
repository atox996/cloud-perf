import "tdesign-vue-next/es/style/index.css";

import App from "./App.vue";
import router from "./router";
import { store } from "./store";

const app = createApp(App);

app.use(router);
app.use(store);

app.mount("#app");

// 版本信息
console.log(`%cBuild Time:  ${__BUILDTIME__}`, "color: #3488ff");
console.log(`%cLast Commit: ${__COMMITID__}`, "color: #3488ff");
