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
  type ChatTexCompileInOffscreenRequest,
  type ChatTexCompileInOffscreenResponse,
} from "@/src/shared/messages";

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
