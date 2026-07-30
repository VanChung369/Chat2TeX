# Editorial Book PDF Layout

## Context

Chat2TeX currently generates a functional A4 `article`, but its visual system
still resembles a lightly styled chat transcript. Every message receives a
prominent full-width header, the document starts with the standard LaTeX
`\maketitle`, headings do not form a usable table of contents, code and tables
use minimal defaults, and long documents lack running navigation.

The supplied 165-page reference PDF demonstrates a stronger reading hierarchy:
large sans-serif headings, generous spacing, pale user-message bands, clear
code surfaces, a consistent footer, and stable pagination. Chat2TeX should
retain that clarity while moving further toward an editorial technical book
rather than copying a browser printout.

## Goals

- Make long conversation exports read like professionally typeset technical
  books.
- Add a dedicated cover, automatic contents page, running header, footer, and
  page numbers.
- Distinguish reader questions from the main narrative without reproducing a
  chat interface.
- Improve typography and the presentation of headings, code, tables, images,
  quotes, lists, links, and mathematics.
- Preserve reliable pagination for very long conversations.
- Remain compatible with the fixed-memory BusyTeX XeLaTeX runtime.

## Non-Goals

- Add selectable PDF themes to the popup.
- Reproduce OpenAI branding or the reference extension's footer.
- Add generated chapter titles that are absent from the conversation.
- Summarize, rewrite, or reorder conversation content.
- Change conversation collection, asset downloading, compilation fallback, or
  export packaging.
- Restore `tcolorbox` or any whole-message visual container.

## Chosen Direction

The selected direction is **Editorial Book**:

- warm off-white paper;
- Latin Modern Roman for narrative text;
- Latin Modern Sans for labels, navigation, and supporting metadata;
- restrained brown and sage accents;
- generous but not wasteful whitespace;
- light, high-contrast code blocks with restrained syntax colors;
- numbered content hierarchy;
- lightweight running navigation.

The design uses A4 `article` rather than `book`. This avoids automatically
inserted blank pages and keeps the current one-sided export behavior while
allowing the generator to supply book-like front matter and page furniture.

## Document Structure

The generated document has this order:

1. **Cover page**
   - conversation title;
   - “A thoughtfully typeset ChatGPT conversation” subtitle;
   - Chat2TeX edition label;
   - source link and export attribution in small metadata.
2. **Contents page**
   - native LaTeX table of contents;
   - every user question as a top-level entry;
   - the main assistant heading within each answer as a child entry;
   - deeper implementation headings omitted from the contents.
3. **Conversation body**
   - reader questions rendered as restrained callouts;
   - assistant responses rendered as the main narrative;
   - numbered headings and running section marks.

The cover does not display a page number. The contents uses lower-case Roman
page numbering with a plain front-matter style. The conversation body restarts
with Arabic page 1 and uses the editorial running style.

## Visual System

### Page and typography

- A4 paper with approximately 23 mm top/bottom and 24 mm left/right margins.
- Narrative copy uses the available Latin Modern Roman face at 11 pt.
- Labels and navigation use the matching sans-serif family.
- A subtle `bookpaper` page color supplies the warm off-white background.
- Paragraphs use a modest first-line-free editorial rhythm with controlled
  inter-paragraph spacing and slightly relaxed leading.
- Widow, orphan, and emergency-stretch settings reduce awkward page endings
  and overfull lines.
- Link color is muted brown rather than browser blue.

`fontspec` remains conditional. When it is unavailable, XeLaTeX uses its
default Latin Modern families and the document retains the same hierarchy.

### Cover

The cover is vertically balanced rather than using `\maketitle`. It contains:

- a short brown rule;
- an uppercase Chat2TeX edition kicker;
- a large, regular-weight conversation title;
- a quiet descriptive subtitle;
- source metadata separated by a thin bottom rule.

The cover uses only core LaTeX layout primitives and does not depend on a cover
package.

### Running header and footer

A custom page style is defined with core LaTeX commands rather than
`fancyhdr`:

- conversation title on the left;
- current top-level section on the right;
- Chat2TeX label and page number in the footer;
- thin, low-contrast rules and small uppercase sans-serif text.

This avoids adding a package that may be unavailable in BusyTeX.

### Reader questions

User messages become a `readerquestion` environment:

- numbered sage “Reader's question” or “Câu hỏi” label;
- indented sans-serif body in a darker sage tone;
- a short accent rule;
- spacing before and after the question.

Each question also advances the section counter and writes a concise,
deterministically truncated title to the contents without rendering a
duplicate large heading in the body.

The environment changes indentation, color, and font inside a normal TeX
group. It must not use `tcolorbox`, `minipage`, `parbox`, framed environments,
or another mechanism that buffers the complete message.

### Assistant responses

Assistant messages do not display a large “Assistant” banner. Their blocks
flow as normal book content after a small transition space. Empty assistant
messages retain the existing visible fallback.

This role treatment is the primary change that makes the export read as a book
instead of a chat transcript.

### Headings and contents

