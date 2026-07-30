import { useState } from "react";

import { browser } from "wxt/browser";

import { getAssetOriginPatterns } from "@/src/features/export/asset-origins";

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
} from "@/src/shared/messages";

export type ExportPhase =
  | "idle"
  | "preparing"
  | "permission-required"
  | "processing-assets"
  | "ready"
  | "error";

export function useExportFlow() {
  const [phase, setPhase] = useState<ExportPhase>("idle");

  const [prepared, setPrepared] = useState<PreparedExport | null>(null);

  const [missingOrigins, setMissingOrigins] = useState<string[]>([]);

  const [processedAssets, setProcessedAssets] =
    useState<ProcessedExportAssets | null>(null);

  const [progress, setProgress] = useState<ExportProgress | null>(null);

  const [error, setError] = useState<string | null>(null);

  async function prepare(): Promise<void> {
    setPhase("preparing");
    setError(null);
    setProgress(null);
    setProcessedAssets(null);

    try {
      const tabId = await getActiveTabId();

      const request: ChatTexPrepareExportRequest = {
        type: CHATTEX_PREPARE_EXPORT,
      };

      const response = (await browser.tabs.sendMessage(
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
     * permissions.request() là lời gọi đầu tiên
     * trong click handler để giữ user gesture.
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

    for (let index = 0; index < exportData.assets.length; index += 1) {
      const asset = exportData.assets[index];

      setProgress({
        current: index + 1,
        total: exportData.assets.length,
        label: asset.alt || asset.id,
      });

      const result = await resolveAsset(tabId, asset);

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

  return {
    phase,
    prepared,
    processedAssets,
    missingOrigins,
    progress,
    error,
    prepare,
    grantPermissions,
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

    const pageResult = (await browser.tabs.sendMessage(
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

    return browser.runtime.sendMessage(
      convertRequest,
    ) as Promise<ResolveAssetResult>;
  }

  const request: ChatTexProcessImageAssetRequest = {
    type: CHATTEX_PROCESS_IMAGE_ASSET,
    asset,
  };

  return browser.runtime.sendMessage(request) as Promise<ResolveAssetResult>;
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
