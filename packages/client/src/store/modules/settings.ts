import { store } from "..";

interface SettingState {
  mode: "auto" | "dark" | "light";
}

const state: SettingState = {
  mode: "auto",
};

export const useSettingStore = defineStore("setting", {
  state: () => state,
  getters: {
    getMode: (state) => {
      if (state.mode === "auto") {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        return media.matches ? "dark" : "light";
      }
      return state.mode;
    },
  },
  actions: {
    changeMode(mode: SettingState["mode"]) {
      this.mode = mode;
      document.documentElement.setAttribute("theme-mode", this.getMode);
    },
  },
});

export function getSettingStore() {
  return useSettingStore(store);
}
