import {
  useEffect,
  useReducer,
  useRef,
  useState,
} from "preact/hooks";

import { browser } from "wxt/browser";

import {
  exportFlowReducer,
  initialExportFlowState,
  type ExportPhase,
} from "./export-flow-state";
import { getAssetOriginPatterns } from "@/src/features/export/asset-origins";

import type { CompilerCacheStatus } from "@/src/features/compiler/compiler-asset-cache";
import type { CompilerJobSnapshot } from "@/src/features/compiler/compiler-job-types";
import type {
  ExportProgress,
  PreparedExport,
  ProcessedExportAssets,
} from "@/src/features/export/types";
import type { OutputKind } from "@/src/features/export/output-plan";
import type { ResolveAssetResult } from "@/src/features/assets/types";
import type { LatexExportOptions, LatexTemplateId } from "@/src/features/latex/types";

import {
  CHATTEX_CANCEL_COMPILER_JOB,
  CHATTEX_CLEAR_COMPILER_CACHE,
  CHATTEX_COMPILER_JOB_UPDATED,
  CHATTEX_CONVERT_IMAGE_DATA,
  CHATTEX_DOWNLOAD_COMPILER_JOB,
  CHATTEX_GET_COMPILER_CACHE_STATUS,
  CHATTEX_GET_COMPILER_JOB,
  CHATTEX_GET_COMPILER_JOB_DIAGNOSTICS,
  CHATTEX_PREPARE_EXPORT,
  CHATTEX_PROCESS_IMAGE_ASSET,
  CHATTEX_READ_PAGE_IMAGE,
  CHATTEX_START_COMPILER_JOB,
  type ChatTexCompilerCacheStatusResponse,
  type ChatTexCompilerJobDiagnosticsResponse,
  type ChatTexCompilerJobSnapshotResponse,
  type ChatTexCompilerJobUpdatedEvent,
  type ChatTexConvertImageDataRequest,
  type ChatTexDownloadCompilerJobResponse,
  type ChatTexPrepareExportRequest,
  type ChatTexPrepareExportResponse,
  type ChatTexProcessImageAssetRequest,
  type ChatTexReadPageImageRequest,
  type ChatTexReadPageImageResponse,
  type ChatTexStartCompilerJobRequest,
} from "@/src/shared/messages";

export type { ExportPhase } from "./export-flow-state";

