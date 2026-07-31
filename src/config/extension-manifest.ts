export interface ExtensionManifestOptions {
  mode: "development" | "production";
}

export function createExtensionManifest({
  mode,
}: ExtensionManifestOptions) {
  const development = mode === "development";
  const developmentCoreOrigin = development
    ? " http://127.0.0.1:4178"
    : "";

  return {
    name: "Chat2TeX Exporter",
    short_name: "Chat2TeX",
    description:
      "Export ChatGPT conversations to beautifully formatted PDF and LaTeX files.",
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
      ...(development ? ["http://127.0.0.1:4178/*"] : []),
    ],
    optional_host_permissions: ["https://*/*"],
    action: {
      default_title: "Chat2TeX Exporter",
    },
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'none'; frame-src 'self'; " +
        "connect-src https://github.com https://release-assets.githubusercontent.com " +
        `https://texlive2026.texlyre.org${developmentCoreOrigin};`,
      sandbox:
        "sandbox allow-scripts; default-src 'none'; " +
        "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:; " +
        "worker-src blob:; connect-src blob:; object-src 'none'; " +
        "child-src 'none'; frame-src 'none'; img-src 'none'; " +
        "media-src 'none'; font-src 'none'; style-src 'none'; " +
        "base-uri 'none'; form-action 'none';",
    },
  } as const;
}
