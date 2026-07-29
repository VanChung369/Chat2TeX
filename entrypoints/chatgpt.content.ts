import {
  isPingMessage,
  PingMessage,
  PingResponse,
} from "@/src/shared/messages";
import { browser } from "wxt/browser";

export default defineContentScript({
  matches: ["https://chatgpt.com/*"],
  runAt: "document_idle",

  main() {
    console.info("[Chat2TeX] Content script loaded");

    browser.runtime.onMessage.addListener(
      (message: PingMessage): Promise<PingResponse> | undefined => {
        if (!isPingMessage(message)) {
          return undefined;
        }

        const response: PingResponse = {
          ok: true,
          title: getConversationTitle(),
          url: window.location.href,
        };

        return Promise.resolve(response);
      },
    );
  },
});

function getConversationTitle(): string {
  const title = document.title.replace(/\s*[-–—]\s*ChatGPT\s*$/i, "").trim();

  return title || "Untitled conversation";
}
