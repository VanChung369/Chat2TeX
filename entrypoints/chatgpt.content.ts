import { browser } from "wxt/browser";

import { ChatGPTAdapter } from "@/src/features/chat/chatgpt-adapter";

import { ConversationCollector } from "@/src/features/chat/conversation-collector";

import { DomConversationViewport } from "@/src/features/chat/dom-conversation-viewport";

import type { ChatConversation } from "@/src/features/chat/types";

import { HtmlToAstParser } from "@/src/features/document/html-to-ast";

import { LatexGenerator } from "@/src/features/latex/latex-generator";

import { PageImageReader } from "@/src/features/assets/page-image-reader";

import {
  isChatTexPingRequest,
  isCollectConversationRequest,
  isExtractConversationRequest,
  isPrepareExportRequest,
  isReadPageImageRequest,
  type ChatTexCollectConversationResponse,
  type ChatTexPrepareExportResponse,
  type PingResponse,
} from "@/src/shared/messages";

export default defineContentScript({
  matches: ["https://chatgpt.com/*"],
  runAt: "document_idle",

  main() {
    console.info("[ChatTeX] Content script loaded");

    const adapter = new ChatGPTAdapter();

    const pageImageReader = new PageImageReader();

    let collectionPromise: Promise<ChatConversation> | null = null;

    const collectConversation = (): Promise<ChatConversation> => {
      if (collectionPromise) {
        return collectionPromise;
      }

      collectionPromise = runConversationCollection(adapter).finally(() => {
        collectionPromise = null;
      });

      return collectionPromise;
    };

    browser.runtime.onMessage.addListener(
      (message: unknown, _sender, sendResponse) => {
        if (isChatTexPingRequest(message)) {
          const response: PingResponse = {
            ok: true,
            title: adapter.getConversationTitle(),
            url: window.location.href,
          };

          sendResponse(response);
          return;
        }

        if (isExtractConversationRequest(message)) {
          sendResponse(adapter.extractConversation());

          return;
        }

        if (isCollectConversationRequest(message)) {
          void collectConversation()
            .then((conversation) => {
              const response: ChatTexCollectConversationResponse = {
                ok: true,
                conversation,
              };

              sendResponse(response);
            })
            .catch((error) => {
              sendResponse({
                ok: false,

                error: readErrorMessage(error),
              });
            });

          return true;
        }

        if (isPrepareExportRequest(message)) {
          void collectConversation()
            .then((conversation) => {
              const parser = new HtmlToAstParser();

              const generator = new LatexGenerator();

              const ast = parser.parseConversation(conversation);

              const latex = generator.generate(ast);

              const response: ChatTexPrepareExportResponse = {
                ok: true,

                prepared: {
                  title: conversation.title,
                  url: conversation.url,
                  latexSource: latex.source,
                  assets: latex.assets,
                },
              };

              sendResponse(response);
            })
            .catch((error) => {
              sendResponse({
                ok: false,
                error: readErrorMessage(error),
              });
            });

          return true;
        }

        if (isReadPageImageRequest(message)) {
          void pageImageReader
            .read(message.asset)
            .then(sendResponse)
            .catch((error) => {
              sendResponse({
                ok: false,
                code: "download-failed",
                message: readErrorMessage(error),
              });
            });

          return true;
        }

        return;
      },
    );
  },
});

async function runConversationCollection(
  adapter: ChatGPTAdapter,
): Promise<ChatConversation> {
  const viewport = DomConversationViewport.fromDocument();

  const collector = new ConversationCollector(adapter, viewport);

  return collector.collect((progress) => {
    console.info("[ChatTeX] Collecting", progress);
  });
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown export error.";
}
