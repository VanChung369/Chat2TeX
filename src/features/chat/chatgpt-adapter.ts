import type { ChatConversation, ChatMessage, ChatRole } from "./types";
import { CHATGPT_MESSAGE_SELECTOR, CHATGPT_TURN_SELECTOR } from "./selectors";

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
    private readonly fixedCurrentUrl?: string,
  ) {}

  private getCurrentUrl(): string {
    if (this.fixedCurrentUrl) {
      return this.fixedCurrentUrl;
    }

    return this.documentRef.location?.href ?? window.location.href;
  }

  isSupportedPage(): boolean {
    try {
      const url = new URL(this.getCurrentUrl());

      return url.hostname === "chatgpt.com";
    } catch {
      return false;
    }
  }

  extractConversation(): ChatConversation {
    return {
      title: this.getConversationTitle(),
      url: this.getCurrentUrl(),
      messages: this.extractMountedMessages(),
    };
  }

  hasConversationStart(): boolean | null {
    const numberedTurns = Array.from(
      this.documentRef.querySelectorAll<HTMLElement>(CHATGPT_TURN_SELECTOR),
    )
      .map((element) => element.getAttribute("data-testid") ?? "")
      .map((testId) => testId.match(/^conversation-turn-(\d+)$/))
      .filter((match): match is RegExpMatchArray => match !== null);

    if (numberedTurns.length === 0) {
      return null;
    }

    return numberedTurns.some(
      (match) => Number.parseInt(match[1], 10) === 0,
    );
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
      this.documentRef.querySelectorAll<HTMLElement>(CHATGPT_TURN_SELECTOR),
    );

    const messages = turnElements
      .map((turnElement, index) => {
        const messageElement = turnElement.querySelector<HTMLElement>(
          CHATGPT_MESSAGE_SELECTOR,
        );

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
      this.documentRef.querySelectorAll<HTMLElement>(CHATGPT_MESSAGE_SELECTOR),
    );

    const messages = messageElements
      .map((messageElement, index) => {
        const turnElement =
          messageElement.closest<HTMLElement>(CHATGPT_TURN_SELECTOR) ??
          undefined;

        return this.createMessage(messageElement, index, turnElement);
      })
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

    const cleanedContent = this.cloneAndCleanContent(messageElement);

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

  private cloneAndCleanContent(
    messageElement: HTMLElement,
  ): HTMLElement {
    const candidates = Array.from(
      messageElement.querySelectorAll<HTMLElement>(CONTENT_SELECTOR),
    );

    const topLevelCandidates = candidates.filter(
      (candidate) =>
        !candidates.some(
          (other) => other !== candidate && other.contains(candidate),
        ),
    );

    const clone =
      topLevelCandidates.length > 0
        ? this.documentRef.createElement("div")
        : (messageElement.cloneNode(true) as HTMLElement);

    for (const sourceElement of topLevelCandidates) {
      clone.append(sourceElement.cloneNode(true));
    }

    clone
      .querySelectorAll(NOISY_ELEMENT_SELECTOR)
      .forEach((element) => element.remove());

    const retainedImageSources = new Set(
      Array.from(clone.querySelectorAll<HTMLImageElement>("img"))
        .map(readImageSource)
        .filter(Boolean),
    );

    for (const imageElement of messageElement.querySelectorAll("img")) {
      const sourceUrl = readImageSource(imageElement);

      if (!sourceUrl || retainedImageSources.has(sourceUrl)) {
        continue;
      }

      const imageClone = imageElement.cloneNode(false) as HTMLImageElement;

      imageClone.setAttribute("src", sourceUrl);
      clone.append(imageClone);
      retainedImageSources.add(sourceUrl);
    }

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

function readImageSource(imageElement: HTMLImageElement): string {
  return (
    imageElement.currentSrc ||
    imageElement.src ||
    imageElement.getAttribute("src") ||
    ""
  ).trim();
}
