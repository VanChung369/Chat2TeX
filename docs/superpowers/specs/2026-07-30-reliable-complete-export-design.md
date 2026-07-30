# Reliable Complete Export Design

## Context

The exported PDF at
`/Users/duongchung/Downloads/ChatTeX/extension-export-pdf-latex-2026-07-30.pdf`
proves that the current implementation still fails in three user-visible
ways:

1. the export contains only two user questions and begins at “Bước 9”;
2. every generated `lstlisting` lacks a language option, so the configured
   syntax colors are never applied;
3. line numbers are ordinary PDF text and are copied with the source code.

The DOM collector is not a reliable source of completeness. ChatGPT currently
numbers its first rendered turn as `conversation-turn-1`, while the adapter
waits for turn zero. More importantly, the collector returns its partial map
after `maxPasses` even when it never finds the beginning. Virtualized DOM,
scroll-root selection, and asynchronous history loading can therefore produce
a successful but incomplete export.

## Goals

- Export every user and assistant message on the active conversation branch.
- Preserve Markdown structure, especially fenced-code language identifiers.
- Keep images available from mounted DOM content when possible.
- Never report a partial conversation as a successful complete export.
- Produce visible syntax colors for TypeScript, JavaScript, JSON, shell, CSS,
  HTML, Python, SQL, and other supported fenced languages.
- Keep visual line numbers without including them in copied code text.
- Preserve the existing Vietnamese, question-based contents, image pipeline,
  source ZIP, and BusyTeX compilation behavior.

## Non-Goals

- Exporting every alternate response branch.
- Exporting hidden tool, system, reasoning, or internal metadata messages.
- Replacing ChatGPT's authentication flow.
- Building a general-purpose Markdown editor.
- Guaranteeing compatibility with future undocumented backend response
  formats without validation and fallback.

## Chosen Architecture

The export preparation path becomes API-first with a guarded DOM fallback.

### API conversation reader

A new `ChatGptConversationApiReader` runs in the ChatGPT content-script
context. It:

1. derives the conversation ID from `/c/:id`;
2. reads the current session from `/api/auth/session`;
3. requests `/backend-api/conversation/:id` with the session access token;
4. validates the minimum response shape before consuming it;
5. follows `parent` links from `current_node` back to the root;
6. reverses that path into chronological order;
7. retains only user and assistant messages whose visible content can be
   exported.

The reader receives a bound fetch function through its constructor. This
avoids illegal invocation errors and makes the external boundary testable.

The API response is treated as an unstable external contract. Parsing uses
runtime type guards and produces a targeted error when required fields are
missing. Raw access tokens and response bodies are never logged.

### Markdown rendering

API text parts remain Markdown until a dedicated Markdown renderer converts
them to standard HTML understood by the existing `HtmlToAstParser`.

The renderer:

- disables raw HTML execution;
- preserves headings, paragraphs, emphasis, links, lists, quotes, tables,
  horizontal rules, and fenced code;
- emits fenced code as
  `<pre data-language="typescript"><code class="language-typescript">…`;
- emits safe links with their original URL;
- preserves line breaks and Unicode text;
- renders supported inline and display math into elements carrying
  `data-latex`, so the existing AST math extraction still works.

The implementation uses `marked` with local extensions for inline/display
math and a renderer that escapes raw HTML while retaining fenced-language
metadata. This avoids a partial hand-written Markdown parser. The dependency
is confined to the content-script export path.

### Active-branch ordering

The API mapping can contain edited prompts and alternate assistant answers.
Only the branch ending at `current_node` is exported:

```text
current_node
    -> parent
    -> parent
    -> root
```

After reversing the path, order is assigned sequentially. Nodes without an
exportable user or assistant message are skipped without breaking the path.
This matches the conversation currently selected in ChatGPT rather than
including abandoned alternatives.

### DOM enrichment and fallback

Mounted DOM extraction remains useful because it contains resolved image URLs
and current rendered details. API messages and mounted DOM messages are merged
by message ID:

- the API provides the complete ordered message set;
- unique image elements from matching mounted DOM messages are appended to
  the API-rendered HTML;
- API-rendered prose and code remain authoritative so fenced-language
  metadata cannot be lost during enrichment;
- API-rendered HTML supplies every unmounted message.

