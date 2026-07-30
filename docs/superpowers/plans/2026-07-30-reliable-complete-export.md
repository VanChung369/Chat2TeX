# Reliable Complete Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export the complete active ChatGPT branch, retain code-fence languages for real syntax colors, and keep visible PDF line numbers out of copied code.

**Architecture:** Fetch and validate the complete active branch from ChatGPT's conversation API, render its Markdown to safe standard HTML, then enrich matching messages with mounted DOM images. Keep the DOM scroll collector as a guarded fallback that rejects known-partial results. Layer code-language detection and copy-safe LaTeX numbering behind focused helpers.

**Tech Stack:** TypeScript 5.9, WXT Chrome MV3 content scripts, `marked`, JSDOM, Vitest, LaTeX `listings`, guarded `accsupp`, BusyTeX XeLaTeX.

## Global Constraints

- Work directly in the current checkout on `main`.
- Do not create a worktree, commit, push, or open a pull request.
- Export only the active branch ending at `current_node`.
- Never log session access tokens, authorization headers, or raw API payloads.
- Raw Markdown HTML must be escaped rather than executed.
- API-rendered prose and fenced-code metadata remain authoritative; DOM enrichment appends only unique images.
- If API collection and verified-complete DOM fallback both fail, stop export instead of returning partial data.
- Keep visual line numbers only when `accsupp.sty` can remove them from copied text; otherwise use no line numbers.
- Preserve Vietnamese NFC normalization, question-based contents, images, source ZIP, and BusyTeX behavior.

---

## File Structure

**Create**

- `src/features/chat/markdown-message-renderer.ts` — converts API Markdown to safe HTML while preserving code languages and math metadata.
- `tests/features/chat/markdown-message-renderer.test.ts` — Markdown boundary behavior.
- `src/features/chat/chatgpt-conversation-api-reader.ts` — fetches, validates, and linearizes the active API branch.
- `tests/features/chat/chatgpt-conversation-api-reader.test.ts` — API response, auth, validation, and branch tests.
- `src/features/chat/complete-conversation-reader.ts` — API-first orchestration, DOM image enrichment, and guarded fallback.
- `tests/features/chat/complete-conversation-reader.test.ts` — source selection, enrichment, and combined errors.

**Modify**

- `package.json`, `pnpm-lock.yaml` — add `marked`.
- `src/features/chat/chatgpt-adapter.ts` — recognize turn one as the beginning and expose lowest mounted turn.
- `src/features/chat/conversation-collector.ts` — reject exhausted known-partial collection.
- `src/features/document/html-to-ast.ts` — read code language attributes before classes.
- `src/features/latex/latex-generator.ts` — language inference, `ChatTypeScript`, and copy-safe line numbers.
- `entrypoints/chatgpt.content.ts` — use the complete reader for prepare/collect.
- Existing focused tests for all modified modules.

---

### Task 1: Safe Markdown Message Renderer

**Files:**
- Create: `src/features/chat/markdown-message-renderer.ts`
- Create: `tests/features/chat/markdown-message-renderer.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: raw API message Markdown as `string`.
- Produces:

```ts
export class MarkdownMessageRenderer {
  render(markdown: string): string;
}
```

- [ ] **Step 1: Install the focused Markdown dependency**

Run:

```bash
pnpm add marked
```

Expected: `package.json` and `pnpm-lock.yaml` add one direct runtime
dependency; no unrelated package upgrades.

- [ ] **Step 2: Write failing renderer tests**

Create tests that catch loss of language metadata, unsafe raw HTML, broken
Vietnamese, and lost math:

```ts
import { describe, expect, it } from "vitest";

import { HtmlToAstParser } from "@/src/features/document/html-to-ast";
import { MarkdownMessageRenderer } from "@/src/features/chat/markdown-message-renderer";

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
  });
});
```

- [ ] **Step 3: Run the renderer tests and verify RED**

Run:

```bash
pnpm exec vitest run tests/features/chat/markdown-message-renderer.test.ts
```

Expected: FAIL because `MarkdownMessageRenderer` does not exist.

- [ ] **Step 4: Implement the renderer**

Use a private `Marked` instance with:

```ts
const marked = new Marked({
  async: false,
  breaks: true,
  gfm: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    code({ text, lang }) {
      const language = normalizeFenceLanguage(lang);
      const attribute = language
        ? ` data-language="${escapeHtmlAttribute(language)}"`
        : "";
      const className = language
        ? ` class="language-${escapeHtmlAttribute(language)}"`
        : "";

      return [
        `<pre${attribute}>`,
        `<code${className}>${escapeHtml(text)}</code>`,
        "</pre>",
      ].join("");
    },
  },
});
```

Register one block extension for `$$...$$` and one inline extension for
`$...$`. Their renderers must emit empty visible containers with escaped
attributes:

```html
<span data-math-style="inline" data-latex="E = mc^2"></span>
<div data-math-style="display" data-latex="T(n) = ..."></div>
```

The tokenizers must refuse escaped dollar signs and must not run inside
fenced/code-span tokens; `marked`'s block/inline token boundaries provide
that isolation.

- [ ] **Step 5: Run renderer and parser tests and verify GREEN**

Run:

```bash
pnpm exec vitest run \
  tests/features/chat/markdown-message-renderer.test.ts \
  tests/features/document/html-to-ast.test.ts
