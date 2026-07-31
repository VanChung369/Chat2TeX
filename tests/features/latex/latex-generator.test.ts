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
            presentation: "content",
          },
        ],
      },
    ],
  };
}

function createCodeDocument(
  language: string | null,
  code: string,
): ChatDocumentAst {
  return {
    title: "Code sample",
    url: "https://chatgpt.com/c/code",
    messages: [
      {
        id: "assistant-code",
        role: "assistant",
        order: 0,
        blocks: [
          {
            type: "code",
            language,
            code,
          },
        ],
      },
    ],
  };
}

describe("LatexGenerator", () => {
  it("generates a complete Editorial Book document", () => {
    const generator = new LatexGenerator();

    const result = generator.generate(createDocument());

    expect(result.source).toContain("\\documentclass[11pt,a4paper]{article}");

    expect(result.source).toContain("\\usepackage{iftex}");
    expect(result.source).toContain("\\usepackage{fontspec}");

    expect(result.source).toContain("\\newenvironment{readerquestion}");
    expect(result.source).toContain("\\maketitle");
    expect(result.source).toContain("\\begin{document}");
    expect(result.source).toContain("\\end{document}");
    expect(result.source).toContain("\\IfFileExists{assets/image-001.png}");
  });

  it("keeps complete message bodies outside memory-heavy boxes", () => {
    const generator = new LatexGenerator();

    const result = generator.generate(createDocument());

    expect(result.source).not.toContain("\\usepackage[most]{tcolorbox}");
    expect(result.source).not.toContain("\\newtcolorbox{chatmessage}");
    expect(result.source).not.toContain("\\begin{chatmessage}");
    expect(result.source).toContain("\\begin{readerquestion}");
  });

  it("emits independently balanced hooks for the readerquestion environment", () => {
    const generator = new LatexGenerator();

    const source = generator.generate(createDocument()).source;
    const marker = "\\newenvironment{readerquestion}[1]";
    const definitionStart = source.indexOf(marker);
    expect(definitionStart).toBeGreaterThanOrEqual(0);

    const beginHook = readLatexGroup(
      source,
      definitionStart + marker.length,
    );
    expect(beginHook).not.toBeNull();

    const endHook = readLatexGroup(source, beginHook!.end);
    expect(endHook).not.toBeNull();
    expect(source.slice(endHook!.end).trimStart()).toMatch(
      /^\\newenvironment\{chattexiconrow\}/,
    );
  });

  it("renders user prompts as sections and assistant headings as children", () => {
    const generator = new LatexGenerator();

    const result = generator.generate({
      title: "Editorial conversation",
      url: "https://chatgpt.com/c/editorial",
      messages: [
        {
          id: "user-1",
          role: "user",
          order: 0,
          blocks: [
            {
              type: "paragraph",
              children: [{ type: "text", value: "How does this work?" }],
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
                { type: "text", value: "Architecture " },
                { type: "inline-code", value: "v2" },
              ],
            },
            {
              type: "heading",
              level: 3,
              children: [{ type: "text", value: "Implementation note" }],
            },
            {
              type: "paragraph",
              children: [{ type: "text", value: "Narrative response." }],
            },
          ],
        },
      ],
    });

    expect(result.source).toContain(
      "\\chatquestionsection{How does this work?}",
    );
    expect(result.source).toContain(
      "\\begin{readerquestion}{Reader's question 1}",
    );
    expect(result.source).toContain("How does this work?");
    expect(result.source).toContain("\\end{readerquestion}");
    expect(result.source).toContain(
      "\\subsection[Architecture v2]{Architecture \\texttt{v2}}",
    );
    expect(result.source).toContain(
      "\\subsubsection[Implementation note]{Implementation note}",
    );
    expect(result.source).toContain("Narrative response.");
    expect(result.source).not.toContain("\\section[Architecture v2]");
    expect(result.source).not.toContain("\\chatmessageheader{Assistant}");
  });

  it("creates concise contents titles from user questions", () => {
    const generator = new LatexGenerator();
    const longQuestion =
      "Explain how the extension collects every message from a very long virtualized conversation without losing content near the beginning";

    const result = generator.generate({
      title: "Question titles",
      url: "https://chatgpt.com/c/questions",
      messages: [
        {
          id: "user-1",
          role: "user",
          order: 0,
          blocks: [
            {
              type: "paragraph",
              children: [{ type: "text", value: longQuestion }],
            },
          ],
        },
        {
          id: "user-2",
          role: "user",
          order: 1,
          blocks: [],
        },
      ],
    });

    expect(result.source).toContain(
      "\\chatquestionsection{Explain how the extension collects every message from a very long virtualized…}",
    );
    expect(result.source).toContain("\\chatquestionsection{Question 2}");
  });

  it("promotes the shallowest assistant heading to a top-level section", () => {
    const generator = new LatexGenerator();

    const result = generator.generate({
      title: "Normalized hierarchy",
      url: "https://chatgpt.com/c/normalized",
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          order: 0,
          blocks: [
            {
              type: "heading",
              level: 2,
              children: [{ type: "text", value: "Overview" }],
            },
            {
              type: "heading",
              level: 3,
              children: [{ type: "text", value: "Details" }],
            },
          ],
        },
      ],
    });

    expect(result.source).toContain("\\section[Overview]{Overview}");
    expect(result.source).toContain("\\subsection[Details]{Details}");
    expect(result.source).not.toContain("\\subsection[Overview]{Overview}");
  });

  it("keeps English book labels while preserving Vietnamese prose", () => {
    const generator = new LatexGenerator();
    const decomposedVietnamese = "Tie\u0302\u0301ng Vie\u0323\u0302t";

    const result = generator.generate({
      title: "Hướng dẫn tiếng Việt",
      url: "https://chatgpt.com/c/vietnamese",
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
                  value: `Giải thích cách xuất toàn bộ hội thoại bằng ${decomposedVietnamese}.`,
                },
              ],
            },
          ],
        },
        {
          id: "user-2",
          role: "user",
          order: 1,
          blocks: [],
        },
      ],
    });

    expect(result.source).toContain("\\usepackage{polyglossia}");
    expect(result.source).toContain("\\setdefaultlanguage{vietnamese}");
    expect(result.source).toContain("\\renewcommand{\\contentsname}{Contents}");
    expect(result.source).toContain("Reader's question");
    expect(result.source).toContain("\\chatquestionsection{Question 2}");
    expect(result.source).toContain("Source:");
    expect(result.source).toContain("Exported with Chat2TeX");
    expect(result.source).toContain("Hướng dẫn tiếng Việt");
    expect(result.source).toContain("bằng Tiếng Việt.");
    expect(result.source).not.toContain(decomposedVietnamese);
  });

  it("normalizes and renders Vietnamese characters inside code blocks", () => {
    const generator = new LatexGenerator();
    const decomposedVietnamese = "Tie\u0302\u0301ng Vie\u0323\u0302t";

    const result = generator.generate({
      title: "Mã nguồn tiếng Việt",
      url: "https://chatgpt.com/c/vietnamese-code",
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          order: 0,
          blocks: [
            {
              type: "code",
              language: "javascript",
              code: `const lờiChào = "${decomposedVietnamese}"; // đầy đủ`,
            },
          ],
        },
      ],
    });

    expect(result.source).toContain('const lờiChào = "Tiếng Việt"; // đầy đủ');
    expect(result.source).not.toContain(decomposedVietnamese);
    expect(result.source).toContain("literate=");
    expect(result.source).toContain("{ế}{{ế}}1");
    expect(result.source).toContain("{đ}{{đ}}1");
    expect(result.source).toContain("{Đ}{{Đ}}1");
  });

  it("defines and uses TypeScript-specific listings keywords", () => {
    const source = new LatexGenerator().generate(
      createCodeDocument(
        "typescript",
        "interface User { readonly id: string }",
      ),
    ).source;

    expect(source).toContain("\\lstdefinelanguage{ChatTypeScript}");
    expect(source).not.toContain("  language=JavaScript,");
    expect(source).toContain(
      "morekeywords={break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,from,function,get,if,import,in,instanceof,let,new,of,return,set,static,super,switch,this,throw,try,typeof,var,void,while,with,yield,async,await,interface,type,implements,readonly,public,private,protected,enum,namespace,declare,abstract,unknown,never,keyof,infer,as,satisfies}",
    );
    expect(source).toContain("morecomment=[l]{//}");
    expect(source).toContain("morecomment=[s]{/*}{*/}");
    expect(source).toContain('morestring=[b]"');
    expect(source).toContain("morestring=[b]'");
    expect(source).toContain("\\begin{lstlisting}[language=ChatTypeScript]");
  });

  it("uses a bundled JavaScript definition instead of an unavailable listings language", () => {
    const source = new LatexGenerator().generate(
      createCodeDocument(
        "javascript",
        "const answer = async () => await Promise.resolve(42);",
      ),
    ).source;

    expect(source).toContain("\\lstdefinelanguage{ChatJavaScript}");
    expect(source).toContain("\\begin{lstlisting}[language=ChatJavaScript]");
    expect(source).not.toContain("\\begin{lstlisting}[language=JavaScript]");
  });

  it.each([
    ["css", "ChatCSS"],
    ["html", "ChatHTML"],
    ["xml", "ChatHTML"],
  ])("uses the bundled %s listings definition", (language, listingLanguage) => {
    const source = new LatexGenerator().generate(
      createCodeDocument(language, "<main class='page'>color: red;</main>"),
    ).source;

    expect(source).toContain(`\\lstdefinelanguage{${listingLanguage}}`);
    expect(source).toContain(
      `\\begin{lstlisting}[language=${listingLanguage}]`,
    );
  });

  it("escapes code-number macro parameters nested inside IfFileExists", () => {
    const source = new LatexGenerator().generate(
      createCodeDocument("typescript", "const value: number = 1;"),
    ).source;

    expect(source).toContain("\\providecommand{\\chatcodenumber}[1]{#1}");
  });

  it("infers TypeScript only from strong unlabeled syntax", () => {
    const inferredSource = new LatexGenerator().generate(
      createCodeDocument(
        null,
        "interface User { id: string }\nconst user: User = { id: '1' };",
      ),
    ).source;
    const plainSource = new LatexGenerator().generate(
      createCodeDocument(null, "plain words without a language"),
    ).source;

    expect(inferredSource).toContain(
      "\\begin{lstlisting}[language=ChatTypeScript]",
    );
    expect(plainSource).toContain("\\begin{lstlisting}");
    expect(plainSource).not.toContain(
      "\\begin{lstlisting}[language=ChatTypeScript]",
    );
  });

  it("escapes special LaTeX characters in normal text", () => {
    const generator = new LatexGenerator();

    const result = generator.generate(createDocument());

    expect(result.source).toContain("Binary Search \\& Complexity");

    expect(result.source).toContain("50\\% reduction");
  });

  it("renders editorial code, lists, tables and math", () => {
    const generator = new LatexGenerator();

    const result = generator.generate(createDocument(), "editorial-book");

    expect(result.source).toContain(
      "\\definecolor{codebackground}{HTML}{F7FAFC}",
    );
    expect(result.source).toContain(
      "\\definecolor{codeforeground}{HTML}{1A202C}",
    );
    expect(result.source).toContain("\\definecolor{codekeyword}{HTML}{3182CE}");
    expect(result.source).toContain("\\definecolor{codestring}{HTML}{DD6B20}");
    expect(result.source).toContain("\\definecolor{codecomment}{HTML}{38A169}");
    expect(result.source).toContain("\\definecolor{codelabel}{HTML}{2B6CB0}");
    expect(result.source).toContain(
      "{\\sffamily\\scriptsize\\bfseries\\color{codelabel}\\MakeUppercase{TypeScript}\\par}",
    );
    expect(result.source).toContain(
      "\\begin{lstlisting}[language=ChatTypeScript]",
    );
    expect(result.source).toContain("backgroundcolor=\\color{codebackground}");
    expect(result.source).toContain(
      "basicstyle=\\ttfamily\\footnotesize\\color{codeforeground}",
    );
    expect(result.source).toContain("identifierstyle=\\color{codeforeground}");
    expect(result.source).toContain(
      "\\providecommand{\\chatcodenumber}[1]{#1}",
    );
    expect(result.source).toContain("numberstyle=\\tiny\\color{bookmuted}");
    expect(result.source).toContain("numbers=left");
    expect(result.source).not.toContain("title={JavaScript}");

    expect(result.source).toContain("\\begin{enumerate}[start=2]");

    expect(result.source).toContain(
      "\\begin{longtable}{p{\\dimexpr(\\linewidth-4\\tabcolsep)/2\\relax}p{\\dimexpr(\\linewidth-4\\tabcolsep)/2\\relax}}",
    );
    expect(result.source).toContain(
      [
        "\\toprule",
        "\\textbf{Operation} & \\textbf{Complexity} \\\\",
        "\\midrule",
        "\\endfirsthead",
        "\\toprule",
        "\\textbf{Operation} & \\textbf{Complexity} \\\\",
        "\\midrule",
        "\\endhead",
      ].join("\n"),
    );

    expect(result.source).toContain("$O(\\log n)$");

    expect(result.source).toContain("\\[\nT(n) = T(n/2) + O(1)\n\\]");
  });

  it("renders editorial quotes, separators and image captions", () => {
    const generator = new LatexGenerator();

    const result = generator.generate({
      title: "Styled blocks",
      url: "https://chatgpt.com/c/styled",
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          order: 0,
          blocks: [
            {
              type: "quote",
              blocks: [
                {
                  type: "paragraph",
                  children: [{ type: "text", value: "Quoted material" }],
                },
              ],
            },
            {
              type: "horizontal-rule",
            },
            {
              type: "image",
              src: "https://example.com/diagram.webp",
              alt: "System architecture",
              title: null,
              presentation: "content",
            },
          ],
        },
      ],
    });

    expect(result.source).toContain("\\color{bookmuted}\\itshape");
    expect(result.source).toContain(
      "\\textcolor{bookaccent}{\\rule{18mm}{0.8pt}}",
    );
    expect(result.source).toContain(
      "\\textcolor{bookaccent}{\\rule{36mm}{0.8pt}}",
    );
    expect(result.source).toContain(
      "{\\small\\itshape\\color{bookmuted}System architecture\\par}",
    );
    expect(result.source).toContain("\\IfFileExists{assets/image-001.png}");
    expect(result.source).toContain("\\usepackage[export]{adjustbox}");
    expect(result.source).toContain("\\newlength{\\maxwidth}");
    expect(result.source).toContain("\\newlength{\\maxheight}");
    expect(result.source).toContain("    width=\\maxwidth,");
    expect(result.source).toContain("    height=\\maxheight,");
  });

  it("renders adjacent icon images as one compact row", () => {
    const result = new LatexGenerator().generate({
      title: "Citation icons",
      url: "https://chatgpt.com/c/icons",
      messages: [
        {
          id: "assistant-icons",
          role: "assistant",
          order: 0,
          blocks: [
            {
              type: "image",
              src: "https://example.com/chrome.png",
              alt: "Chrome",
              title: null,
              presentation: "icon",
            },
            {
              type: "image",
              src: "https://example.com/github.png",
              alt: "GitHub",
              title: null,
              presentation: "icon",
            },
          ],
        },
      ],
    });

    expect(result.source).toContain("\\begin{chattexiconrow}");
    expect(result.source).toContain("max width=1.4em");
    expect(result.source).toContain("max height=1.4em");
    expect(result.source.match(/\\begin\{chattexiconrow\}/g)).toHaveLength(1);
    expect(result.source).toContain("\\texttt{[icon unavailable]}");
    expect(result.assets).toHaveLength(2);
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

  it("sanitizes emojis in code blocks to prevent listings errors", () => {
    const generator = new LatexGenerator();
    const doc: ChatDocumentAst = {
      title: "Emoji Test",
      url: "https://chatgpt.com/c/emoji",
      messages: [
        {
          id: "m1",
          role: "assistant",
          order: 0,
          blocks: [
            {
              type: "code",
              language: "javascript",
              code: "console.log('Done! 🚀👍');",
            },
          ],
        },
      ],
    };

    const result = generator.generate(doc);
    expect(result.source).toContain("console.log('Done! [U+1F680][U+1F44D]');");
  });

  it("supports all 10 LaTeX document templates with distinct preambles", () => {
    const generator = new LatexGenerator();
    const doc = createDocument();

    const academic = generator.generate(doc, "academic").source;
    expect(academic).toContain("\\definecolor{bookpaper}{HTML}{FFFFFF}");

    const dark = generator.generate(doc, "dark-mode").source;
    expect(dark).toContain("\\definecolor{bookpaper}{HTML}{18181B}");

    const ieee = generator.generate(doc, "ieee-twocolumn").source;
    expect(ieee).toContain("twocolumn");
    expect(ieee).toContain("\\begin{tabular}");
    expect(ieee).not.toContain("\\begin{longtable}");

    const notion = generator.generate(doc, "notion-style").source;
    expect(notion).toContain("\\definecolor{bookaccent}{HTML}{6366F1}");

    const exec = generator.generate(doc, "executive-report").source;
    expect(exec).toContain("\\definecolor{bookaccent}{HTML}{1E3A8A}");

    const book = generator.generate(doc, "editorial-book").source;
    expect(book).toContain("\\begin{titlepage}");
  });

  it("supports custom paper background color and font family overrides", () => {
    const generator = new LatexGenerator();
    const doc = createDocument();

    const sepia = generator.generate(doc, {
      templateId: "academic",
      paperColor: "sepia",
      fontFamily: "sans",
    }).source;
    expect(sepia).toContain("\\definecolor{bookpaper}{HTML}{FBF0D9}");
    expect(sepia).toContain("\\renewcommand{\\familydefault}{\\sfdefault}");

    const dark = generator.generate(doc, {
      templateId: "academic",
      paperColor: "dark",
      fontFamily: "mono",
    }).source;
    expect(dark).toContain("\\definecolor{bookpaper}{HTML}{18181B}");
    expect(dark).toContain("\\renewcommand{\\familydefault}{\\ttdefault}");
  });

  it("supports excluding user messages and specific message IDs", () => {
    const generator = new LatexGenerator();
    const doc = createDocument();

    const noUser = generator.generate(doc, {
      includeUserMessages: false,
    }).source;
    expect(noUser).not.toContain("\\begin{readerquestion}");

    const msgIdToOmit = doc.messages[0]?.id;
    if (msgIdToOmit) {
      const omitted = generator.generate(doc, {
        excludedMessageIds: [msgIdToOmit],
      }).source;
      expect(omitted).not.toContain("Explain binary search with O(log n)");
    }
  });

  it("supports custom paperSize and authorName watermark", () => {
    const generator = new LatexGenerator();
    const doc = createDocument();

    const letterPaper = generator.generate(doc, {
      paperSize: "letter",
      authorName: "Nguyen Van A",
    }).source;
    expect(letterPaper).toContain("letterpaper");
    expect(letterPaper).toContain("Nguyen Van A");

    const a5Paper = generator.generate(doc, {
      paperSize: "a5",
      authorName: "Chat2TeX User",
    }).source;
    expect(a5Paper).toContain("a5paper");
    expect(a5Paper).toContain("Chat2TeX User");
  });
});

function readLatexGroup(
  source: string,
  offset: number,
): { body: string; end: number } | null {
  let cursor = offset;
  while (/\s/.test(source[cursor] ?? "")) {
    cursor += 1;
  }
  if (source[cursor] !== "{") {
    return null;
  }

  const bodyStart = cursor + 1;
  let depth = 1;
  for (cursor = bodyStart; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    const isEscaped =
      cursor > 0 &&
      source[cursor - 1] === "\\" &&
      source[cursor - 2] !== "\\";
    if (isEscaped) {
      continue;
    }
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          body: source.slice(bodyStart, cursor),
          end: cursor + 1,
        };
      }
    }
  }

  return null;
}
