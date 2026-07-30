import { describe, expect, it } from "vitest";

import { HtmlToAstParser } from "@/src/features/document/html-to-ast";

import type { ChatConversation, ChatMessage } from "@/src/features/chat/types";

function createParser(): HtmlToAstParser {
  const testDocument = document.implementation.createHTMLDocument("AST test");

  return new HtmlToAstParser(testDocument);
}

function createMessage(html: string): ChatMessage {
  return {
    id: "message-1",
    role: "assistant",
    order: 1,
    text: "Test message",
    html,
  };
}

describe("HtmlToAstParser", () => {
  it("parses common Markdown HTML elements", () => {
    const parser = createParser();

    const result = parser.parseMessage(
      createMessage(`
        <h2>Binary Search</h2>

        <p>
          Use <strong>binary search</strong>
          when the array is <em>sorted</em>.
          Read <a href="https://example.com">this guide</a>.
        </p>

        <pre>
          <code class="language-typescript">const middle = 10;</code>
        </pre>

        <ul>
          <li>Fast lookup</li>
          <li>
            Logarithmic complexity
            <ol start="2">
              <li>Nested item</li>
            </ol>
          </li>
        </ul>

        <blockquote>
          <p>The array must be sorted.</p>
        </blockquote>

        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Complexity</th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td>Binary search</td>
              <td>O(log n)</td>
            </tr>
          </tbody>
        </table>

        <p>
          <img
            src="https://example.com/diagram.png"
            alt="Binary search diagram"
          />
        </p>

        <hr />
      `),
    );

    expect(result.blocks[0]).toEqual({
      type: "heading",
      level: 2,
      children: [
        {
          type: "text",
          value: "Binary Search",
        },
      ],
    });

    expect(result.blocks).toContainEqual({
      type: "code",
      language: "typescript",
      code: "const middle = 10;",
    });

    expect(result.blocks).toContainEqual(
      expect.objectContaining({
        type: "list",
        ordered: false,
      }),
    );

    expect(result.blocks).toContainEqual(
      expect.objectContaining({
        type: "quote",
      }),
    );

    expect(result.blocks).toContainEqual(
      expect.objectContaining({
        type: "table",
      }),
    );

    expect(result.blocks).toContainEqual({
      type: "horizontal-rule",
    });
  });

  it("extracts inline and display KaTeX source", () => {
    const parser = createParser();

    const result = parser.parseMessage(
      createMessage(`
        <p>
          Einstein wrote

          <span class="katex">
            <span class="katex-mathml">
              <math>
                <semantics>
                  <annotation encoding="application/x-tex">
                    E = mc^2
                  </annotation>
                </semantics>
              </math>
            </span>

            <span class="katex-html">
              rendered content
            </span>
          </span>.
        </p>

        <div class="katex-display">
          <span class="katex">
            <span class="katex-mathml">
              <math>
                <semantics>
                  <annotation encoding="application/x-tex">
                    \\int_0^1 x\\,dx
                  </annotation>
                </semantics>
              </math>
            </span>
          </span>
        </div>
      `),
    );

    expect(result.blocks[0]).toEqual({
      type: "paragraph",
      children: [
        {
          type: "text",
          value: "Einstein wrote ",
        },
        {
          type: "inline-math",
          latex: "E = mc^2",
        },
        {
          type: "text",
          value: ".",
        },
      ],
    });

    expect(result.blocks[1]).toEqual({
      type: "math",
      latex: "\\int_0^1 x\\,dx",
    });
  });

  it("converts a full conversation into document AST", () => {
    const parser = createParser();

    const conversation: ChatConversation = {
      title: "Algorithm discussion",
      url: "https://chatgpt.com/c/example",
      messages: [
        {
          id: "user-1",
          role: "user",
          order: 0,
          text: "Explain binary search",
          html: "<p>Explain binary search</p>",
        },
        {
          id: "assistant-1",
          role: "assistant",
          order: 1,
          text: "Binary search divides the range.",
          html: `
            <p>
              Binary search divides the range.
            </p>
          `,
        },
      ],
    };

    const result = parser.parseConversation(conversation);

    expect(result.title).toBe("Algorithm discussion");

    expect(result.messages).toHaveLength(2);

    expect(result.messages[0]).toMatchObject({
      id: "user-1",
      role: "user",
      order: 0,
    });

    expect(result.messages[0].blocks).toEqual([
      {
        type: "paragraph",
        children: [
          {
            type: "text",
            value: "Explain binary search",
          },
        ],
      },
    ]);
  });
});
