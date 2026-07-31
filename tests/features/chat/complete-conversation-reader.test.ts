import { describe, expect, it } from "vitest";

import { CompleteConversationReader } from "@/src/features/chat/complete-conversation-reader";

import type {
  ChatConversation,
  ChatMessage,
} from "@/src/features/chat/types";

function message(id: string, order: number, html: string): ChatMessage {
  return {
    id,
    role: order % 2 === 0 ? "user" : "assistant",
    order,
    text: `Message ${order}`,
    html,
  };
}

function conversation(messages: ChatMessage[]): ChatConversation {
  return {
    title: "Complete conversation",
    url: "https://chatgpt.com/c/complete",
    messages,
  };
}

describe("CompleteConversationReader", () => {
  it("returns every API message and appends only unique mounted images", async () => {
    const apiConversation = conversation([
      message("user-1", 0, "<p>First</p>"),
      message("assistant-1", 1, "<p>Second</p>"),
      message("user-2", 2, "<p>Third</p>"),
      message(
        "assistant-2",
        3,
        '<pre data-language="typescript"><code>const last = true;</code></pre>',
      ),
    ]);
    const mountedConversation = conversation([
      message("user-2", 2, "<p>Third</p>"),
      message(
        "assistant-2",
        3,
        [
          "<p>Fourth</p>",
          '<img src="https://example.com/final.png" alt="Final" />',
          '<img src="https://example.com/final.png" alt="Duplicate" />',
          '<img src="https://www.google.com/s2/favicons?domain=example.com&sz=128" alt="" />',
        ].join(""),
      ),
    ]);

    const reader = new CompleteConversationReader(
      { read: async () => apiConversation },
      () => mountedConversation,
      async () => mountedConversation,
      document.implementation.createHTMLDocument("Enrichment"),
    );

    const result = await reader.read();

    expect(result.messages.map(({ id }) => id)).toEqual([
      "user-1",
      "assistant-1",
      "user-2",
      "assistant-2",
    ]);
    expect(result.messages[3].html).toContain('data-language="typescript"');
    expect(result.messages[3].html.match(/final\.png/g)).toHaveLength(1);
    expect(result.messages[3].html.match(/s2\/favicons/g)).toHaveLength(1);
    expect(result.messages[3].html).toContain(
      'data-chattex-image-presentation="icon"',
    );
  });

  it("uses verified DOM output when the API source rejects", async () => {
    const mountedConversation = conversation([
      message("assistant-1", 1, "<p>Answer</p>"),
    ]);
    const domConversation = conversation([
      message("user-1", 0, "<p>Question</p>"),
      message("assistant-1", 1, "<p>Answer</p>"),
    ]);
    const reader = new CompleteConversationReader(
      {
        read: async () => {
          throw new Error("Session unavailable.");
        },
      },
      () => mountedConversation,
      async () => domConversation,
    );

    await expect(reader.read()).resolves.toEqual(domConversation);
  });

  it("rejects a DOM fallback that collected no additional messages", async () => {
    const partialConversation = conversation([
      message("assistant-9", 18, "<p>Only the mounted tail</p>"),
    ]);
    const reader = new CompleteConversationReader(
      {
        read: async () => {
          throw new Error("Workspace conversation request failed.");
        },
      },
      () => partialConversation,
      async () => partialConversation,
    );

    await expect(reader.read()).rejects.toThrow(
      [
        "Unable to collect a complete conversation.",
        "API: Workspace conversation request failed.",
        "DOM fallback: DOM collection did not load any additional messages",
      ].join("\n"),
    );
  });

  it("reports both source failures without leaking credentials", async () => {
    const reader = new CompleteConversationReader(
      {
        read: async () => {
          throw new Error("Session unavailable.");
        },
      },
      () => conversation([]),
      async () => {
        throw new Error(
          "Stopped after collecting 5 messages without reaching the beginning.",
        );
      },
    );

    await expect(reader.read()).rejects.toThrow(
      [
        "Unable to collect a complete conversation.",
        "API: Session unavailable.",
        "DOM fallback: Stopped after collecting 5 messages",
      ].join("\n"),
    );

    await expect(reader.read()).rejects.not.toThrow(
      /Authorization|Bearer|test-token/i,
    );
  });
});
