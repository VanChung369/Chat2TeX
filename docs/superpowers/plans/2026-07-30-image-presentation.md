# Image Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every collected conversation image while rendering content images without upscaling and citation/favicon images as compact icons.

**Architecture:** Classify images at the ChatGPT DOM boundary and persist the presentation through a `data-chattex-image-presentation` attribute. Parse that attribute into the document AST, then let the LaTeX generator render content images and icon groups with separate size rules. API-first enrichment deduplicates images without discarding either presentation.

**Tech Stack:** TypeScript 5.9, WXT, DOM APIs, Vitest/jsdom, LaTeX `graphicx` and `adjustbox`, BusyTeX XeLaTeX WASM.

## Global Constraints

- Never drop a collected image because it is a favicon, citation image, logo, or small raster.
- Content images keep their aspect ratio, render at natural size when they fit, and only scale down beyond `\linewidth` or `0.7\textheight`.
- Icon images render in a compact row with maximum height `1.4em`.
- Failed content images use a compact framed fallback; failed icons use a small text fallback.
- Preserve both image kinds in the generated source package.
- Do not commit; leave all changes in the current working tree for user review.
- Do not redesign the broader PDF template or popup in this plan.

---

### Task 1: Retain and classify mounted images

**Files:**
- Modify: `src/features/chat/image-eligibility.ts`
- Modify: `src/features/chat/chatgpt-adapter.ts:217-251`
- Modify: `src/features/chat/complete-conversation-reader.ts:96-123`
- Test: `tests/features/chat/chatgpt-adapter.test.ts`
- Test: `tests/features/chat/complete-conversation-reader.test.ts`

**Interfaces:**
- Produces: `type ChatImagePresentation = "content" | "icon"`.
- Produces: `classifyChatImage(imageElement: HTMLImageElement): ChatImagePresentation`.
- Produces: `classifyImageSource(source: string): ChatImagePresentation`.
- Produces: DOM attribute `data-chattex-image-presentation="content|icon"`.

- [ ] **Step 1: Replace the favicon-removal expectations with failing retention and classification tests**

Update the adapter regression test to assert that both images remain and receive distinct presentation attributes:

```ts
const [message] = new ChatGPTAdapter(
  testDocument,
).extractMountedMessages();

expect(message.html).toContain(
  'data-chattex-image-presentation="icon"',
);
expect(message.html).toContain(
  "https://www.google.com/s2/favicons",
);
expect(message.html).not.toContain(
  'data-chattex-image-presentation="content"',
);
```

Keep the existing generated-image test and add:

```ts
expect(conversation.messages[0].html).toContain(
  'data-chattex-image-presentation="content"',
);
```

Update the complete-reader fixture to contain one normal image and one favicon, then assert both survive exactly once:

```ts
expect(result.messages[3].html.match(/final\.png/g)).toHaveLength(1);
expect(result.messages[3].html.match(/s2\/favicons/g)).toHaveLength(1);
expect(result.messages[3].html).toContain(
  'data-chattex-image-presentation="icon"',
);
```

- [ ] **Step 2: Run the chat tests and verify the new expectations fail**

Run:

```bash
pnpm exec vitest run \
  tests/features/chat/chatgpt-adapter.test.ts \
  tests/features/chat/complete-conversation-reader.test.ts
```

Expected: FAIL because the current adapter removes decorative images and the complete reader skips favicon sources.

- [ ] **Step 3: Convert image eligibility from deletion to classification**

Replace the boolean removal API in `image-eligibility.ts` with:

```ts
export type ChatImagePresentation = "content" | "icon";

export const CHATTEX_IMAGE_PRESENTATION_ATTRIBUTE =
  "data-chattex-image-presentation";

export function classifyChatImage(
  imageElement: HTMLImageElement,
): ChatImagePresentation {
  const source = readImageSource(imageElement);

  if (classifyImageSource(source) === "icon") {
    return "icon";
  }

  const citationContainer = imageElement.closest(
    [
      '[data-testid*="citation" i]',
      '[data-testid*="link-preview" i]',
    ].join(","),
  );

  return !imageElement.alt.trim() && citationContainer
    ? "icon"
    : "content";
}

export function classifyImageSource(
  source: string,
): ChatImagePresentation {
  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    return FAVICON_HOSTS.has(host) ||
      path === "/favicon.ico" ||
      path.includes("/s2/favicons") ||
      path.includes("/faviconv2")
      ? "icon"
      : "content";
  } catch {
    return "content";
  }
}
```

