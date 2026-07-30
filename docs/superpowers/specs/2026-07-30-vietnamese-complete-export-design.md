# Vietnamese and Complete Conversation Export Design

## Summary

Chat2TeX currently produces an Editorial Book PDF, but four related problems
remain:

1. some long or multi-part ChatGPT messages are only partially collected;
2. the collector can stop before older virtualized messages have loaded;
3. the contents page is based only on assistant headings and is therefore
   sparse or noisy;
4. code blocks have weak readability and do not reliably preserve Vietnamese
   UTF-8 text.

This change makes conversation collection observable and complete, promotes
each reader question into the book's navigation hierarchy, and replaces the
dark code palette with a high-contrast, multi-color technical-book style.

## Goals

- Preserve every mounted content section inside each supported user or
  assistant message.
- Continue loading virtualized history until the beginning of the conversation
  is observed whenever ChatGPT exposes a reliable first-turn marker.
- Show the collected message count before compilation.
- Render Vietnamese prose, navigation labels, and code comments or strings
  correctly with XeLaTeX.
- Give each user question a stable top-level contents entry.
- Keep assistant headings as subordinate document structure without creating
  an excessively deep contents page.
- Use colorful syntax highlighting with print-friendly contrast.

## Non-goals

- Summarizing or rewriting user questions with an AI model.
- Adding an online syntax-highlighting service.
- Using `minted`, Python, Pygments, or shell escape.
- Supporting arbitrary emoji fonts inside code listings.
- Changing the compiler, image pipeline, export archive structure, or existing
  no-commit workflow.

## Root Causes

### Partial message content

`ChatGPTAdapter.createMessage()` currently selects one element with
`querySelector(CONTENT_SELECTOR)`. When a message contains multiple top-level
Markdown or message-content containers, only the first container reaches the
HTML-to-AST parser.

### Premature collection completion

`ConversationCollector` currently treats two unchanged snapshots at
`scrollTop <= 2` as completion. `DomConversationViewport.waitForSettle()` can
resolve after 300 ms without a mutation. Older messages loaded by a slower
network request may therefore arrive after collection has already stopped.

### Weak contents hierarchy

The current contents page is driven exclusively by assistant headings. A
conversation with few headings has an almost empty contents page, while an
answer with many small headings can dominate it. The reader's questions are
the stable top-level structure of a conversation and should form the primary
navigation.

### Vietnamese inside code

XeLaTeX and `fontspec` support Unicode prose, but the `lstlisting` environment
does not provide general native UTF-8 handling. Vietnamese characters need to
be normalized and explicitly mapped for listings.

## Architecture

The change stays within existing boundaries:

- `ChatGPTAdapter` remains responsible for turning mounted ChatGPT DOM into
  complete `ChatMessage` values.
- `ConversationCollector` remains responsible for scrolling, merging, and
  ordering virtualized messages.
- `PreparedExport` carries collection diagnostics to the popup.
- `LatexGenerator` remains responsible for language detection, document
  navigation, and code presentation.

No new runtime dependency is introduced.

## Complete Message Extraction

The adapter will collect all top-level content candidates matching the current
content selector instead of taking the first match.

Nested matches are de-duplicated: if a candidate is contained by another
candidate, only the outer candidate is retained. The retained candidates are
cloned into a temporary wrapper in their original DOM order, then the existing
noise removal and image preservation rules are applied.

If no content candidate exists, the complete message element remains the
fallback.

This supports messages split into multiple Markdown sections without
duplicating nested prose.

## Virtualized History Completion

The reader exposes a tri-state conversation-start signal:

- `true`: a reliable first-turn marker such as
  `data-testid="conversation-turn-0"` is mounted;
- `false`: numbered ChatGPT turn markers exist, but turn zero is not mounted;
- `null`: the DOM does not expose a compatible numbered marker.

At the top of the scroll container:

- when the signal is `false`, the collector continues waiting and requesting
  the top instead of accepting a stable snapshot;
- when it is `true`, the existing stability check confirms that the first turn
  has settled;
- when it is `null`, a longer fallback stability window prevents an indefinite
  wait on an unknown DOM version.

The collector still obeys a maximum pass limit and always restores the user's
original scroll position.

Collection progress includes the number of unique messages and whether the
conversation start has been observed. The prepared export exposes the final
message count so the popup can display, for example, “Đã thu thập 48 tin
nhắn.”

## Vietnamese Support

The generator detects Vietnamese from the document title and textual message
content using Vietnamese-specific letters and diacritics.

When Vietnamese is detected:

- `fontspec` remains the Unicode font layer;
- `polyglossia` is loaded conditionally and Vietnamese becomes the default
  document language;
