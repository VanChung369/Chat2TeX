import type { ChatConversation, ChatMessage } from "./types";

export interface ViewportSnapshot {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface ConversationViewport {
  capture(): ViewportSnapshot;
  scrollToBottom(): void;
  scrollPageUp(): void;
  scrollToTop(): void;
  restore(snapshot: ViewportSnapshot): void;
  waitForSettle(): Promise<void>;
}

export interface ConversationReader {
  extractMountedMessages(): ChatMessage[];
  extractConversation(): ChatConversation;
  hasConversationStart(): boolean | null;
}

export interface CollectionProgress {
  pass: number;
  collectedMessages: number;
  mountedMessages: number;
  reachedTop: boolean;
  conversationStartFound: boolean | null;
}

export interface ConversationCollectorOptions {
  maxPasses?: number;
  stableTopPasses?: number;
  unknownTopPasses?: number;
  topTolerance?: number;
}

const DEFAULT_OPTIONS: Required<ConversationCollectorOptions> = {
  maxPasses: 120,
  stableTopPasses: 2,
  unknownTopPasses: 6,
  topTolerance: 2,
};

export class ConversationCollector {
  private readonly options: Required<ConversationCollectorOptions>;

  constructor(
    private readonly reader: ConversationReader,
    private readonly viewport: ConversationViewport,
    options: ConversationCollectorOptions = {},
  ) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  async collect(
    onProgress?: (progress: CollectionProgress) => void,
  ): Promise<ChatConversation> {
    const originalViewport = this.viewport.capture();
    const collectedMessages = new Map<string, ChatMessage>();

    let previousTopSignature = "";
    let stableTopPasses = 0;
    let collectionCompleted = false;

    try {
      this.viewport.scrollToBottom();
      await this.viewport.waitForSettle();

      for (let pass = 1; pass <= this.options.maxPasses; pass += 1) {
        const mountedMessages = this.reader.extractMountedMessages();

        mergeMessages(collectedMessages, mountedMessages);

        const currentViewport = this.viewport.capture();

        const reachedTop =
          currentViewport.scrollTop <= this.options.topTolerance;

        const conversationStartFound =
          this.reader.hasConversationStart();

        onProgress?.({
          pass,
          collectedMessages: collectedMessages.size,
          mountedMessages: mountedMessages.length,
          reachedTop,
          conversationStartFound,
        });

        if (reachedTop) {
          if (conversationStartFound === false) {
            previousTopSignature = "";
            stableTopPasses = 0;
            this.viewport.scrollToTop();
            await this.viewport.waitForSettle();
            continue;
          }

          const topSignature = [
            currentViewport.scrollHeight,
            collectedMessages.size,
          ].join(":");

          if (topSignature === previousTopSignature) {
            stableTopPasses += 1;
          } else {
            previousTopSignature = topSignature;
            stableTopPasses = 0;
          }

          const requiredStablePasses =
            conversationStartFound === null
              ? this.options.unknownTopPasses
              : this.options.stableTopPasses;

          if (stableTopPasses >= requiredStablePasses) {
            collectionCompleted = true;
            break;
          }

          /*
           * Tiếp tục yêu cầu vị trí top để trang
           * có cơ hội tải thêm các message cũ.
           */
          this.viewport.scrollToTop();
        } else {
          previousTopSignature = "";
          stableTopPasses = 0;
          this.viewport.scrollPageUp();
        }

        await this.viewport.waitForSettle();
      }
    } finally {
      this.viewport.restore(originalViewport);
    }

    if (!collectionCompleted) {
      throw new Error(
        `Stopped after collecting ${collectedMessages.size} messages ` +
          "without reaching the beginning of the conversation.",
      );
    }

    const baseConversation = this.reader.extractConversation();

    return {
      title: baseConversation.title,
      url: baseConversation.url,
      messages: Array.from(collectedMessages.values()).sort(compareMessages),
    };
  }
}

function mergeMessages(
  target: Map<string, ChatMessage>,
  messages: ChatMessage[],
): void {
  for (const message of messages) {
    const existing = target.get(message.id);

    if (!existing) {
      target.set(message.id, message);
      continue;
    }

    /*
     * Một message có thể đang stream hoặc chưa render
     * đầy đủ. Giữ phiên bản có nhiều nội dung hơn.
     */
    const existingSize = existing.text.length + existing.html.length;

    const incomingSize = message.text.length + message.html.length;

    if (incomingSize > existingSize) {
      target.set(message.id, {
        ...message,
        order: Math.min(existing.order, message.order),
      });
    }
  }
}

function compareMessages(first: ChatMessage, second: ChatMessage): number {
  if (first.order !== second.order) {
    return first.order - second.order;
  }

  return first.id.localeCompare(second.id);
}
