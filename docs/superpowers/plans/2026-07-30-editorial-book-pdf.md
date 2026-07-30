# Editorial Book PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the transcript-like LaTeX output with a reliable Editorial Book layout containing a cover, contents, running navigation, narrative role styling, and polished technical blocks.

**Architecture:** Keep the public `LatexGenerator.generate(ChatDocumentAst)` interface and asset request format unchanged. Add front-matter and editorial-template responsibilities inside `LatexGenerator`, determine the shallowest assistant heading in the document, then pass a small role-aware render context through nested block renderers so assistant headings are normalized into numbered contents entries. Use core LaTeX primitives and the packages already loaded by the generator; never buffer a whole message in a box.

**Tech Stack:** TypeScript 5.9, Vitest 4, XeLaTeX through BusyTeX WebAssembly, WXT Chrome MV3.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-30-editorial-book-pdf-design.md`.
- Keep `\documentclass[11pt,a4paper]{article}`.
- Do not add runtime dependencies or new LaTeX package requirements.
- Keep `fontspec` behind `\IfFileExists{fontspec.sty}`.
- Do not use `tcolorbox`, `minipage`, `parbox`, framed environments, or any equivalent container around a complete message.
- Keep image registration, missing-image placeholders, compile fallback, diagnostic logs, and export packaging behavior unchanged.
- Only the first three normalized assistant heading levels are numbered and
  included in the contents.
- Keep user content and assistant content in their original order without summarizing or rewriting it.
- Do not create a worktree.
- Do not create commits; use test and diff checkpoints instead.

---

## File Map

- Modify `src/features/latex/latex-generator.ts`
  - Own the Editorial Book preamble, cover, contents, page styles, role-aware rendering, and technical block styles.
- Modify `tests/features/latex/latex-generator.test.ts`
  - Cover front matter, typography, role behavior, heading context, technical block output, image captions, and memory-safety invariants.
- Read only `src/features/document/ast.ts`
  - Reuse `ChatDocumentAst`, `ChatMessageAst`, `BlockNode`, and `InlineNode`; do not change the AST.
- Read only `src/features/latex/latex-escape.ts`
  - Continue using the existing escaping functions.

---

### Task 1: Editorial document shell and front matter

**Files:**
- Modify: `tests/features/latex/latex-generator.test.ts:211-250`
- Modify: `src/features/latex/latex-generator.ts:21-144`

**Interfaces:**
- Consumes: `ChatDocumentAst.title`, `ChatDocumentAst.url`, and the existing `escapeLatexText()` / `escapeLatexUrl()` functions.
- Produces:
  - `private renderCover(document: ChatDocumentAst): string`
  - `private renderContents(document: ChatDocumentAst): string`
  - Editorial preamble macros `\chatbooktitle`, `\readerquestion`, and page style `chatbook`.

- [ ] **Step 1: Replace the complete-document expectations with failing Editorial Book assertions**

Update the first generator test so it asserts the new shell explicitly:

```ts
it("generates a complete Editorial Book document", () => {
  const generator = new LatexGenerator();

  const result = generator.generate(createDocument());

  expect(result.source).toContain("\\documentclass[11pt,a4paper]{article}");
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
});
```

Retain the existing conditional-`fontspec` assertion in this test.

- [ ] **Step 2: Run the focused test and verify the new assertions fail**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: FAIL because the generated source still contains `\maketitle` /
`\chatmessageheader` and does not contain the cover, contents, or editorial
page-style macros.

- [ ] **Step 3: Assemble the document from cover, contents, and body**

Change `generate()` to use the two new render methods:

```ts
const source = [
  this.renderPreamble(),
  "",
  "\\begin{document}",
  "",
  this.renderCover(document),
  "",
  this.renderContents(document),
  "",
  body,
  "",
  "\\end{document}",
  "",
].join("\n");
```

Delete `renderDocumentHeader()`. Add these methods:

```ts
private renderCover(document: ChatDocumentAst): string {
  const title = escapeLatexText(document.title.trim() || "Untitled conversation");
  const sourceUrl = escapeLatexUrl(document.url);

  return [
    "\\begin{titlepage}",
    "\\thispagestyle{empty}",
    "\\vspace*{\\fill}",
    "\\noindent\\textcolor{bookaccent}{\\rule{42mm}{1.4pt}}",
    "\\par\\vspace{7mm}",
    "{\\sffamily\\small\\bfseries\\MakeUppercase{Chat2TeX Edition}}",
    "\\par\\vspace{5mm}",
    `{\\Huge\\bfseries ${title}\\par}`,
    "\\vspace{5mm}",
    "{\\Large\\color{bookmuted}A thoughtfully typeset ChatGPT conversation\\par}",
    "\\vfill",
    "\\noindent\\textcolor{bookrule}{\\rule{\\linewidth}{0.4pt}}",
    "\\par\\vspace{3mm}",
    "{\\sffamily\\footnotesize\\color{bookmuted}",
    `Source: \\url{${sourceUrl}}`,
    "\\par Exported with Chat2TeX}",
    "\\end{titlepage}",
  ].join("\n");
}

