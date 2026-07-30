# Vietnamese and Complete Conversation Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export every available ChatGPT message section, build navigation from user questions, render Vietnamese correctly, and produce colorful high-contrast code blocks.

**Architecture:** Keep DOM extraction, virtualized collection, export preparation, and LaTeX rendering in their existing modules. Add an explicit conversation-start signal between the adapter and collector, move prepared-export assembly into a testable pure function, and make `LatexGenerator` language- and question-hierarchy-aware without changing its public `generate(ChatDocumentAst)` signature.

**Tech Stack:** TypeScript 5.9, Vitest 4, React 19, WXT Chrome MV3, XeLaTeX through BusyTeX WebAssembly, LaTeX `fontspec`, conditional `polyglossia`, and `listings`.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-30-vietnamese-complete-export-design.md`.
- Do not add a runtime dependency or an online service.
- Do not use `minted`, Python, Pygments, or shell escape.
- Keep the existing compiler, asset pipeline, archive format, and image failure behavior.
- Keep `LatexGenerator.generate(ChatDocumentAst)` and the LaTeX asset request format unchanged.
- Keep complete messages outside `tcolorbox`, `minipage`, `parbox`, and equivalent whole-message containers.
- Preserve message order and content without summarizing or rewriting it.
- Work directly in the current checkout.
- Do not create a worktree.
- Do not create commits; use focused tests, `git diff --check`, and status checkpoints.

---

## File Map

- Modify `src/features/chat/chatgpt-adapter.ts`
  - Extract all non-nested message-content containers and expose the first-turn signal.
- Modify `src/features/chat/conversation-collector.ts`
  - Require the first-turn signal before accepting stable top snapshots.
- Modify `tests/features/chat/chatgpt-adapter.test.ts`
  - Cover sibling content containers, nested de-duplication, and start-state detection.
- Modify `tests/features/chat/conversation-collector.test.ts`
  - Cover delayed first-turn arrival, unknown-marker fallback, progress, and restoration.
- Create `src/features/export/prepare-conversation-export.ts`
  - Convert a collected conversation into `PreparedExport`.
- Create `tests/features/export/prepare-conversation-export.test.ts`
  - Verify message count and existing generator output.
- Modify `src/features/export/types.ts`
  - Add `messageCount` to `PreparedExport`.
- Modify `entrypoints/chatgpt.content.ts`
  - Use the new prepared-export function.
- Modify `entrypoints/popup/App.tsx`
  - Show the final collected message count before compilation.
- Modify `src/features/latex/latex-generator.ts`
  - Add language detection, localization, question navigation, heading offsets, and colorful Vietnamese-safe listings.
- Modify `tests/features/latex/latex-generator.test.ts`
  - Cover Vietnamese, question-based contents, truncation, assistant-only fallback, and code styling.
- Update `docs/superpowers/specs/2026-07-30-editorial-book-pdf-design.md`
  - Reconcile the original Editorial Book hierarchy with question-based navigation.

---

### Task 1: Preserve Every Message Content Container

**Files:**
- Modify: `tests/features/chat/chatgpt-adapter.test.ts`
- Modify: `src/features/chat/chatgpt-adapter.ts:112-214`

**Interfaces:**
- Consumes: `CONTENT_SELECTOR`, `NOISY_ELEMENT_SELECTOR`, and the existing `ChatMessage` shape.
- Produces: unchanged `ChatGPTAdapter.extractMountedMessages(): ChatMessage[]`; each `html` value contains every retained top-level content container exactly once.

- [ ] **Step 1: Add failing tests for sibling content and nested de-duplication**

Add these tests:

```ts
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

  const [message] = new ChatGPTAdapter(testDocument).extractMountedMessages();

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

  const [message] = new ChatGPTAdapter(testDocument).extractMountedMessages();

  expect(message.html.match(/Nested once/g)).toHaveLength(1);
});
```

- [ ] **Step 2: Run the adapter test and verify RED**

Run:

```bash
pnpm exec vitest run tests/features/chat/chatgpt-adapter.test.ts
```

Expected: the sibling test fails because only `First section` is present.

- [ ] **Step 3: Replace the single-element selection with top-level candidate collection**

In `createMessage()`, replace the `querySelector()` selection and call the
cleaner with the message element:

```ts
const cleanedContent = this.cloneAndCleanContent(messageElement);
```

Replace the first part of `cloneAndCleanContent()` with:

```ts
private cloneAndCleanContent(messageElement: HTMLElement): HTMLElement {
  const candidates = Array.from(
    messageElement.querySelectorAll<HTMLElement>(CONTENT_SELECTOR),
  );

  const topLevelCandidates = candidates.filter(
    (candidate) =>
      !candidates.some(
        (other) => other !== candidate && other.contains(candidate),
      ),
  );

  const sourceElements =
    topLevelCandidates.length > 0 ? topLevelCandidates : [messageElement];

  const clone = this.documentRef.createElement("div");

  for (const sourceElement of sourceElements) {
    clone.append(sourceElement.cloneNode(true));
  }
```

Keep the existing noisy-element removal, retained-image detection, image
append logic, and final `return clone`.

- [ ] **Step 4: Run the adapter test and verify GREEN**

Run:

```bash
pnpm exec vitest run tests/features/chat/chatgpt-adapter.test.ts
```

Expected: all adapter tests pass and both new tests preserve content once.

- [ ] **Step 5: Check the task diff**

Run:

```bash
git diff --check
git diff -- src/features/chat/chatgpt-adapter.ts tests/features/chat/chatgpt-adapter.test.ts
```

Expected: no whitespace errors; only complete-content extraction and its tests
changed.

---

### Task 2: Wait for the Real Beginning of Virtualized Conversations

**Files:**
- Modify: `src/features/chat/conversation-collector.ts:8-114`
- Modify: `src/features/chat/chatgpt-adapter.ts:45-110`
- Modify: `tests/features/chat/conversation-collector.test.ts`
- Modify: `tests/features/chat/chatgpt-adapter.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ConversationReader {
  extractMountedMessages(): ChatMessage[];
  extractConversation(): ChatConversation;
  hasConversationStart(): boolean | null;
}

export interface CollectionProgress {
  pass: number;
  collectedMessages: number;
  mountedMessages: number;
  reachedTop: boolean;
  conversationStartFound: boolean | null;
}

export interface ConversationCollectorOptions {
  maxPasses?: number;
  stableTopPasses?: number;
  unknownTopPasses?: number;
  topTolerance?: number;
}
```

- `true` means turn zero is mounted, `false` means numbered turn markers exist
  without turn zero, and `null` means reliable numbered markers are absent.

- [ ] **Step 1: Add failing adapter tests for the tri-state start signal**

Add:

```ts
it("reports whether the first numbered conversation turn is mounted", () => {
  const firstTurn = createTestDocument(`
    <article data-testid="conversation-turn-0"></article>
    <article data-testid="conversation-turn-1"></article>
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
```

- [ ] **Step 2: Add a failing delayed-start collector test**

Extend `FakeReader` so its constructor accepts:

```ts
private readonly startStates: Array<boolean | null> = [true]
```

and add:

```ts
private startStateIndex = 0;

hasConversationStart(): boolean | null {
  const state =
    this.startStates[
      Math.min(this.startStateIndex, this.startStates.length - 1)
    ] ?? null;

  this.startStateIndex += 1;

  if (state === true) {
    this.viewport.currentPage = this.viewport.pages.length - 1;
  }

  return state;
}
```

Add the test:

```ts
it("does not stop at a stable top before turn zero appears", async () => {
  const viewport = new FakeViewport(
    [
      {
        viewport: { scrollTop: 0, scrollHeight: 900, clientHeight: 300 },
        messages: [createMessage(4, "user"), createMessage(5, "assistant")],
      },
      {
        viewport: { scrollTop: 0, scrollHeight: 1_400, clientHeight: 300 },
        messages: [
          createMessage(0, "user"),
          createMessage(1, "assistant"),
          createMessage(2, "user"),
          createMessage(3, "assistant"),
        ],
      },
    ],
    { scrollTop: 200, scrollHeight: 900, clientHeight: 300 },
  );

  viewport.currentPage = -1;

  const reader = new FakeReader(viewport, [false, false, false, true, true]);
  const collector = new ConversationCollector(reader, viewport, {
    stableTopPasses: 1,
    unknownTopPasses: 3,
    maxPasses: 20,
  });

  const conversation = await collector.collect();

  expect(conversation.messages.map((message) => message.order)).toEqual([
    0, 1, 2, 3, 4, 5,
  ]);
});
```

Also add `hasConversationStart(): boolean | null { return true; }` to any
remaining `ConversationReader` test double that does not use the extended
`FakeReader`.

- [ ] **Step 3: Add a failing unknown-marker fallback test**

Add:

```ts
it("uses a bounded stability fallback when turn markers are unknown", async () => {
  const viewport = new FakeViewport(
    [
      {
        viewport: { scrollTop: 0, scrollHeight: 500, clientHeight: 500 },
        messages: [createMessage(0, "user"), createMessage(1, "assistant")],
      },
    ],
    { scrollTop: 0, scrollHeight: 500, clientHeight: 500 },
  );

  viewport.currentPage = -1;

  const progress: Array<boolean | null> = [];
  const collector = new ConversationCollector(
    new FakeReader(viewport, [null]),
    viewport,
    {
      stableTopPasses: 1,
      unknownTopPasses: 3,
      maxPasses: 10,
    },
  );

  const conversation = await collector.collect((value) => {
    progress.push(value.conversationStartFound);
  });

  expect(conversation.messages).toHaveLength(2);
  expect(progress).toEqual([null, null, null, null]);
});
```

- [ ] **Step 4: Run the focused tests and verify RED**

Run:

```bash
pnpm exec vitest run \
  tests/features/chat/chatgpt-adapter.test.ts \
  tests/features/chat/conversation-collector.test.ts
```

Expected: TypeScript/test failures because `hasConversationStart`,
`unknownTopPasses`, and `conversationStartFound` do not exist.

- [ ] **Step 5: Implement `ChatGPTAdapter.hasConversationStart()`**

Add:

```ts
hasConversationStart(): boolean | null {
  const numberedTurns = Array.from(
    this.documentRef.querySelectorAll<HTMLElement>(CHATGPT_TURN_SELECTOR),
  )
    .map((element) => element.getAttribute("data-testid") ?? "")
    .map((testId) => testId.match(/^conversation-turn-(\d+)$/))
    .filter((match): match is RegExpMatchArray => match !== null);

  if (numberedTurns.length === 0) {
    return null;
  }

  return numberedTurns.some((match) => Number.parseInt(match[1], 10) === 0);
}
```

- [ ] **Step 6: Implement marker-aware top completion**

Add `unknownTopPasses: 6` to `DEFAULT_OPTIONS`. During each pass read:

```ts
const conversationStartFound = this.reader.hasConversationStart();
```

Include it in progress:

```ts
onProgress?.({
  pass,
  collectedMessages: collectedMessages.size,
  mountedMessages: mountedMessages.length,
  reachedTop,
  conversationStartFound,
});
```

Inside the `reachedTop` branch, before calculating the stable signature:

```ts
if (conversationStartFound === false) {
  previousTopSignature = "";
  stableTopPasses = 0;
  this.viewport.scrollToTop();
  await this.viewport.waitForSettle();
  continue;
}
```

Use a state-dependent threshold:

```ts
const requiredStablePasses =
  conversationStartFound === null
    ? this.options.unknownTopPasses
    : this.options.stableTopPasses;

if (stableTopPasses >= requiredStablePasses) {
  break;
}
```

- [ ] **Step 7: Run collector and adapter tests and verify GREEN**

Run:

```bash
pnpm exec vitest run \
  tests/features/chat/chatgpt-adapter.test.ts \
  tests/features/chat/conversation-collector.test.ts
```

Expected: both files pass; delayed turn zero is collected, unknown markers
terminate at the configured fallback, and restoration assertions still pass.

- [ ] **Step 8: Check the task diff**

Run:

```bash
git diff --check
git diff -- src/features/chat tests/features/chat
```

Expected: no whitespace errors and no changes outside the adapter/collector
contract and tests.

---

### Task 3: Expose the Final Collected Message Count

**Files:**
- Create: `src/features/export/prepare-conversation-export.ts`
- Create: `tests/features/export/prepare-conversation-export.test.ts`
- Modify: `src/features/export/types.ts:8-13`
- Modify: `entrypoints/chatgpt.content.ts:1-118`
- Modify: `entrypoints/popup/App.tsx:180-191`

**Interfaces:**
- Produces:

```ts
export interface PreparedExport {
  title: string;
  url: string;
  messageCount: number;
  latexSource: string;
  assets: LatexAssetRequest[];
}

export function prepareConversationExport(
  conversation: ChatConversation,
  parser?: HtmlToAstParser,
  generator?: LatexGenerator,
): PreparedExport
```

- [ ] **Step 1: Add a failing prepared-export test**

Create `tests/features/export/prepare-conversation-export.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { prepareConversationExport } from "@/src/features/export/prepare-conversation-export";

describe("prepareConversationExport", () => {
  it("reports the number of unique collected messages", () => {
    const prepared = prepareConversationExport({
      title: "Đầy đủ hội thoại",
      url: "https://chatgpt.com/c/complete",
      messages: [
        {
          id: "user-1",
          role: "user",
          order: 0,
          text: "Câu hỏi",
          html: "<p>Câu hỏi</p>",
        },
        {
          id: "assistant-1",
          role: "assistant",
          order: 1,
          text: "Câu trả lời",
          html: "<p>Câu trả lời</p>",
        },
      ],
    });

    expect(prepared.messageCount).toBe(2);
    expect(prepared.latexSource).toContain("Câu trả lời");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm exec vitest run tests/features/export/prepare-conversation-export.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the prepared-export function and type**

Create:

```ts
import type { ChatConversation } from "@/src/features/chat/types";

import { HtmlToAstParser } from "@/src/features/document/html-to-ast";

import { LatexGenerator } from "@/src/features/latex/latex-generator";

import type { PreparedExport } from "./types";

export function prepareConversationExport(
  conversation: ChatConversation,
  parser = new HtmlToAstParser(),
  generator = new LatexGenerator(),
): PreparedExport {
  const ast = parser.parseConversation(conversation);
  const latex = generator.generate(ast);

  return {
    title: conversation.title,
    url: conversation.url,
    messageCount: conversation.messages.length,
    latexSource: latex.source,
    assets: latex.assets,
  };
}
```

Add `messageCount: number` to `PreparedExport`.

- [ ] **Step 4: Route the content script through the new function**

Replace the `HtmlToAstParser` and `LatexGenerator` imports with:

```ts
import { prepareConversationExport } from "@/src/features/export/prepare-conversation-export";
```

Replace the preparation body with:

```ts
const response: ChatTexPrepareExportResponse = {
  ok: true,
  prepared: prepareConversationExport(conversation),
};
```

- [ ] **Step 5: Show the count in the ready state**

In `App.tsx`, before the image count, add:

```tsx
<p>{exportFlow.prepared.messageCount} messages collected</p>
```

- [ ] **Step 6: Run focused tests and TypeScript**

Run:

```bash
pnpm exec vitest run tests/features/export/prepare-conversation-export.test.ts
pnpm compile
```

Expected: the new test passes and all `PreparedExport` consumers type-check.

- [ ] **Step 7: Check the task diff**

Run:

```bash
git diff --check
git status --short
```

Expected: the new preparation module/test and the three explicit consumers are
the only new files for this task.

---

### Task 4: Detect and Localize Vietnamese Documents

**Files:**
- Modify: `tests/features/latex/latex-generator.test.ts`
- Modify: `src/features/latex/latex-generator.ts:18-241`

**Interfaces:**
- Keeps: `LatexGenerator.generate(document): LatexGenerationResult`.
- Adds internal:

```ts
type DocumentLanguage = "en" | "vi";

interface BookLabels {
  contents: string;
  question: string;
  subtitle: string;
  source: string;
  attribution: string;
}
```

- [ ] **Step 1: Add a failing Vietnamese document test**

Add:

```ts
it("localizes Vietnamese prose and book labels", () => {
  const generator = new LatexGenerator();

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
              { type: "text", value: "Giải thích cách xuất toàn bộ hội thoại." },
            ],
          },
        ],
      },
    ],
  });

  expect(result.source).toContain("\\usepackage{polyglossia}");
  expect(result.source).toContain("\\setdefaultlanguage{vietnamese}");
  expect(result.source).toContain("\\renewcommand{\\contentsname}{Mục lục}");
  expect(result.source).toContain("Câu hỏi");
  expect(result.source).toContain("Nguồn:");
  expect(result.source).toContain("Xuất bằng Chat2TeX");
  expect(result.source).toContain("Hướng dẫn tiếng Việt");
});
```

- [ ] **Step 2: Run the generator test and verify RED**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: FAIL because labels are English and no Vietnamese language is
configured.

- [ ] **Step 3: Add language detection and labels**

Add:

```ts
type DocumentLanguage = "en" | "vi";

