import { useState } from "react";

import { browser } from "wxt/browser";

import { getAssetOriginPatterns } from "@/src/features/export/asset-origins";

import { applyCompileOmissions } from "@/src/features/export/compile-omissions";

import { formatCompileFailure } from "@/src/features/compiler/compile-diagnostics";

import type {
  ExportProgress,
  PreparedExport,
  ProcessedExportAssets,
} from "@/src/features/export/types";

import type { ResolveAssetResult } from "@/src/features/assets/types";

import {
  CHATTEX_CONVERT_IMAGE_DATA,
  CHATTEX_PREPARE_EXPORT,
  CHATTEX_PROCESS_IMAGE_ASSET,
  CHATTEX_READ_PAGE_IMAGE,
  type ChatTexConvertImageDataRequest,
  type ChatTexPrepareExportRequest,
  type ChatTexPrepareExportResponse,
  type ChatTexProcessImageAssetRequest,
  type ChatTexReadPageImageRequest,
  type ChatTexReadPageImageResponse,
  CHATTEX_COMPILE_LATEX,
  type ChatTexCompileLatexRequest,
  type ChatTexCompileInOffscreenResponse,
  CHATTEX_DOWNLOAD_EXPORT,
  type ChatTexDownloadExportRequest,
  type ChatTexDownloadExportResponse,
} from "@/src/shared/messages";

export type ExportPhase =
  | "idle"
  | "preparing"
  | "permission-required"
  | "processing-assets"
  | "ready"
  | "compiling"
  | "compiled"
  | "packaging"
  | "downloaded"
  | "error";

export function useExportFlow() {
  const [phase, setPhase] = useState<ExportPhase>("idle");

  const [prepared, setPrepared] = useState<PreparedExport | null>(null);

  const [missingOrigins, setMissingOrigins] = useState<string[]>([]);

  const [processedAssets, setProcessedAssets] =
    useState<ProcessedExportAssets | null>(null);

  const [progress, setProgress] = useState<ExportProgress | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [pdfBase64, setPdfBase64] = useState<string | null>(null);

  const [compileLog, setCompileLog] = useState("");

  const [downloadedFiles, setDownloadedFiles] = useState<string[]>([]);
  const [exportOptions, setExportOptions] = useState<
    import("@/src/features/latex/types").LatexExportOptions | null
  >(null);

  async function prepare(
    optionsOrTemplateId?:
      | import("@/src/features/latex/types").LatexExportOptions
      | import("@/src/features/latex/types").LatexTemplateId,
  ): Promise<void> {
    const options =
      typeof optionsOrTemplateId === "string"
        ? { templateId: optionsOrTemplateId }
        : optionsOrTemplateId;

    setExportOptions(options ?? null);
    setPhase("preparing");
    setError(null);
    setProgress(null);
    setProcessedAssets(null);
    setPdfBase64(null);
    setCompileLog("");

    try {
      const tabId = await getActiveTabId();

      const request: ChatTexPrepareExportRequest = {
        type: CHATTEX_PREPARE_EXPORT,
        options,
        templateId: options?.templateId,
      };

      const response = (await sendTabMessageWithRetry(
        tabId,
        request,
      )) as ChatTexPrepareExportResponse;

      if (!response.ok) {
        throw new Error(response.error);
      }

      setPrepared(response.prepared);

      const requiredOrigins = getAssetOriginPatterns(response.prepared.assets);

      const missing = await findMissingOrigins(requiredOrigins);

      setMissingOrigins(missing);

      if (missing.length > 0) {
        setPhase("permission-required");

        return;
      }

      await processAssets(tabId, response.prepared);
    } catch (caughtError) {
      setError(readErrorMessage(caughtError));

      setPhase("error");
    }
  }

  async function grantPermissions(): Promise<void> {
    if (!prepared) {
      return;
    }

    /*
     * Keep permissions.request() as the first call in the click handler
     * so the browser preserves the user gesture.
     */
    const granted = await browser.permissions.request({
      origins: missingOrigins,
    });

    if (!granted) {
      setError("Image access permission was denied.");

      setPhase("error");
      return;
    }

    try {
      const tabId = await getActiveTabId();

      setMissingOrigins([]);

      await processAssets(tabId, prepared);
    } catch (caughtError) {
      setError(readErrorMessage(caughtError));

      setPhase("error");
    }
  }

  async function processAssets(
    tabId: number,
    exportData: PreparedExport,
  ): Promise<void> {
    setPhase("processing-assets");

    const files: ProcessedExportAssets["files"] = [];
    const failures: ProcessedExportAssets["failures"] = [];
    const total = exportData.assets.length;

    if (total === 0) {
      setProcessedAssets({ files, failures });
      setPhase("ready");
      return;
    }

    let completedCount = 0;
    setProgress({
      current: 0,
      total,
      label: exportData.assets[0].alt || exportData.assets[0].id,
    });

    const results = await mapConcurrent(exportData.assets, 3, async (asset) => {
      const result = await resolveAsset(tabId, asset);
      completedCount += 1;
      setProgress({
        current: completedCount,
        total,
        label: asset.alt || asset.id,
      });
      return { asset, result };
    });

    for (const { asset, result } of results) {
      if (result.ok) {
        files.push(result.file);
      } else {
        failures.push({
          id: asset.id,
          sourceUrl: asset.sourceUrl,
          code: result.code,
          message: result.message,
        });
      }
    }

    setProcessedAssets({
      files,
      failures,
    });

    setProgress(null);
    setPhase("ready");
  }

  async function compile(): Promise<void> {
    if (!prepared || !processedAssets) {
      return;
    }

    setPhase("compiling");
    setError(null);
    setCompileLog("");

    try {
      const request: ChatTexCompileLatexRequest = {
        type: CHATTEX_COMPILE_LATEX,

        project: {
          source: prepared.latexSource,

          files: processedAssets.files.map((file) => ({
            path: file.outputPath,

            base64: file.base64,
          })),
        },
      };

      const response = (await sendRuntimeMessageWithRetry(
        request,
      )) as ChatTexCompileInOffscreenResponse;

      setCompileLog(response.log);

      if (!response.ok) {
        throw new Error(formatCompileFailure(response.error, response.log));
      }

      const reconciledAssets = applyCompileOmissions(
        prepared,
        processedAssets,
        response.omittedFiles,
      );

      setProcessedAssets(reconciledAssets);

      setPdfBase64(response.pdfBase64);

      setPhase("compiled");
    } catch (caughtError) {
      setError(readErrorMessage(caughtError));

      setPhase("error");
    }
  }

  async function downloadAll(): Promise<void> {
    if (!prepared || !processedAssets || !pdfBase64) {
      return;
    }

    setPhase("packaging");
    setError(null);
    setDownloadedFiles([]);

    try {
      const request: ChatTexDownloadExportRequest = {
        type: CHATTEX_DOWNLOAD_EXPORT,

        payload: {
          title: prepared.title,

          url: prepared.url,

          exportedAtIso: new Date().toISOString(),

          latexSource: prepared.latexSource,

          pdfBase64,

          files: processedAssets.files,
          failures: processedAssets.failures,
          exportPdfOnly: exportOptions?.exportPdfOnly,
        },
      };

      const response = (await sendRuntimeMessageWithRetry(
        request,
      )) as ChatTexDownloadExportResponse;

      const successfulFiles = response.downloads
        .filter((download) => download.error === null)
        .map((download) => download.filename);

      setDownloadedFiles(successfulFiles);

      if (!response.ok) {
        throw new Error(response.error);
      }

      setPhase("downloaded");
    } catch (caughtError) {
      setError(readErrorMessage(caughtError));

      setPhase("error");
    }
  }

  return {
    phase,
    prepared,
    processedAssets,
    missingOrigins,
    progress,
    error,
    pdfBase64,
    compileLog,
    downloadedFiles,
    prepare,
    grantPermissions,
    compile,
    downloadAll,
  };
}

