import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createExtensionManifest } from "@/src/config/extension-manifest";

describe("production extension manifest policy", () => {
  it("uses the exact Chrome-only permissions and network origins", () => {
    const manifest = createExtensionManifest({
      mode: "production",
    });

    expect(manifest.minimum_chrome_version).toBe("116");
    expect(manifest.permissions).toEqual([
      "storage",
      "unlimitedStorage",
      "downloads",
      "offscreen",
    ]);
    expect(manifest.host_permissions).toEqual([
      "https://chatgpt.com/*",
      "https://chat.openai.com/*",
      "https://github.com/*",
      "https://release-assets.githubusercontent.com/*",
      "https://texlive2026.texlyre.org/*",
    ]);
    expect(manifest.host_permissions).not.toContain(
      "https://*.openai.com/*",
    );
    expect(manifest.host_permissions).not.toContain(
      "https://*.gstatic.com/*",
    );
  });

  it("keeps the sandbox offline except for verified local Blob URLs", () => {
    const manifest = createExtensionManifest({
      mode: "production",
    });
    const sandbox = manifest.content_security_policy.sandbox;

    expect(sandbox).toContain("connect-src blob:");
    expect(sandbox).toContain("default-src 'none'");
    expect(sandbox).not.toMatch(/connect-src[^;]*https?:/);
    expect(sandbox).not.toMatch(/connect-src[^;]*wss?:/);
    expect(
      existsSync("entrypoints/compiler-sandbox.sandbox/index.html"),
    ).toBe(true);
  });
});
