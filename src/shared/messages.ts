import { ChatConversation } from "../features/chat/types";

import type {
  ImageAssetRequest,
  ResolveAssetResult,
} from "@/src/features/assets/types";

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
