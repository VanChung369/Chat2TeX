export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  order: number;

  /* The text content of the message. */
  text: string;

  /* The HTML content of the message, if available. */
  html: string;
}

export interface ChatConversation {
  title: string;
  url: string;

  /* The messages in the conversation, in order. */
  messages: ChatMessage[];
}