export function useExportFlow() {
  const [state, dispatch] = useReducer(
    exportFlowReducer,
    initialExportFlowState,
  );
  const runIdRef = useRef(0);
  const [missingOrigins, setMissingOrigins] = useState<string[]>([]);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [exportOptions, setExportOptions] =
    useState<LatexExportOptions | null>(null);
  const [cacheStatus, setCacheStatus] =
    useState<CompilerCacheStatus | null>(null);

  useEffect(() => {
    const onMessage = (message: unknown) => {
      if (
        !message ||
        typeof message !== "object" ||
        !("type" in message) ||
        message.type !== CHATTEX_COMPILER_JOB_UPDATED ||
        !("snapshot" in message)
      ) {
        return;
      }
      const event = message as ChatTexCompilerJobUpdatedEvent;
      const runId = runIdRef.current;
      dispatch({
        type: "job-updated",
        runId,
        snapshot: event.snapshot,
      });
      if (
        event.snapshot.phase === "completed" ||
        event.snapshot.phase === "failed"
      ) {
        void loadDiagnostics(event.snapshot.jobId, runId);
      }
    };

    browser.runtime.onMessage.addListener(onMessage);
    void refreshJob();
    void getCacheStatus();
    return () => {
      browser.runtime.onMessage.removeListener(onMessage);
    };
  }, []);

  async function prepare(
    optionsOrTemplateId?: LatexExportOptions | LatexTemplateId,
  ): Promise<void> {
    const options =
      typeof optionsOrTemplateId === "string"
        ? { templateId: optionsOrTemplateId }
        : optionsOrTemplateId;
    const runId = ++runIdRef.current;
    setExportOptions(options ?? null);
    setMissingOrigins([]);
    setProgress(null);
    dispatch({ type: "prepare-started", runId });

    try {
      const tabId = await getActiveTabId();
      const request: ChatTexPrepareExportRequest = {
        type: CHATTEX_PREPARE_EXPORT,
        options,
        templateId: options?.templateId,
      };
      const response = await sendTabMessageWithRetry<ChatTexPrepareExportResponse>(
        tabId,
        request,
      );
      if (!response.ok) {
        throw new Error(response.error);
      }

      const requiredOrigins = getAssetOriginPatterns(
        response.prepared.assets,
      );
      const missing = await findMissingOrigins(requiredOrigins);
      setMissingOrigins(missing);
      dispatch({
        type: "prepared",
        runId,
        prepared: response.prepared,
        permissionRequired: missing.length > 0,
      });
      if (missing.length === 0) {
        await processAssets(tabId, response.prepared, runId);
      }
    } catch (error) {
      dispatch({
        type: "prepare-failed",
        runId,
        error: readErrorMessage(error),
      });
    }
  }

  async function grantPermissions(): Promise<void> {
    const prepared = state.prepared;
    if (!prepared) {
      return;
    }
    const granted = await browser.permissions.request({
      origins: missingOrigins,
    });
    if (!granted) {
      dispatch({
        type: "operation-failed",
        runId: state.runId,
        error: "Image access permission was denied.",
      });
      return;
    }

    try {
      const tabId = await getActiveTabId();
      setMissingOrigins([]);
      await processAssets(tabId, prepared, state.runId);
    } catch (error) {
      dispatch({
        type: "operation-failed",
        runId: state.runId,
        error: readErrorMessage(error),
      });
    }
  }

  async function processAssets(
    tabId: number,
    exportData: PreparedExport,
    runId: number,
  ): Promise<void> {
    dispatch({ type: "assets-processing", runId });
    const files: ProcessedExportAssets["files"] = [];
    const failures: ProcessedExportAssets["failures"] = [];
    const total = exportData.assets.length;

    if (total === 0) {
      dispatch({
        type: "assets-ready",
        runId,
        processedAssets: { files, failures },
      });
      return;
    }

    let completedCount = 0;
    setProgress({
      current: 0,
      total,
      label: exportData.assets[0]!.alt || exportData.assets[0]!.id,
    });
    const results = await mapConcurrent(
      exportData.assets,
      3,
      async (asset) => {
        const result = await resolveAsset(tabId, asset);
        completedCount += 1;
        setProgress({
          current: completedCount,
          total,
          label: asset.alt || asset.id,
        });
        return { asset, result };
      },
    );

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
    setProgress(null);
    dispatch({
      type: "assets-ready",
      runId,
      processedAssets: { files, failures },
    });
  }

  async function compile(): Promise<void> {
    if (!state.prepared || !state.processedAssets) {
      return;
    }
    const outputKinds: OutputKind[] = exportOptions?.exportPdfOnly
      ? ["pdf"]
      : ["pdf", "tex", "source"];
    const request: ChatTexStartCompilerJobRequest = {
      type: CHATTEX_START_COMPILER_JOB,
      payload: {
        title: state.prepared.title,
        url: state.prepared.url,
        messageCount: state.prepared.messageCount,
        exportedAtIso: new Date().toISOString(),
        latexSource: state.prepared.latexSource,
        files: state.processedAssets.files,
        failures: state.processedAssets.failures,
        outputKinds,
      },
    };

    try {
      const response =
        await sendRuntimeMessageWithRetry<ChatTexCompilerJobSnapshotResponse>(
          request,
        );
      if (!response.ok || !response.snapshot) {
        throw new Error(
          response.ok ? "Compiler job did not start." : response.error,
        );
      }
      dispatch({
        type: "job-updated",
        runId: state.runId,
        snapshot: response.snapshot,
      });
    } catch (error) {
      dispatch({
        type: "operation-failed",
        runId: state.runId,
        error: readErrorMessage(error),
      });
    }
  }

  async function downloadAll(): Promise<void> {
    const jobId = state.activeJob?.jobId;
    if (!jobId) {
      return;
    }
    dispatch({ type: "downloads-started", runId: state.runId });
    try {
      const response =
        await sendRuntimeMessageWithRetry<ChatTexDownloadCompilerJobResponse>(
          {
            type: CHATTEX_DOWNLOAD_COMPILER_JOB,
            jobId,
          },
        );
      const downloadedFiles = response.downloads
        .filter((download) => download.error === null)
        .map((download) => download.filename);
      if (!response.ok) {
        throw new Error(response.error);
      }
      dispatch({
        type: "downloads-completed",
        runId: state.runId,
        downloadedFiles,
      });
      void getCacheStatus();
    } catch (error) {
      dispatch({
        type: "operation-failed",
        runId: state.runId,
        error: readErrorMessage(error),
      });
    }
  }

  async function cancel(): Promise<void> {
    const jobId = state.activeJob?.jobId;
    if (!jobId) {
      return;
    }
    try {
      const response =
        await sendRuntimeMessageWithRetry<ChatTexCompilerJobSnapshotResponse>(
          {
            type: CHATTEX_CANCEL_COMPILER_JOB,
            jobId,
          },
        );
      if (!response.ok || !response.snapshot) {
        throw new Error(
          response.ok ? "Compiler job was not found." : response.error,
        );
      }
      dispatch({
        type: "job-updated",
        runId: state.runId,
        snapshot: response.snapshot,
      });
      void getCacheStatus();
    } catch (error) {
      dispatch({
        type: "operation-failed",
        runId: state.runId,
        error: readErrorMessage(error),
      });
    }
  }

  async function refreshJob(): Promise<void> {
    try {
      const response =
        await sendRuntimeMessageWithRetry<ChatTexCompilerJobSnapshotResponse>(
          { type: CHATTEX_GET_COMPILER_JOB },
        );
      if (!response.ok) {
        throw new Error(response.error);
      }
      if (response.snapshot) {
        dispatch({
          type: "job-updated",
          runId: runIdRef.current,
          snapshot: response.snapshot,
        });
        if (
          response.snapshot.phase === "completed" ||
          response.snapshot.phase === "failed"
        ) {
          await loadDiagnostics(
            response.snapshot.jobId,
            runIdRef.current,
          );
        }
      }
    } catch {
      // A missing offscreen document on first install is not a UI error.
    }
  }

  async function loadDiagnostics(
    jobId: string,
    runId: number,
  ): Promise<void> {
    const response =
      await sendRuntimeMessageWithRetry<ChatTexCompilerJobDiagnosticsResponse>(
        {
          type: CHATTEX_GET_COMPILER_JOB_DIAGNOSTICS,
          jobId,
        },
      );
    if (response.ok) {
      dispatch({
        type: "diagnostics-loaded",
        runId,
        compileLog: response.diagnostics.compileLog,
      });
    }
  }

  async function getCacheStatus(): Promise<void> {
    try {
      const response =
        await sendRuntimeMessageWithRetry<ChatTexCompilerCacheStatusResponse>(
          { type: CHATTEX_GET_COMPILER_CACHE_STATUS },
        );
      if (response.ok) {
        setCacheStatus(response.status);
      }
    } catch {
      // Cache disclosure is useful but must not block exporting.
    }
  }

  async function clearCompilerCache(): Promise<void> {
    const response =
      await sendRuntimeMessageWithRetry<ChatTexCompilerCacheStatusResponse>(
        { type: CHATTEX_CLEAR_COMPILER_CACHE },
      );
    if (!response.ok) {
      throw new Error(response.error);
    }
    setCacheStatus(response.status);
  }

  return {
    ...state,
    missingOrigins,
    progress,
    cacheStatus,
    compilerProgress: state.activeJob?.progress ?? null,
    prepare,
    grantPermissions,
    compile,
    downloadAll,
    cancel,
    refreshJob,
    getCacheStatus,
    clearCompilerCache,
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
    const pageResult =
      await sendTabMessageWithRetry<ChatTexReadPageImageResponse>(
        tabId,
        readRequest,
      );
    if (!pageResult.ok) {
      return pageResult;
    }
    const convertRequest: ChatTexConvertImageDataRequest = {
      type: CHATTEX_CONVERT_IMAGE_DATA,
      asset,
      data: pageResult.data,
    };
    return sendRuntimeMessageWithRetry<ResolveAssetResult>(
      convertRequest,
    );
  }

  const request: ChatTexProcessImageAssetRequest = {
    type: CHATTEX_PROCESS_IMAGE_ASSET,
    asset,
  };
  return sendRuntimeMessageWithRetry<ResolveAssetResult>(request);
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
        results[index] = await fn(items[index]!, index);
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
      const noReceiver =
        error instanceof Error &&
        (error.message.includes("Could not establish connection") ||
          error.message.includes("Receiving end does not exist"));
      if (noReceiver && attempt < maxRetries - 1) {
        await wait(backoffDelay(delayMs, attempt));
        continue;
      }
      if (noReceiver) {
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
      const noReceiver =
        error instanceof Error &&
        (error.message.includes("Could not establish connection") ||
          error.message.includes("Receiving end does not exist"));
      if (noReceiver && attempt < maxRetries - 1) {
        await wait(backoffDelay(delayMs, attempt));
        continue;
      }
      throw error;
    }
  }
  throw new Error(
    "Unable to connect to the extension automatically. Please try again.",
  );
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function backoffDelay(baseDelayMs: number, attempt: number): number {
  return Math.min(baseDelayMs * 2 ** attempt, 2_000);
}
