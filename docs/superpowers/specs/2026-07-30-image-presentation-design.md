# Image Presentation Design

## Goal

Preserve every image collected from a ChatGPT conversation while preventing
small favicons, logos, and icons from being enlarged into full-page images.
This change is limited to image collection, classification, rendering, and
image-failure presentation. The broader PDF and popup redesign remains out of
scope.

## Image classification

Every collected image is classified as one of two presentations:

- `content`: screenshots, generated images, diagrams, photos, and other images
  that belong to the conversation.
- `icon`: favicon providers, citation/link-preview images, and small
  decorative logos.

Classification uses DOM context and source URL, but never drops an image.
Known favicon providers and favicon paths are classified as `icon`.
Images inside citation or link-preview elements are also classified as
`icon` when they have no meaningful alternative text. All other images remain
`content`.

The presentation value is carried from the mounted ChatGPT DOM through the
conversation HTML and document AST into the LaTeX generator. API-first
conversation enrichment preserves both image kinds and deduplicates them by
source URL.

## PDF rendering

Content images:

- Keep their original aspect ratio.
- Render at their natural size when they already fit.
- Only scale down when wider than the text area or taller than 70 percent of
  the text height.
- Remain centered and may include their alternative text as a caption.

Icon images:

- Render in a compact horizontal row.
- Use a maximum height of `1.4em` and never receive block-image dimensions.
- Do not create a dedicated page or large vertical gap.
- Preserve the underlying asset in the source package.

The LaTeX template uses `adjustbox` maximum dimensions so small raster images
are never upscaled.

## Failed images

A failed content image renders as a compact framed placeholder containing its
alternative text and a short failure marker. A failed icon renders as a small
text marker. Detailed download causes remain available in the extension
diagnostics and source-package metadata.

## Data flow

1. `ChatGPTAdapter` clones message content and annotates each image with a
   ChatTeX presentation attribute.
2. `CompleteConversationReader` merges mounted images into API messages
   without removing favicon or citation images.
3. `HtmlToAstParser` converts the presentation attribute into the image AST.
4. `LatexGenerator` groups adjacent icons into a compact row and renders
   content images with scale-down-only constraints.
5. `AssetManager` continues downloading both image kinds without changing
   its byte-size and conversion safeguards.

## Verification

Automated tests cover:

- Citation favicons are retained and classified as icons.
- Generated and normal Markdown images remain content images.
- API-first enrichment retains and deduplicates both image kinds.
- Content-image LaTeX uses maximum dimensions rather than forced width.
- Icon-image LaTeX uses compact height and does not use block-image sizing.
- BusyTeX compiles a document containing both presentations without a fatal
  diagnostic.

Manual verification uses the supplied export case: the Chrome, GitHub, and
other citation icons must appear compactly, while the full conversation and
real content images remain present.
