import { ChatGPTAdapter } from "@/src/features/chat/chatgpt-adapter";
import {
  isChatTexPingRequest,
  isExtractConversationRequest,
  PingResponse,
} from "@/src/shared/messages";
import { browser } from "wxt/browser";

export default defineContentScript({
  matches: ["https://chatgpt.com/*"],
  runAt: "document_idle",

  main() {
    console.info("[ChatTeX] Content script loaded");

    const adapter = new ChatGPTAdapter();

    browser.runtime.onMessage.addListener((message: unknown) => {
      if (isChatTexPingRequest(message)) {
        const response: PingResponse = {
          ok: true,
          title: adapter.getConversationTitle(),
          url: window.location.href,
        };

        return Promise.resolve(response);
      }

      if (isExtractConversationRequest(message)) {
        return Promise.resolve(adapter.extractConversation());
      }

      return undefined;
    });
  },
});
