import { ChatConversation } from "../features/chat/types";

import type {
  ImageAssetRequest,
  ResolveAssetResult,
} from "@/src/features/assets/types";

import type {
  PageImageData,
  PageImageReadResult,
} from "@/src/features/assets/page-image-reader";

import type { PreparedExport } from "@/src/features/export/types";

import type {
  LatexAssetRequest,
  LatexExportOptions,
  LatexTemplateId,
} from "@/src/features/latex/types";

import type {
  StartedDownload,
} from "@/src/features/export/download-types";
import type { CompilerCacheStatus } from "@/src/features/compiler/compiler-asset-cache";
import type {
  CompilerJobDiagnostics,
  CompilerJobSnapshot,
  StartCompilerJobPayload,
} from "@/src/features/compiler/compiler-job-types";

export const CHAT2TEX_PING = "CHAT2TEX_PING";

export interface PingMessage {
  type: typeof CHAT2TEX_PING;
}

export const CHATTEX_EXTRACT_CONVERSATION =
  "CHATTEX_EXTRACT_CONVERSATION" as const;

export const CHATTEX_COLLECT_CONVERSATION =
  "CHATTEX_COLLECT_CONVERSATION" as const;

export const CHATTEX_PROCESS_IMAGE_ASSET =
  "CHATTEX_PROCESS_IMAGE_ASSET" as const;

export const CHATTEX_PREPARE_EXPORT = "CHATTEX_PREPARE_EXPORT" as const;

export const CHATTEX_READ_PAGE_IMAGE = "CHATTEX_READ_PAGE_IMAGE" as const;

export const CHATTEX_CONVERT_IMAGE_DATA = "CHATTEX_CONVERT_IMAGE_DATA" as const;

export const CHATTEX_START_COMPILER_JOB =
  "CHATTEX_START_COMPILER_JOB" as const;
export const CHATTEX_GET_COMPILER_JOB =
  "CHATTEX_GET_COMPILER_JOB" as const;
export const CHATTEX_GET_COMPILER_JOB_DIAGNOSTICS =
  "CHATTEX_GET_COMPILER_JOB_DIAGNOSTICS" as const;
export const CHATTEX_CANCEL_COMPILER_JOB =
  "CHATTEX_CANCEL_COMPILER_JOB" as const;
export const CHATTEX_DOWNLOAD_COMPILER_JOB =
  "CHATTEX_DOWNLOAD_COMPILER_JOB" as const;
export const CHATTEX_COMPILER_JOB_UPDATED =
  "CHATTEX_COMPILER_JOB_UPDATED" as const;
export const CHATTEX_GET_COMPILER_CACHE_STATUS =
  "CHATTEX_GET_COMPILER_CACHE_STATUS" as const;
export const CHATTEX_CLEAR_COMPILER_CACHE =
  "CHATTEX_CLEAR_COMPILER_CACHE" as const;
export const CHATTEX_PREPARE_COMPILER_JOB_ARTIFACTS =
  "CHATTEX_PREPARE_COMPILER_JOB_ARTIFACTS" as const;
export const CHATTEX_RECORD_COMPILER_JOB_DOWNLOADS =
  "CHATTEX_RECORD_COMPILER_JOB_DOWNLOADS" as const;
export const CHATTEX_COMPILER_OFFSCREEN_TARGET =
  "chat2tex-compiler-offscreen" as const;
export const CHATTEX_COMPILER_STORAGE =
  "CHATTEX_COMPILER_STORAGE" as const;

export type CompilerStorageAreaName = "local" | "session";
export type CompilerStorageOperation =
  | "get"
  | "set"
  | "remove"
  | "set-access-level";

export interface ChatTexCompilerStorageRequest {
  type: typeof CHATTEX_COMPILER_STORAGE;
  area: CompilerStorageAreaName;
  operation: CompilerStorageOperation;
  key?: string;
  items?: Record<string, unknown>;
}

export type ChatTexCompilerStorageResponse =
  | {
      ok: true;
      values?: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
    };

