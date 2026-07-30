import { describe, expect, it } from "vitest";

import {
  ConversationCollector,
  type ConversationReader,
  type ConversationViewport,
  type ViewportSnapshot,
} from "@/src/features/chat/conversation-collector";

import type {
  ChatConversation,
  ChatMessage,
  ChatRole,
} from "@/src/features/chat/types";

function createMessage(order: number, role: ChatRole): ChatMessage {
  return {
    id: `message-${order}`,
    role,
    order,
    text: `Message ${order}`,
    html: `<p>Message ${order}</p>`,
  };
}

interface VirtualPage {
  viewport: ViewportSnapshot;
  messages: ChatMessage[];
}

class FakeViewport implements ConversationViewport {
  currentPage = 0;
  restoredSnapshot: ViewportSnapshot | null = null;

  constructor(
    readonly pages: VirtualPage[],
    private readonly initialSnapshot: ViewportSnapshot,
    private readonly deferTopReveal = false,
  ) {}

  capture(): ViewportSnapshot {
    if (this.currentPage === -1) {
      return this.initialSnapshot;
    }

    return this.pages[this.currentPage].viewport;
  }

  scrollToBottom(): void {
    this.currentPage = 0;
  }

  scrollPageUp(): void {
    this.currentPage = Math.min(this.currentPage + 1, this.pages.length - 1);
  }

  scrollToTop(): void {
    if (!this.deferTopReveal) {
      this.currentPage = this.pages.length - 1;
    }
  }

  revealDeferredTopPage(): void {
    if (this.deferTopReveal) {
      this.currentPage = this.pages.length - 1;
    }
  }

  restore(snapshot: ViewportSnapshot): void {
    this.restoredSnapshot = snapshot;
  }

  async waitForSettle(): Promise<void> {
    await Promise.resolve();
  }
}

class FakeReader implements ConversationReader {
  private startStateIndex = 0;

  constructor(
    private readonly viewport: FakeViewport,
    private readonly startStates: Array<boolean | null> = [true],
  ) {}

  extractMountedMessages(): ChatMessage[] {
    return this.viewport.pages[this.viewport.currentPage].messages;
  }

  extractConversation(): ChatConversation {
    return {
      title: "Virtualized conversation",
      url: "https://chatgpt.com/c/example",
      messages: this.extractMountedMessages(),
    };
  }

  hasConversationStart(): boolean | null {
    const state =
      this.startStates[
        Math.min(this.startStateIndex, this.startStates.length - 1)
      ] ?? null;

    this.startStateIndex += 1;

    if (state === true) {
      this.viewport.revealDeferredTopPage();
    }

    return state;
  }
}

describe("ConversationCollector", () => {
  it("collects virtualized messages and restores scroll position", async () => {
    const initialSnapshot: ViewportSnapshot = {
      scrollTop: 320,
      scrollHeight: 1_000,
      clientHeight: 200,
    };

    const viewport = new FakeViewport(
      [
        {
          viewport: {
            scrollTop: 800,
            scrollHeight: 1_000,
            clientHeight: 200,
          },
          messages: [createMessage(4, "user"), createMessage(5, "assistant")],
        },
        {
          viewport: {
            scrollTop: 400,
            scrollHeight: 1_000,
            clientHeight: 200,
          },
          messages: [
            createMessage(2, "user"),
            createMessage(3, "assistant"),
            createMessage(4, "user"),
          ],
        },
        {
          viewport: {
            scrollTop: 0,
            scrollHeight: 1_000,
            clientHeight: 200,
          },
          messages: [
            createMessage(0, "user"),
            createMessage(1, "assistant"),
            createMessage(2, "user"),
          ],
        },
      ],
      initialSnapshot,
    );

    viewport.currentPage = -1;

    const collector = new ConversationCollector(
      new FakeReader(viewport),
      viewport,
      {
        stableTopPasses: 1,
        maxPasses: 20,
      },
    );

    const conversation = await collector.collect();

    expect(conversation.messages.map((message) => message.order)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);

    expect(conversation.messages).toHaveLength(6);

    expect(viewport.restoredSnapshot).toEqual(initialSnapshot);
  });

  it("reports collection progress", async () => {
    const viewport = new FakeViewport(
      [
        {
          viewport: {
            scrollTop: 0,
            scrollHeight: 500,
            clientHeight: 500,
          },
          messages: [createMessage(0, "user"), createMessage(1, "assistant")],
        },
      ],
      {
        scrollTop: 0,
        scrollHeight: 500,
        clientHeight: 500,
      },
    );

    viewport.currentPage = -1;

    const progressValues: number[] = [];

    const collector = new ConversationCollector(
      new FakeReader(viewport),
      viewport,
      {
        stableTopPasses: 1,
      },
    );

    await collector.collect((progress) => {
      progressValues.push(progress.collectedMessages);
    });

    expect(progressValues).toContain(2);
  });

  it("does not stop at a stable top before turn zero appears", async () => {
    const viewport = new FakeViewport(
      [
        {
          viewport: {
            scrollTop: 0,
            scrollHeight: 900,
            clientHeight: 300,
          },
          messages: [createMessage(4, "user"), createMessage(5, "assistant")],
        },
        {
          viewport: {
            scrollTop: 0,
            scrollHeight: 1_400,
            clientHeight: 300,
          },
          messages: [
            createMessage(0, "user"),
            createMessage(1, "assistant"),
            createMessage(2, "user"),
            createMessage(3, "assistant"),
          ],
        },
      ],
      {
        scrollTop: 200,
        scrollHeight: 900,
        clientHeight: 300,
      },
      true,
    );

    viewport.currentPage = -1;

    const reader = new FakeReader(viewport, [
      false,
      false,
      false,
      true,
      true,
    ]);

    const collector = new ConversationCollector(reader, viewport, {
      stableTopPasses: 1,
      unknownTopPasses: 3,
      maxPasses: 20,
    });

    const conversation = await collector.collect();

    expect(conversation.messages.map((message) => message.order)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("uses a bounded stability fallback when turn markers are unknown", async () => {
    const viewport = new FakeViewport(
      [
        {
          viewport: {
            scrollTop: 0,
            scrollHeight: 500,
            clientHeight: 500,
          },
          messages: [createMessage(0, "user"), createMessage(1, "assistant")],
        },
      ],
      {
        scrollTop: 0,
        scrollHeight: 500,
        clientHeight: 500,
      },
    );

    viewport.currentPage = -1;

    const progress: Array<boolean | null> = [];

    const collector = new ConversationCollector(
      new FakeReader(viewport, [null]),
      viewport,
      {
        stableTopPasses: 1,
        unknownTopPasses: 3,
        maxPasses: 10,
      },
    );

    const conversation = await collector.collect((value) => {
      progress.push(value.conversationStartFound);
    });

    expect(conversation.messages).toHaveLength(2);
    expect(progress).toEqual([null, null, null, null]);
  });
});
