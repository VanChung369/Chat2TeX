import { defineConfig } from "wxt";
import { createExtensionManifest } from "./src/config/extension-manifest";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  react: {
    vite: {
      jsxImportSource: "preact",
    },
  },
  targetBrowsers: ["chrome"],
  manifestVersion: 3,
  vite: () => ({
    build: {
      modulePreload: false,
    },
  }),
  manifest: ({ mode }) =>
    createExtensionManifest({
      mode: mode === "development" ? "development" : "production",
    }),
});