export function isCompilerOffscreenTargetedMessage(
  value: unknown,
): value is { target: typeof CHATTEX_COMPILER_OFFSCREEN_TARGET } {
  return (
    typeof value === "object" &&
    value !== null &&
    "target" in value &&
    value.target === CHATTEX_COMPILER_OFFSCREEN_TARGET
  );
}

export function isCompilerStorageRequest(
  value: unknown,
): value is ChatTexCompilerStorageRequest {
  if (
    !hasMessageType(value, CHATTEX_COMPILER_STORAGE) ||
    typeof value !== "object" ||
    value === null ||
    !("area" in value) ||
    (value.area !== "local" && value.area !== "session") ||
    !("operation" in value)
  ) {
    return false;
  }

  if (value.operation === "get" || value.operation === "remove") {
    return "key" in value && isNonemptyString(value.key);
  }
  if (value.operation === "set") {
    return (
      "items" in value &&
      typeof value.items === "object" &&
      value.items !== null &&
      !Array.isArray(value.items)
    );
  }
  return value.operation === "set-access-level";
}

export interface ChatTexPingRequest {
  type: typeof CHAT2TEX_PING;
}

export interface PingResponse {
  ok: true;
  title: string;
  url: string;
}
export type ChatTexExtractConversationResponse = ChatConversation;

export function isChatTexPingRequest(
  value: unknown,
): value is ChatTexPingRequest {
  return hasMessageType(value, CHAT2TEX_PING);
}

export interface ChatTexExtractConversationRequest {
  type: typeof CHATTEX_EXTRACT_CONVERSATION;
}

export function isExtractConversationRequest(
  value: unknown,
): value is ChatTexExtractConversationRequest {
  return hasMessageType(value, CHATTEX_EXTRACT_CONVERSATION);
}

export function isPingMessage(message: unknown): message is PingMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  return "type" in message && message.type === CHAT2TEX_PING;
}

function hasMessageType(value: unknown, expectedType: string): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return "type" in value && value.type === expectedType;
}

export interface ChatTexCollectConversationRequest {
  type: typeof CHATTEX_COLLECT_CONVERSATION;
}

export type ChatTexCollectConversationResponse =
  | {
      ok: true;
      conversation: ChatConversation;
    }
  | {
      ok: false;
      error: string;
    };

export function isCollectConversationRequest(
  value: unknown,
): value is ChatTexCollectConversationRequest {
  return hasMessageType(value, CHATTEX_COLLECT_CONVERSATION);
}

export interface ChatTexProcessImageAssetRequest {
  type: typeof CHATTEX_PROCESS_IMAGE_ASSET;

  asset: ImageAssetRequest;
}

export type ChatTexProcessImageAssetResponse = ResolveAssetResult;

export function isProcessImageAssetRequest(
  value: unknown,
): value is ChatTexProcessImageAssetRequest {
  if (!hasMessageType(value, CHATTEX_PROCESS_IMAGE_ASSET)) {
    return false;
  }

  if (typeof value !== "object" || value === null || !("asset" in value)) {
    return false;
  }

  const asset = value.asset;

  if (typeof asset !== "object" || asset === null) {
    return false;
  }

  return (
    "id" in asset &&
    typeof asset.id === "string" &&
    "kind" in asset &&
    asset.kind === "image" &&
    "sourceUrl" in asset &&
    typeof asset.sourceUrl === "string" &&
    "outputPath" in asset &&
    typeof asset.outputPath === "string" &&
    "alt" in asset &&
    typeof asset.alt === "string"
  );
}

export interface ChatTexPrepareExportRequest {
  type: typeof CHATTEX_PREPARE_EXPORT;
  options?: LatexExportOptions;
  templateId?: LatexTemplateId;
}

export type ChatTexPrepareExportResponse =
  | {
      ok: true;
      prepared: PreparedExport;
    }
  | {
      ok: false;
      error: string;
    };

export interface ChatTexReadPageImageRequest {
  type: typeof CHATTEX_READ_PAGE_IMAGE;
  asset: LatexAssetRequest;
}

export type ChatTexReadPageImageResponse = PageImageReadResult;

