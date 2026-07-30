import { ChatGPTAdapter } from "@/src/features/chat/chatgpt-adapter";
import {
  isChatTexPingRequest,
  isExtractConversationRequest,
  PingResponse,
} from "@/src/shared/messages";

import { ConversationCollector } from "@/src/features/chat/conversation-collector";

import { DomConversationViewport } from "@/src/features/chat/dom-conversation-viewport";

import {
  isCollectConversationRequest,
  type ChatTexCollectConversationResponse,
} from "@/src/shared/messages";

import { HtmlToAstParser } from "@/src/features/document/html-to-ast";

import { browser } from "wxt/browser";

export default defineContentScript({
  matches: ["https://chatgpt.com/*"],
  runAt: "document_idle",

  main() {
    console.info("[ChatTeX] Content script loaded");

    const adapter = new ChatGPTAdapter();

    let collectionPromise: Promise<ChatTexCollectConversationResponse> | null =
      null;

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

      if (isCollectConversationRequest(message)) {
        if (collectionPromise) {
          return collectionPromise;
        }

        collectionPromise = collectConversation(adapter).finally(() => {
          collectionPromise = null;
        });

        return collectionPromise;
      }

      return undefined;
    });
  },
});

async function collectConversation(
  adapter: ChatGPTAdapter,
): Promise<ChatTexCollectConversationResponse> {
  try {
    const viewport = DomConversationViewport.fromDocument();

    const collector = new ConversationCollector(adapter, viewport);

    const conversation = await collector.collect((progress) => {
      console.info("[ChatTeX] Collecting conversation", progress);
    });

    const parser = new HtmlToAstParser();
    const documentAst = parser.parseConversation(conversation);

    console.info("[ChatTeX] Document AST", documentAst);
    return {
      ok: true,
      conversation,
    };
  } catch (error) {
    console.error("[ChatTeX] Collection failed", error);

    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Unknown collection error.",
    };
  }
}
