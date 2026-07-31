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

    expect(result.source).toContain(
      [
        "\\IfFileExists{fontspec.sty}{",
        "  \\usepackage{fontspec}",
        "  \\setmainfont{Latin Modern Roman}",
        "  \\setsansfont{Latin Modern Sans}",
        "  \\setmonofont{Latin Modern Mono}",
        "}{}",
      ].join("\n"),
    );

    expect(result.source).toContain("\\definecolor{bookpaper}{HTML}{FFFDF8}");
    expect(result.source).toContain("\\pagecolor{bookpaper}");
    expect(result.source).toContain("\\newenvironment{readerquestion}");
    expect(result.source).toContain("\\def\\ps@chatbook");
    expect(result.source).toContain("\\begin{titlepage}");
    expect(result.source).toContain(
      "{\\sffamily\\small\\bfseries\\MakeUppercase{Chat2TeX Edition}}",
    );
    expect(result.source).toContain(
      "{\\Huge\\bfseries Binary Search \\& Complexity\\par}",
    );
    expect(result.source).toContain("\\pagenumbering{roman}");
    expect(result.source).toContain("\\tableofcontents");
    expect(result.source).toContain("\\pagenumbering{arabic}");
    expect(result.source).toContain(
      "\\setchatbooktitle{Binary Search \\& Complexity}",
    );
    expect(result.source).toContain("\\pagestyle{chatbook}");
    expect(result.source).toContain("\\begin{document}");
    expect(result.source).toContain("\\end{document}");
    expect(result.source).not.toContain("\\maketitle");
    expect(result.source).not.toContain("\\chatmessageheader");
    expect(result.source).toContain("\\IfFileExists{assets/image-001.png}");
  });

  it("keeps complete message bodies outside memory-heavy boxes", () => {
    const generator = new LatexGenerator();

    const result = generator.generate(createDocument());

    expect(result.source).not.toContain("\\usepackage[most]{tcolorbox}");
    expect(result.source).not.toContain("\\newtcolorbox{chatmessage}");
    expect(result.source).not.toContain("\\begin{chatmessage}");
    expect(result.source).not.toContain("\\begin{minipage}");
    expect(result.source).toContain("\\begin{readerquestion}");
    expect(result.source).toContain("\\begingroup");
    expect(result.source).toContain("\\par\\endgroup\\bigskip");
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

  it("localizes Vietnamese prose and book labels", () => {
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
                  value:
                    `Giải thích cách xuất toàn bộ hội thoại bằng ${decomposedVietnamese}.`,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.source).toContain("\\usepackage{polyglossia}");
    expect(result.source).toContain("\\setdefaultlanguage{vietnamese}");
    expect(result.source).toContain(
      "\\renewcommand{\\contentsname}{Mục lục}",
    );
    expect(result.source).toContain("Câu hỏi");
    expect(result.source).toContain("Nguồn:");
    expect(result.source).toContain("Xuất bằng Chat2TeX");
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

    expect(result.source).toContain(
      'const lờiChào = "Tiếng Việt"; // đầy đủ',
    );
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
    expect(source).toContain(
      "\\begin{lstlisting}[language=ChatTypeScript]",
    );
  });

  it("uses a bundled JavaScript definition instead of an unavailable listings language", () => {
    const source = new LatexGenerator().generate(
      createCodeDocument(
        "javascript",
        "const answer = async () => await Promise.resolve(42);",
      ),
    ).source;

    expect(source).toContain("\\lstdefinelanguage{ChatJavaScript}");
    expect(source).toContain(
      "\\begin{lstlisting}[language=ChatJavaScript]",
    );
    expect(source).not.toContain(
      "\\begin{lstlisting}[language=JavaScript]",
    );
  });

  it.each([
    ["css", "ChatCSS"],
    ["html", "ChatHTML"],
    ["xml", "ChatHTML"],
  ])(
    "uses the bundled %s listings definition",
    (language, listingLanguage) => {
      const source = new LatexGenerator().generate(
        createCodeDocument(language, "<main class='page'>color: red;</main>"),
      ).source;

      expect(source).toContain(
        `\\lstdefinelanguage{${listingLanguage}}`,
      );
      expect(source).toContain(
        `\\begin{lstlisting}[language=${listingLanguage}]`,
      );
    },
  );

  it("escapes code-number macro parameters nested inside IfFileExists", () => {
    const source = new LatexGenerator().generate(
      createCodeDocument("typescript", "const value: number = 1;"),
    ).source;

    expect(source).toContain(
      [
        "\\IfFileExists{accsupp.sty}{",
        "  \\usepackage{accsupp}",
        "  \\newcommand{\\chatcodenumber}[1]{%",
        "    \\BeginAccSupp{method=escape,ActualText={}}##1\\EndAccSupp{}%",
        "  }",
        "}{",
        "  \\newcommand{\\chatcodenumber}[1]{##1}",
        "}",
      ].join("\n"),
    );
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

    const result = generator.generate(createDocument());

    expect(result.source).toContain("\\definecolor{codebackground}{HTML}{F3F1ED}");
    expect(result.source).toContain("\\definecolor{codeforeground}{HTML}{25282E}");
    expect(result.source).toContain("\\definecolor{codekeyword}{HTML}{1F5FAE}");
    expect(result.source).toContain("\\definecolor{codestring}{HTML}{A13D52}");
    expect(result.source).toContain("\\definecolor{codecomment}{HTML}{397052}");
    expect(result.source).toContain("\\definecolor{codelabel}{HTML}{8A5A3B}");
    expect(result.source).toContain(
      "{\\sffamily\\scriptsize\\bfseries\\color{codelabel}\\MakeUppercase{TypeScript}\\par}",
    );
    expect(result.source).toContain(
      "\\begin{lstlisting}[language=ChatTypeScript]",
    );
    expect(result.source).toContain(
      "backgroundcolor=\\color{codebackground}",
    );
    expect(result.source).toContain(
      "basicstyle=\\ttfamily\\footnotesize\\color{codeforeground}",
    );
    expect(result.source).toContain(
      "identifierstyle=\\color{codeforeground}",
    );
    expect(result.source).toContain("\\IfFileExists{accsupp.sty}{");
    expect(result.source).toContain("\\usepackage{accsupp}");
    expect(result.source).toContain(
      "\\newcommand{\\chatcodenumber}[1]",
    );
    expect(result.source).toContain(
      "\\BeginAccSupp{method=escape,ActualText={}}##1\\EndAccSupp{}",
    );
    expect(result.source).toContain(
      "numberstyle=\\scriptsize\\color{bookmuted}\\chatcodenumber",
    );
    expect(result.source).toContain("\\lstset{numbers=none}");
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
    expect(result.source).toContain(
      "\\IfFileExists{assets/image-001.png}",
    );
    expect(result.source).toContain("\\usepackage[export]{adjustbox}");
    expect(result.source).toContain("    max width=\\linewidth,");
    expect(result.source).toContain(
      "    max height=0.7\\textheight,",
    );
    expect(result.source).not.toContain("    width=\\linewidth,");
    expect(result.source).not.toContain("    height=0.7\\textheight,");
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
    expect(
      result.source.match(/\\begin\{chattexiconrow\}/g),
    ).toHaveLength(1);
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
    expect(result.source).toContain("console.log('Done! [🚀][👍]');");
  });
});