private renderContents(document: ChatDocumentAst): string {
  const title = escapeLatexText(document.title.trim() || "Untitled conversation");

  return [
    "\\clearpage",
    "\\pagenumbering{roman}",
    "\\pagestyle{plain}",
    "\\tableofcontents",
    "\\clearpage",
    "\\pagenumbering{arabic}",
    `\\setchatbooktitle{${title}}`,
    "\\markright{}",
    "\\pagestyle{chatbook}",
  ].join("\n");
}
```

- [ ] **Step 4: Replace the current colors, message-header macro, and typography defaults**

Keep the existing package list and conditional `fontspec`, but change the font
branch to include the matching sans face:

```ts
"\\IfFileExists{fontspec.sty}{",
"  \\usepackage{fontspec}",
"  \\setmainfont{Latin Modern Roman}",
"  \\setsansfont{Latin Modern Sans}",
"  \\setmonofont{Latin Modern Mono}",
"}{}",
```

Use 23 mm vertical and 24 mm horizontal margins. Replace the current message
colors and `\chatmessageheader` definition with these exact template settings:

```ts
"\\definecolor{bookpaper}{HTML}{FFFDF8}",
"\\definecolor{bookink}{HTML}{332E2A}",
"\\definecolor{bookmuted}{HTML}{81766B}",
"\\definecolor{bookaccent}{HTML}{A86B3F}",
"\\definecolor{bookrule}{HTML}{DED5CA}",
"\\definecolor{questionaccent}{HTML}{6E8B75}",
"\\definecolor{questiontext}{HTML}{33483A}",
"\\definecolor{codebackground}{HTML}{292C32}",
"\\definecolor{codeforeground}{HTML}{E9EDF1}",
"\\definecolor{codecomment}{HTML}{9CB49F}",
"\\definecolor{codekeyword}{HTML}{E5A86B}",
"\\definecolor{codestring}{HTML}{B8D7A3}",
"",
"\\pagecolor{bookpaper}",
"\\color{bookink}",
"\\setlength{\\parindent}{0pt}",
"\\setlength{\\parskip}{0.62em}",
"\\setlength{\\abovedisplayskip}{0.9em}",
"\\setlength{\\belowdisplayskip}{0.9em}",
"\\linespread{1.08}",
"\\raggedbottom",
"\\clubpenalty=10000",
"\\widowpenalty=10000",
"\\displaywidowpenalty=10000",
"\\emergencystretch=2em",
"\\setcounter{tocdepth}{3}",
"\\setcounter{secnumdepth}{3}",
"\\renewcommand{\\contentsname}{Contents}",
"\\setlist{itemsep=0.25em, topsep=0.45em, parsep=0pt}",
```

Move `\hypersetup` below the color definitions and replace the browser-blue
link colors with:

```ts
"\\hypersetup{",
"  colorlinks=true,",
"  linkcolor=bookaccent,",
"  urlcolor=bookaccent,",
"  citecolor=bookaccent",
"}",
```

Define the user environment without a boxed body:

```ts
"\\newenvironment{readerquestion}{",
"  \\par\\bigskip",
"  \\begingroup",
"  \\setlength{\\leftskip}{1.3em}",
"  \\setlength{\\rightskip}{0.6em}",
"  \\noindent\\textcolor{questionaccent}{\\rule{22mm}{1.2pt}}",
"  \\par\\smallskip",
"  {\\sffamily\\scriptsize\\bfseries\\color{questionaccent}\\MakeUppercase{Reader's question}}",
"  \\par\\smallskip",
"  \\sffamily\\color{questiontext}",
"}{",
"  \\par\\endgroup\\bigskip",
"}",
```

Define the custom page style with core LaTeX commands. The two `\parbox`
instances contain only short header metadata, never message content:

```ts
"\\makeatletter",
"\\newcommand{\\chatbooktitle}{}",
"\\newcommand{\\setchatbooktitle}[1]{\\renewcommand{\\chatbooktitle}{#1}}",
"\\renewcommand{\\sectionmark}[1]{\\markright{#1}}",
"\\def\\ps@chatbook{",
"  \\def\\@oddhead{%",
"    \\parbox[b]{0.46\\textwidth}{\\raggedright\\sffamily\\scriptsize\\color{bookmuted}\\chatbooktitle}%",
"    \\hfill%",
"    \\parbox[b]{0.46\\textwidth}{\\raggedleft\\sffamily\\scriptsize\\color{bookmuted}\\rightmark}%",
"  }",
"  \\def\\@evenhead{\\@oddhead}",
"  \\def\\@oddfoot{%",
"    \\sffamily\\scriptsize\\color{bookmuted}Chat2TeX%",
"    \\hfill\\thepage%",
"  }",
"  \\def\\@evenfoot{\\@oddfoot}",
"}",
"\\makeatother",
```

Customize section typography using core `\@startsection` definitions:

```ts
"\\makeatletter",
"\\renewcommand\\section{\\@startsection{section}{1}{\\z@}%",
"  {-3.2ex \\@plus -1ex \\@minus -.2ex}%",
"  {1.4ex \\@plus .2ex}%",
"  {\\normalfont\\sffamily\\LARGE\\bfseries\\color{bookink}}}",
"\\renewcommand\\subsection{\\@startsection{subsection}{2}{\\z@}%",
"  {-2.8ex \\@plus -1ex \\@minus -.2ex}%",
"  {1ex \\@plus .2ex}%",
"  {\\normalfont\\sffamily\\Large\\bfseries\\color{bookaccent}}}",
"\\renewcommand\\subsubsection{\\@startsection{subsubsection}{3}{\\z@}%",
"  {-2.3ex \\@plus -1ex \\@minus -.2ex}%",
"  {.8ex \\@plus .2ex}%",
"  {\\normalfont\\sffamily\\normalsize\\bfseries\\color{bookaccent}}}",
"\\makeatother",
```

- [ ] **Step 5: Remove the obsolete message-header calls**

Use the approved role treatment immediately so the Task 1 document is valid
even before heading context is added in Task 2:

```ts
private renderMessage(message: ChatMessageAst): string {
  const content = message.blocks
    .map((block) => this.renderBlock(block))
    .filter(Boolean)
    .join("\n\n");

  const renderedContent = content || "\\emph{Empty message}";

  if (message.role === "user") {
    return [
      "\\begin{readerquestion}",
      renderedContent,
      "\\end{readerquestion}",
    ].join("\n");
  }

  return [renderedContent, "\\par\\bigskip"].join("\n");
}
```

- [ ] **Step 6: Run the focused test and verify the shell passes**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: every existing generator test passes with the new complete-document
assertions. Role-specific hierarchy, code styling, and wrapping-table tests are
added only in Tasks 2–4.

- [ ] **Step 7: Record the no-commit checkpoint**

Run:

```bash
git diff --check
git diff -- src/features/latex/latex-generator.ts tests/features/latex/latex-generator.test.ts
```

Expected: no whitespace errors; diff contains only the document-shell work for
this task.

---

### Task 2: Role-aware narrative and heading hierarchy

**Files:**
- Modify: `tests/features/latex/latex-generator.test.ts`
- Modify: `src/features/latex/latex-generator.ts:131-315`

**Interfaces:**
- Consumes: `ChatMessageAst.role`, nested `BlockNode` structures, and all
  `InlineNode` variants from the existing AST.
- Produces:

```ts
interface BlockRenderContext {
  numberedHeadings: boolean;
  headingBaseLevel: number;
}
```

and these method signatures:

```ts
private renderBlock(block: BlockNode, context: BlockRenderContext): string
private renderHeading(
  level: number,
  children: InlineNode[],
  context: BlockRenderContext,
): string
private renderList(block: ListBlock, context: BlockRenderContext): string
private renderPlainInlineNodes(nodes: InlineNode[]): string
private renderPlainInlineNode(node: InlineNode): string
```

- [ ] **Step 1: Add a failing role-and-heading test fixture**

Add this test without changing the shared `createDocument()` fixture:

```ts
it("renders user prompts as questions and assistant headings as book sections", () => {
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
            type: "heading",
            level: 1,
            children: [{ type: "text", value: "User heading" }],
          },
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
            level: 1,
            children: [
              { type: "text", value: "Architecture " },
              { type: "inline-code", value: "v2" },
            ],
          },
          {
            type: "heading",
            level: 4,
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

  expect(result.source).toContain("\\begin{readerquestion}");
  expect(result.source).toContain("\\section*{User heading}");
  expect(result.source).toContain("How does this work?");
  expect(result.source).toContain("\\end{readerquestion}");
  expect(result.source).toContain(
    "\\section[Architecture v2]{Architecture \\texttt{v2}}",
  );
  expect(result.source).toContain("\\paragraph*{Implementation note}");
  expect(result.source).toContain("Narrative response.");
  expect(result.source).not.toContain("Assistant}");
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: FAIL because messages still share one header treatment, renderers do
not receive role context, and all headings are currently starred.

- [ ] **Step 3: Introduce the render context and role-specific message output**

Add the interface near the imports:

```ts
interface BlockRenderContext {
  numberedHeadings: boolean;
  headingBaseLevel: number;
}
```

Replace `renderMessage()` with:

```ts
private renderMessage(
  message: ChatMessageAst,
  assistantHeadingBaseLevel: number,
): string {
  const context: BlockRenderContext = {
    numberedHeadings: message.role === "assistant",
    headingBaseLevel: assistantHeadingBaseLevel,
  };

  const content = message.blocks
    .map((block) => this.renderBlock(block, context))
    .filter(Boolean)
    .join("\n\n");

  const renderedContent = content || "\\emph{Empty message}";

  if (message.role === "user") {
    return [
      "\\begin{readerquestion}",
      renderedContent,
      "\\end{readerquestion}",
    ].join("\n");
  }

  return [renderedContent, "\\par\\bigskip"].join("\n");
}
```

Change `renderBlock()` to require `context`. Pass the same context into nested
list and quote blocks:

```ts
case "heading":
  return this.renderHeading(block.level, block.children, context);

case "list":
  return this.renderList(block, context);

case "quote":
  return [
    "\\begin{quote}",
    "\\color{bookmuted}\\itshape",
    "\\noindent\\textcolor{bookaccent}{\\rule{18mm}{0.8pt}}",
    "\\par\\smallskip",
    block.blocks
      .map((child) => this.renderBlock(child, context))
      .join("\n\n"),
    "\\end{quote}",
  ].join("\n");
```

Update `renderList()` so each item calls `this.renderBlock(child, context)`.

- [ ] **Step 4: Implement numbered assistant headings and safe moving titles**

Replace `renderHeading()` with:

```ts
private renderHeading(
  level: number,
  children: InlineNode[],
  context: BlockRenderContext,
): string {
  const content = this.renderInlineNodes(children);
  const plainContent = this.renderPlainInlineNodes(children);

  const commands: Readonly<Record<number, string>> = {
    1: "section",
    2: "subsection",
    3: "subsubsection",
    4: "paragraph",
    5: "subparagraph",
  };

  const normalizedLevel = context.numberedHeadings
    ? Math.max(1, level - context.headingBaseLevel + 1)
    : level;

  const command = commands[normalizedLevel];

  if (!command) {
    return `\\textbf{${content}}`;
  }

  const canBeNumbered =
    context.numberedHeadings && normalizedLevel <= 3;

  return canBeNumbered
    ? `\\${command}[${plainContent}]{${content}}`
    : `\\${command}*{${content}}`;
}
```

Add plain inline rendering for table-of-contents and running-header arguments:

```ts
private renderPlainInlineNodes(nodes: InlineNode[]): string {
  return nodes.map((node) => this.renderPlainInlineNode(node)).join("");
}

private renderPlainInlineNode(node: InlineNode): string {
  switch (node.type) {
    case "text":
      return escapeLatexText(node.value);
    case "strong":
    case "emphasis":
    case "strike":
      return this.renderPlainInlineNodes(node.children);
    case "inline-code":
      return escapeLatexText(node.value);
    case "link":
      return (
        this.renderPlainInlineNodes(node.children) ||
        escapeLatexText(node.href)
      );
    case "inline-math":
      return escapeLatexText(node.latex);
    case "inline-image":
      return escapeLatexText(node.alt || "image");
    case "line-break":
      return " ";
  }
}
```

- [ ] **Step 5: Run focused tests and verify role-aware rendering passes**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: the new role-and-heading test passes. The complete-document test no
longer contains any `\chatmessageheader` assertion.

- [ ] **Step 6: Record the no-commit checkpoint**

Run:

```bash
git diff --check
git diff --stat
```

Expected: no whitespace errors; only the generator, its test, approved spec,
and plan are visible as tracked/untracked product changes.

---

### Task 3: Editorial code, quotes, lists, separators, and images

**Files:**
- Modify: `tests/features/latex/latex-generator.test.ts`
- Modify: `src/features/latex/latex-generator.ts`

**Interfaces:**
- Consumes: existing `renderCodeBlock()`, `renderBlockImage()`,
  `renderInlineImage()`, `registerImage()`, and the Task 2 render context.
- Produces: styled `lstlisting` output and captions for block images.

- [ ] **Step 1: Add failing assertions for editorial technical blocks**

Update the current block-rendering test and add a focused quote/image test:

```ts
it("renders editorial code, lists and math", () => {
  const generator = new LatexGenerator();

  const result = generator.generate(createDocument());

  expect(result.source).toContain(
    "\\begin{lstlisting}[language=JavaScript,title={JavaScript}]",
  );
  expect(result.source).toContain("backgroundcolor=\\color{codebackground}");
  expect(result.source).toContain("basicstyle=\\ttfamily\\footnotesize\\color{codeforeground}");
  expect(result.source).toContain("\\begin{enumerate}[start=2]");
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
          { type: "horizontal-rule" },
          {
            type: "image",
            src: "https://example.com/diagram.webp",
            alt: "System architecture",
            title: null,
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
});
```

- [ ] **Step 2: Run focused tests and verify the editorial block assertions fail**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: FAIL on listing colors/title, horizontal separator, and image
caption.

- [ ] **Step 3: Replace the global listing style**

Replace the existing `\lstset` entries with:

```ts
"\\lstset{",
"  basicstyle=\\ttfamily\\footnotesize\\color{codeforeground},",
"  keywordstyle=\\bfseries\\color{codekeyword},",
"  commentstyle=\\itshape\\color{codecomment},",
"  stringstyle=\\color{codestring},",
"  breaklines=true,",
"  breakatwhitespace=false,",
"  columns=fullflexible,",
"  keepspaces=true,",
"  showstringspaces=false,",
"  frame=single,",
"  framerule=0pt,",
"  rulecolor=\\color{codebackground},",
"  backgroundcolor=\\color{codebackground},",
"  xleftmargin=0.5em,",
"  xrightmargin=0.5em,",
"  aboveskip=0.9em,",
"  belowskip=0.9em",
"}",
```

Replace `renderCodeBlock()` with:

```ts
private renderCodeBlock(language: string | null, code: string): string {
  const listingLanguage = mapListingLanguage(language);
  const displayLanguage = listingLanguage ?? language?.trim() ?? "";

  const options = listingLanguage
    ? `[language=${listingLanguage},title={${escapeLatexText(displayLanguage)}}]`
    : "";

  const safeCode = code.replace(/\\end\{lstlisting\}/g, "\\end {lstlisting}");

  return [
    `\\begin{lstlisting}${options}`,
    safeCode,
    "\\end{lstlisting}",
  ].join("\n");
}
```

The `displayLanguage` normalization makes `js`, `ts`, and `py` display their
mapped names (`JavaScript`, `JavaScript`, and `Python`) rather than raw aliases.

- [ ] **Step 4: Implement the editorial separator and block-image caption**

Replace the horizontal-rule branch with:

```ts
case "horizontal-rule":
  return [
    "\\par\\medskip",
    "\\begin{center}",
    "\\textcolor{bookaccent}{\\rule{36mm}{0.8pt}}",
    "\\end{center}",
    "\\medskip",
  ].join("\n");
```

In `renderBlockImage()`, add a caption only when `alt.trim()` is non-empty:

```ts
const caption = alt.trim()
  ? `{\\small\\itshape\\color{bookmuted}${escapeLatexText(alt.trim())}\\par}`
  : "";

return [
  "\\begin{center}",
  `\\IfFileExists{${asset.outputPath}}{`,
  "  \\includegraphics[",
  "    width=\\linewidth,",
  "    height=0.7\\textheight,",
  "    keepaspectratio",
  `  ]{${asset.outputPath}}`,
  caption ? "  \\par\\smallskip" : "",
  caption ? `  ${caption}` : "",
  "}{",
  "  \\fbox{",
  "    \\parbox{0.85\\linewidth}{",
  `      ${safeAlt}`,
  "    }",
  "  }",
  "}",
  "\\end{center}",
].filter(Boolean).join("\n");
```

The `\parbox` remains restricted to the small missing-image placeholder; it
does not contain a message body or a downloaded image.

- [ ] **Step 5: Run focused tests and verify editorial blocks pass**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: all code, quote, separator, image-caption, asset-order, and escaping
tests pass.

- [ ] **Step 6: Record the no-commit checkpoint**

Run:

```bash
git diff --check
git diff --stat
```

Expected: no whitespace errors.

---

### Task 4: Wrapping long tables with repeated headers

**Files:**
- Modify: `tests/features/latex/latex-generator.test.ts`
- Modify: `src/features/latex/latex-generator.ts:244-286`

**Interfaces:**
- Consumes: existing `TableBlock` rows and inline cell rendering.
- Produces: equal-width `longtable` paragraph columns and repeated header rows.

- [ ] **Step 1: Replace the old `ll` assertion with failing wrapping-table assertions**

Add these assertions to the block-rendering test:

```ts
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
```

Remove the old `expect(result.source).toContain("\\begin{longtable}{ll}")`.

- [ ] **Step 2: Run focused tests and verify the table test fails**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: FAIL because the generator still emits one `l` per column and does
not repeat headers.

- [ ] **Step 3: Generate equal-width paragraph columns**

Inside `renderTable()`, replace:

```ts
const columnDefinition = "l".repeat(columnCount);
```

with:

```ts
const columnWidth =
  `p{\\dimexpr(\\linewidth-${columnCount * 2}\\tabcolsep)` +
  `/${columnCount}\\relax}`;

const columnDefinition = columnWidth.repeat(columnCount);
```

- [ ] **Step 4: Separate and repeat a semantic header row**

Refactor row creation so the first all-header row is reusable:

```ts
const renderedRows = block.rows.map((row) => {
  const cells = Array.from({ length: columnCount }, (_, columnIndex) => {
    const cell = row.cells[columnIndex];

    if (!cell) {
      return "";
    }

    const content = this.renderInlineNodes(cell.children);

    return cell.header ? `\\textbf{${content}}` : content;
  });

  return `${cells.join(" & ")} \\\\`;
});

const firstRow = block.rows[0];
const hasHeader =
  firstRow.cells.length > 0 &&
  firstRow.cells.every((cell) => cell.header);

const header = hasHeader ? renderedRows[0] : null;
const bodyRows = hasHeader ? renderedRows.slice(1) : renderedRows;

return [
  `\\begin{longtable}{${columnDefinition}}`,
  "\\toprule",
  ...(header
    ? [
        header,
        "\\midrule",
        "\\endfirsthead",
        "\\toprule",
        header,
        "\\midrule",
        "\\endhead",
      ]
    : []),
  ...bodyRows,
  "\\bottomrule",
  "\\end{longtable}",
].join("\n");
```

- [ ] **Step 5: Run focused tests and verify wrapping tables pass**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: every generator test passes, including a two-column wrapping
definition and repeated header.

- [ ] **Step 6: Record the no-commit checkpoint**

Run:

```bash
git diff --check
git diff --stat
```

Expected: no whitespace errors.

---

### Task 5: Memory-safety regression and complete verification

**Files:**
- Modify: `tests/features/latex/latex-generator.test.ts`
- Verify: all source and tests

**Interfaces:**
- Consumes: all output produced by Tasks 1–4.
- Produces: regression evidence for the approved spec and a clean build.

- [ ] **Step 1: Strengthen the memory-safety regression test**

Replace the existing memory-heavy-box test body with:

```ts
it("keeps complete message bodies outside memory-heavy boxes", () => {
  const generator = new LatexGenerator();

  const result = generator.generate(createDocument());

  expect(result.source).not.toContain("\\usepackage[most]{tcolorbox}");
  expect(result.source).not.toContain("\\newtcolorbox");
  expect(result.source).not.toContain("\\begin{chatmessage}");
  expect(result.source).not.toContain("\\begin{minipage}");
  expect(result.source).toContain("\\begin{readerquestion}");
  expect(result.source).toContain("\\begingroup");
  expect(result.source).toContain("\\par\\endgroup\\bigskip");
});
```

Do not forbid the small `\parbox` used exclusively by the missing-image
placeholder.

- [ ] **Step 2: Run the focused test file**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: all tests in the file pass with zero failures.

- [ ] **Step 3: Run the complete automated verification**

Run:

```bash
pnpm test
pnpm compile
pnpm build
git diff --check
```

Expected:

- all Vitest files pass;
- `tsc --noEmit` exits 0;
- WXT produces the Chrome MV3 extension;
- `git diff --check` emits no errors.

- [ ] **Step 4: Inspect generated source invariants**

Run:

```bash
rg -n "tcolorbox|newtcolorbox|begin\\{chatmessage\\}|begin\\{minipage\\}" \
  src/features/latex/latex-generator.ts \
  tests/features/latex/latex-generator.test.ts
```

Expected: matches occur only in negative regression assertions; production
generator code contains none of the forbidden whole-message constructs.

Run:

```bash
rg -n "titlepage|tableofcontents|readerquestion|ps@chatbook|longtable" \
  src/features/latex/latex-generator.ts
```

Expected: the generator contains each approved Editorial Book component.

- [ ] **Step 5: Perform the manual long-document export check**

Reload the unpacked extension and the ChatGPT conversation tab, then export a
conversation that includes:

1. at least three heading levels;
2. a user prompt longer than one page;
3. an assistant response longer than five pages;
4. a long code listing;
5. a table with long cell content;
6. display mathematics;
7. at least one image and one unavailable image.

Confirm:

- cover and contents appear in the correct order;
- contents page numbers resolve after BusyTeX compilation;
- body numbering restarts at Arabic page 1;
- running header shows the conversation and current section;
- user content can break across pages;
- assistant content reads without a repeated banner;
- code and tables cross pages without clipping;
- image caption and missing-image fallback both render;
- compilation does not report `TeX capacity exceeded`;
- omitted-image warnings and full logs still work.

- [ ] **Step 6: Final no-commit handoff**

Run:

```bash
git status --short
git diff --stat
```

Expected: the approved design spec, this plan, generator implementation, and
generator tests are present as uncommitted changes. Do not run `git commit`.