export interface ChatTexConvertImageDataRequest {
  type: typeof CHATTEX_CONVERT_IMAGE_DATA;

  asset: LatexAssetRequest;
  data: PageImageData;
}

export function isPrepareExportRequest(
  value: unknown,
): value is ChatTexPrepareExportRequest {
  return hasMessageType(value, CHATTEX_PREPARE_EXPORT);
}

export function isReadPageImageRequest(
  value: unknown,
): value is ChatTexReadPageImageRequest {
  return hasMessageType(value, CHATTEX_READ_PAGE_IMAGE) && hasAsset(value);
}

export function isConvertImageDataRequest(
  value: unknown,
): value is ChatTexConvertImageDataRequest {
  return (
    hasMessageType(value, CHATTEX_CONVERT_IMAGE_DATA) &&
    hasAsset(value) &&
    typeof value === "object" &&
    value !== null &&
    "data" in value
  );
}

function hasAsset(value: unknown): value is {
  asset: LatexAssetRequest;
} {
  if (typeof value !== "object" || value === null || !("asset" in value)) {
    return false;
  }

  const asset = value.asset;

  return (
    typeof asset === "object" &&
    asset !== null &&
    "id" in asset &&
    typeof asset.id === "string" &&
    "sourceUrl" in asset &&
    typeof asset.sourceUrl === "string" &&
    "outputPath" in asset &&
    typeof asset.outputPath === "string"
  );
}

export interface ChatTexStartCompilerJobRequest {
  type: typeof CHATTEX_START_COMPILER_JOB;
  payload: StartCompilerJobPayload;
}

export interface ChatTexGetCompilerJobRequest {
  type: typeof CHATTEX_GET_COMPILER_JOB;
  jobId?: string;
}

export interface ChatTexGetCompilerJobDiagnosticsRequest {
  type: typeof CHATTEX_GET_COMPILER_JOB_DIAGNOSTICS;
  jobId: string;
}

export interface ChatTexCancelCompilerJobRequest {
  type: typeof CHATTEX_CANCEL_COMPILER_JOB;
  jobId: string;
}

export interface ChatTexDownloadCompilerJobRequest {
  type: typeof CHATTEX_DOWNLOAD_COMPILER_JOB;
  jobId: string;
}

export interface ChatTexCompilerJobUpdatedEvent {
  type: typeof CHATTEX_COMPILER_JOB_UPDATED;
  snapshot: CompilerJobSnapshot;
}

export interface ChatTexGetCompilerCacheStatusRequest {
  type: typeof CHATTEX_GET_COMPILER_CACHE_STATUS;
}

export interface ChatTexClearCompilerCacheRequest {
  type: typeof CHATTEX_CLEAR_COMPILER_CACHE;
}

export interface ChatTexPrepareCompilerJobArtifactsRequest {
  type: typeof CHATTEX_PREPARE_COMPILER_JOB_ARTIFACTS;
  jobId: string;
}

export interface ChatTexRecordCompilerJobDownloadsRequest {
  type: typeof CHATTEX_RECORD_COMPILER_JOB_DOWNLOADS;
  jobId: string;
  downloads: StartedDownload[];
}

export type ChatTexCompilerJobSnapshotResponse =
  | { ok: true; snapshot: CompilerJobSnapshot | null }
  | { ok: false; error: string };

export type ChatTexCompilerJobDiagnosticsResponse =
  | { ok: true; diagnostics: CompilerJobDiagnostics }
  | { ok: false; error: string };

export type ChatTexCompilerCacheStatusResponse =
  | { ok: true; status: CompilerCacheStatus }
  | { ok: false; error: string };

export type ChatTexDownloadCompilerJobResponse =
  | {
      ok: true;
      snapshot: CompilerJobSnapshot;
      downloads: StartedDownload[];
    }
  | {
      ok: false;
      error: string;
      snapshot: CompilerJobSnapshot | null;
      downloads: StartedDownload[];
    };

