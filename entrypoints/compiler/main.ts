import { browser } from "wxt/browser";

import { LatexCompiler } from "@/src/features/compiler/latex-compiler";
import {
  OnDemandBusyTexEngine,
  type CompilerProgress,
} from "@/src/features/compiler/on-demand-busytex-engine";
import { CompilerJobCoordinator } from "@/src/features/compiler/compiler-job-coordinator";
import { CompilerJobStore } from "@/src/features/compiler/compiler-job-store";

import {
  GENERATED_CORE_ASSETS,
  type CoreAssetId,
} from "@/src/features/compiler/compiler-core-assets.generated";

import {
  DEVELOPMENT_COMPILER_CORE_BASE_URL,
  MAX_PACKAGE_PASSES,
  packageLookupKey,
  PRODUCTION_COMPILER_CORE_BASE_URL,
  resolveCompilerCoreBaseUrl,
  type PackageLookup,
} from "@/src/features/compiler/asset-manifest";

import { CompilerAssetFetcher } from "@/src/features/compiler/compiler-asset-fetcher";

import { CompilerAssetCache } from "@/src/features/compiler/compiler-asset-cache";

import { BrowserCompilerAssetStore } from "@/src/features/compiler/compiler-asset-store";
import { RuntimeStorageArea } from "@/src/features/compiler/runtime-storage-area";

import { SandboxCompilerClient } from "@/src/features/compiler/sandbox-compiler-client";

import { SourcePackageBuilder } from "@/src/features/export/source-package-builder";
import { prepareDownloadArtifacts as buildDownloadArtifacts } from "@/src/features/export/prepare-download-artifacts";

import {
  CHATTEX_COMPILER_JOB_UPDATED,
  isCompilerOffscreenTargetedMessage,
  isCancelCompilerJobRequest,
  isClearCompilerCacheRequest,
  isGetCompilerCacheStatusRequest,
  isGetCompilerJobDiagnosticsRequest,
  isGetCompilerJobRequest,
  isPrepareCompilerJobArtifactsRequest,
  isRecordCompilerJobDownloadsRequest,
  isStartCompilerJobRequest,
} from "@/src/shared/messages";
import { isBackgroundRuntimeSender } from "@/src/shared/trusted-message-sender";

const sourcePackageBuilder = new SourcePackageBuilder();
const localStorageArea = new RuntimeStorageArea("local");
const sessionStorageArea = new RuntimeStorageArea("session");
const assetCache = new CompilerAssetCache(
  new BrowserCompilerAssetStore(caches, localStorageArea),
);
const compilerCoreBaseUrl = import.meta.env.DEV
  ? resolveCompilerCoreBaseUrl({
      development: true,
      configuredBaseUrl:
        (
          import.meta.env as ImportMetaEnv & {
            WXT_COMPILER_ASSET_BASE_URL?: string;
          }
        ).WXT_COMPILER_ASSET_BASE_URL ??
        DEVELOPMENT_COMPILER_CORE_BASE_URL,
    })
  : PRODUCTION_COMPILER_CORE_BASE_URL;
const assetFetcher = new CompilerAssetFetcher(
  fetch,
  compilerCoreBaseUrl,
);

function createOnDemandCompiler(
  onProgress?: (progress: CompilerProgress) => void,
): LatexCompiler {
  const sandboxUrl = (
    browser.runtime.getURL as (path: string) => string
  )("/compiler-sandbox.html");
  return new LatexCompiler(
    new OnDemandBusyTexEngine(
      new SandboxCompilerClient(document, sandboxUrl),
      assetCache,
      assetFetcher,
      onProgress,
    ),
  );
}

const coordinator = new CompilerJobCoordinator({
  store: new CompilerJobStore(sessionStorageArea, localStorageArea),
  cache: assetCache,
  createCompiler: (onProgress) =>
    createOnDemandCompiler((progress) => {
      void onProgress(progress);
    }),
  prepareArtifacts: (payload, signal) =>
    buildDownloadArtifacts(payload, {
      sourcePackageBuilder,
      signal,
    }),
  notify: (snapshot) =>
    browser.runtime
      .sendMessage({
        type: CHATTEX_COMPILER_JOB_UPDATED,
        snapshot,
      })
      .catch(() => undefined),
});

