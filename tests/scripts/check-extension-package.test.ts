import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  MAX_EXTENSION_ZIP_BYTES,
  inspectExtensionBytes,
} from "@/scripts/check-extension-package.mjs";

const validManifest = {
  manifest_version: 3,
  minimum_chrome_version: "116",
  permissions: [
    "storage",
    "unlimitedStorage",
    "downloads",
    "offscreen",
  ],
  host_permissions: [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://github.com/*",
    "https://release-assets.githubusercontent.com/*",
    "https://texlive2026.texlyre.org/*",
  ],
  optional_host_permissions: ["https://*/*"],
  background: { service_worker: "background.js" },
  action: { default_popup: "popup.html" },
  content_scripts: [{ matches: ["https://chatgpt.com/*"], js: ["content.js"] }],
  sandbox: { pages: ["compiler-sandbox.html"] },
  content_security_policy: {
    extension_pages:
      "script-src 'self'; object-src 'none'; connect-src https://github.com https://release-assets.githubusercontent.com https://texlive2026.texlyre.org;",
    sandbox:
      "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:; worker-src blob:; connect-src blob:;",
  },
};

async function fixture(
  files: Record<string, string | Uint8Array> = {},
): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(validManifest));
  zip.file(
    "compiler-sandbox.html",
    '<script type="module" src="/sandbox.js"></script>',
  );
  zip.file(
    "sandbox.js",
    [
      "const NativeXMLHttpRequest = XMLHttpRequest;",
      'const endpoint = "https://chat2tex.invalid";',
    ].join("\n"),
  );
  zip.file("background.js", 'const source = "https://github.com";');
  zip.file("popup.html", '<script src="/popup.js"></script>');
  zip.file("popup.js", "export {};");
  zip.file("content.js", "export {};");
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return zip.generateAsync({
    type: "uint8array",
    compression: "STORE",
  });
}

describe("extension package policy gate", () => {
  it("accepts a small policy-compliant Chrome package", async () => {
    await expect(
      inspectExtensionBytes(await fixture()),
    ).resolves.toMatchObject({
      forbiddenEntries: [],
      forbiddenUrls: [],
      manifest: {
        minimum_chrome_version: "116",
      },
    });
  });

  it("accepts exact inert documentation and DOM namespace URLs", async () => {
    await expect(
      inspectExtensionBytes(
        await fixture({
          "popup.js": [
            'const docs = "https://react.dev/errors/";',
            'const zipDocs = "https://stuk.github.io/jszip/documentation/howto/read_zip.html";',
            'const bundlerDocs = "https://rolldown.rs/in-depth/bundling-cjs#require-external-modules";',
            'const xlink = "http://www.w3.org/1999/xlink";',
            'const xml = "http://www.w3.org/XML/1998/namespace";',
          ].join("\n"),
        }),
      ),
    ).resolves.toMatchObject({
      forbiddenUrls: [],
    });
  });

  it("does not broaden inert URL exceptions to their origins", async () => {
    await expect(
      inspectExtensionBytes(
        await fixture({
          "popup.js": 'fetch("https://react.dev/api/private");',
        }),
      ),
    ).rejects.toThrow("forbidden remote URL");
  });

  it("rejects TeX data and WASM in the extension archive", async () => {
    await expect(
      inspectExtensionBytes(
        await fixture({
          "texlive-basic.data": new Uint8Array([1]),
          "busytex.wasm": new Uint8Array([1]),
        }),
      ),
    ).rejects.toThrow("forbidden compiler assets");
  });

  it("rejects a remote script outside the sandbox bootstrap", async () => {
    await expect(
      inspectExtensionBytes(
        await fixture({
          "background.js": 'import("https://cdn.example.com/code.js")',
        }),
      ),
    ).rejects.toThrow("forbidden remote URL");
  });

  it("rejects modulepreload links that Chrome cannot reuse across extension worlds", async () => {
    await expect(
      inspectExtensionBytes(
        await fixture({
          "popup.html": [
            '<script type="module" src="/popup.js"></script>',
            '<link rel="modulepreload" href="/chunks/messages.js">',
          ].join("\n"),
        }),
      ),
    ).rejects.toThrow("modulepreload");
  });

  it("rejects a ZIP larger than 5 MiB", async () => {
    const bytes = await fixture({
      "oversized.bin": new Uint8Array(MAX_EXTENSION_ZIP_BYTES),
    });

    await expect(inspectExtensionBytes(bytes)).rejects.toThrow(
      "exceeds 5 MiB",
    );
  });

  it.each([
    [
      "missing Chrome floor",
      { minimum_chrome_version: undefined },
      "Chrome 116",
    ],
    [
      "extra permission",
      { permissions: [...validManifest.permissions, "scripting"] },
      "permissions",
    ],
    [
      "broad host",
      {
        host_permissions: [
          ...validManifest.host_permissions,
          "https://*.openai.com/*",
        ],
      },
      "host permissions",
    ],
    [
      "missing sandbox CSP",
      { content_security_policy: { extension_pages: "script-src 'self';" } },
      "sandbox CSP",
    ],
  ])("rejects %s", async (_label, patch, message) => {
    const zip = new JSZip();
    zip.file(
      "manifest.json",
      JSON.stringify({ ...validManifest, ...patch }),
    );
    zip.file(
      "compiler-sandbox.html",
      '<script type="module" src="/sandbox.js"></script>',
    );
    zip.file(
      "sandbox.js",
      'const NativeXMLHttpRequest = XMLHttpRequest; const endpoint = "https://chat2tex.invalid";',
    );

    await expect(
      inspectExtensionBytes(
        await zip.generateAsync({ type: "uint8array" }),
      ),
    ).rejects.toThrow(message);
  });

  it("rejects a sandbox chunk imported by the background", async () => {
    await expect(
      inspectExtensionBytes(
        await fixture({
          "background.js": 'import "./sandbox.js";',
        }),
      ),
    ).rejects.toThrow("sandbox module closure is shared");
  });

  it("rejects the synthetic endpoint outside the sandbox closure", async () => {
    await expect(
      inspectExtensionBytes(
        await fixture({
          "background.js":
            'const endpoint = "https://chat2tex.invalid";',
        }),
      ),
    ).rejects.toThrow("synthetic compiler endpoint");
  });

  it("rejects eval outside the sandbox closure", async () => {
    await expect(
      inspectExtensionBytes(
        await fixture({
          "popup.js": 'eval("alert(1)")',
        }),
      ),
    ).rejects.toThrow("eval outside sandbox");
  });
});
