import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],

  manifest: {
    name: "Chat2TeX Exporter",
    short_name: "Chat2TeX",

    description:
      "Export ChatGPT conversations to beautifully formatted PDF and LaTeX files.",

    permissions: ["storage", "downloads", "offscreen", "scripting"],

    host_permissions: [
      "https://chatgpt.com/*",
      "https://*.chatgpt.com/*",
      "https://chat.openai.com/*",
      "https://*.openai.com/*",
      "https://*.gstatic.com/*",
    ],

    optional_host_permissions: ["https://*/*"],

    action: {
      default_title: "Chat2TeX Exporter",
    },

    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
});