browser.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse) => {
    if (isSandboxSmokeRequest(message)) {
      void runSandboxSmoke(message.project)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Sandbox smoke test failed.",
          });
        });
      return true;
    }

    const isInternalSender = isBackgroundRuntimeSender(
      sender,
      browser.runtime.id,
      (browser.runtime.getURL as (path: string) => string)(
        "background.js",
      ),
    );
    const isCoordinatorRequest =
      isStartCompilerJobRequest(message) ||
      isGetCompilerJobRequest(message) ||
      isGetCompilerJobDiagnosticsRequest(message) ||
      isCancelCompilerJobRequest(message) ||
      isGetCompilerCacheStatusRequest(message) ||
      isClearCompilerCacheRequest(message) ||
      isPrepareCompilerJobArtifactsRequest(message) ||
      isRecordCompilerJobDownloadsRequest(message);
    if (
      isCoordinatorRequest &&
      !isCompilerOffscreenTargetedMessage(message)
    ) {
      return;
    }
    if (isCoordinatorRequest && !isInternalSender) {
      sendResponse({
        ok: false,
        error: "Unauthorized offscreen compiler message sender.",
      });
      return false;
    }

    if (isStartCompilerJobRequest(message)) {
      void coordinator
        .start(message.payload)
        .then((snapshot) => sendResponse({ ok: true, snapshot }))
        .catch((error) =>
          sendResponse({ ok: false, error: readErrorMessage(error) }),
        );
      return true;
    }

    if (isGetCompilerJobRequest(message)) {
      void coordinator
        .get(message.jobId)
        .then((snapshot) => sendResponse({ ok: true, snapshot }))
        .catch((error) =>
          sendResponse({ ok: false, error: readErrorMessage(error) }),
        );
      return true;
    }

    if (isGetCompilerJobDiagnosticsRequest(message)) {
      void coordinator
        .diagnostics(message.jobId)
        .then((diagnostics) =>
          sendResponse({ ok: true, diagnostics }),
        )
        .catch((error) =>
          sendResponse({ ok: false, error: readErrorMessage(error) }),
        );
      return true;
    }

    if (isCancelCompilerJobRequest(message)) {
      void coordinator
        .cancel(message.jobId)
        .then((snapshot) => sendResponse({ ok: true, snapshot }))
        .catch((error) =>
          sendResponse({ ok: false, error: readErrorMessage(error) }),
        );
      return true;
    }

    if (isGetCompilerCacheStatusRequest(message)) {
      void coordinator
        .cacheStatus()
        .then((status) => sendResponse({ ok: true, status }))
        .catch((error) =>
          sendResponse({ ok: false, error: readErrorMessage(error) }),
        );
      return true;
    }

    if (isClearCompilerCacheRequest(message)) {
      void coordinator
        .clearCache()
        .then((status) => sendResponse({ ok: true, status }))
        .catch((error) =>
          sendResponse({ ok: false, error: readErrorMessage(error) }),
        );
      return true;
    }

    if (isPrepareCompilerJobArtifactsRequest(message)) {
      void coordinator
        .prepareArtifacts(message.jobId)
        .then(sendResponse)
        .catch((error) =>
          sendResponse({ ok: false, error: readErrorMessage(error) }),
        );
      return true;
    }

    if (isRecordCompilerJobDownloadsRequest(message)) {
      void coordinator
        .recordDownloads(message.jobId, message.downloads)
        .then((snapshot) => sendResponse({ ok: true, snapshot }))
        .catch((error) =>
          sendResponse({ ok: false, error: readErrorMessage(error) }),
        );
      return true;
    }

    return;
  },
);

function readErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unknown compiler job error.";
}

const sandboxSmokeMode = new URL(window.location.href).searchParams.get(
  "sandbox-smoke",
);
if (
  import.meta.env.DEV &&
  (sandboxSmokeMode === "1" || sandboxSmokeMode === "xcolor")
) {
  const source =
    sandboxSmokeMode === "xcolor"
      ? "\\documentclass{article}\\usepackage{xcolor}\\begin{document}\\color{blue}Xin chào\\end{document}"
      : "\\documentclass{article}\\begin{document}Xin chào Việt Nam\\end{document}";
  document.body.textContent = "Running Chat2TeX sandbox smoke test…";
  void runSandboxSmoke({ source, files: [] })
    .then((result) => {
      document.body.dataset.smokeStatus = result.ok ? "passed" : "failed";
      document.body.textContent = JSON.stringify(result, null, 2);
    })
    .catch((error) => {
      document.body.dataset.smokeStatus = "failed";
      document.body.textContent =
        error instanceof Error ? error.message : String(error);
    });
}

