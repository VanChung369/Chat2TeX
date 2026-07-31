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

import { InPageExporterUI } from "@/src/features/chat/in-page-exporter";
import type { PreparedExport, ProcessedExportAssets } from "@/src/features/export/types";
import type { ResolveAssetResult } from "@/src/features/assets/types";

export default defineContentScript({
  matches: [
    "https://chatgpt.com/*",
    "https://*.chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://*.openai.com/*",
  ],
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

    const processInPageAssets = async (prepared: PreparedExport) => {
      const files: ProcessedExportAssets["files"] = [];
      const failures: ProcessedExportAssets["failures"] = [];

      for (const asset of prepared.assets) {
        try {
          const protocol = readProtocol(asset.sourceUrl);
          if (protocol === "blob:" || protocol === "data:") {
            const pageResult = await pageImageReader.read(asset);
            if (pageResult.ok) {
              const convertResult = (await browser.runtime.sendMessage({
                type: "CHATTEX_CONVERT_IMAGE_DATA",
                asset,
                data: pageResult.data,
              })) as ResolveAssetResult;
              if (convertResult.ok) {
                files.push(convertResult.file);
                continue;
              }
            }
          } else {
            const result = (await browser.runtime.sendMessage({
              type: "CHATTEX_PROCESS_IMAGE_ASSET",
              asset,
            })) as ResolveAssetResult;
            if (result.ok) {
              files.push(result.file);
              continue;
            }
          }
        } catch {
          // ignore failure
        }

        failures.push({
          id: asset.id,
          sourceUrl: asset.sourceUrl,
          code: "download-failed",
          message: "Unable to process image asset",
        });
      }

      return { files, failures };
    };

    const runInPageExport = async (updateStatus: (statusText: string) => void) => {
      updateStatus("1/3 Quét cuộc trò chuyện...");
      const conversation = await collectConversation();
      const prepared = prepareConversationExport(conversation);

      if (prepared.assets.length > 0) {
        updateStatus(`1/3 Đang xử lý ${prepared.assets.length} hình ảnh...`);
      }
      const { files, failures } = await processInPageAssets(prepared);

      updateStatus("2/3 Đang biên dịch XeLaTeX PDF...");
      const compileResponse = (await sendRuntimeMessageWithRetry({
        type: "CHATTEX_COMPILE_LATEX",
        project: {
          source: prepared.latexSource,
          files: files.map((f) => ({ path: f.outputPath, base64: f.base64 })),
        },
      })) as { ok: boolean; pdfBase64?: string; error?: string };

      if (!compileResponse?.ok || !compileResponse.pdfBase64) {
        throw new Error(compileResponse?.error || "XeLaTeX compilation failed.");
      }

      updateStatus("3/3 Đang hoàn tất & tải về...");
      const downloadResponse = (await sendRuntimeMessageWithRetry({
        type: "CHATTEX_DOWNLOAD_EXPORT",
        payload: {
          title: prepared.title,
          url: prepared.url,
          exportedAtIso: new Date().toISOString(),
          latexSource: prepared.latexSource,
          pdfBase64: compileResponse.pdfBase64,
          files,
          failures,
        },
      })) as { ok: boolean; error?: string };

      if (!downloadResponse?.ok) {
        throw new Error(downloadResponse?.error || "Download packaging failed.");
      }

      updateStatus("✅ Hoàn tất! Đã tải về PDF, TEX & ZIP.");
    };

    new InPageExporterUI(runInPageExport).mount();

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

function readProtocol(value: string): string {
  try {
    return new URL(value).protocol;
  } catch {
    return "";
  }
}

async function sendRuntimeMessageWithRetry<T>(
  message: unknown,
  maxRetries = 10,
  delayMs = 300,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return (await browser.runtime.sendMessage(message)) as T;
    } catch (error) {
      const isNoReceiver =
        error instanceof Error &&
        (error.message.includes("Could not establish connection") ||
          error.message.includes("Receiving end does not exist"));

      if (isNoReceiver && attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw error;
    }
  }

  throw new Error("Extension background script failed to respond.");
}
