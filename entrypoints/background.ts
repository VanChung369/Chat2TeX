import { browser } from "wxt/browser";

import { AssetManager } from "@/src/features/assets/asset-manager";

import { BrowserHostPermissionChecker } from "@/src/features/assets/browser-host-permission-checker";

import { BrowserImageConverter } from "@/src/features/assets/browser-image-converter";

import { ImageDataProcessor } from "@/src/features/assets/image-data-processor";

import {
  isConvertImageDataRequest,
  isProcessImageAssetRequest,
  CHATTEX_COMPILE_IN_OFFSCREEN,
  isCompileLatexRequest,
  CHATTEX_PREPARE_DOWNLOADS_OFFSCREEN,
  isDownloadExportRequest,
  type ChatTexCompileInOffscreenRequest,
  type ChatTexCompileInOffscreenResponse,
  type ChatTexDownloadExportResponse,
  type ChatTexPrepareDownloadsOffscreenRequest,
  type ChatTexPrepareDownloadsOffscreenResponse,
} from "@/src/shared/messages";

import type {
  DownloadArtifactDescriptor,
  DownloadExportPayload,
  StartedDownload,
} from "@/src/features/export/download-types";

export default defineBackground(() => {
  const imageConverter = new BrowserImageConverter();

  const assetManager = new AssetManager(
    new BrowserHostPermissionChecker(),
    fetch,
    imageConverter,
  );

  const imageDataProcessor = new ImageDataProcessor(imageConverter);

  browser.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse) => {
      if (!isTrustedSender(sender)) {
        return;
      }

      if (isProcessImageAssetRequest(message)) {
        void assetManager
          .resolve(message.asset)
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

      if (isConvertImageDataRequest(message)) {
        void imageDataProcessor
          .process(message.asset, message.data)
          .then(sendResponse)
          .catch((error) => {
            sendResponse({
              ok: false,
              code: "decode-failed",

              message: readErrorMessage(error),
            });
          });

        return true;
      }

      if (isCompileLatexRequest(message)) {
        void compileInOffscreen(message.project)
          .then(sendResponse)
          .catch((error) => {
            sendResponse({
              ok: false,

              error:
                error instanceof Error
                  ? error.message
                  : "Unable to start compiler.",

              log: "",
            });
          });

        return true;
      }

      if (isDownloadExportRequest(message)) {
        void downloadExport(message.payload)
          .then(sendResponse)
          .catch((error) => {
            const response: ChatTexDownloadExportResponse = {
              ok: false,

              error:
                error instanceof Error
                  ? error.message
                  : "Unable to download export files.",

              downloads: [],
            };

            sendResponse(response);
          });

        return true;
      }

      return;
    },
  );
});

function isTrustedSender(sender: Browser.runtime.MessageSender): boolean {
  if (sender.id !== browser.runtime.id) {
    return false;
  }

  if (!sender.tab?.url) {
    return true;
  }

  try {
    return new URL(sender.tab.url).hostname === "chatgpt.com";
  } catch {
    return false;
  }
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown background error.";
}

let creatingOffscreenDocument: Promise<void> | null = null;

async function compileInOffscreen(
  project: ChatTexCompileInOffscreenRequest["project"],
): Promise<ChatTexCompileInOffscreenResponse> {
  await ensureCompilerDocument();

  const request: ChatTexCompileInOffscreenRequest = {
    type: CHATTEX_COMPILE_IN_OFFSCREEN,

    project,
  };

  return browser.runtime.sendMessage(
    request,
  ) as Promise<ChatTexCompileInOffscreenResponse>;
}

async function ensureCompilerDocument(): Promise<void> {
  const documentUrl = browser.runtime.getURL("/compiler.html");

  const contexts = await browser.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],

    documentUrls: [documentUrl],
  });

  if (contexts.length > 0) {
    return;
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = browser.offscreen
      .createDocument({
        url: "compiler.html",

        reasons: [browser.offscreen.Reason.WORKERS],

        justification:
          "Run the XeLaTeX WebAssembly compiler without blocking the popup.",
      })
      .finally(() => {
        creatingOffscreenDocument = null;
      });
  }

  await creatingOffscreenDocument;
}

async function downloadExport(
  payload: DownloadExportPayload,
): Promise<ChatTexDownloadExportResponse> {
  await ensureCompilerDocument();

  const request: ChatTexPrepareDownloadsOffscreenRequest = {
    type: CHATTEX_PREPARE_DOWNLOADS_OFFSCREEN,

    payload,
  };

  const prepared = (await browser.runtime.sendMessage(
    request,
  )) as ChatTexPrepareDownloadsOffscreenResponse;

  if (!prepared.ok) {
    return {
      ok: false,
      error: prepared.error,
      downloads: [],
    };
  }

  const downloads: StartedDownload[] = [];

  for (const artifact of prepared.artifacts) {
    downloads.push(await startArtifactDownload(artifact));
  }

  const failed = downloads.filter((download) => download.error !== null);

  if (failed.length > 0) {
    return {
      ok: false,

      error: `${failed.length} file downloads failed.`,

      downloads,
    };
  }

  return {
    ok: true,
    downloads,
  };
}

async function startArtifactDownload(
  artifact: DownloadArtifactDescriptor,
): Promise<StartedDownload> {
  try {
    const downloadId = await browser.downloads.download({
      url: artifact.objectUrl,
      filename: `ChatTeX/${artifact.filename}`,

      saveAs: false,

      conflictAction: "uniquify",
    });

    return {
      filename: artifact.filename,
      downloadId,
      error: null,
    };
  } catch (error) {
    return {
      filename: artifact.filename,
      downloadId: null,

      error: error instanceof Error ? error.message : "Download failed.",
    };
  }
}
