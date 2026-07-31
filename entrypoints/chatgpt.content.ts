import { browser } from "wxt/browser";

import { ChatGPTAdapter } from "@/src/features/chat/chatgpt-adapter";

import { ChatGptConversationApiReader } from "@/src/features/chat/chatgpt-conversation-api-reader";

import { CompleteConversationReader } from "@/src/features/chat/complete-conversation-reader";

import { ConversationCollector } from "@/src/features/chat/conversation-collector";

import { DomConversationViewport } from "@/src/features/chat/dom-conversation-viewport";

import type { ChatConversation } from "@/src/features/chat/types";

import { prepareConversationExport } from "@/src/features/export/prepare-conversation-export";

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
    const apiFetcher = window.fetch.bind(window);
    const completeConversationReader = new CompleteConversationReader(
      {
        read: () =>
          new ChatGptConversationApiReader(
            apiFetcher,
            window.location.href,
            {
              cookie: document.cookie,
            },
          ).read(),
      },
      () => adapter.extractConversation(),
      () => runConversationCollection(adapter),
    );

    let collectionPromise: Promise<ChatConversation> | null = null;

    const collectConversation = (): Promise<ChatConversation> => {
      if (collectionPromise) {
        return collectionPromise;
      }

      collectionPromise = completeConversationReader
        .read()
        .finally(() => {
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
              const response: ChatTexPrepareExportResponse = {
                ok: true,
                prepared: prepareConversationExport(conversation),
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
