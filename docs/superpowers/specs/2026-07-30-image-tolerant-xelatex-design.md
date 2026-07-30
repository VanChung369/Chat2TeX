# Image-Tolerant XeLaTeX Compilation

## Context

Chat2TeX currently sends all successfully downloaded image files to BusyTeX.
When BusyTeX returns a failed result, the popup only shows the generic exit
code even though the response already contains the complete compile log.
A single image that XeLaTeX or `xdvipdfmx` cannot embed can therefore block
the entire PDF export without identifying the failing asset.

Runtime checks confirmed that BusyTeX can compile both the generated Chat2TeX
document and a real `gstatic` favicon after the existing Canvas-to-PNG
conversion. The fallback must consequently respond to file-specific failures
without assuming that all images are unsupported.

## Goals

- Keep successfully embeddable images in the PDF.
- Prevent a file-specific image failure from blocking the PDF export.
- Identify omitted image paths in the successful compile response.
- Show a concise failure reason and make the full BusyTeX log available.
- Preserve the current missing-image placeholder generated with
  `\IfFileExists`.

## Non-Goals

- Repair malformed image bytes inside the compiler.
- Retry network downloads during compilation.
- Change the generated LaTeX image layout.
- Suppress non-image LaTeX failures.

## Compilation Flow

1. Compile the source with all resolved image files.
2. If compilation succeeds, return the PDF with no omitted files.
3. If compilation fails:
   - Search the compile log for project image paths mentioned in fatal/error
     diagnostics.
   - If one or more paths are identified, remove only those files.
   - If no path can be identified, remove all image files as a safe fallback.
4. Retry compilation once with the reduced file set.
5. If the retry succeeds, return the PDF, combined diagnostic log, and the
   omitted paths.
6. If the retry fails, return the second failure with both attempt logs so the
   popup exposes the final actionable error.

The retry count is limited to one to avoid repeatedly running a relatively
expensive XeLaTeX pipeline.

## Components

### Compile log diagnostics

A pure compiler utility will:

- extract project file paths mentioned in fatal/error sections;
- extract a concise human-readable diagnostic from BusyTeX logs;
- combine primary and fallback logs with clear attempt labels.

Path matching is restricted to the exact paths supplied in the compile
project. Arbitrary strings found in the log cannot remove files.

### Compiler orchestration

`LatexCompiler` will own the retry policy because it already coordinates
engine initialization and compilation. A successful output will include
`omittedFiles: string[]`.

The first error is rethrown without retry when the project contains no files.
When a retry is required, the compiler supplies only the retained files to the
engine.

### Message boundary

The serialized successful compile response will include `omittedFiles`.
The offscreen compiler will preserve the diagnostic log returned by
`LatexCompiler`.

### Popup state and reporting

After a successful fallback compile, the popup will:

- move omitted files from the processed-file list into the failure list;
- associate paths back to prepared assets;
- state that XeLaTeX omitted those images;
- package metadata consistently with the actual PDF contents.

On a failed compile, the popup will show:

- the generic compiler error plus the concise extracted diagnostic;
- a collapsible raw-log section for complete troubleshooting context.

## Error Handling

- A normal successful compile does not display a warning.
- A successful retry produces a PDF and an explicit omitted-image warning.
- A failed retry remains a compilation error; it is not reported as an image
  omission.
- Empty logs fall back to the existing generic error message.
- Log parsing never decides whether compilation succeeded; BusyTeX's result
  remains authoritative.

## Testing

- Unit-test extraction of exact failing project paths from XeLaTeX and
  `xdvipdfmx` diagnostics.
- Unit-test the no-match case.
- Unit-test successful compilation without retry.
- Unit-test retry with only the diagnosed image removed.
- Unit-test retry without all files when no failing path is identifiable.
- Unit-test that projects without files are not retried.
- Unit-test that a failed fallback preserves diagnostic context.
- Verify TypeScript, the full Vitest suite, and the production extension
  build.