```

Expected: both files pass.

---

### Task 2: Complete Active-Branch API Reader

**Files:**
- Create: `src/features/chat/chatgpt-conversation-api-reader.ts`
- Create: `tests/features/chat/chatgpt-conversation-api-reader.test.ts`

**Interfaces:**
- Consumes:

```ts
export type ConversationApiFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
```

- Produces:

```ts
export class ChatGptConversationApiReader {
  constructor(
    fetcher: ConversationApiFetcher,
    currentUrl: string,
    markdownRenderer?: MarkdownMessageRenderer,
  );

  read(): Promise<ChatConversation>;
}
```

- [ ] **Step 1: Write a failing active-branch test**

Use a literal response containing a root, the selected user/assistant path,
and one abandoned alternative:

```ts
it("reconstructs only the complete active branch", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ accessToken: "test-token" }),
    )
    .mockResolvedValueOnce(
      Response.json({
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
            id: "user-1",
            parent: "root",
            children: ["assistant-1", "assistant-abandoned"],
            message: {
              id: "user-1",
              author: { role: "user" },
              content: { parts: ["Start of the chat"] },
              recipient: "all",
            },
          },
          "assistant-abandoned": {
            id: "assistant-abandoned",
            parent: "user-1",
            children: [],
            message: {
              id: "assistant-abandoned",
              author: { role: "assistant" },
              content: { parts: ["Wrong branch"] },
              recipient: "all",
            },
          },
          "assistant-1": {
            id: "assistant-1",
            parent: "user-1",
            children: ["user-2"],
            message: {
              id: "assistant-1",
              author: { role: "assistant" },
              content: {
                parts: ["```typescript\\nconst first = true;\\n```"],
              },
              recipient: "all",
            },
          },
          "user-2": {
            id: "user-2",
            parent: "assistant-1",
            children: ["assistant-2"],
            message: {
              id: "user-2",
              author: { role: "user" },
              content: { parts: ["End question"] },
              recipient: "all",
            },
          },
          "assistant-2": {
            id: "assistant-2",
            parent: "user-2",
            children: [],
            message: {
              id: "assistant-2",
              author: { role: "assistant" },
              content: { parts: ["End answer"] },
              recipient: "all",
            },
          },
        },
      }),
    );

  const conversation = await new ChatGptConversationApiReader(
    fetcher,
    "https://chatgpt.com/c/conversation-123",
  ).read();

  expect(conversation.messages.map(({ id }) => id)).toEqual([
    "user-1",
    "assistant-1",
    "user-2",
    "assistant-2",
  ]);
  expect(conversation.messages[0].order).toBe(0);
  expect(conversation.messages[3].order).toBe(3);
  expect(conversation.messages[1].html).toContain(
    'class="language-typescript"',
  );
  expect(conversation.messages.some(({ text }) =>
    text.includes("Wrong branch"),
  )).toBe(false);
});
```

- [ ] **Step 2: Add failing boundary tests**

Add this response helper above the tests:

```ts
function createApiFetcher(conversation: unknown) {
  return vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ accessToken: "test-token" }),
    )
    .mockResolvedValueOnce(Response.json(conversation));
}

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
  const node = (
    id: string,
    parent: string | null,
    role: string,
    parts: unknown[],
    recipient = "all",
  ) => ({
    id,
    parent,
    children: [],
    message: {
      id,
      author: { role },
      content: { parts },
      recipient,
    },
  });

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
      system: node("system", "root", "system", ["Hidden"]),
      "user-visible": node(
        "user-visible",
        "system",
        "user",
        ["Visible question"],
      ),
      tool: node("tool", "user-visible", "tool", ["Hidden tool"]),
      "assistant-private": node(
        "assistant-private",
        "tool",
        "assistant",
        ["Hidden recipient"],
        "browser",
      ),
      empty: node("empty", "assistant-private", "assistant", []),
      "assistant-visible": node(
        "assistant-visible",
        "empty",
        "assistant",
        ["Visible answer"],
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
});
```

- [ ] **Step 3: Run the API reader tests and verify RED**

Run:

```bash
pnpm exec vitest run \
  tests/features/chat/chatgpt-conversation-api-reader.test.ts