- book labels are localized, including “Mục lục”, “Câu hỏi”, source metadata,
  and export attribution;
- strings are normalized to Unicode NFC before LaTeX escaping;
- Latin Modern Roman, Sans, and Mono remain the selected families because they
  are already bundled and cover Vietnamese text.

English documents retain the existing English labels and hierarchy.

If `polyglossia.sty` is unavailable, the document still renders Unicode text
through XeLaTeX and `fontspec`; only language-specific hyphenation is omitted.

## Contents and Conversation Hierarchy

Each user message starts one numbered top-level conversation section.

The contents title is derived deterministically from the first meaningful text
in the question:

- whitespace is collapsed;
- formatting is removed;
- the result is limited to 80 Unicode code points at a word boundary;
- an ellipsis is appended when truncated;
- an empty question falls back to “Câu hỏi N” or “Question N”.

The question callout remains the visible section opener, so the generated title
is not repeated as a separate large heading. A lightweight LaTeX command:

- increments the section counter;
- writes the question title to the contents;
- updates the running header;
- anchors the contents link at the question.

Assistant headings become children of the current question:

- the shallowest assistant heading level in that answer maps to
  `\subsection`;
- the next level maps to `\subsubsection`;
- deeper headings remain visible unnumbered run-in headings.

The contents depth is limited to subsections. It therefore shows every question
and the main heading level inside each answer, while deeper implementation
details stay out of the navigation.

An assistant-only document retains the existing behavior where its shallowest
heading becomes a top-level section.

## Colorful Code Blocks

The generator keeps `listings` because it provides offline, language-aware
syntax highlighting without external processes.

The visual system changes to:

- warm light-gray code background;
- dark neutral base code text;
- blue keywords;
- deep rose strings;
- green comments;
- muted brown line numbers and language label;
- a subtle warm-gray frame;
- visible continuation markers for wrapped lines.

The palette must maintain strong contrast on both screen and print. No token
class may use a color close to the background.

Code blocks display a small uppercase language label and left-side line
numbers. Long lines continue to wrap.

Before rendering, code is normalized to NFC. The preamble defines `literate`
mappings for the complete set of precomposed Vietnamese letters in uppercase
and lowercase. These mappings allow Vietnamese comments, identifiers, and
strings to survive `lstlisting` while retaining the surrounding syntax style.

The existing defense against an embedded `\end{lstlisting}` terminator remains.

## Data Flow

1. The collector scrolls to the bottom and gathers mounted messages.
2. The adapter extracts every top-level content section from each message.
3. The collector scrolls upward until the first-turn marker and stable content
   are observed, or the guarded fallback limit is reached.
4. The popup receives a prepared export containing the message count, LaTeX
   source, and asset requests.
5. The generator detects the document language.
6. Each user question creates a top-level contents entry.
7. Assistant headings create subordinate structure.
8. Code blocks use the light multi-color listings style and Vietnamese
   character mappings.
9. Existing asset resolution and BusyTeX compilation continue unchanged.

## Error Handling and Observability

- Collection never leaves the ChatGPT viewport at a different position.
- Repeated DOM containers are not duplicated.
- Unknown ChatGPT turn-marker formats use the guarded fallback stability path.
- Reaching the maximum pass limit returns all unique messages collected so far
  and exposes the count rather than silently claiming a known total.
- Existing compile diagnostics and image omission details remain unchanged.

## Testing

Automated tests will cover:

- one message containing multiple sibling Markdown containers;
- nested content candidates without duplicate text;
- delayed first-turn arrival after several stable top snapshots;
- fallback completion when numbered turn markers are unavailable;
- viewport restoration after collection;
- prepared export message count;
- Vietnamese language detection and localized labels;
- question-derived top-level contents entries;
- assistant headings subordinate to the current question;
- truncation and empty-question title fallbacks;
- light high-contrast code palette and multiple syntax colors;
- Vietnamese `literate` mappings and NFC-normalized code;
- existing long-table, image, math, memory-safety, compile, and build tests.

## Acceptance Criteria

- A conversation split across multiple content containers exports every
  container once and in order.
- A virtualized conversation does not stop before turn zero when ChatGPT
  exposes numbered turn markers.
- The popup shows the exact number of unique collected messages.
- Vietnamese prose and Vietnamese text inside code blocks survive generation.
- The contents page lists every user question as a top-level entry.
- The main assistant headings appear as child entries without excessive depth.
- Code blocks have a light background with clearly distinct keyword, string,
  comment, base-text, label, and line-number colors.
- Long code still wraps and long messages still cross pages without a
  whole-message box.
- Full tests, TypeScript compilation, production build, and `git diff --check`
  pass.