interface SandboxSmokeRequest {
  type: "CHAT2TEX_SANDBOX_SMOKE";
  project: {
    source: string;
    files: Array<{ path: string; base64: string }>;
  };
}

function isSandboxSmokeRequest(
  value: unknown,
): value is SandboxSmokeRequest {
  if (!import.meta.env.DEV || !value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SandboxSmokeRequest>;
  return (
    candidate.type === "CHAT2TEX_SANDBOX_SMOKE" &&
    Boolean(candidate.project) &&
    typeof candidate.project?.source === "string" &&
    Array.isArray(candidate.project.files)
  );
}

async function runSandboxSmoke(
  project: SandboxSmokeRequest["project"],
): Promise<{
  ok: boolean;
  pdfPrefix: string;
  byteLength: number;
  packageLookups: PackageLookup[];
  coreBytes: number;
  packageBytes: number;
}> {
  if (!import.meta.env.DEV) {
    throw new Error("Sandbox smoke testing is development-only.");
  }
  const configuredBaseUrl = (
    import.meta.env as ImportMetaEnv & {
      WXT_COMPILER_ASSET_BASE_URL?: string;
    }
  ).WXT_COMPILER_ASSET_BASE_URL;
  const coreBaseUrl = resolveCompilerCoreBaseUrl({
    development: true,
    configuredBaseUrl,
  });
  const cache = new CompilerAssetCache(
    new BrowserCompilerAssetStore(
      caches,
      new RuntimeStorageArea("local"),
    ),
  );
  const fetcher = new CompilerAssetFetcher(fetch, coreBaseUrl);

  for (const asset of GENERATED_CORE_ASSETS) {
    await cache.getOrFetchCore(asset, fetcher);
  }
  const coreAssets = await cache.readActiveCoreAssets();
  if (!coreAssets) {
    throw new Error("Verified compiler core is incomplete.");
  }

  const sandboxUrl = (
    browser.runtime.getURL as (path: string) => string
  )("/compiler-sandbox.html");
  const client = new SandboxCompilerClient(
    document,
    sandboxUrl,
  );
  const observedLookups = new Map<string, PackageLookup>();
  const suppliedLookups = new Set<string>();

  try {
    await client.initialize(
      coreAssets as Record<CoreAssetId, Uint8Array>,
    );
    for (let pass = 0; pass < MAX_PACKAGE_PASSES; pass += 1) {
      const result = await client.compile(project);
      for (const lookup of result.packageLookups) {
        observedLookups.set(packageLookupKey(lookup), lookup);
      }
      if (result.success && result.pdf) {
        const bytes = new Uint8Array(result.pdf);
        const status = await cache.status();
        return {
          ok:
            new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-",
          pdfPrefix: new TextDecoder().decode(bytes.subarray(0, 5)),
          byteLength: bytes.byteLength,
          packageLookups: [...observedLookups.values()],
          coreBytes: status.coreBytes,
          packageBytes: status.packageBytes,
        };
      }

      const remoteFiles = [];
      for (const lookup of result.packageLookups) {
        const key = packageLookupKey(lookup);
        if (suppliedLookups.has(key)) {
          continue;
        }
        suppliedLookups.add(key);
        const resolved = await cache.getOrFetchPackage(lookup, fetcher);
        if (resolved) {
          remoteFiles.push({
            ...lookup,
            content: resolved.content,
          });
        }
      }
      if (remoteFiles.length === 0) {
        throw new Error(
          `Sandbox compile failed without resolvable package lookups. ${result.log}`,
        );
      }
      await client.writeRemoteFiles(remoteFiles);
    }
    throw new Error(
      `Sandbox compile exceeded ${MAX_PACKAGE_PASSES} package-resolution passes.`,
    );
  } finally {
    client.terminate();
  }
}