- [ ] **Step 4: Annotate every adapter image instead of removing decorative images**

In `cloneAndCleanContent`, replace the removal loop with:

```ts
clone
  .querySelectorAll<HTMLImageElement>("img")
  .forEach((imageElement) => {
    imageElement.setAttribute(
      CHATTEX_IMAGE_PRESENTATION_ATTRIBUTE,
      classifyChatImage(imageElement),
    );
  });
```

When cloning an image from outside the Markdown candidate, set both attributes:

```ts
imageClone.setAttribute("src", sourceUrl);
imageClone.setAttribute(
  CHATTEX_IMAGE_PRESENTATION_ATTRIBUTE,
  classifyChatImage(imageElement),
);
```

Do not use presentation as a reason to skip the image.

- [ ] **Step 5: Preserve and annotate both image kinds during API enrichment**

Remove `isFaviconSource(source)` from the skip condition. Before appending a mounted image clone:

```ts
const imageClone = image.cloneNode(true) as HTMLImageElement;
const presentation =
  image.getAttribute(CHATTEX_IMAGE_PRESENTATION_ATTRIBUTE) ??
  classifyImageSource(source);

imageClone.setAttribute(
  CHATTEX_IMAGE_PRESENTATION_ATTRIBUTE,
  presentation,
);
apiTemplate.content.append(imageClone);
```

Deduplication remains source-URL based.

- [ ] **Step 6: Run the chat tests and verify retention and classification pass**

Run:

```bash
pnpm exec vitest run \
  tests/features/chat/chatgpt-adapter.test.ts \
  tests/features/chat/complete-conversation-reader.test.ts
```

Expected: both test files pass; generated images are `content`, favicon/citation images are `icon`, and neither is removed.

- [ ] **Step 7: Review the task diff**

Run:

```bash
git diff --check
git diff -- \
  src/features/chat/image-eligibility.ts \
  src/features/chat/chatgpt-adapter.ts \
  src/features/chat/complete-conversation-reader.ts \
  tests/features/chat/chatgpt-adapter.test.ts \
  tests/features/chat/complete-conversation-reader.test.ts
```

Expected: no whitespace errors and no image-deletion branch remains.

---

### Task 2: Carry image presentation through the document AST

**Files:**
- Modify: `src/features/document/ast.ts:75-86`
- Modify: `src/features/document/html-to-ast.ts:184-201`
- Test: `tests/features/document/html-to-ast.test.ts`

**Interfaces:**
- Consumes: `data-chattex-image-presentation="content|icon"`.
- Produces: `type ImagePresentation = "content" | "icon"`.
- Produces: `ImageBlock.presentation: ImagePresentation`.

- [ ] **Step 1: Write a failing AST test for both image presentations**

Add a parser test with literal expected nodes:

```ts
expect(
  parser.parseHtml(`
    <img
      src="https://example.com/diagram.png"
      alt="Architecture"
      data-chattex-image-presentation="content"
    />
    <img
      src="https://www.google.com/s2/favicons?domain=example.com"
      alt=""
      data-chattex-image-presentation="icon"
    />
  `),
).toEqual([
  {
    type: "image",
    src: "https://example.com/diagram.png",
    alt: "Architecture",
    title: null,
    presentation: "content",
  },
  {
    type: "image",
    src: "https://www.google.com/s2/favicons?domain=example.com",
    alt: "",
    title: null,
    presentation: "icon",
  },
]);
```

Add a defaulting assertion for legacy HTML without the attribute:

```ts
expect(parser.parseHtml('<img src="legacy.png" alt="Legacy" />')).toEqual([
  expect.objectContaining({ presentation: "content" }),
]);
```

