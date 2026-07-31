# Existing Export Quality Design

## Context

Chat2TeX already supports complete-conversation collection, configurable
LaTeX templates, image conversion, XeLaTeX compilation, and PDF/TEX/ZIP
downloads. This change improves those capabilities without adding a new
user-facing feature.

The current implementation has four structural risks:

1. popup export and in-page export duplicate orchestration and process images
   differently;
2. the popup stores one export run across several independent React states,
   so an older asynchronous run can overwrite a newer run;
3. XeLaTeX fallback removes every image when a failing path is not present in
   the log, even when most images are valid;
4. the largest rendering and UI files combine unrelated responsibilities and
   lack direct tests around their existing state transitions.

## Goals

- Make popup and in-page exports use the same preparation, asset, compilation,
  and download application service.
- Preserve bounded parallel image processing, deterministic output order,
  detailed failure codes, and progress reporting in both entrypoints.
- Prevent stale asynchronous work from mutating the active popup run.
- Retain as many valid images as possible when XeLaTeX rejects an image.
- Split language/text helpers out of the LaTeX generator without changing
  generated output.
- Add regression tests for the existing export states and failure paths.

## Non-Goals

- Adding export formats, cloud storage, history, accounts, an editor, or new
  template controls.
- Changing the current popup steps or the one-click in-page workflow.
- Changing the generated document's visual design.
- Changing how ChatGPT conversations are discovered or which branch is
  exported.
- Adding a general localization framework.

## Shared Export Application Service

A framework-independent `ExportPipeline` will own the existing export
operations. Browser-specific behavior is supplied through an `ExportPorts`
interface:

- `prepare(options)` returns a `PreparedExport`;
- `resolveAsset(asset)` returns the existing `ResolveAssetResult`;
- `compile(project)` returns the existing compiler response;
- `download(payload)` returns the existing download response.

The pipeline exposes four staged methods:

1. `prepare`;
2. `processAssets`;
3. `compile`;
4. `download`.

The popup keeps its explicit prepare, compile, and download buttons by calling
the methods separately. The in-page exporter calls the same methods
sequentially. Host-permission prompting remains in the popup adapter because
the browser requires the permission request to happen directly from a user
gesture.

`processAssets` uses one shared bounded-concurrency helper. It records results
by input index so files and failures remain deterministic even when requests
finish out of order. A progress callback receives completed count, total, and
the latest asset label.

The pipeline contains no React state and no direct `browser.*` calls. This
makes orchestration testable with real in-memory ports.

## Popup State Consistency

The popup hook will use a reducer for the export data that belongs to a single
run: phase, prepared export, processed assets, progress, error, PDF data,
compiler log, downloaded files, and selected export options.

Every `prepare` call increments a run identifier. Asynchronous actions capture
that identifier, and reducer actions from an older run are ignored. This
prevents an earlier scan, asset conversion, compile, or download from
overwriting the current run.

The reducer accepts only explicit transition actions such as:

- `prepare-started`;
- `permission-required`;
- `asset-progress`;
- `assets-ready`;
- `compile-started`;
- `compile-succeeded`;
- `download-started`;
- `download-succeeded`;
- `failed`.

The visible phase names and button behavior remain unchanged.

## Image Processing Consistency

Both entrypoints will resolve images through the shared pipeline with a
concurrency limit of three. Existing result codes remain authoritative:

- permission required;
- page read required;
- download failed;
- decode failed;
- compiler rejected.

The in-page adapter will no longer replace all asset failures with a generic
`download-failed` value. Each failure retains the resolver's original code and
message. Unexpected thrown errors are converted into a targeted
`download-failed` result for that asset without stopping the rest of the
batch.

No new retry policy is added to image network requests in this change.
Existing browser-message retry behavior remains in place.

## XeLaTeX Image Isolation

Compilation keeps the existing first attempt with every processed image.

When compilation fails:

1. if the log names one or more project image paths, remove those paths and
   retry the remaining project;
2. if the log names no path, probe subsets of the remaining files to isolate
   one failing image;
3. retry the complete project without the isolated image;
4. repeat when another image fails;
5. stop after every original file has been removed or a compile succeeds.

Subset probes are valid because generated image markup uses
`\IfFileExists`; omitted probe files render the existing unavailable-image
fallback instead of causing a missing-file source error.

All attempt logs are combined in chronological order. A successful result
reports the exact omitted file paths. If the source still fails with no files,
the compiler throws a `FallbackCompileError` containing the accumulated log.

The isolation algorithm prioritizes preserving valid images over minimizing
compile attempts. It uses binary partitioning, so isolating one unnamed bad
file takes logarithmic probe attempts.

## LaTeX Generator Decomposition

Pure language and text helpers will move out of `latex-generator.ts`:

- document-language detection;
- Vietnamese `listings` character mappings;
- code-language normalization and inference;
- word-boundary truncation.

The generator will import these helpers and keep a compatibility re-export for
`truncateAtWordBoundary`. The content script will import truncation from the
small text helper directly, avoiding an unnecessary dependency on the full
generator module.

Golden output assertions in the existing generator tests must remain
unchanged except where a test imports the extracted helper directly.

## Error Handling

- A single asset failure does not stop other assets.
- Permission denial remains a terminal popup error for that run.
- Stale run failures are ignored rather than shown over the current run.
- Compile errors retain all accumulated diagnostic logs.
- Partial download success retains the successful filenames and reports the
  existing aggregate failure.
- No error message exposes cookies, authorization headers, or raw API
  responses.

## Testing

### Export pipeline

- processes at most three assets concurrently;
- preserves deterministic result order;
- reports progress for every completed asset;
- retains resolver failure codes and converts thrown errors safely;
- passes prepared source and successful files to compile and download ports.

### Popup reducer

- follows the valid existing phase sequence;
- resets run-specific data on a new prepare;
- ignores actions from stale run identifiers;
- preserves successful download filenames when a partial download fails.

### Compiler

- preserves existing exact-path fallback;
- isolates one unnamed bad image without removing valid siblings;
- isolates multiple bad images over successive retries;
- fails with accumulated logs when source compilation fails without images;
- initializes the engine once.

### Generator extraction

- language detection, code inference, Vietnamese mappings, and truncation keep
  existing behavior;
- complete LaTeX generator tests remain green.

### Verification

- focused red-green tests for each production change;
- complete Vitest suite;
- TypeScript compilation;
- Chrome MV3 production build;
- `git diff --check`.

## Acceptance Criteria

- Popup and in-page exports use the same application service for the four
  existing export stages.
- Both entrypoints process images with the same concurrency and failure
  semantics.
- An earlier asynchronous run cannot overwrite a newer popup run.
- An unnamed corrupt image no longer causes every valid image to be omitted.
- Generated LaTeX output remains compatible with all existing tests.
- No new user-facing control or workflow is introduced.
- Existing user changes remain uncommitted unless the user explicitly asks
  for a commit.
