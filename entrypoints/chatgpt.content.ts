import { browser } from "wxt/browser";

interface PingMessage {
  type: "CHAT2TEX_PING";
}

interface PingResponse {
  ok: true;
  title: string;
  url: string;
}

export default defineContentScript({
  matches: ["https://chatgpt.com/*"],
  runAt: "document_idle",

  main() {
    console.info("[Chat2TeX] Content script loaded");

    browser.runtime.onMessage.addListener(
      (message: PingMessage): Promise<PingResponse> | undefined => {
        if (message.type !== "CHAT2TEX_PING") {
          return undefined;
        }

        return Promise.resolve({
          ok: true,
          title: document.title,
          url: window.location.href,
        });
      },
    );
  },
});
