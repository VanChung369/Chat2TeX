import { browser } from "wxt/browser";

import type { AssetHostPermissionChecker } from "./types";

export class BrowserHostPermissionChecker implements AssetHostPermissionChecker {
  contains(originPattern: string): Promise<boolean> {
    return browser.permissions.contains({
      origins: [originPattern],
    });
  }
}
