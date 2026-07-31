import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { init, parse } from "es-module-lexer";
import JSZip from "jszip";

export const MAX_EXTENSION_ZIP_BYTES = 5 * 1024 * 1024;

const EXPECTED_PERMISSIONS = [
  "storage",
  "unlimitedStorage",
  "downloads",
  "offscreen",
];
const EXPECTED_HOST_PERMISSIONS = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://github.com/*",
  "https://release-assets.githubusercontent.com/*",
  "https://texlive2026.texlyre.org/*",
];
const ALLOWED_NETWORK_ORIGINS = new Set([
  "https://chatgpt.com",
  "https://chat.openai.com",
  "https://github.com",
  "https://release-assets.githubusercontent.com",
  "https://texlive2026.texlyre.org",
]);
const INERT_URLS = new Set([
  "http://www.w3.org/1999/xhtml",
  "http://www.w3.org/2000/svg",
  "http://www.w3.org/1998/Math/MathML",
  "http://www.w3.org/1999/xlink",
  "http://www.w3.org/XML/1998/namespace",
  "https://react.dev/errors/",
  "https://stuk.github.io/jszip/documentation/howto/read_zip.html",
  "https://rolldown.rs/in-depth/bundling-cjs#require-external-modules",
]);
const SYNTHETIC_COMPILER_ORIGIN = "https://chat2tex.invalid";
const TEXT_ENTRY_PATTERN = /\.(?:js|mjs|html|css|json)$/i;
const JAVASCRIPT_ENTRY_PATTERN = /\.(?:js|mjs)$/i;
const FORBIDDEN_ENTRY_PATTERNS = [
  /\.wasm$/i,
  /\.data$/i,
  /texlive-(?:recommended|extra)/i,
  /firefox/i,
];

export async function inspectExtensionZip(path) {
  const file = await stat(path);
  if (file.size > MAX_EXTENSION_ZIP_BYTES) {
    throw new Error(
      `Extension ZIP exceeds 5 MiB: ${file.size} bytes.`,
    );
  }
  return inspectExtensionBytes(new Uint8Array(await readFile(path)));
}