```

Expected: FAIL because the API reader module does not exist.

- [ ] **Step 4: Implement fetch, validation, and branch traversal**

Use exact endpoints derived from the current origin:

```ts
const sessionUrl = new URL("/api/auth/session", currentUrl);
const conversationUrl = new URL(
  `/backend-api/conversation/${encodeURIComponent(conversationId)}`,
  currentUrl,
);
```

Fetch the session with `credentials: "include"`. Require a non-empty
`accessToken`, then fetch the conversation with:

```ts
{
  credentials: "include",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "X-Authorization": `Bearer ${accessToken}`,
  },
}
```

Validate values with `isRecord(value: unknown): value is
Record<string, unknown>`. Walk `current_node -> parent` with a `Set<string>`;
throw on a missing node or repeated ID. Reverse the nodes, filter visible
messages, join only string `content.parts` with `"\n\n"`, render HTML, and
assign sequential `order`.

Error strings must describe category/status but never include headers, token,
or raw JSON.

- [ ] **Step 5: Run the API reader tests and verify GREEN**

Run:

```bash
pnpm exec vitest run \
  tests/features/chat/chatgpt-conversation-api-reader.test.ts \
  tests/features/chat/markdown-message-renderer.test.ts
```

Expected: both files pass.

---

### Task 3: DOM Completeness Guard

**Files:**
- Modify: `src/features/chat/chatgpt-adapter.ts`
- Modify: `src/features/chat/conversation-collector.ts`
- Modify: `tests/features/chat/chatgpt-adapter.test.ts`
- Modify: `tests/features/chat/conversation-collector.test.ts`

**Interfaces:**
- `ConversationReader.hasConversationStart(): boolean | null` remains.
- `ConversationCollector.collect()` now rejects when it exhausts passes before
  satisfying its completeness rule.

- [ ] **Step 1: Change the start-marker test to reproduce ChatGPT numbering**

Replace the zero-first fixture with turn one and assert later-only turns are
false:

```ts
expect(
  new ChatGPTAdapter(
    createTestDocument(`
      <article data-testid="conversation-turn-1"></article>
      <article data-testid="conversation-turn-2"></article>
    `),
  ).hasConversationStart(),
).toBe(true);
```

- [ ] **Step 2: Add a failing pass-exhaustion test**

Configure a fake viewport whose reader always reports `false`, set
`maxPasses: 3`, and assert:

```ts
await expect(collector.collect()).rejects.toThrow(
  "Stopped after collecting 2 messages without reaching the beginning",
);
expect(viewport.restoredSnapshot).toEqual(initialSnapshot);
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
pnpm exec vitest run \
  tests/features/chat/chatgpt-adapter.test.ts \
  tests/features/chat/conversation-collector.test.ts
```

Expected: the turn-one assertion and exhausted-collector assertion fail.

- [ ] **Step 4: Implement minimal completeness behavior**

In `hasConversationStart()`, parse all numeric markers and return true when
the minimum mounted turn is `0` or `1`:

```ts
return Math.min(...turnNumbers) <= 1;
```

In `collect()`, track `collectionCompleted`. Set it only when the stable-top
condition breaks the loop. After the loop and before returning:

```ts
if (!collectionCompleted) {
  throw new Error(
    `Stopped after collecting ${collectedMessages.size} messages ` +
      "without reaching the beginning of the conversation.",
  );
}
```

Keep viewport restoration in `finally`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run \
  tests/features/chat/chatgpt-adapter.test.ts \
  tests/features/chat/conversation-collector.test.ts
```

Expected: both files pass.

---

### Task 4: API-First Reader, DOM Image Enrichment, and Fallback

**Files:**
- Create: `src/features/chat/complete-conversation-reader.ts`
- Create: `tests/features/chat/complete-conversation-reader.test.ts`
- Modify: `entrypoints/chatgpt.content.ts`

**Interfaces:**
- Consumes:

```ts
interface ApiConversationSource {
  read(): Promise<ChatConversation>;
}

type MountedConversationSource = () => ChatConversation;
type DomConversationFallback = () => Promise<ChatConversation>;
```

