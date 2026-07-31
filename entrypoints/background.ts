import { browser } from "wxt/browser";

import { AssetManager } from "@/src/features/assets/asset-manager";

import { BrowserHostPermissionChecker } from "@/src/features/assets/browser-host-permission-checker";

import { BrowserImageConverter } from "@/src/features/assets/browser-image-converter";

import { ImageDataProcessor } from "@/src/features/assets/image-data-processor";

import {
  CHATTEX_COMPILER_OFFSCREEN_TARGET,
  CHATTEX_PREPARE_COMPILER_JOB_ARTIFACTS,
  CHATTEX_RECORD_COMPILER_JOB_DOWNLOADS,
  isCancelCompilerJobRequest,
  isClearCompilerCacheRequest,
  isCompilerOffscreenTargetedMessage,
  isCompilerStorageRequest,
  isConvertImageDataRequest,
  isDownloadCompilerJobRequest,
  isGetCompilerCacheStatusRequest,
  isGetCompilerJobDiagnosticsRequest,
  isGetCompilerJobRequest,
  isProcessImageAssetRequest,
  isStartCompilerJobRequest,
  type ChatTexDownloadCompilerJobResponse,
} from "@/src/shared/messages";
import {
  isBackgroundRuntimeSender,
  isCompilerDocumentRuntimeSender,
  isTrustedPublicRuntimeSender,
} from "@/src/shared/trusted-message-sender";
import {
  runCompilerStorageRequest,
  type BrowserStorageAreaLike,
} from "@/src/features/compiler/runtime-storage-area";

import type {
  DownloadArtifactDescriptor,
  PrepareDownloadResult,
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
      if (
        isCompilerOffscreenTargetedMessage(message) ||
        isBackgroundRuntimeSender(
          sender,
          browser.runtime.id,
          getBackgroundUrl(),
        )
      ) {
        return;
      }

      if (isCompilerStorageRequest(message)) {
        if (
          !isCompilerDocumentRuntimeSender(
            sender,
            browser.runtime.id,
            getCompilerDocumentUrl(),
          )
        ) {
          sendResponse({
            ok: false,
            error: "Unauthorized compiler storage sender.",
          });
          return false;
        }
        void runCompilerStorageRequest(message, {
          local: browser.storage.local as BrowserStorageAreaLike,
          session: browser.storage.session as BrowserStorageAreaLike,
        }).then(sendResponse);
        return true;
      }

      if (
        !isTrustedPublicRuntimeSender(sender, browser.runtime.id)
      ) {
        sendResponse({
          ok: false,
          error: "Unauthorized extension message sender.",
        });
        return false;
      }

      if (
        isStartCompilerJobRequest(message) ||
        isGetCompilerJobRequest(message) ||
        isGetCompilerJobDiagnosticsRequest(message) ||
        isCancelCompilerJobRequest(message) ||
        isGetCompilerCacheStatusRequest(message) ||
        isClearCompilerCacheRequest(message)
      ) {
        void sendCompilerCommandToOffscreen(message)
          .then(sendResponse)
          .catch((error) => {
            sendResponse({
              ok: false,
              error: readErrorMessage(error),
            });
          });
        return true;
      }

      if (isDownloadCompilerJobRequest(message)) {
        void downloadCompilerJob(message.jobId)
          .then(sendResponse)
          .catch((error) => {
            const response: ChatTexDownloadCompilerJobResponse = {
              ok: false,
              error: readErrorMessage(error),
              snapshot: null,
              downloads: [],
            };
            sendResponse(response);
          });
        return true;
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

      return;
    },
  );
});

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown background error.";
}

function getBackgroundUrl(): string {
  return (browser.runtime.getURL as (path: string) => string)(
    "background.js",
  );
}

function getCompilerDocumentUrl(): string {
  return (browser.runtime.getURL as (path: string) => string)(
    "compiler.html",
  );
}

let creatingOffscreenDocument: Promise<void> | null = null;

async function sendMessageToOffscreenWithRetry<T>(
  message: unknown,
  maxRetries = 30,
  delayMs = 350,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      await ensureCompilerDocument();
      return (await browser.runtime.sendMessage(message)) as T;
    } catch (error) {
      const isNoReceiver =
        error instanceof Error &&
        (error.message.includes("Could not establish connection") ||
          error.message.includes("Receiving end does not exist") ||
          error.message.includes("Extension context invalidated"));

      if (isNoReceiver && attempt < maxRetries - 1) {
        await closeCompilerDocument();
        const backoffMs = Math.min(delayMs * 2 ** attempt, 2_000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      throw error;
    }
  }

  throw new Error("The PDF compiler is not ready. Please try again.");
}

async function sendCompilerCommandToOffscreen<T>(
  message: object,
): Promise<T> {
  return sendMessageToOffscreenWithRetry<T>({
    ...message,
    target: CHATTEX_COMPILER_OFFSCREEN_TARGET,
  });
}

async function closeCompilerDocument(): Promise<void> {
  try {
    const documentUrl = browser.runtime.getURL("/compiler.html");
    const contexts = await browser.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [documentUrl],
    });

    if (contexts.length > 0) {
      await browser.offscreen.closeDocument();
    }
  } catch {
    // Ignore cleanup errors
  }
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
      .then(async () => {
        // Allow WASM script listener initialization time
        await new Promise((resolve) => setTimeout(resolve, 300));
      })
      .finally(() => {
        creatingOffscreenDocument = null;
      });
  }

  await creatingOffscreenDocument;
}

async function downloadCompilerJob(
  jobId: string,
): Promise<ChatTexDownloadCompilerJobResponse> {
  const prepared =
    await sendCompilerCommandToOffscreen<PrepareDownloadResult>(
      {
        type: CHATTEX_PREPARE_COMPILER_JOB_ARTIFACTS,
        jobId,
      },
    );
  if (!prepared.ok) {
    return {
      ok: false,
      error: prepared.error,
      snapshot: null,
      downloads: [],
    };
  }

  const downloads: StartedDownload[] = [];
  for (const artifact of prepared.artifacts) {
    downloads.push(await startArtifactDownload(artifact));
  }

  const recorded = await sendCompilerCommandToOffscreen<{
    ok: boolean;
    snapshot?: import("@/src/features/compiler/compiler-job-types").CompilerJobSnapshot;
    error?: string;
  }>({
    type: CHATTEX_RECORD_COMPILER_JOB_DOWNLOADS,
    jobId,
    downloads,
  });
  if (!recorded.ok || !recorded.snapshot) {
    return {
      ok: false,
      error:
        recorded.error ?? "Unable to record export downloads.",
      snapshot: null,
      downloads,
    };
  }

  const failed = downloads.filter(
    (download) => download.error !== null,
  );
  return failed.length === 0
    ? {
        ok: true,
        snapshot: recorded.snapshot,
        downloads,
      }
    : {
        ok: false,
        error: `${failed.length} file downloads failed.`,
        snapshot: recorded.snapshot,
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
