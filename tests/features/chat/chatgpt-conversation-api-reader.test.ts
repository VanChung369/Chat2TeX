import { describe, expect, it, vi } from "vitest";

import { ChatGptConversationApiReader } from "@/src/features/chat/chatgpt-conversation-api-reader";

function createApiFetcher(conversation: unknown) {
  return vi
    .fn()
    .mockResolvedValueOnce(Response.json({ accessToken: "test-token" }))
    .mockResolvedValueOnce(Response.json(conversation));
}

function apiNode(
  id: string,
  parent: string | null,
  role: string,
  parts: unknown[],
  recipient = "all",
) {
  return {
    id,
    parent,
    children: [],
    message: {
      id,
      author: { role },
      content: { parts },
      recipient,
    },
  };
}

describe("ChatGptConversationApiReader", () => {
  it("reconstructs only the complete active branch", async () => {
    const fetcher = createApiFetcher({
      title: "Long conversation",
      current_node: "assistant-2",
      mapping: {
        root: {
          id: "root",
          parent: null,
          children: ["user-1"],
          message: null,
        },
        "user-1": {
          ...apiNode(
            "user-1",
            "root",
            "user",
            ["Start of the chat"],
          ),
          children: ["assistant-1", "assistant-abandoned"],
        },
        "assistant-abandoned": apiNode(
          "assistant-abandoned",
          "user-1",
          "assistant",
          ["Wrong branch"],
        ),
        "assistant-1": {
          ...apiNode(
            "assistant-1",
            "user-1",
            "assistant",
            ["```typescript\nconst first = true;\n```"],
          ),
          children: ["user-2"],
        },
        "user-2": {
          ...apiNode(
            "user-2",
            "assistant-1",
            "user",
            ["End question"],
          ),
          children: ["assistant-2"],
        },
        "assistant-2": apiNode(
          "assistant-2",
          "user-2",
          "assistant",
          ["End answer"],
        ),
      },
    });

    const conversation = await new ChatGptConversationApiReader(
      fetcher,
      "https://chatgpt.com/c/conversation-123",
    ).read();

    expect(conversation.title).toBe("Long conversation");
    expect(conversation.url).toBe(
      "https://chatgpt.com/c/conversation-123",
    );
    expect(conversation.messages.map(({ id }) => id)).toEqual([
      "user-1",
      "assistant-1",
      "user-2",
      "assistant-2",
    ]);
    expect(conversation.messages.map(({ order }) => order)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(conversation.messages[1].html).toContain(
      'class="language-typescript"',
    );
    expect(
      conversation.messages.some(({ text }) => text.includes("Wrong branch")),
    ).toBe(false);

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      new URL("https://chatgpt.com/api/auth/session"),
      {
        credentials: "include",
      },
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      new URL(
        "https://chatgpt.com/backend-api/conversation/conversation-123",
      ),
      {
        credentials: "include",
        headers: {
          Authorization: "Bearer test-token",
          "X-Authorization": "Bearer test-token",
        },
      },
    );
  });

  it("rejects URLs without a conversation id", async () => {
    await expect(
      new ChatGptConversationApiReader(
        vi.fn(),
        "https://chatgpt.com/",
      ).read(),
    ).rejects.toThrow("conversation ID");
  });

  it("rejects malformed mappings and parent cycles", async () => {
    const fetcher = createApiFetcher({
      title: "Cycle",
      current_node: "node-a",
      mapping: {
        "node-a": {
          id: "node-a",
          parent: "node-a",
          children: [],
          message: null,
        },
      },
    });

    await expect(
      new ChatGptConversationApiReader(
        fetcher,
        "https://chatgpt.com/c/cycle",
      ).read(),
    ).rejects.toThrow("cycle");
  });

  it("filters system, tool, non-all, and empty messages", async () => {
    const fetcher = createApiFetcher({
      title: "Filtered",
      current_node: "assistant-visible",
      mapping: {
        root: {
          id: "root",
          parent: null,
          children: [],
          message: null,
        },
        system: apiNode("system", "root", "system", ["Hidden"]),
        "user-visible": apiNode(
          "user-visible",
          "system",
          "user",
          ["Visible question"],
        ),
        tool: apiNode(
          "tool",
          "user-visible",
          "tool",
          ["Hidden tool"],
        ),
        "assistant-private": apiNode(
          "assistant-private",
          "tool",
          "assistant",
          ["Hidden recipient"],
          "browser",
        ),
        empty: apiNode(
          "empty",
          "assistant-private",
          "assistant",
          [],
        ),
        "assistant-visible": apiNode(
          "assistant-visible",
          "empty",
          "assistant",
          ["Visible answer", { asset_pointer: "file-service://hidden" }],
        ),
      },
    });

    const conversation = await new ChatGptConversationApiReader(
      fetcher,
      "https://chatgpt.com/c/filtered",
    ).read();

    expect(
      conversation.messages.map(({ id, order }) => ({ id, order })),
    ).toEqual([
      { id: "user-visible", order: 0 },
      { id: "assistant-visible", order: 1 },
    ]);
    expect(conversation.messages[1].text).toBe("Visible answer");
  });

  it("reports rejected requests without leaking the access token", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ accessToken: "secret-token" }))
      .mockResolvedValueOnce(
        new Response("sensitive body", {
          status: 403,
          statusText: "Forbidden",
        }),
      );

    const read = new ChatGptConversationApiReader(
      fetcher,
      "https://chatgpt.com/c/rejected",
    ).read();

    await expect(read).rejects.toThrow(
      "Conversation request failed with status 403.",
    );
    await expect(read).rejects.not.toThrow(/secret-token|sensitive body/);
  });
});