interface BookLabels {
  contents: string;
  question: string;
  subtitle: string;
  source: string;
  attribution: string;
}

const VIETNAMESE_CHARACTER_PATTERN =
  /[ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬĐÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴàáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/u;

const BOOK_LABELS: Readonly<Record<DocumentLanguage, BookLabels>> = {
  en: {
    contents: "Contents",
    question: "Reader's question",
    subtitle: "A thoughtfully typeset ChatGPT conversation",
    source: "Source",
    attribution: "Exported with Chat2TeX",
  },
  vi: {
    contents: "Mục lục",
    question: "Câu hỏi",
    subtitle: "Cuộc trò chuyện ChatGPT được trình bày như một cuốn sách",
    source: "Nguồn",
    attribution: "Xuất bằng Chat2TeX",
  },
};

function detectDocumentLanguage(document: ChatDocumentAst): DocumentLanguage {
  return VIETNAMESE_CHARACTER_PATTERN.test(
    JSON.stringify(document).normalize("NFC"),
  )
    ? "vi"
    : "en";
}
```

At the start of `generate()`:

```ts
const language = detectDocumentLanguage(document);
const labels = BOOK_LABELS[language];
```

Pass `language` and `labels` to the preamble, cover, contents, and message
rendering methods.

- [ ] **Step 4: Render Vietnamese-aware font and language configuration**

In the existing `fontspec` branch, after the font declarations, emit this only
for Vietnamese documents:

```tex
  \IfFileExists{polyglossia.sty}{
    \usepackage{polyglossia}
    \setdefaultlanguage{vietnamese}
  }{}
```

Use `labels.contents` for `\contentsname`, `labels.question` in the question
environment, and localized cover metadata. Normalize title and visible text to
NFC before `escapeLatexText()`.

- [ ] **Step 5: Run generator tests and verify GREEN**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: the Vietnamese test and existing English assertions pass.

- [ ] **Step 6: Check the task diff**

Run:

```bash
git diff --check
git diff -- src/features/latex/latex-generator.ts tests/features/latex/latex-generator.test.ts
```

Expected: language detection changes only labels and language configuration;
question hierarchy and code palette are not implemented yet.

---

### Task 5: Build the Contents Page from User Questions

**Files:**
- Modify: `tests/features/latex/latex-generator.test.ts`
- Modify: `src/features/latex/latex-generator.ts:18-438`
- Modify: `docs/superpowers/specs/2026-07-30-editorial-book-pdf-design.md`

**Interfaces:**
- Extends internal context:

```ts
interface BlockRenderContext {
  numberedHeadings: boolean;
  headingBaseLevel: number;
  headingLevelOffset: 0 | 1;
}
```

- Adds internal helpers:

```ts
private createQuestionTitle(
  message: ChatMessageAst,
  questionNumber: number,
  language: DocumentLanguage,
): string

private findMessageHeadingBaseLevel(message: ChatMessageAst): number
private renderRawBlockText(block: BlockNode): string
private renderRawInlineNodes(nodes: InlineNode[]): string
```

- [ ] **Step 1: Replace the role test with a failing question-hierarchy test**

Update the role fixture by removing its user heading, keeping the user
paragraph as `"How does this work?"`, and changing the assistant headings to
levels 2 and 3. Then assert:

```ts
expect(result.source).toContain(
  "\\chatquestionsection{How does this work?}",
);
expect(result.source).toContain(
  "\\begin{readerquestion}{Reader's question 1}",
);
expect(result.source).toContain("\\subsection[Architecture v2]");
expect(result.source).toContain("\\subsubsection[Implementation note]");
expect(result.source).not.toContain("\\section[Architecture v2]");
```

Keep the assistant-only test and its expected `\section[Overview]{Overview}`.

- [ ] **Step 2: Add failing title truncation and fallback tests**

Add:

```ts
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

  expect(result.source).toMatch(
    /\\chatquestionsection\\{Explain how the extension collects every message.{1,80}…\\}/,
  );
  expect(result.source).toContain("\\chatquestionsection{Question 2}");
});
```

- [ ] **Step 3: Run the generator test and verify RED**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: FAIL because questions do not create contents entries and assistant
headings are still top-level sections.

- [ ] **Step 4: Define the lightweight question-section command**

Add to the preamble:

```tex
\newcommand{\chatquestionsection}[1]{%
  \refstepcounter{section}%
  \addcontentsline{toc}{section}{\protect\numberline{\thesection}#1}%
  \markright{#1}%
}
```

Change the question environment to accept one label argument:

```tex
\newenvironment{readerquestion}[1]{
  ...
  {\sffamily\scriptsize\bfseries\color{questionaccent}\MakeUppercase{#1}}
  ...
}{
  \par\endgroup\bigskip
}
```

Set:

```tex
\setcounter{tocdepth}{2}
```

- [ ] **Step 5: Add deterministic raw question-title extraction**

Implement recursive raw-text rendering for paragraph/heading/list/quote/table,
math, code, and image alt text. Inline rendering returns literal visible text,
recurses through strong/emphasis/strike/link, uses inline code values, math
source, image alt text, and spaces for line breaks.

Collapse whitespace, normalize NFC, and truncate with:

```ts
function truncateAtWordBoundary(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim().normalize("NFC");
  const characters = Array.from(normalized);

  if (characters.length <= limit) {
    return normalized;
  }

  const prefix = characters.slice(0, limit - 1).join("");
  const boundary = prefix.lastIndexOf(" ");
  const truncated =
    boundary >= Math.floor(limit * 0.55)
      ? prefix.slice(0, boundary)
      : prefix;

  return `${truncated.trim()}…`;
}
```

`createQuestionTitle()` uses the first non-empty rendered block sequence and
falls back to `Câu hỏi ${questionNumber}` or `Question ${questionNumber}`.

- [ ] **Step 6: Render each user message as a navigable question**

Track `questionNumber` and `hasQuestionSection` while rendering sorted
messages. For each user message emit:

```ts
return [
  `\\chatquestionsection{${escapedQuestionTitle}}`,
  `\\begin{readerquestion}{${escapeLatexText(questionLabel)}}`,
  renderedContent,
  "\\end{readerquestion}",
].join("\n");
```

Use `Câu hỏi N` for Vietnamese and `Reader's question N` for English.

- [ ] **Step 7: Offset assistant headings under the current question**

Calculate the shallowest heading separately for each assistant message. Set
`headingLevelOffset` to `1` when a user question has already opened a section,
otherwise `0`.

In `renderHeading()`:

```ts
const normalizedLevel =
  Math.max(1, level - context.headingBaseLevel + 1) +
  context.headingLevelOffset;
```

Number only normalized levels 1 through 3. The contents depth of 2 includes
the question section and main assistant subsection; subsubsections stay visible
without cluttering the contents.

- [ ] **Step 8: Run generator tests and verify GREEN**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: question entries, truncation, empty fallback, child headings, and
assistant-only fallback all pass.

- [ ] **Step 9: Reconcile the original Editorial Book design**

Update its contents and heading sections to state:

- user questions are top-level navigation sections;
- main assistant headings are subsections;
- assistant-only documents promote their shallowest heading to section;
- `tocdepth=2` prevents deep heading noise.

- [ ] **Step 10: Check the task diff**

Run:

```bash
git diff --check
rg -n "chatquestionsection|tocdepth|headingLevelOffset" \
  src/features/latex/latex-generator.ts \
  tests/features/latex/latex-generator.test.ts \
  docs/superpowers/specs
```

Expected: question hierarchy is present in implementation, tests, and both
design documents.

---

### Task 6: Add Colorful Vietnamese-safe Code Listings

**Files:**
- Modify: `tests/features/latex/latex-generator.test.ts`
- Modify: `src/features/latex/latex-generator.ts:92-197,440-456`

**Interfaces:**
- Keeps: `renderCodeBlock(language: string | null, code: string): string`.
- Adds:

```ts
const VIETNAMESE_LISTINGS_CHARACTERS: string;

function renderVietnameseListingsMappings(): string;
```

- [ ] **Step 1: Add a failing high-contrast palette test**

Replace dark-palette assertions with:

```ts
expect(result.source).toContain("\\definecolor{codebackground}{HTML}{F3F1ED}");
expect(result.source).toContain("\\definecolor{codeforeground}{HTML}{25282E}");
expect(result.source).toContain("\\definecolor{codekeyword}{HTML}{1F5FAE}");
expect(result.source).toContain("\\definecolor{codestring}{HTML}{A13D52}");
expect(result.source).toContain("\\definecolor{codecomment}{HTML}{397052}");
expect(result.source).toContain("\\definecolor{codelabel}{HTML}{8A5A3B}");
expect(result.source).toContain("numbers=left,");
expect(result.source).toContain(
  "numberstyle=\\sffamily\\scriptsize\\color{codelabel},",
);
expect(result.source).toContain(
  "{\\sffamily\\scriptsize\\bfseries\\color{codelabel}\\MakeUppercase{JavaScript}}",
);
```

- [ ] **Step 2: Add a failing Vietnamese code test**

Add:

```ts
it("normalizes and maps Vietnamese characters inside colorful code", () => {
  const generator = new LatexGenerator();
  const decomposedVietnamese = "Tie\u0302\u0301ng Vie\u0323\u0302t";

  const result = generator.generate({
    title: "Mã tiếng Việt",
    url: "https://chatgpt.com/c/code",
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        order: 0,
        blocks: [
          {
            type: "code",
            language: "typescript",
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
```

- [ ] **Step 3: Run the generator test and verify RED**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: FAIL because the palette is dark, line numbers/label are absent, and
Vietnamese mappings are not generated.

- [ ] **Step 4: Define the light multi-color palette and listings options**

Use:

```tex
\definecolor{codebackground}{HTML}{F3F1ED}
\definecolor{codeforeground}{HTML}{25282E}
\definecolor{codecomment}{HTML}{397052}
\definecolor{codekeyword}{HTML}{1F5FAE}
\definecolor{codestring}{HTML}{A13D52}
\definecolor{codelabel}{HTML}{8A5A3B}
\definecolor{coderule}{HTML}{D8D1C7}
```

Set:

```tex
basicstyle=\ttfamily\footnotesize\color{codeforeground},
keywordstyle=\bfseries\color{codekeyword},
commentstyle=\itshape\color{codecomment},
stringstyle=\color{codestring},
identifierstyle=\color{codeforeground},
numbers=left,
numberstyle=\sffamily\scriptsize\color{codelabel},
numbersep=8pt,
stepnumber=1,
frame=single,
framerule=0.4pt,
rulecolor=\color{coderule},
backgroundcolor=\color{codebackground},
postbreak=\mbox{\textcolor{codelabel}{$\hookrightarrow$}\space},
```

Keep line wrapping, flexible columns, spacing preservation, and safe page
break behavior.

- [ ] **Step 5: Generate Vietnamese `literate` mappings**

Add the complete precomposed character string:

```ts
const VIETNAMESE_LISTINGS_CHARACTERS = [
  "ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬĐÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊ",
  "ÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ",
  "àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩị",
  "òóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ",
].join("");
```

Add:

```ts
function renderVietnameseListingsMappings(): string {
  return Array.from(VIETNAMESE_LISTINGS_CHARACTERS)
    .map((character) => `{${character}}{{${character}}}1`)
    .join(" ");
}
```

Emit:

```ts
`  literate=${renderVietnameseListingsMappings()},`
```

inside `\lstset`.

- [ ] **Step 6: Normalize code and render a separate language label**

At the start of `renderCodeBlock()`:

```ts
const normalizedCode = code.normalize("NFC");
```

Protect the terminator in `normalizedCode`. Remove `title={...}` from listing
options and render the label before the environment:

```ts
const label = displayLanguage
  ? `{\\sffamily\\scriptsize\\bfseries\\color{codelabel}\\MakeUppercase{${escapeLatexText(
      displayLanguage,
    )}}}`
  : "";

return [
  label,
  `\\begin{lstlisting}${options}`,
  safeCode,
  "\\end{lstlisting}",
]
  .filter(Boolean)
  .join("\n");
```

- [ ] **Step 7: Run generator tests and verify GREEN**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: all generator tests pass with the light colorful palette, distinct
syntax styles, line numbers, language label, NFC code, and Vietnamese mappings.

- [ ] **Step 8: Check the task diff**

Run:

```bash
git diff --check
rg -n "F3F1ED|1F5FAE|A13D52|397052|literate=|numbers=left" \
  src/features/latex/latex-generator.ts \
  tests/features/latex/latex-generator.test.ts
```

Expected: every requested visual and Unicode setting has a matching test.

---

### Task 7: Full Regression and Runtime Handoff

**Files:**
- Review all modified and untracked files.
- Do not create a commit.

**Interfaces:**
- Verifies all public contracts from Tasks 1–6.
- Produces a clean, buildable uncommitted worktree ready for extension reload.

- [ ] **Step 1: Run all focused feature tests**

Run:

```bash
pnpm exec vitest run \
  tests/features/chat/chatgpt-adapter.test.ts \
  tests/features/chat/conversation-collector.test.ts \
  tests/features/export/prepare-conversation-export.test.ts \
  tests/features/latex/latex-generator.test.ts
```

Expected: all focused tests pass with zero failures.

- [ ] **Step 2: Run the complete test suite**

Run:

```bash
pnpm test
```

Expected: every test file and test passes.

- [ ] **Step 3: Run TypeScript and production build**

Run:

```bash
pnpm compile
pnpm build
```

Expected: both commands exit 0 and WXT reports a completed Chrome MV3 build.

- [ ] **Step 4: Verify the memory-safety and package constraints**

Run:

```bash
rg -n "tcolorbox|newtcolorbox|begin\\{chatmessage\\}|begin\\{minipage\\}" \
  src/features/latex/latex-generator.ts
rg -n "minted|Pygments|shell-escape" \
  src package.json
```

Expected: no whole-message box or forbidden online/external highlighter appears
in production source.

- [ ] **Step 5: Inspect whitespace and final scope**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; no `public/texlive` files are modified; no
commit has been created.

- [ ] **Step 6: Manual extension verification**

After the user reloads `.output/chrome-mv3` in `chrome://extensions`, verify:

1. a long virtualized conversation reports a plausible final message count;
2. the first user question and last assistant response both appear in the TEX;
3. multiple Markdown sections inside one response all appear;
4. the contents lists user questions as top-level entries;
5. main assistant headings appear below their question;
6. Vietnamese prose and Vietnamese code comments retain all diacritics;
7. keywords, strings, comments, base code, labels, and line numbers are visibly
   distinct;
8. the PDF compiles without a TeX capacity error.

If no connected browser session is available, report these exact manual checks
as the remaining handoff rather than claiming visual runtime verification.