export function isStartCompilerJobRequest(
  value: unknown,
): value is ChatTexStartCompilerJobRequest {
  if (
    !hasMessageType(value, CHATTEX_START_COMPILER_JOB) ||
    !hasRecordProperty(value, "payload")
  ) {
    return false;
  }
  const payload = value.payload;
  return (
    typeof payload.title === "string" &&
    typeof payload.url === "string" &&
    typeof payload.messageCount === "number" &&
    typeof payload.exportedAtIso === "string" &&
    typeof payload.latexSource === "string" &&
    Array.isArray(payload.files) &&
    payload.files.every(isResolvedAssetFile) &&
    Array.isArray(payload.failures) &&
    Array.isArray(payload.outputKinds) &&
    payload.outputKinds.length > 0 &&
    payload.outputKinds.every(
      (kind) =>
        kind === "pdf" || kind === "tex" || kind === "source",
    )
  );
}

export function isGetCompilerJobRequest(
  value: unknown,
): value is ChatTexGetCompilerJobRequest {
  return (
    hasMessageType(value, CHATTEX_GET_COMPILER_JOB) &&
    (typeof value !== "object" ||
      value === null ||
      !("jobId" in value) ||
      value.jobId === undefined ||
      isNonemptyString(value.jobId))
  );
}

export function isGetCompilerJobDiagnosticsRequest(
  value: unknown,
): value is ChatTexGetCompilerJobDiagnosticsRequest {
  return hasJobId(value, CHATTEX_GET_COMPILER_JOB_DIAGNOSTICS);
}

export function isCancelCompilerJobRequest(
  value: unknown,
): value is ChatTexCancelCompilerJobRequest {
  return hasJobId(value, CHATTEX_CANCEL_COMPILER_JOB);
}

export function isDownloadCompilerJobRequest(
  value: unknown,
): value is ChatTexDownloadCompilerJobRequest {
  return hasJobId(value, CHATTEX_DOWNLOAD_COMPILER_JOB);
}

export function isGetCompilerCacheStatusRequest(
  value: unknown,
): value is ChatTexGetCompilerCacheStatusRequest {
  return hasMessageType(value, CHATTEX_GET_COMPILER_CACHE_STATUS);
}

export function isClearCompilerCacheRequest(
  value: unknown,
): value is ChatTexClearCompilerCacheRequest {
  return hasMessageType(value, CHATTEX_CLEAR_COMPILER_CACHE);
}

export function isPrepareCompilerJobArtifactsRequest(
  value: unknown,
): value is ChatTexPrepareCompilerJobArtifactsRequest {
  return hasJobId(value, CHATTEX_PREPARE_COMPILER_JOB_ARTIFACTS);
}

export function isRecordCompilerJobDownloadsRequest(
  value: unknown,
): value is ChatTexRecordCompilerJobDownloadsRequest {
  if (
    !hasJobId(value, CHATTEX_RECORD_COMPILER_JOB_DOWNLOADS) ||
    !("downloads" in value) ||
    !Array.isArray(value.downloads)
  ) {
    return false;
  }
  return value.downloads.every(
    (download) =>
      Boolean(download) &&
      typeof download === "object" &&
      "filename" in download &&
      typeof download.filename === "string" &&
      "downloadId" in download &&
      (download.downloadId === null ||
        typeof download.downloadId === "number") &&
      "error" in download &&
      (download.error === null || typeof download.error === "string"),
  );
}

function hasJobId<T extends string>(
  value: unknown,
  type: T,
): value is { type: T; jobId: string } {
  return (
    hasMessageType(value, type) &&
    typeof value === "object" &&
    value !== null &&
    "jobId" in value &&
    isNonemptyString(value.jobId)
  );
}

function hasRecordProperty<K extends string>(
  value: unknown,
  property: K,
): value is Record<K, Record<string, unknown>> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    property in record &&
    typeof record[property] === "object" &&
    record[property] !== null
  );
}

function isResolvedAssetFile(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const file = value as Record<string, unknown>;
  return (
    typeof file.id === "string" &&
    typeof file.outputPath === "string" &&
    typeof file.base64 === "string" &&
    typeof file.byteLength === "number"
  );
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
