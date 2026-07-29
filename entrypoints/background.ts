import { browser } from "wxt/browser";

export default defineBackground(() => {
  console.info("[ChatTeX] Background service worker started");

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install") {
      console.info("[ChatTeX] Extension installed");
    }

    if (reason === "update") {
      console.info("[ChatTeX] Extension updated");
    }
  });
});
