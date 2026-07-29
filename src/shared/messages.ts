import { ChatConversation } from "../features/chat/types";

export const CHAT2TEX_PING = "CHAT2TEX_PING";

export interface PingMessage {
  type: typeof CHAT2TEX_PING;
}

export const CHATTEX_EXTRACT_CONVERSATION =
  "CHATTEX_EXTRACT_CONVERSATION" as const;

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