- Produces:

```ts
export class CompleteConversationReader {
  constructor(
    apiSource: ApiConversationSource,
    mountedSource: MountedConversationSource,
    domFallback: DomConversationFallback,
    documentRef?: Document,
  );

  read(): Promise<ChatConversation>;
}
```

- [ ] **Step 1: Write failing orchestration tests**

Define a literal helper and test all three observable behaviors:

```ts
function message(
  id: string,
  order: number,
  html: string,
): ChatMessage {
  return {
    id,
    role: order % 2 === 0 ? "user" : "assistant",
    order,
    text: `Message ${order}`,
    html,
  };
}

function conversation(messages: ChatMessage[]): ChatConversation {
  return {
    title: "Complete conversation",
    url: "https://chatgpt.com/c/complete",
    messages,
  };
}

it("returns every API message and appends only unique mounted images", async () => {
  const apiConversation = conversation([
    message("user-1", 0, "<p>First</p>"),
    message("assistant-1", 1, "<p>Second</p>"),
    message("user-2", 2, "<p>Third</p>"),
    message(
      "assistant-2",
      3,
      '<pre data-language="typescript"><code>const last = true;</code></pre>',
    ),
  ]);
  const mountedConversation = conversation([
    message("user-2", 2, "<p>Third</p>"),
    message(
      "assistant-2",
      3,
      [
        "<p>Fourth</p>",
        '<img src="https://example.com/final.png" alt="Final" />',
        '<img src="https://example.com/final.png" alt="Duplicate" />',
      ].join(""),
    ),
  ]);

  const reader = new CompleteConversationReader(
    { read: async () => apiConversation },
    () => mountedConversation,
    async () => mountedConversation,
    document.implementation.createHTMLDocument("Enrichment"),
  );

  const result = await reader.read();

  expect(result.messages.map(({ id }) => id)).toEqual([
    "user-1",
    "assistant-1",
    "user-2",
    "assistant-2",
  ]);
  expect(result.messages[3].html).toContain('data-language="typescript"');
  expect(result.messages[3].html.match(/final\\.png/g)).toHaveLength(1);
});

it("uses verified DOM output when the API source rejects", async () => {
  const domConversation = conversation([
    message("user-1", 0, "<p>Question</p>"),
    message("assistant-1", 1, "<p>Answer</p>"),
  ]);
  const reader = new CompleteConversationReader(
    {
      read: async () => {
        throw new Error("Session unavailable.");
      },
    },
    () => domConversation,
    async () => domConversation,
  );

  await expect(reader.read()).resolves.toEqual(domConversation);
});

it("reports both source failures without leaking credentials", async () => {
  const reader = new CompleteConversationReader(
    {
      read: async () => {
        throw new Error("Session unavailable.");
      },
    },
    () => conversation([]),
    async () => {
      throw new Error(
        "Stopped after collecting 5 messages without reaching the beginning.",
      );
    },
  );

  await expect(reader.read()).rejects.toThrow(
    [
      "Unable to collect a complete conversation.",
      "API: Session unavailable.",
      "DOM fallback: Stopped after collecting 5 messages",
    ].join("\\n"),
  );

  await expect(reader.read()).rejects.not.toThrow(
    /Authorization|Bearer|test-token/i,
  );
});
```

- [ ] **Step 2: Run the orchestration tests and verify RED**

Run:

```bash
pnpm exec vitest run \
  tests/features/chat/complete-conversation-reader.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement API-first orchestration**

`read()` first awaits the API source. On success, call a private enrichment
function:

```ts
function enrichWithMountedImages(
  apiConversation: ChatConversation,
  mountedConversation: ChatConversation,
  documentRef: Document,
): ChatConversation;
```

For each matching ID:

1. parse both HTML strings in `<template>` elements;
2. collect normalized `currentSrc`/`src` values;
3. append cloned DOM `<img>` elements whose source is absent from API HTML;
4. leave API prose/code untouched.

On API success, call `mountedSource()` only for image enrichment; do not run
the scroll collector. If the API source rejects, await `domFallback()`. If the
fallback also rejects, throw:

```text
Unable to collect a complete conversation.
API: <safe reason>
DOM fallback: <safe reason>
```

- [ ] **Step 4: Integrate the content script**

Create one bound fetcher inside `main()`:

```ts
const apiReader = new ChatGptConversationApiReader(
  window.fetch.bind(window),
  window.location.href,
);
```

Replace the cached DOM-only `collectionPromise` with a cached
`CompleteConversationReader.read()` promise. Pass
`adapter.extractConversation()` as `mountedSource`. The `domFallback`
constructs a fresh `DomConversationViewport` and `ConversationCollector` when
invoked. Both collect and prepare-export requests use this same complete
promise.

- [ ] **Step 5: Run orchestration, export, and content-script type tests**

Run:

```bash
pnpm exec vitest run \
  tests/features/chat/complete-conversation-reader.test.ts \
  tests/features/export/prepare-conversation-export.test.ts