async function resolveAsset(
  tabId: number,
  asset: PreparedExport["assets"][number],
): Promise<ResolveAssetResult> {
  const protocol = readProtocol(asset.sourceUrl);

  if (protocol === "blob:" || protocol === "data:") {
    const readRequest: ChatTexReadPageImageRequest = {
      type: CHATTEX_READ_PAGE_IMAGE,
      asset,
    };

    const pageResult = (await sendTabMessageWithRetry(
      tabId,
      readRequest,
    )) as ChatTexReadPageImageResponse;

    if (!pageResult.ok) {
      return pageResult;
    }

    const convertRequest: ChatTexConvertImageDataRequest = {
      type: CHATTEX_CONVERT_IMAGE_DATA,
      asset,
      data: pageResult.data,
    };

    return sendRuntimeMessageWithRetry(
      convertRequest,
    ) as Promise<ResolveAssetResult>;
  }

  const request: ChatTexProcessImageAssetRequest = {
    type: CHATTEX_PROCESS_IMAGE_ASSET,
    asset,
  };

  return sendRuntimeMessageWithRetry(request) as Promise<ResolveAssetResult>;
}

async function findMissingOrigins(origins: string[]): Promise<string[]> {
  const missing: string[] = [];

  for (const origin of origins) {
    const granted = await browser.permissions.contains({
      origins: [origin],
    });

    if (!granted) {
      missing.push(origin);
    }
  }

  return missing;
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (tab?.id === undefined) {
    throw new Error("Active browser tab was not found.");
  }

  return tab.id;
}

function readProtocol(value: string): string {
  try {
    return new URL(value).protocol;
  } catch {
    return "";
  }
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unable to prepare the export.";
}

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (currentIndex < items.length) {
        const index = currentIndex++;
        results[index] = await fn(items[index], index);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

async function sendTabMessageWithRetry<T>(
  tabId: number,
  message: unknown,
  maxRetries = 10,
  delayMs = 300,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return (await browser.tabs.sendMessage(tabId, message)) as T;
    } catch (error) {
      const isNoReceiver =
        error instanceof Error &&
        (error.message.includes("Could not establish connection") ||
          error.message.includes("Receiving end does not exist"));

      if (isNoReceiver && attempt < maxRetries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, backoffDelay(delayMs, attempt)),
        );
        continue;
      }

      if (isNoReceiver) {
        throw new Error(
          "Unable to connect to the ChatGPT page. Press F5 to reload it, then try again.",
        );
      }

      throw error;
    }
  }

  throw new Error(
    "The ChatGPT page is responding too slowly. Please reload it.",
  );
}

async function sendRuntimeMessageWithRetry<T>(
  message: unknown,
  maxRetries = 30,
  delayMs = 350,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return (await browser.runtime.sendMessage(message)) as T;
    } catch (error) {
      const isNoReceiver =
        error instanceof Error &&
        (error.message.includes("Could not establish connection") ||
          error.message.includes("Receiving end does not exist"));

      if (isNoReceiver && attempt < maxRetries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, backoffDelay(delayMs, attempt)),
        );
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    "Unable to connect to the extension automatically. Please try again.",
  );
}

function backoffDelay(baseDelayMs: number, attempt: number): number {
  const maxDelayMs = 2_000;
  return Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
}