export async function inspectExtensionBytes(bytes) {
  if (bytes.byteLength > MAX_EXTENSION_ZIP_BYTES) {
    throw new Error(
      `Extension ZIP exceeds 5 MiB: ${bytes.byteLength} bytes.`,
    );
  }

  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.keys(zip.files)
    .filter((entry) => !zip.files[entry].dir)
    .sort();
  const forbiddenEntries = entries.filter((entry) =>
    FORBIDDEN_ENTRY_PATTERNS.some((pattern) => pattern.test(entry)),
  );
  if (forbiddenEntries.length > 0) {
    throw new Error(
      `Extension contains forbidden compiler assets: ${forbiddenEntries.join(
        ", ",
      )}`,
    );
  }

  const texts = new Map();
  for (const entry of entries) {
    if (TEXT_ENTRY_PATTERN.test(entry)) {
      texts.set(entry, await zip.files[entry].async("string"));
    }
  }
  for (const [entry, text] of texts) {
    if (
      /\.html$/i.test(entry) &&
      /<link\b[^>]*\brel\s*=\s*["'][^"']*\bmodulepreload\b[^"']*["']/i.test(
        text,
      )
    ) {
      throw new Error(
        `Extension HTML contains a cross-world modulepreload: ${entry}.`,
      );
    }
  }
  const manifestText = texts.get("manifest.json");
  if (!manifestText) {
    throw new Error("Extension archive is missing manifest.json.");
  }
  const manifest = JSON.parse(manifestText);
  assertManifestPolicy(manifest);

  const sandboxPages = new Set(manifest.sandbox.pages);
  const sandboxRoots = new Set();
  for (const page of sandboxPages) {
    const html = texts.get(page);
    if (!html) {
      throw new Error(`Sandbox page is missing: ${page}.`);
    }
    for (const script of readHtmlScriptSources(html)) {
      sandboxRoots.add(resolveArchiveSpecifier(page, script));
    }
  }
  const sandboxClosure = await buildModuleClosure(
    sandboxRoots,
    texts,
  );

  const regularRoots = collectRegularRoots(
    manifest,
    texts,
    sandboxPages,
  );
  const regularClosure = await buildModuleClosure(
    regularRoots,
    texts,
  );
  const sharedSandboxModules = [...sandboxClosure].filter((entry) =>
    regularClosure.has(entry),
  );
  if (sharedSandboxModules.length > 0) {
    throw new Error(
      `The sandbox module closure is shared with a privileged entry: ${sharedSandboxModules.join(
        ", ",
      )}.`,
    );
  }

  const sandboxText = [...sandboxClosure]
    .map((entry) => texts.get(entry) ?? "")
    .join("\n");
  const syntheticFiles = [];
  const forbiddenUrls = [];

  for (const [entry, text] of texts) {
    if (text.includes(SYNTHETIC_COMPILER_ORIGIN)) {
      syntheticFiles.push(entry);
      if (!sandboxClosure.has(entry)) {
        throw new Error(
          `The synthetic compiler endpoint appears outside the sandbox closure: ${entry}.`,
        );
      }
    }
    if (
      JAVASCRIPT_ENTRY_PATTERN.test(entry) &&
      /\beval\s*\(/.test(text) &&
      !sandboxClosure.has(entry)
    ) {
      throw new Error(`Found eval outside sandbox: ${entry}.`);
    }
    assertNoRemoteCode(entry, text);
    for (const url of readUrls(text)) {
      if (
        INERT_URLS.has(url) ||
        url === SYNTHETIC_COMPILER_ORIGIN ||
        (entry === "manifest.json" && url === "https://*/*")
      ) {
        continue;
      }
      let origin;
      try {
        origin = new URL(url).origin;
      } catch {
        forbiddenUrls.push(`${entry}: ${url}`);
        continue;
      }
      if (!ALLOWED_NETWORK_ORIGINS.has(origin)) {
        forbiddenUrls.push(`${entry}: ${url}`);
      }
    }
  }

  if (
    syntheticFiles.length > 0 &&
    !sandboxText.includes("NativeXMLHttpRequest")
  ) {
    throw new Error(
      "Synthetic compiler endpoint is missing the sandbox XHR shim signature.",
    );
  }
  if (forbiddenUrls.length > 0) {
    throw new Error(
      `Extension contains a forbidden remote URL: ${forbiddenUrls.join(
        ", ",
      )}`,
    );
  }

  return {
    byteLength: bytes.byteLength,
    entries,
    manifest,
    forbiddenEntries,
    forbiddenUrls,
  };
}

function assertManifestPolicy(manifest) {
  if (
    manifest.manifest_version !== 3 ||
    manifest.minimum_chrome_version !== "116"
  ) {
    throw new Error(
      "Manifest must target MV3 with the Chrome 116 minimum.",
    );
  }
  if (
    JSON.stringify(manifest.permissions) !==
    JSON.stringify(EXPECTED_PERMISSIONS)
  ) {
    throw new Error("Manifest permissions do not match policy.");
  }
  if (
    JSON.stringify(manifest.host_permissions) !==
    JSON.stringify(EXPECTED_HOST_PERMISSIONS)
  ) {
    throw new Error("Manifest host permissions do not match policy.");
  }
  if (
    JSON.stringify(manifest.optional_host_permissions) !==
    JSON.stringify(["https://*/*"])
  ) {
    throw new Error(
      "Manifest optional host permissions do not match policy.",
    );
  }
  if (
    !Array.isArray(manifest.sandbox?.pages) ||
    !manifest.sandbox.pages.includes("compiler-sandbox.html")
  ) {
    throw new Error("Manifest is missing the compiler sandbox page.");
  }
  const sandboxCsp =
    manifest.content_security_policy?.sandbox;
  if (
    typeof sandboxCsp !== "string" ||
    !sandboxCsp.includes("default-src 'none'") ||
    !sandboxCsp.includes("connect-src blob:")
  ) {
    throw new Error("Manifest sandbox CSP is missing or unsafe.");
  }
  const connectSources =
    sandboxCsp.match(/(?:^|;)\s*connect-src\s+([^;]+)/)?.[1];
  if (
    !connectSources ||
    connectSources.trim() !== "blob:" ||
    /https?:|wss?:|\*/i.test(connectSources)
  ) {
    throw new Error("Manifest sandbox CSP allows network access.");
  }
}

async function buildModuleClosure(roots, texts) {
  await init;
  const closure = new Set();
  const pending = [...roots];
  while (pending.length > 0) {
    const entry = pending.pop();
    if (
      closure.has(entry) ||
      !JAVASCRIPT_ENTRY_PATTERN.test(entry)
    ) {
      continue;
    }
    const source = texts.get(entry);
    if (source === undefined) {
      throw new Error(`Referenced JavaScript entry is missing: ${entry}.`);
    }
    closure.add(entry);
    const [imports] = parse(source);
    for (const imported of imports) {
      if (!imported.n) {
        continue;
      }
      if (/^https?:\/\//i.test(imported.n)) {
        throw new Error(
          `Extension contains a forbidden remote URL in import: ${imported.n}.`,
        );
      }
      if (
        imported.n.startsWith(".") ||
        imported.n.startsWith("/")
      ) {
        pending.push(
          resolveArchiveSpecifier(entry, imported.n),
        );
      }
    }
  }
  return closure;
}

function collectRegularRoots(manifest, texts, sandboxPages) {
  const roots = new Set();
  const background = manifest.background?.service_worker;
  if (typeof background === "string") {
    roots.add(normalizeArchivePath(background));
  }
  for (const script of manifest.content_scripts ?? []) {
    for (const file of script.js ?? []) {
      roots.add(normalizeArchivePath(file));
    }
  }
  for (const [entry, text] of texts) {
    if (
      /\.html$/i.test(entry) &&
      !sandboxPages.has(entry) &&
      entry !== "legal.html"
    ) {
      for (const script of readHtmlScriptSources(text)) {
        roots.add(resolveArchiveSpecifier(entry, script));
      }
    }
  }
  return roots;
}

function readHtmlScriptSources(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(
    (match) => match[1],
  );
}

function assertNoRemoteCode(entry, text) {
  if (
    /\.html$/i.test(entry) &&
    /<script\b[^>]*\bsrc=["']https?:\/\//i.test(text)
  ) {
    throw new Error(
      `Extension contains a forbidden remote URL in script source: ${entry}.`,
    );
  }
  if (
    JAVASCRIPT_ENTRY_PATTERN.test(entry) &&
    /\bimport\s*\(\s*["']https?:\/\//i.test(text)
  ) {
    throw new Error(
      `Extension contains a forbidden remote URL in dynamic import: ${entry}.`,
    );
  }
}

function readUrls(text) {
  return [
    ...text.matchAll(
      /https?:\/\/[A-Za-z0-9.*_~:/?#\[\]@!$&'()+,;=%-]+/g,
    ),
  ].map((match) => match[0].replace(/[),.;]+$/, ""));
}

function resolveArchiveSpecifier(importer, specifier) {
  const withoutQuery = specifier.split(/[?#]/, 1)[0];
  return normalizeArchivePath(
    withoutQuery.startsWith("/")
      ? withoutQuery.slice(1)
      : posix.join(posix.dirname(importer), withoutQuery),
  );
}

function normalizeArchivePath(path) {
  const normalized = posix.normalize(path).replace(/^\/+/, "");
  if (normalized.startsWith("../")) {
    throw new Error(`Archive import escapes its root: ${path}.`);
  }
  return normalized;
}

async function findNewestChromeZip(outputDirectory) {
  const candidates = [];
  for (const entry of await readdir(outputDirectory)) {
    if (
      /-chrome\.zip$/i.test(entry) &&
      !/-sources\.zip$/i.test(entry)
    ) {
      const path = resolve(outputDirectory, entry);
      candidates.push({ path, modified: (await stat(path)).mtimeMs });
    }
  }
  candidates.sort((left, right) => right.modified - left.modified);
  if (!candidates[0]) {
    throw new Error(
      "No Chrome extension ZIP was found in .output. Run pnpm run zip first.",
    );
  }
  return candidates[0].path;
}

const isCli =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const outputDirectory = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../.output",
  );
  const path = await findNewestChromeZip(outputDirectory);
  const result = await inspectExtensionZip(path);
  console.log(
    `Extension package policy passed: ${result.byteLength} bytes, ${result.entries.length} files (${path}).`,
  );
}