pnpm compile
```

Expected: tests and TypeScript compilation pass.

---

### Task 5: Preserve and Infer Code Languages

**Files:**
- Modify: `src/features/document/html-to-ast.ts`
- Modify: `tests/features/document/html-to-ast.test.ts`
- Modify: `src/features/latex/latex-generator.ts`
- Modify: `tests/features/latex/latex-generator.test.ts`

**Interfaces:**
- `readCodeLanguage(...)` additionally reads attributes/header labels.
- `inferCodeLanguage(code: string): string | null` remains private to the
  generator module.
- `mapListingLanguage("typescript")` returns `ChatTypeScript`.

- [ ] **Step 1: Write failing parser language tests**

Add literal ChatGPT-like HTML:

```ts
expect(
  parser.parseHtml(`
    <div>
      <div><span>typescript</span><button>Copy</button></div>
      <pre><code>const value: string = "colored";</code></pre>
    </div>
  `),
).toContainEqual({
  type: "code",
  language: "typescript",
  code: 'const value: string = "colored";',
});

expect(
  parser.parseHtml(
    '<pre data-language="python"><code>def run(): pass</code></pre>',
  ),
).toContainEqual({
  type: "code",
  language: "python",
  code: "def run(): pass",
});
```

- [ ] **Step 2: Write failing generator highlighting tests**

Assert explicit and inferred TypeScript:

```ts
expect(explicitSource).toContain(
  "\\begin{lstlisting}[language=ChatTypeScript]",
);
expect(inferredSource).toContain(
  "\\begin{lstlisting}[language=ChatTypeScript]",
);
expect(plainTextSource).toContain("\\begin{lstlisting}");
expect(plainTextSource).not.toContain("language=ChatTypeScript");
expect(explicitSource).toContain(
  "\\lstdefinelanguage{ChatTypeScript}",
);
expect(explicitSource).toContain(
  "morekeywords={interface,type,implements,readonly,public,private,protected,enum,namespace,declare,abstract,unknown,never,keyof,infer,as,satisfies}",
);
```

- [ ] **Step 3: Run parser/generator tests and verify RED**

Run:

```bash
pnpm exec vitest run \
  tests/features/document/html-to-ast.test.ts \
  tests/features/latex/latex-generator.test.ts
```

Expected: parser returns `null` language; generator uses JavaScript/plain.

- [ ] **Step 4: Implement layered language detection**

`readCodeLanguage()` checks in order:

```ts
for (const element of [codeElement, preElement]) {
  const value =
    element?.getAttribute("data-language") ??
    element?.getAttribute("data-lang");
  if (value?.trim()) return value.trim().toLowerCase();
}
```

Then existing classes. Finally inspect preceding siblings within at most two
ancestor levels. Accept the trimmed label only when it is in the same alias
set used by `mapListingLanguage`; never treat arbitrary prose as a language.

Implement conservative inference for:

- TypeScript/JavaScript import/export/const/interface/type/arrow patterns;
- valid JSON object/array;
- shell shebang/common command prefix;
- HTML/XML leading tag;
- CSS declaration block;
- Python def/class/from-import;
- SQL statement prefix.

Normalize code to NFC before inference.

- [ ] **Step 5: Define and use `ChatTypeScript`**

Add before `\lstset`:

```tex
\lstdefinelanguage{ChatTypeScript}{
  language=JavaScript,
  morekeywords={
    interface,type,implements,readonly,public,private,protected,
    enum,namespace,declare,abstract,unknown,never,keyof,infer,as,satisfies
  }
}
```

Map `ts`, `tsx`, and `typescript` to `ChatTypeScript`. Keep JavaScript/JSX
mapped to JavaScript.

- [ ] **Step 6: Run parser/generator tests and verify GREEN**

Run:

```bash
pnpm exec vitest run \
  tests/features/document/html-to-ast.test.ts \
  tests/features/latex/latex-generator.test.ts
