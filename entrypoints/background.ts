import { browser } from "wxt/browser";

import { AssetManager } from "@/src/features/assets/asset-manager";

import { BrowserHostPermissionChecker } from "@/src/features/assets/browser-host-permission-checker";

import { BrowserImageConverter } from "@/src/features/assets/browser-image-converter";

import { ImageDataProcessor } from "@/src/features/assets/image-data-processor";

import {
  isConvertImageDataRequest,
  isProcessImageAssetRequest,
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