If API collection fails, the existing scroll collector runs as fallback with
two changes:

- `conversation-turn-1` is accepted as the beginning;
- reaching `maxPasses` without a verified beginning throws an explicit
  incomplete-conversation error instead of returning partial data.

The popup displays the detailed failure and does not proceed to asset
processing or compilation.

## Code Language Detection

Language detection is layered:

1. `data-language` or `data-lang` on `<pre>` or `<code>`;
2. `language-*` or `lang-*` classes;
3. a recognized ChatGPT code-header label near the `<pre>`;
4. a conservative content heuristic when no metadata exists.

The heuristic recognizes only strong signatures:

- TypeScript/JavaScript: `import`, `export`, `const`, `interface`, typed
  declarations, or arrow functions;
- JSON: a parseable object or array shape without comments;
- shell: shebangs or common shell commands;
- HTML/XML: leading tags;
- CSS: selector-plus-declaration structure;
- Python: `def`, `class`, `from ... import`, or indentation with colons;
- SQL: common statement prefixes.

Ambiguous snippets remain plain listings rather than receiving incorrect
highlighting.

The LaTeX preamble defines `ChatTypeScript` from the built-in JavaScript
language and adds TypeScript-specific keywords. Mapped TypeScript fences use
this language instead of silently degrading to generic JavaScript.

## Copy-Safe Line Numbers

The document keeps visual line numbers. When `accsupp.sty` is available, the
number style wraps each line number in an accessibility span whose
`ActualText` is empty. PDF viewers then copy only code content.

The package remains guarded with `\IfFileExists`. If it is unavailable, the
safe fallback disables line numbers rather than making them copyable. This
prioritizes correct clipboard behavior over decorative numbering.

## Error Handling

API collection errors use concise categories:

- session unavailable;
- conversation request rejected;
- malformed conversation response;
- active branch cannot be reconstructed.

If API collection fails but verified-complete DOM collection succeeds, export
continues. If both fail, the popup shows one error containing:

- the API failure reason;
- the number of DOM messages collected;
- the lowest mounted turn number;
- a statement that export was stopped to avoid producing an incomplete PDF.

No token, authorization header, or full backend payload is included.

## Testing

### API reader tests

- reconstruct a complete active branch from a mapping with alternatives;
- begin at turn one and include the first user message;
- ignore system and tool nodes while keeping branch order;
- reject malformed responses;
- reject non-conversation URLs;
- use a bound injected fetcher and send required authorization headers.

### Markdown and AST tests

- fenced TypeScript retains `language: "typescript"`;
- headings, lists, tables, quotes, links, Vietnamese text, and math survive
  Markdown-to-AST conversion;
- raw HTML is escaped rather than executed;
- mounted DOM HTML can enrich an API message without dropping API-only
  messages.

### DOM fallback tests

- turn one is recognized as the conversation start;
- reaching the pass limit without a verified start rejects instead of
  returning partial content;
- a verified complete DOM conversation remains exportable when API access
  fails.

### LaTeX tests

- TypeScript emits `language=ChatTypeScript`;
- TypeScript-specific and base syntax styles are configured;
- unlabeled but strongly identifiable code receives a supported language;
- ambiguous text remains plain;
- line numbers use the non-copy wrapper;
- the no-`accsupp` branch disables line numbers.

### Verification

- focused red-green tests for each defect;
- complete Vitest suite;
- TypeScript compilation;
- Chrome MV3 production build;
- `git diff --check`;
- manual export of the same long conversation;
- confirm the TEX starts at the first user message and contains the expected
  question count;
- copy a multi-line code block from the PDF and confirm no line numbers enter
  the clipboard;
- visually confirm keywords, strings, comments, and identifiers use distinct
  colors.

## Acceptance Criteria

- The exported source contains the first and last visible messages on the
  selected conversation branch.
- The popup never marks a known-partial collection as ready.
- The exported message count matches the API active-branch message count.
- TypeScript and JavaScript blocks visibly use multiple syntax colors.
- Copying code from the PDF does not include visual line numbers.
- Vietnamese prose and code retain all diacritics.
- Existing image, contents, source ZIP, and BusyTeX flows remain operational.
- All changes remain uncommitted unless the user later requests a commit.