```

Expected: all language and color-source assertions pass.

---

### Task 6: Copy-Safe Visual Line Numbers

**Files:**
- Modify: `src/features/latex/latex-generator.ts`
- Modify: `tests/features/latex/latex-generator.test.ts`

**Interfaces:**
- No TypeScript API change.
- Generated LaTeX uses `accsupp` when available and no numbers otherwise.

- [ ] **Step 1: Write failing generated-source tests**

Replace the direct `numbers=left` assertion with:

```ts
expect(source).toContain("\\IfFileExists{accsupp.sty}{");
expect(source).toContain("\\usepackage{accsupp}");
expect(source).toContain("\\newcommand{\\chatcodenumber}[1]");
expect(source).toContain(
  "\\BeginAccSupp{method=escape,ActualText={}}#1\\EndAccSupp{}",
);
expect(source).toContain(
  "numberstyle=\\scriptsize\\color{bookmuted}\\chatcodenumber",
);
expect(source).toContain("\\lstset{numbers=none}");
```

The mutation caught is removing `ActualText={}` or restoring unconditional
copyable numbers.

- [ ] **Step 2: Run the generator test and verify RED**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: FAIL because `accsupp` and `\chatcodenumber` are absent.

- [ ] **Step 3: Implement guarded numbering**

Remove `numbers=left` and `numberstyle` from the base `\lstset`. Add:

```tex
\IfFileExists{accsupp.sty}{
  \usepackage{accsupp}
  \newcommand{\chatcodenumber}[1]{%
    \BeginAccSupp{method=escape,ActualText={}}#1\EndAccSupp{}%
  }
}{
  \newcommand{\chatcodenumber}[1]{#1}
}
```

After the base listing configuration add:

```tex
\IfFileExists{accsupp.sty}{
  \lstset{
    numbers=left,
    numberstyle=\scriptsize\color{bookmuted}\chatcodenumber
  }
}{
  \lstset{numbers=none}
}
```

- [ ] **Step 4: Run the generator tests and verify GREEN**

Run:

```bash
pnpm exec vitest run tests/features/latex/latex-generator.test.ts
```

Expected: all generator tests pass.

---

### Task 7: Regression, Production Build, and Manual Handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-reliable-complete-export-design.md` only if implementation reveals a verified contract difference.

**Interfaces:**
- Consumes all completed tasks.
- Produces a verified uncommitted working tree and an unpacked extension.

- [ ] **Step 1: Run all focused defect tests**

Run:

```bash
pnpm exec vitest run \
  tests/features/chat/markdown-message-renderer.test.ts \
  tests/features/chat/chatgpt-conversation-api-reader.test.ts \
  tests/features/chat/complete-conversation-reader.test.ts \
  tests/features/chat/chatgpt-adapter.test.ts \
  tests/features/chat/conversation-collector.test.ts \
  tests/features/document/html-to-ast.test.ts \
  tests/features/latex/latex-generator.test.ts \
  tests/features/export/prepare-conversation-export.test.ts
```

Expected: every focused file passes.

- [ ] **Step 2: Run the complete verification gate**

Run:

```bash
pnpm test
pnpm compile
pnpm build
git diff --check
```

Expected:

- all Vitest files and tests pass;
- TypeScript emits no errors;
- WXT builds `.output/chrome-mv3`;
- diff check emits no output.

- [ ] **Step 3: Inspect the generated package**

Run:

```bash
rg -n \
  "backend-api/conversation|ChatTypeScript|chatcodenumber|ActualText" \
  .output/chrome-mv3
git status --short
```

Expected: production chunks contain the complete-reader and LaTeX features;
the working tree remains uncommitted.

- [ ] **Step 4: Manual test instructions for the same conversation**

Reload `.output/chrome-mv3` as an unpacked extension, reopen:

```text
https://chatgpt.com/c/6a696e9a-20e4-83ec-8fe9-14aa73b4ffa8
```

Export again and verify:

1. the popup's collected-message count is greater than five;
2. `main.tex` begins with the actual first user question, not “Bước 9”;
3. the final “Bước 11” content remains present;
4. TypeScript code starts with
   `\begin{lstlisting}[language=ChatTypeScript]`;
5. keywords, strings, and comments visibly use different colors;
6. copied multi-line code contains no visual line numbers;
7. Vietnamese diacritics remain intact.

- [ ] **Step 5: Preserve the requested Git state**

Do not stage or commit. Report:

- focused/full test counts;
- compile/build result;
- files created/modified;
- manual runtime items that require the user's browser if no connected
  browser is available.
