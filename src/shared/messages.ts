import { ChatConversation } from "../features/chat/types";

import type {
  ImageAssetRequest,
  ResolveAssetResult,
} from "@/src/features/assets/types";

import type {
  PageImageData,
  PageImageReadResult,
} from "@/src/features/assets/page-image-reader";

import type {
  CompileLatexResult,
  SerializedCompileProject,
} from "@/src/features/compiler/types";

import type { PreparedExport } from "@/src/features/export/types";

import type {
  LatexAssetRequest,
  LatexExportOptions,
  LatexTemplateId,
} from "@/src/features/latex/types";

import type {
  DownloadExportPayload,
  DownloadExportResult,
  PrepareDownloadResult,
} from "@/src/features/export/download-types";

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

export const CHATTEX_COMPILE_LATEX = "CHATTEX_COMPILE_LATEX" as const;

export const CHATTEX_COMPILE_IN_OFFSCREEN =
  "CHATTEX_COMPILE_IN_OFFSCREEN" as const;

export const CHATTEX_DOWNLOAD_EXPORT = "CHATTEX_DOWNLOAD_EXPORT" as const;

export const CHATTEX_PREPARE_DOWNLOADS_OFFSCREEN =
  "CHATTEX_PREPARE_DOWNLOADS_OFFSCREEN" as const;

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

export interface ChatTexCompileLatexRequest {
  type: typeof CHATTEX_COMPILE_LATEX;
  project: SerializedCompileProject;
}

export interface ChatTexCompileInOffscreenRequest {
  type: typeof CHATTEX_COMPILE_IN_OFFSCREEN;

  project: SerializedCompileProject;
}

export type ChatTexCompileInOffscreenResponse = CompileLatexResult;

export function isCompileLatexRequest(
  value: unknown,
): value is ChatTexCompileLatexRequest {
  return (
    hasMessageType(value, CHATTEX_COMPILE_LATEX) && hasCompileProject(value)
  );
}

export function isCompileInOffscreenRequest(
  value: unknown,
): value is ChatTexCompileInOffscreenRequest {
  return (
    hasMessageType(value, CHATTEX_COMPILE_IN_OFFSCREEN) &&
    hasCompileProject(value)
  );
}

function hasCompileProject(value: unknown): value is {
  project: SerializedCompileProject;
} {
  if (typeof value !== "object" || value === null || !("project" in value)) {
    return false;
  }

  const project = value.project;

  return (
    typeof project === "object" &&
    project !== null &&
    "source" in project &&
    typeof project.source === "string" &&
    "files" in project &&
    Array.isArray(project.files)
  );
}

export interface ChatTexDownloadExportRequest {
  type: typeof CHATTEX_DOWNLOAD_EXPORT;

  payload: DownloadExportPayload;
}

export type ChatTexDownloadExportResponse = DownloadExportResult;

export interface ChatTexPrepareDownloadsOffscreenRequest {
  type: typeof CHATTEX_PREPARE_DOWNLOADS_OFFSCREEN;

  payload: DownloadExportPayload;
}

export type ChatTexPrepareDownloadsOffscreenResponse = PrepareDownloadResult;

export function isDownloadExportRequest(
  value: unknown,
): value is ChatTexDownloadExportRequest {
  return (
    hasMessageType(value, CHATTEX_DOWNLOAD_EXPORT) && hasDownloadPayload(value)
  );
}

export function isPrepareDownloadsOffscreenRequest(
  value: unknown,
): value is ChatTexPrepareDownloadsOffscreenRequest {
  return (
    hasMessageType(value, CHATTEX_PREPARE_DOWNLOADS_OFFSCREEN) &&
    hasDownloadPayload(value)
  );
}

function hasDownloadPayload(value: unknown): value is {
  payload: DownloadExportPayload;
} {
  if (typeof value !== "object" || value === null || !("payload" in value)) {
    return false;
  }

  const payload = value.payload;

  return (
    typeof payload === "object" &&
    payload !== null &&
    "title" in payload &&
    typeof payload.title === "string" &&
    "latexSource" in payload &&
    typeof payload.latexSource === "string" &&
    "pdfBase64" in payload &&
    typeof payload.pdfBase64 === "string" &&
    "files" in payload &&
    Array.isArray(payload.files) &&
    "failures" in payload &&
    Array.isArray(payload.failures)
  );
}
