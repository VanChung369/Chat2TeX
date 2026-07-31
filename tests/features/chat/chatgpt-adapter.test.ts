import { describe, expect, it } from "vitest";

import { ChatGPTAdapter } from "@/src/features/chat/chatgpt-adapter";
import { HtmlToAstParser } from "@/src/features/document/html-to-ast";
import { LatexGenerator } from "@/src/features/latex/latex-generator";

function createTestDocument(
  body: string,
  title = "Test conversation - ChatGPT",
): Document {
  const testDocument = document.implementation.createHTMLDocument(title);

  testDocument.body.innerHTML = body;

  return testDocument;
}

describe("ChatGPTAdapter", () => {
  it("extracts user and assistant messages in conversation order", () => {
    const testDocument = createTestDocument(`
      <article data-testid="conversation-turn-0">
        <div
          data-message-author-role="user"
          data-message-id="user-1"
        >
          How does binary search work?
        </div>
      </article>

      <article data-testid="conversation-turn-1">
        <div
          data-message-author-role="assistant"
          data-message-id="assistant-1"
        >
          <div class="markdown">
            <p>Binary search repeatedly divides the search range.</p>

            <pre>
              <code>const middle = Math.floor((left + right) / 2);</code>
            </pre>

            <button>Copy code</button>
          </div>
        </div>
      </article>
    `);

    const adapter = new ChatGPTAdapter(
      testDocument,
      "https://chatgpt.com/c/example",
    );

    const conversation = adapter.extractConversation();

    expect(conversation.title).toBe("Test conversation");
    expect(conversation.url).toBe("https://chatgpt.com/c/example");

    expect(conversation.messages).toHaveLength(2);

    expect(conversation.messages[0]).toMatchObject({
      id: "user-1",
      role: "user",
      order: 0,
      text: "How does binary search work?",
    });

    expect(conversation.messages[1]).toMatchObject({
      id: "assistant-1",
      role: "assistant",
      order: 1,
    });

    expect(conversation.messages[1].text).toContain(
      "Binary search repeatedly divides the search range.",
    );

    expect(conversation.messages[1].html).toContain("<code>");

    expect(conversation.messages[1].html).not.toContain("<button");
  });

  it("preserves every sibling Markdown section in one message", () => {
    const testDocument = createTestDocument(`
      <article data-testid="conversation-turn-0">
        <div
          data-message-author-role="assistant"
          data-message-id="assistant-multipart"
        >
          <div class="markdown"><p>First section</p></div>
          <div class="markdown"><p>Second section</p></div>
        </div>
      </article>
    `);

    const [message] = new ChatGPTAdapter(
      testDocument,
    ).extractMountedMessages();

    expect(message.text).toContain("First section");
    expect(message.text).toContain("Second section");
    expect(message.html.match(/First section/g)).toHaveLength(1);
    expect(message.html.match(/Second section/g)).toHaveLength(1);
  });

  it("does not duplicate nested content candidates", () => {
    const testDocument = createTestDocument(`
      <article data-testid="conversation-turn-0">
        <div
          data-message-author-role="assistant"
          data-message-id="assistant-nested"
        >
          <div data-message-content>
            <div class="markdown"><p>Nested once</p></div>
          </div>
        </div>
      </article>
    `);

    const [message] = new ChatGPTAdapter(
      testDocument,
    ).extractMountedMessages();

    expect(message.html.match(/Nested once/g)).toHaveLength(1);
  });

  it("reports whether the first numbered conversation turn is mounted", () => {
    const firstTurn = createTestDocument(`
      <article data-testid="conversation-turn-1"></article>
      <article data-testid="conversation-turn-2"></article>
    `);

    const partialTurns = createTestDocument(`
      <article data-testid="conversation-turn-8"></article>
      <article data-testid="conversation-turn-9"></article>
    `);

    const unknownTurns = createTestDocument(`
      <article data-testid="conversation-turn-latest"></article>
    `);

    expect(new ChatGPTAdapter(firstTurn).hasConversationStart()).toBe(true);
    expect(new ChatGPTAdapter(partialTurns).hasConversationStart()).toBe(false);
    expect(new ChatGPTAdapter(unknownTurns).hasConversationStart()).toBeNull();
  });

  it("preserves generated images for LaTeX asset collection", () => {
    const testDocument = createTestDocument(`
      <article data-testid="conversation-turn-0">
        <div
          data-message-author-role="assistant"
          data-message-id="assistant-image"
        >
          <div class="markdown">
            <p>Here is the generated image.</p>
          </div>

          <button aria-label="Open image">
            <img
              src="https://cdn.example.com/generated-image.webp"
              alt="Generated landscape"
            />
          </button>
        </div>
      </article>
    `);

    const adapter = new ChatGPTAdapter(
      testDocument,
      "https://chatgpt.com/c/example",
    );

    const conversation = adapter.extractConversation();
    const documentAst = new HtmlToAstParser(testDocument).parseConversation(
      conversation,
    );
    const result = new LatexGenerator().generate(documentAst);

    expect(conversation.messages[0].html).toContain(
      'data-chattex-image-presentation="content"',
    );
    expect(result.assets).toEqual([
      {
        id: "image-001",
        kind: "image",
        sourceUrl: "https://cdn.example.com/generated-image.webp",
        outputPath: "assets/image-001.png",
        alt: "Generated landscape",
      },
    ]);
  });

  it("retains citation favicons and classifies them as icons", () => {
    const testDocument = createTestDocument(`
      <article data-testid="conversation-turn-1">
        <div
          data-message-author-role="assistant"
          data-message-id="assistant-citation"
        >
          <div class="markdown">
            <p>See the cited browser documentation.</p>

            <a
              data-testid="citation-inline"
              href="https://github.com"
            >
              <img
                src="https://icons.duckduckgo.com/ip3/github.com.ico"
                alt=""
                width="32"
                height="32"
              />
            </a>
          </div>

          <a
            data-testid="citation"
            href="https://developer.chrome.com/docs/extensions"
          >
            <img
              src="https://www.google.com/s2/favicons?domain=developer.chrome.com&sz=128"
              alt=""
              width="128"
              height="128"
            />
          </a>
        </div>
      </article>
    `);

    const [message] = new ChatGPTAdapter(
      testDocument,
    ).extractMountedMessages();

    expect(message.html).toContain("See the cited browser documentation.");
    expect(message.html.match(/<img/g)).toHaveLength(2);
    expect(
      message.html.match(/data-chattex-image-presentation="icon"/g),
    ).toHaveLength(2);
    expect(message.html).toContain("favicons");
    expect(message.html).toContain("icons.duckduckgo.com");
  });

  it("ignores unsupported roles and empty messages", () => {
    const testDocument = createTestDocument(`
      <div data-message-author-role="system">
        Internal system message
      </div>

      <div data-message-author-role="tool">
        Tool result
      </div>

      <div data-message-author-role="user">
      </div>

      <div
        data-message-author-role="assistant"
        data-message-id="assistant-valid"
      >
        <div class="markdown">
          <p>Valid response</p>
        </div>
      </div>
    `);

    const adapter = new ChatGPTAdapter(testDocument);

    const messages = adapter.extractMountedMessages();

    expect(messages).toHaveLength(1);

    expect(messages[0]).toMatchObject({
      id: "assistant-valid",
      role: "assistant",
      text: "Valid response",
    });
  });

  it("falls back to role elements when turn wrappers are missing", () => {
    const testDocument = createTestDocument(`
      <main>
        <div
          data-message-author-role="user"
          data-message-id="message-a"
        >
          First message
        </div>

        <div
          data-message-author-role="assistant"
          data-message-id="message-b"
        >
          <div class="markdown">
            <p>Second message</p>
          </div>
        </div>
      </main>
    `);

    const adapter = new ChatGPTAdapter(testDocument);

    const messages = adapter.extractMountedMessages();

    expect(
      messages.map((message: { role: string; order: number }) => message.role),
    ).toEqual(["user", "assistant"]);

    expect(
      messages.map((message: { role: string; order: number }) => message.order),
    ).toEqual([0, 1]);
  });

  it("supports chatgpt.com, www.chatgpt.com, and chat.openai.com domains", () => {
    const doc = createTestDocument("");
    expect(
      new ChatGPTAdapter(doc, "https://chatgpt.com/c/123").isSupportedPage(),
    ).toBe(true);
    expect(
      new ChatGPTAdapter(doc, "https://www.chatgpt.com/c/123").isSupportedPage(),
    ).toBe(true);
    expect(
      new ChatGPTAdapter(doc, "https://chat.openai.com/c/123").isSupportedPage(),
    ).toBe(true);
    expect(
      new ChatGPTAdapter(doc, "https://example.com/c/123").isSupportedPage(),
    ).toBe(false);
  });
});
