import type { ChatConversation, ChatMessage, ChatRole } from "./types";

const MESSAGE_SELECTOR =
  '[data-message-author-role="user"],' +
  '[data-message-author-role="assistant"]';

const TURN_SELECTOR = '[data-testid^="conversation-turn-"]';

const CONTENT_SELECTOR = [
  ".markdown",
  '[class*="markdown"]',
  "[data-message-content]",
].join(",");

const NOISY_ELEMENT_SELECTOR = [
  "button",
  "script",
  "style",
  "noscript",
  "svg",
  '[aria-hidden="true"]',
  '[data-testid*="copy"]',
  '[data-testid*="feedback"]',
].join(",");

export class ChatGPTAdapter {
  constructor(
    private readonly documentRef: Document = document,
    private readonly currentUrl: string = typeof window !== "undefined"
      ? window.location.href
      : "",
  ) {}

  isSupportedPage(): boolean {
    try {
      const url = new URL(this.currentUrl);

      return url.hostname === "chatgpt.com";
    } catch {
      return false;
    }
  }

  extractConversation(): ChatConversation {
    return {
      title: this.getConversationTitle(),
      url: this.currentUrl,
      messages: this.extractMountedMessages(),
    };
  }

  getConversationTitle(): string {
    const title = this.documentRef.title
      .replace(/\s*[-–—]\s*ChatGPT\s*$/i, "")
      .trim();

    return title || "Untitled conversation";
  }

  extractMountedMessages(): ChatMessage[] {
    const messages = this.extractFromTurnElements();

    if (messages.length > 0) {
      return messages;
    }

    return this.extractFromRoleElements();
  }

  private extractFromTurnElements(): ChatMessage[] {
    const turnElements = Array.from(
      this.documentRef.querySelectorAll<HTMLElement>(TURN_SELECTOR),
    );

    const messages = turnElements
      .map((turnElement, index) => {
        const messageElement =
          turnElement.querySelector<HTMLElement>(MESSAGE_SELECTOR);

        if (!messageElement) {
          return null;
        }

        return this.createMessage(messageElement, index, turnElement);
      })
      .filter((message): message is ChatMessage => message !== null);

    return this.removeDuplicates(messages);
  }

  private extractFromRoleElements(): ChatMessage[] {
    const messageElements = Array.from(
      this.documentRef.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR),
    );

    const messages = messageElements
      .map((messageElement, index) => this.createMessage(messageElement, index))
      .filter((message): message is ChatMessage => message !== null);

    return this.removeDuplicates(messages);
  }

  private createMessage(
    messageElement: HTMLElement,
    fallbackOrder: number,
    turnElement?: HTMLElement,
  ): ChatMessage | null {
    const role = this.readRole(messageElement);

    if (!role) {
      return null;
    }

    const contentElement =
      messageElement.querySelector<HTMLElement>(CONTENT_SELECTOR) ??
      messageElement;

    const cleanedContent = this.cloneAndCleanContent(contentElement);

    const text = normalizeText(cleanedContent.textContent ?? "");

    const html = cleanedContent.innerHTML.trim();

    if (!text && !html) {
      return null;
    }

    const order = this.readOrder(turnElement, fallbackOrder);

    const id =
      messageElement.dataset.messageId ||
      turnElement?.dataset.messageId ||
      turnElement?.getAttribute("data-testid") ||
      `message-${order}-${role}`;

    return {
      id,
      role,
      order,
      text,
      html,
    };
  }

  private readRole(messageElement: HTMLElement): ChatRole | null {
    const role = messageElement.getAttribute("data-message-author-role");

    if (role === "user" || role === "assistant") {
      return role;
    }

    return null;
  }

  private readOrder(
    turnElement: HTMLElement | undefined,
    fallbackOrder: number,
  ): number {
    const testId = turnElement?.getAttribute("data-testid") ?? "";

    const match = testId.match(/conversation-turn-(\d+)/);

    if (!match) {
      return fallbackOrder;
    }

    const parsedOrder = Number.parseInt(match[1], 10);

    return Number.isNaN(parsedOrder) ? fallbackOrder : parsedOrder;
  }

  private cloneAndCleanContent(contentElement: HTMLElement): HTMLElement {
    const clone = contentElement.cloneNode(true) as HTMLElement;

    clone
      .querySelectorAll(NOISY_ELEMENT_SELECTOR)
      .forEach((element) => element.remove());

    return clone;
  }

  private removeDuplicates(messages: ChatMessage[]): ChatMessage[] {
    const messageMap = new Map<string, ChatMessage>();

    for (const message of messages) {
      messageMap.set(message.id, message);
    }

    return Array.from(messageMap.values()).sort(
      (first, second) => first.order - second.order,
    );
  }
}

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