- [ ] **Step 2: Run the AST tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/features/document/html-to-ast.test.ts
```

Expected: FAIL because `ImageBlock` and the parser do not expose `presentation`.

- [ ] **Step 3: Add the presentation type and parser normalization**

In `ast.ts`:

```ts
export type ImagePresentation = "content" | "icon";

export interface ImageBlock {
  type: "image";
  src: string;
  alt: string;
  title: string | null;
  presentation: ImagePresentation;
}
```

In `html-to-ast.ts`, add:

```ts
function readImagePresentation(
  element: HTMLElement,
): ImagePresentation {
  return element.getAttribute("data-chattex-image-presentation") === "icon"
    ? "icon"
    : "content";
}
```

Set `presentation: readImagePresentation(element)` when parsing a block image.
Inline images keep their existing `InlineImage` representation because they
already render at text height.

- [ ] **Step 4: Update existing ImageBlock fixtures**

Add `presentation: "content"` to every literal `ImageBlock` fixture in:

```text
tests/features/latex/latex-generator.test.ts
tests/features/document/html-to-ast.test.ts
```

Do not change inline-image fixtures.

- [ ] **Step 5: Run AST and generator type-facing tests**

Run:

```bash
pnpm exec vitest run \
  tests/features/document/html-to-ast.test.ts \
  tests/features/latex/latex-generator.test.ts
```

Expected: both test files pass with the new required AST field.

- [ ] **Step 6: Review the task diff**

Run:

```bash
git diff --check
git diff -- \
  src/features/document/ast.ts \
  src/features/document/html-to-ast.ts \
  tests/features/document/html-to-ast.test.ts \
  tests/features/latex/latex-generator.test.ts
```

Expected: every block image has an explicit or parser-defaulted presentation.

---

### Task 3: Render content images and compact icon rows

**Files:**
- Modify: `src/features/latex/latex-generator.ts:430-610`
- Modify: `src/features/latex/latex-generator.ts:880-930`
- Test: `tests/features/latex/latex-generator.test.ts`

**Interfaces:**
- Consumes: `ImageBlock.presentation`.
- Produces: `renderBlocks(blocks, context)` that groups adjacent icon images.
- Produces: content-image LaTeX with `max width=\linewidth` and `max height=0.7\textheight`.
- Produces: icon-row LaTeX with `max width=1.4em` and `max height=1.4em`.

- [ ] **Step 1: Write failing generator tests for content and icon behavior**

Retain the existing content-image assertions:

```ts
expect(result.source).toContain("    max width=\\linewidth,");
expect(result.source).toContain("    max height=0.7\\textheight,");
expect(result.source).not.toContain("    width=\\linewidth,");
```

Add a document with two adjacent icon blocks and assert:

```ts
expect(result.source).toContain("\\begin{chattexiconrow}");
expect(result.source).toContain("max width=1.4em");
expect(result.source).toContain("max height=1.4em");
expect(result.source.match(/\\begin{chattexiconrow}/g)).toHaveLength(1);
expect(result.assets).toHaveLength(2);
```

Add an icon fallback assertion:

```ts
expect(result.source).toContain("\\texttt{[icon unavailable]}");
```

- [ ] **Step 2: Run the generator tests and verify the icon-row test fails**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: FAIL because icons still use block-image rendering and no
`chattexiconrow` environment exists.

- [ ] **Step 3: Add a compact icon-row environment to the preamble**

Add these lines after the global image packages:

```ts
"\\newenvironment{chattexiconrow}{%",
"  \\par\\smallskip\\noindent\\centering\\begingroup%",
"}{%",
"  \\par\\endgroup\\smallskip%",
"}",
```

The environment provides compact spacing without forcing a page break.

- [ ] **Step 4: Group adjacent icon blocks**

Add:

```ts
private renderBlocks(
  blocks: BlockNode[],
  context: BlockRenderContext,
): string {
  const rendered: string[] = [];
  let icons: ImageBlock[] = [];

  const flushIcons = (): void => {
    if (icons.length === 0) {
      return;
    }

    rendered.push(this.renderIconRow(icons));
    icons = [];
  };

  for (const block of blocks) {
    if (block.type === "image" && block.presentation === "icon") {
      icons.push(block);
      continue;
    }

    flushIcons();

    const output = this.renderBlock(block, context);
    if (output) {
      rendered.push(output);
    }
  }

  flushIcons();
  return rendered.join("\n\n");
}
```

Use `renderBlocks` in `renderMessage`, quote rendering, and list-item rendering
so nested adjacent icons receive the same behavior.

- [ ] **Step 5: Render each icon at compact scale and retain its asset**

Add:

```ts
private renderIconRow(images: ImageBlock[]): string {
  const icons = images.map((image) => {
    const asset = this.registerImage(image.src, image.alt);

    return [
      `\\IfFileExists{${asset.outputPath}}{`,
      "  \\includegraphics[",
      "    max width=1.4em,",
      "    max height=1.4em,",
      "    keepaspectratio",
      `  ]{${asset.outputPath}}`,
      "}{",
      "  \\texttt{[icon unavailable]}",
      "}",
    ].join("\n");
  });

  return [
    "\\begin{chattexiconrow}",
    icons.join("\\hspace{0.55em plus 0.2em}\\allowbreak\n"),
    "\\end{chattexiconrow}",
  ].join("\n");
}
```

Route only `presentation === "content"` through `renderBlockImage`.

- [ ] **Step 6: Keep content-image rendering scale-down-only**

Ensure `renderBlockImage` contains:

```ts
"  \\includegraphics[",
"    max width=\\linewidth,",
"    max height=0.7\\textheight,",
"    keepaspectratio",
```

Keep the existing centered caption. Replace its missing-file box width with a
compact maximum:

```ts
"    \\parbox{0.65\\linewidth}{",
```

This avoids a large empty-looking fallback without changing asset download
diagnostics.

- [ ] **Step 7: Run generator and asset tests**

Run:

```bash
pnpm exec vitest run \
  tests/features/latex/latex-generator.test.ts \
  tests/features/assets/asset-manager.test.ts \
  tests/features/assets/page-image-reader.test.ts
