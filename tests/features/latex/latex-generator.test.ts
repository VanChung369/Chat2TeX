import { describe, expect, it } from "vitest";

import { LatexGenerator } from "@/src/features/latex/latex-generator";

import type { ChatDocumentAst } from "@/src/features/document/ast";

function createDocument(): ChatDocumentAst {
  return {
    title: "Binary Search & Complexity",
    url: "https://chatgpt.com/c/example?id=123&source=test",

    messages: [
      {
        id: "user-1",
        role: "user",
        order: 0,

        blocks: [
          {
            type: "paragraph",
            children: [
              {
                type: "text",
                value: "Explain binary search with O(log n) and 50% reduction.",
              },
            ],
          },
        ],
      },

      {
        id: "assistant-1",
        role: "assistant",
        order: 1,

        blocks: [
          {
            type: "heading",
            level: 2,

            children: [
              {
                type: "text",
                value: "Approach",
              },
            ],
          },

          {
            type: "paragraph",

            children: [
              {
                type: "text",
                value: "Use a ",
              },
              {
                type: "strong",
                children: [
                  {
                    type: "text",
                    value: "sorted array",
                  },
                ],
              },
              {
                type: "text",
                value: " and calculate ",
              },
              {
                type: "inline-code",
                value: "middle = (left + right) / 2",
              },
              {
                type: "text",
                value: ". Read ",
              },
              {
                type: "link",
                href: "https://example.com/search?a=1&b=2",
                title: null,
                children: [
                  {
                    type: "text",
                    value: "the documentation",
                  },
                ],
              },
              {
                type: "text",
                value: ".",
              },
            ],
          },

          {
            type: "code",
            language: "typescript",
            code: [
              "function search(values: number[]) {",
              "  return values.length;",
              "}",
            ].join("\n"),
          },

          {
            type: "list",
            ordered: true,
            start: 2,

            items: [
              {
                blocks: [
                  {
                    type: "paragraph",
                    children: [
                      {
                        type: "text",
                        value: "Calculate the middle index.",
                      },
                    ],
                  },
                ],
              },

              {
                blocks: [
                  {
                    type: "paragraph",
                    children: [
                      {
                        type: "text",
                        value: "Reduce the search range.",
                      },
                    ],
                  },
                ],
              },
            ],
          },

          {
            type: "table",

            rows: [
              {
                cells: [
                  {
                    header: true,
                    children: [
                      {
                        type: "text",
                        value: "Operation",
                      },
                    ],
                  },
                  {
                    header: true,
                    children: [
                      {
                        type: "text",
                        value: "Complexity",
                      },
                    ],
                  },
                ],
              },

              {
                cells: [
                  {
                    header: false,
                    children: [
                      {
                        type: "text",
                        value: "Search",
                      },
                    ],
                  },
                  {
                    header: false,
                    children: [
                      {
                        type: "inline-math",
                        latex: "O(\\log n)",
                      },
                    ],
                  },
                ],
              },
            ],
          },

          {
            type: "math",
            latex: "T(n) = T(n/2) + O(1)",
          },

          {
            type: "image",
            src: "https://example.com/binary-search.webp",
            alt: "Binary search diagram",
            title: null,
          },
        ],
      },
    ],
  };
}

describe("LatexGenerator", () => {
  it("generates a complete XeLaTeX document", () => {
    const generator = new LatexGenerator();

    const result = generator.generate(createDocument());

    expect(result.source).toContain("\\documentclass[11pt,a4paper]{article}");

    expect(result.source).toContain("\\usepackage{fontspec}");

    expect(result.source).toContain("\\begin{document}");

    expect(result.source).toContain("\\end{document}");

    expect(result.source).toContain("\\begin{chatmessage}{User}");

    expect(result.source).toContain("\\begin{chatmessage}{Assistant}");
  });

  it("escapes special LaTeX characters in normal text", () => {
    const generator = new LatexGenerator();

    const result = generator.generate(createDocument());

    expect(result.source).toContain("Binary Search \\& Complexity");

    expect(result.source).toContain("50\\% reduction");
  });

  it("renders code, lists, tables and math", () => {
    const generator = new LatexGenerator();

    const result = generator.generate(createDocument());

    expect(result.source).toContain("\\begin{lstlisting}[language=JavaScript]");

    expect(result.source).toContain("\\begin{enumerate}[start=2]");

    expect(result.source).toContain("\\begin{longtable}{ll}");

    expect(result.source).toContain("$O(\\log n)$");

    expect(result.source).toContain("\\[\nT(n) = T(n/2) + O(1)\n\\]");
  });

  it("registers image assets in appearance order", () => {
    const generator = new LatexGenerator();

    const result = generator.generate(createDocument());

    expect(result.assets).toEqual([
      {
        id: "image-001",
        kind: "image",
        sourceUrl: "https://example.com/binary-search.webp",
        outputPath: "assets/image-001.png",
        alt: "Binary search diagram",
      },
    ]);

    expect(result.source).toContain("{assets/image-001.png}");
  });
});
