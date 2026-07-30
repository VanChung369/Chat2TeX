import { browser } from "wxt/browser";

import { AssetManager } from "@/src/features/assets/asset-manager";

import { BrowserHostPermissionChecker } from "@/src/features/assets/browser-host-permission-checker";

import { BrowserImageConverter } from "@/src/features/assets/browser-image-converter";

import {
  isProcessImageAssetRequest,
  type ChatTexProcessImageAssetResponse,
} from "@/src/shared/messages";

export default defineBackground(() => {
  console.info("[ChatTeX] Background service worker started");

  const assetManager = new AssetManager(
    new BrowserHostPermissionChecker(),
    fetch,
    new BrowserImageConverter(),
  );

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install") {
      console.info("[ChatTeX] Extension installed");
    }

    if (reason === "update") {
      console.info("[ChatTeX] Extension updated");
    }
  });

  browser.runtime.onMessage.addListener(
    (
      message: unknown,
      sender,
    ): Promise<ChatTexProcessImageAssetResponse> | undefined => {
      if (!isProcessImageAssetRequest(message)) {
        return undefined;
      }

      if (!isTrustedSender(sender)) {
        return Promise.resolve({
          ok: false,
          code: "download-failed",
          message: "The asset request sender is not trusted.",
        });
      }

      return assetManager.resolve(message.asset);
    },
  );
});

function isTrustedSender(sender: {
  id?: string;
  tab?: {
    url?: string;
  };
}): boolean {
  if (sender.id !== browser.runtime.id) {
    return false;
  }

  const senderUrl = sender.tab?.url;

  if (!senderUrl) {
    return true;
  }

  try {
    return new URL(senderUrl).hostname === "chatgpt.com";
  } catch {
    return false;
  }
}