```

Expected: all tests pass; both icon assets remain registered and content images
use only maximum dimensions.

- [ ] **Step 8: Compile a BusyTeX smoke document containing both presentations**

Use the existing browser BusyTeX diagnostic pattern to compile generated
LaTeX containing one 32×32 icon and one content image. The result assertion is:

```json
{
  "success": true,
  "exitCode": 0,
  "diagnostics": []
}
```

Inspect the generated source before compilation and confirm it contains one
`chattexiconrow`, `max height=1.4em`, and
`max height=0.7\textheight`.

- [ ] **Step 9: Review the task diff**

Run:

```bash
git diff --check
git diff -- \
  src/features/latex/latex-generator.ts \
  tests/features/latex/latex-generator.test.ts
```

Expected: no forced block width remains and no icon source is omitted.

---

### Task 4: Full verification and extension build

**Files:**
- Verify: all modified source and test files
- Build output: `.output/chrome-mv3`

**Interfaces:**
- Consumes: completed image classification, AST, and LaTeX rendering tasks.
- Produces: a reloadable Chrome MV3 extension build.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
pnpm test
```

Expected: all test files pass with zero failed tests.

- [ ] **Step 2: Run TypeScript validation**

Run:

```bash
pnpm compile
```

Expected: exit code 0 with no TypeScript diagnostics.

- [ ] **Step 3: Build the production extension**

Run:

```bash
pnpm build
```

Expected: WXT reports `Built extension` and writes
`.output/chrome-mv3/content-scripts/chatgpt.js`.

- [ ] **Step 4: Verify the production bundle contains both image paths**

Run:

```bash
rg -n \
  'data-chattex-image-presentation|chattexiconrow|max height=1\\.4em|max height=0\\.7' \
  .output/chrome-mv3/content-scripts/chatgpt.js
```

Expected: the built content script contains classification, compact icon-row,
and scale-down-only content-image logic.

- [ ] **Step 5: Inspect the final working-tree scope**

Run:

```bash
git status --short
git diff --check
```

Expected: no temporary BusyTeX harness remains, no whitespace errors exist,
and no commit has been created.
