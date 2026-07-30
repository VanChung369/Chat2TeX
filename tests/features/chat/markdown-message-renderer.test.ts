import { describe, expect, it } from "vitest";

import { MarkdownMessageRenderer } from "@/src/features/chat/markdown-message-renderer";
import { HtmlToAstParser } from "@/src/features/document/html-to-ast";

describe("MarkdownMessageRenderer", () => {
  it("preserves fenced language metadata through the HTML parser", () => {
    const renderer = new MarkdownMessageRenderer();
    const parser = new HtmlToAstParser(
      document.implementation.createHTMLDocument("Markdown"),
    );

    const blocks = parser.parseHtml(
      renderer.render(
        [
          "## Ví dụ",
          "",
          "```typescript",
          'const lờiChào: string = "Tiếng Việt";',
          "```",
        ].join("\n"),
      ),
    );

    expect(blocks).toContainEqual({
      type: "code",
      language: "typescript",
      code: 'const lờiChào: string = "Tiếng Việt";',
    });
  });

  it("escapes raw HTML and retains inline and display math metadata", () => {
    const renderer = new MarkdownMessageRenderer();

    const html = renderer.render(
      [
        "<script>globalThis.compromised = true</script>",
        "",
        "Inline $E = mc^2$.",
        "",
        "$$",
        "T(n) = T(n/2) + O(1)",
        "$$",
      ].join("\n"),
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('data-math-style="inline"');
    expect(html).toContain('data-latex="E = mc^2"');
    expect(html).toContain('data-math-style="display"');
    expect(html).toContain('data-latex="T(n) = T(n/2) + O(1)"');
  });

  it("does not treat dollars inside code as math", () => {
    const renderer = new MarkdownMessageRenderer();

    const html = renderer.render(
      ["```bash", 'echo "$HOME"', "```", "", "Use `cost = $5`."].join(
        "\n",
      ),
    );

    expect(html).toContain('echo &quot;$HOME&quot;');
    expect(html).toContain("cost = $5");
    expect(html).not.toContain('data-latex="HOME"');
    expect(html).not.toContain('data-latex="5"');
  });
});