- Each user question creates a numbered `\section` navigation entry.
- The shallowest heading in its assistant answer maps to numbered
  `\subsection`, regardless of whether the source begins at HTML H1 or H2.
- The next assistant level maps to numbered `\subsubsection`.
- Deeper levels remain compact run-in headings and stay out of the contents.
- Assistant-only documents still promote their shallowest heading to
  `\section`.
- Headings inside user messages are unnumbered and stay out of the contents.
- `tocdepth=2` keeps the contents focused on questions and main answer
  headings.

Heading typography is customized with core `\@startsection` definitions.
Top-level headings use the editorial brown accent and update the running
section mark.

### Code

Listings use:

- a warm light-gray background with dark monospace text;
- distinct keyword, string, comment, and identifier colors supported by
  `listings`;
- a small sans-serif language label when a mapped language is available;
- subdued line numbers and a fine border;
- automatic line breaking and preserved whitespace;
- NFC-normalized source plus explicit Vietnamese `literate` mappings.

The listing remains page-safe and does not sit inside another unbreakable
container.

### Tables

Long tables retain `longtable` so they may span pages. Generated column
definitions use equal-width paragraph columns derived from `\linewidth`,
allowing cell text to wrap instead of overflowing as it does with the current
`l` columns.

Header rows use bold sans-serif text and subtle rules. Body rows remain
unfilled to avoid relying on additional table-color packages.

### Images

Block images remain non-floating so their order matches the conversation.
They use:

- maximum width of `\linewidth`;
- maximum height that leaves room for surrounding text;
- `keepaspectratio`;
- a small italic caption derived from non-empty alt text;
- the existing missing-file placeholder and image-omission compilation
  fallback.

Inline images keep their current baseline-aligned behavior.

### Quotes, lists, mathematics, and rules

- Quotes receive a narrow left indent, italic narrative styling, and a small
  brown lead rule without a buffered frame.
- Lists use tighter editorial spacing while remaining comfortably readable.
- Display mathematics receives balanced vertical spacing and may break across
  the surrounding page flow.
- Horizontal rules become short brown editorial separators rather than
  full-width black lines.

## Generator Architecture

The change remains inside `LatexGenerator` and its tests. The generator is
divided into focused render responsibilities:

- `renderPreamble()` owns packages, typography, colors, page styles, reusable
  environments, and component defaults;
- `renderCover()` owns front-cover content;
- `renderContents()` owns the contents page and transition into body page
  style;
- `renderMessage()` selects reader-question or narrative treatment from the
  message role;
- block renderers receive enough role context to normalize assistant heading
  depth and decide whether headings are numbered and included in the contents.

The AST, asset request format, compiler project, and message protocol remain
unchanged.

## Data Flow

1. The existing parser produces the conversation AST.
2. `LatexGenerator.generate()` sorts messages and creates the narrative body.
3. User-role rendering creates a top-level navigation entry and opens the
   lightweight reader-question group.
4. Assistant-role rendering emits normal narrative blocks.
5. The shallowest heading in each answer becomes a subsection of the current
   question; assistant-only content retains section promotion.
6. The cover, contents page, and body are assembled around the rendered
   messages.
7. Existing asset resolution and BusyTeX compilation continue unchanged.

## Reliability and Error Handling

- No message body is placed inside `tcolorbox`, `minipage`, `parbox`, or an
  equivalent whole-body box.
- The template uses packages already present in the current generator. New
  page styling is implemented with core LaTeX primitives.
- `fontspec` remains guarded with `\IfFileExists`.
- Missing images retain their current inline placeholder.
- Empty titles fall back to “Untitled conversation”.
- Empty messages remain visibly represented.
- Escaping continues through the existing text and URL escaping utilities.
- Image-tolerant compilation and full diagnostic logs remain unchanged.

## Testing

Unit tests cover:

- cover and contents generation;
- custom running page-style commands;
- user question treatment and assistant narrative treatment;
- question-derived top-level contents entries with concise fallbacks;
- assistant headings becoming children of the current question without a
  leading zero section number;
- user headings remaining unnumbered;
- absence of whole-message boxes and `tcolorbox`;
- wrapping table column definitions;
- high-contrast multi-color code listings, line numbers, and Vietnamese code;
- image caption generation and existing missing-image fallback;
- preservation of conditional `fontspec`.

Verification includes:

- the focused LaTeX generator test file;
- the complete Vitest suite;
- TypeScript compilation;
- production extension build;
- `git diff --check`;
- a manual export of a long conversation to inspect cover, contents,
  pagination, long code, long tables, mathematics, and omitted-image behavior.

## Acceptance Criteria

- The first page is a dedicated Editorial Book cover.
- A contents page follows and contains every user question plus the main
  heading inside each answer.
- User questions are recognizable without a full-width chat banner.
- Assistant content reads as continuous editorial prose.
- Every body page has restrained running navigation and a page number.
- Vietnamese prose and code retain their diacritics.
- Long code, tables, and messages can cross pages without a TeX capacity
  failure caused by whole-message containers.
- Generated source still compiles when `fontspec.sty` is absent.
- Existing image fallback behavior and diagnostic reporting remain intact.
