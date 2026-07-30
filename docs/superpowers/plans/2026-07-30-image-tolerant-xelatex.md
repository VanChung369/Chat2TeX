# Image-Tolerant XeLaTeX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep PDF export working when BusyTeX rejects an image, retain unaffected images when the log identifies the bad file, and expose actionable compiler diagnostics.

**Architecture:** A pure diagnostics module will parse only fatal/error windows and match them against exact project paths. `LatexCompiler` will retry once with diagnosed images removed, or with all images removed when no path is identifiable; the popup will reconcile omitted paths with export metadata and render concise plus raw diagnostics.

**Tech Stack:** TypeScript 5.9, React 19, WXT 0.20, Vitest 4, BusyTeX/XeLaTeX.

## Global Constraints

- Retry compilation at most once.
- Never remove a file based on an arbitrary log substring; match only exact paths supplied in the compile project and only inside fatal/error diagnostic windows.
- Preserve the existing `\IfFileExists` placeholders.
- Do not suppress a compilation failure when the fallback also fails.
- Do not add dependencies.

---

## File Structure

- Create `src/features/compiler/compile-diagnostics.ts`: pure log parsing, exact-path diagnosis, combined logs, and fallback error type.
- Create `tests/features/compiler/compile-diagnostics.test.ts`: parser and formatter behavior.
- Modify `src/features/compiler/types.ts`: distinguish engine output from compiler output and serialize omitted paths.
- Modify `src/features/compiler/latex-compiler.ts`: one-retry orchestration.
- Modify `src/features/compiler/busytex-engine.ts`: conform to the engine-output interface.
- Modify `entrypoints/compiler/main.ts`: serialize omitted paths and preserve structural compile logs.
- Modify `tests/features/compiler/latex-compiler.test.ts`: normal, targeted fallback, all-file fallback, no-file failure, and double-failure coverage.
- Create `src/features/export/compile-omissions.ts`: reconcile omitted compiler paths with processed assets.
- Create `tests/features/export/compile-omissions.test.ts`: metadata consistency coverage.
- Modify `src/features/assets/types.ts`: add the `compiler-rejected` failure code.
- Modify `entrypoints/popup/use-export-flow.ts`: apply omissions and concise error formatting.
- Modify `entrypoints/popup/App.tsx`: warnings, omitted-image list, and raw-log disclosure.
- Modify `entrypoints/popup/style.css`: bounded readable log presentation.

---

### Task 1: Compile Log Diagnostics

**Files:**

- Create: `src/features/compiler/compile-diagnostics.ts`
- Create: `tests/features/compiler/compile-diagnostics.test.ts`

**Interfaces:**

- Produces:
  - `findFailingProjectPaths(log: string, projectPaths: readonly string[]): string[]`
  - `extractCompileDiagnostic(log: string): string | null`
  - `formatCompileFailure(message: string, log: string): string`
  - `readCompileLog(error: unknown): string`
  - `combineCompileLogs(firstLog: string, fallbackLog: string): string`
  - `FallbackCompileError extends Error` with `compileLog: string`

- [ ] **Step 1: Write failing parser tests**

```ts
import { describe, expect, it } from "vitest";

import {
  extractCompileDiagnostic,
  findFailingProjectPaths,
  formatCompileFailure,
  readCompileLog,
} from "@/src/features/compiler/compile-diagnostics";

describe("compile diagnostics", () => {
  it("finds only project paths mentioned near fatal diagnostics", () => {
    const log = [
      "File: assets/good.png Graphic file",
      "xdvipdfmx:fatal: Image inclusion failed.",
      'Unable to load "assets/bad.png".',
    ].join("\n");

    expect(
      findFailingProjectPaths(log, [
        "assets/good.png",
        "assets/bad.png",
      ]),
    ).toEqual(["assets/bad.png"]);
  });

  it("extracts a concise TeX diagnostic with its source line", () => {
    const log = [
      "! LaTeX Error: File `missing.sty' not found.",
      "Type X to quit.",
      "l.42 \\\\usepackage{missing}",
    ].join("\n");

    expect(extractCompileDiagnostic(log)).toBe(
      "LaTeX Error: File `missing.sty' not found. (l.42 \\\\usepackage{missing})",
    );
  });

  it("does not duplicate a diagnostic already present in the message", () => {
    expect(
      formatCompileFailure(
        "Image inclusion failed.",
        "xdvipdfmx:fatal: Image inclusion failed.",
      ),
    ).toBe("Image inclusion failed.");
  });

  it("reads compileLog structurally from compiler errors", () => {
    expect(readCompileLog({ compileLog: "raw log" })).toBe("raw log");
    expect(readCompileLog(new Error("plain error"))).toBe("");
  });
});
```

- [ ] **Step 2: Run the diagnostics tests and verify RED**

Run:

```bash
pnpm test -- tests/features/compiler/compile-diagnostics.test.ts
```

Expected: FAIL because `compile-diagnostics.ts` does not exist.

- [ ] **Step 3: Implement the pure diagnostics module**

```ts
const ERROR_PATTERN = /(^!\s+)|(\bfatal\b)|(\berror:?\b)/i;
const SOURCE_LINE_PATTERN = /^l\.\d+\s+/;

export function findFailingProjectPaths(
  log: string,
  projectPaths: readonly string[],
): string[] {
  const lines = log.split(/\r?\n/);
  const diagnosticIndexes = lines.flatMap((line, index) =>
    ERROR_PATTERN.test(line) ? [index] : [],
  );

  const diagnosticText = diagnosticIndexes
    .flatMap((index) => lines.slice(index, index + 4))
    .join("\n");

  return projectPaths.filter((path) => diagnosticText.includes(path));
}

export function extractCompileDiagnostic(log: string): string | null {
  const lines = log.split(/\r?\n/).map((line) => line.trim());
  const bangIndex = lines.findIndex((line) => line.startsWith("!"));

  if (bangIndex >= 0) {
    const message = lines[bangIndex].replace(/^!\s*/, "");
    const sourceLine = lines
      .slice(bangIndex + 1, bangIndex + 5)
      .find((line) => SOURCE_LINE_PATTERN.test(line));

    return sourceLine ? `${message} (${sourceLine})` : message;
  }

  const fatalLine = lines.find((line) => /\bfatal\b/i.test(line));
  if (fatalLine) {
    return fatalLine.replace(/^.*?\bfatal:\s*/i, "");
  }

  return lines.find((line) => /\berror:?\b/i.test(line)) ?? null;
}

export function formatCompileFailure(message: string, log: string): string {
  const diagnostic = extractCompileDiagnostic(log);
  if (!diagnostic || message.toLowerCase().includes(diagnostic.toLowerCase())) {
    return message;
  }
  return `${message} ${diagnostic}`;
}

export function readCompileLog(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "compileLog" in error &&
    typeof error.compileLog === "string"
  ) {
    return error.compileLog;
  }
  return "";
}

export function combineCompileLogs(
  firstLog: string,
  fallbackLog: string,
): string {
  return [
    "===== Initial compilation =====",
    firstLog || "(no log returned)",
    "===== Fallback compilation =====",
    fallbackLog || "(no log returned)",
  ].join("\n");
}

export class FallbackCompileError extends Error {
  constructor(
    message: string,
    readonly compileLog: string,
  ) {
    super(message);
    this.name = "FallbackCompileError";
  }
}
```

- [ ] **Step 4: Run the diagnostics tests and verify GREEN**

Run:

```bash
pnpm test -- tests/features/compiler/compile-diagnostics.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit diagnostics**

```bash
git add src/features/compiler/compile-diagnostics.ts tests/features/compiler/compile-diagnostics.test.ts
git commit -m "feat: add XeLaTeX compile diagnostics"
```

---

### Task 2: One-Retry Image Fallback

**Files:**

- Modify: `src/features/compiler/types.ts`
- Modify: `src/features/compiler/latex-compiler.ts`
- Modify: `src/features/compiler/busytex-engine.ts`
- Modify: `entrypoints/compiler/main.ts`
- Modify: `tests/features/compiler/latex-compiler.test.ts`

**Interfaces:**

- Consumes diagnostics APIs from Task 1.
- Produces:

```ts
export interface LatexEngineOutput {
  pdf: Uint8Array;
  log: string;
}

export interface LatexCompileOutput extends LatexEngineOutput {
  omittedFiles: string[];
}
```

- Extends successful `CompileLatexResult` with `omittedFiles: string[]`.

- [ ] **Step 1: Add failing compiler fallback tests**

Add tests that use a real `LatexCompiler` and a narrow fake engine boundary:

```ts
it("retries after removing only the image named in the failure log", async () => {
  const engine = createEngine();
  vi.mocked(engine.compile)
    .mockRejectedValueOnce(
      Object.assign(new Error("first failed"), {
        compileLog:
          'xdvipdfmx:fatal: Unable to load "assets/image-002.png".',
      }),
    )
    .mockResolvedValueOnce({
      pdf: new Uint8Array([37, 80, 68, 70]),
      log: "fallback completed",
    });

  const compiler = new LatexCompiler(engine);
  const result = await compiler.compile({
    source: "\\\\begin{document}Test\\\\end{document}",
    files: [
      { path: "assets/image-001.png", content: new Uint8Array([1]) },
      { path: "assets/image-002.png", content: new Uint8Array([2]) },
    ],
  });

  expect(result.omittedFiles).toEqual(["assets/image-002.png"]);
  expect(vi.mocked(engine.compile).mock.calls[1]?.[0].files).toEqual([
    { path: "assets/image-001.png", content: new Uint8Array([1]) },
  ]);
});

it("retries without files when the failure log names no project image", async () => {
  const engine = createEngine();
  vi.mocked(engine.compile)
    .mockRejectedValueOnce(
      Object.assign(new Error("first failed"), {
        compileLog: "xdvipdfmx:fatal: Unknown image error.",
      }),
    )
    .mockResolvedValueOnce({
      pdf: new Uint8Array([37, 80, 68, 70]),
      log: "fallback completed",
    });

  const compiler = new LatexCompiler(engine);
  const result = await compiler.compile({
    source: "\\\\begin{document}Test\\\\end{document}",
    files: [
      { path: "assets/image-001.png", content: new Uint8Array([1]) },
    ],
  });

  expect(result.omittedFiles).toEqual(["assets/image-001.png"]);
  expect(vi.mocked(engine.compile).mock.calls[1]?.[0].files).toEqual([]);
});

it("does not retry a failed project without files", async () => {
  const engine = createEngine();
  vi.mocked(engine.compile).mockRejectedValue(new Error("source failed"));
  const compiler = new LatexCompiler(engine);

  await expect(
    compiler.compile({
      source: "\\\\badcommand",
      files: [],
    }),
  ).rejects.toThrow("source failed");
  expect(engine.compile).toHaveBeenCalledTimes(1);
});

it("preserves both logs when the fallback also fails", async () => {
  const engine = createEngine();
  vi.mocked(engine.compile)
    .mockRejectedValueOnce(
      Object.assign(new Error("first"), { compileLog: "first log" }),
    )
    .mockRejectedValueOnce(
      Object.assign(new Error("second"), { compileLog: "second log" }),
    );
  const compiler = new LatexCompiler(engine);

  await expect(
    compiler.compile({
      source: "\\\\badcommand",
      files: [
        { path: "assets/image-001.png", content: new Uint8Array([1]) },
      ],
    }),
  ).rejects.toMatchObject({
    message: "second",
    compileLog: expect.stringContaining("first log"),
  });
});
```

Update the normal success test to expect `omittedFiles` to equal `[]`.

- [ ] **Step 2: Run compiler tests and verify RED**

Run:

```bash
pnpm test -- tests/features/compiler/latex-compiler.test.ts
```

Expected: fallback tests fail because the engine is called once and
`omittedFiles` is absent.

- [ ] **Step 3: Split engine and compiler output types**

In `src/features/compiler/types.ts`, make `LatexEngine.compile` return
`Promise<LatexEngineOutput>` and add `omittedFiles` to both
`LatexCompileOutput` and the successful serialized result:

```ts
export interface LatexEngineOutput {
  pdf: Uint8Array;
  log: string;
}

export interface LatexCompileOutput extends LatexEngineOutput {
  omittedFiles: string[];
}

export interface LatexEngine {
  initialize(): Promise<void>;
  compile(project: LatexCompileProject): Promise<LatexEngineOutput>;
  terminate(): void;
}
```

- [ ] **Step 4: Implement the one-retry policy**

Replace the direct engine return in `LatexCompiler.compile` with:

```ts
try {
  const result = await this.engine.compile(project);
  return {
    ...result,
    omittedFiles: [],
  };
} catch (firstError) {
  if (project.files.length === 0) {
    throw firstError;
  }

  const firstLog = readCompileLog(firstError);
  const mentionedPaths = findFailingProjectPaths(
    firstLog,
    project.files.map((file) => file.path),
  );
  const omittedFiles =
    mentionedPaths.length > 0
      ? mentionedPaths
      : project.files.map((file) => file.path);
  const omittedSet = new Set(omittedFiles);

  try {
    const fallback = await this.engine.compile({
      ...project,
      files: project.files.filter((file) => !omittedSet.has(file.path)),
    });

    return {
      ...fallback,
      log: combineCompileLogs(firstLog, fallback.log),
      omittedFiles,
    };
  } catch (fallbackError) {
    throw new FallbackCompileError(
      fallbackError instanceof Error
        ? fallbackError.message
        : "XeLaTeX fallback compilation failed.",
      combineCompileLogs(firstLog, readCompileLog(fallbackError)),
    );
  }
}
```

Import the Task 1 utilities. Keep initialization behavior unchanged.

- [ ] **Step 5: Serialize fallback results and logs**

In `entrypoints/compiler/main.ts`:

- include `omittedFiles: result.omittedFiles` in successful responses;
- replace the `BusyTexCompileError` instance check with
  `readCompileLog(error)`;
- remove the now-unused `BusyTexCompileError` import.

Keep `BusyTexEngine` returning `{ pdf, log }`; it conforms to
`LatexEngineOutput` without owning fallback metadata.

- [ ] **Step 6: Run compiler tests and TypeScript**

Run:

```bash
pnpm test -- tests/features/compiler/compile-diagnostics.test.ts tests/features/compiler/latex-compiler.test.ts
pnpm compile
```

Expected: all selected tests pass and TypeScript exits 0.

- [ ] **Step 7: Commit compiler fallback**

```bash
git add src/features/compiler/types.ts src/features/compiler/latex-compiler.ts src/features/compiler/busytex-engine.ts entrypoints/compiler/main.ts tests/features/compiler/latex-compiler.test.ts
git commit -m "feat: retry XeLaTeX without rejected images"
```

---

### Task 3: Reconcile Omitted Assets

**Files:**

- Create: `src/features/export/compile-omissions.ts`
- Create: `tests/features/export/compile-omissions.test.ts`
- Modify: `src/features/assets/types.ts`
- Modify: `entrypoints/popup/use-export-flow.ts`

**Interfaces:**

- Produces:

```ts
export function applyCompileOmissions(
  prepared: PreparedExport,
  processed: ProcessedExportAssets,
  omittedPaths: readonly string[],
): ProcessedExportAssets;
```

- [ ] **Step 1: Write the failing reconciliation test**

```ts
import { describe, expect, it } from "vitest";

import { applyCompileOmissions } from "@/src/features/export/compile-omissions";

describe("applyCompileOmissions", () => {
  it("moves omitted files to compiler-rejected failures", () => {
    const result = applyCompileOmissions(
      {
        title: "Test",
        url: "https://chatgpt.com/c/test",
        latexSource: "source",
        assets: [
          {
            id: "image-001",
            kind: "image",
            sourceUrl: "https://example.com/one.png",
            outputPath: "assets/image-001.png",
            alt: "One",
          },
          {
            id: "image-002",
            kind: "image",
            sourceUrl: "https://example.com/two.png",
            outputPath: "assets/image-002.png",
            alt: "Two",
          },
        ],
      },
      {
        files: [
          {
            id: "image-001",
            outputPath: "assets/image-001.png",
            mimeType: "image/png",
            base64: "AQ==",
            byteLength: 1,
            width: 1,
            height: 1,
          },
          {
            id: "image-002",
            outputPath: "assets/image-002.png",
            mimeType: "image/png",
            base64: "Ag==",
            byteLength: 1,
            width: 1,
            height: 1,
          },
        ],
        failures: [],
      },
      ["assets/image-002.png"],
    );

    expect(result.files.map((file) => file.id)).toEqual(["image-001"]);
    expect(result.failures).toEqual([
      {
        id: "image-002",
        sourceUrl: "https://example.com/two.png",
        code: "compiler-rejected",
        message: "XeLaTeX could not embed this image; it was omitted from the PDF.",
      },
    ]);
  });
});
```

- [ ] **Step 2: Run the reconciliation test and verify RED**

Run:

```bash
pnpm test -- tests/features/export/compile-omissions.test.ts
```

Expected: FAIL because `compile-omissions.ts` does not exist.

- [ ] **Step 3: Implement metadata reconciliation**

Add `"compiler-rejected"` to `AssetFailureCode`, then implement the utility:

```ts
export function applyCompileOmissions(
  prepared: PreparedExport,
  processed: ProcessedExportAssets,
  omittedPaths: readonly string[],
): ProcessedExportAssets {
  const omitted = new Set(omittedPaths);
  const retainedFiles = processed.files.filter(
    (file) => !omitted.has(file.outputPath),
  );
  const addedFailures = processed.files
    .filter((file) => omitted.has(file.outputPath))
    .map((file) => {
      const asset = prepared.assets.find(
        (candidate) => candidate.outputPath === file.outputPath,
      );

      return {
        id: file.id,
        sourceUrl: asset?.sourceUrl ?? "",
        code: "compiler-rejected" as const,
        message:
          "XeLaTeX could not embed this image; it was omitted from the PDF.",
      };
    });

  return {
    files: retainedFiles,
    failures: [...processed.failures, ...addedFailures],
  };
}
```

- [ ] **Step 4: Apply omissions in the popup compile flow**

After a successful compile response in `use-export-flow.ts`:

```ts
const reconciledAssets = applyCompileOmissions(
  prepared,
  processedAssets,
  response.omittedFiles,
);

setProcessedAssets(reconciledAssets);
setPdfBase64(response.pdfBase64);
setPhase("compiled");
```

For failed responses, replace the generic thrown message with:

```ts
throw new Error(formatCompileFailure(response.error, response.log));
```

Import both helpers from their focused modules.

- [ ] **Step 5: Run focused tests and TypeScript**

Run:

```bash
pnpm test -- tests/features/export/compile-omissions.test.ts tests/features/compiler/compile-diagnostics.test.ts tests/features/compiler/latex-compiler.test.ts
pnpm compile
```

Expected: all selected tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit popup state reconciliation**

```bash
git add src/features/assets/types.ts src/features/export/compile-omissions.ts tests/features/export/compile-omissions.test.ts entrypoints/popup/use-export-flow.ts
git commit -m "feat: track images omitted by XeLaTeX"
```

---

### Task 4: Popup Diagnostics and Final Verification

**Files:**

- Modify: `entrypoints/popup/App.tsx`
- Modify: `entrypoints/popup/style.css`

**Interfaces:**

- Consumes `processedAssets.failures` with code `compiler-rejected`.
- Consumes the existing `exportFlow.compileLog` state.

- [ ] **Step 1: Render omitted-image and raw-log disclosures**

In the compiled section, derive compiler-rejected failures and render:

```tsx
{exportFlow.processedAssets?.failures.some(
  (failure) => failure.code === "compiler-rejected",
) && (
  <details className="diagnostic-details">
    <summary>Images omitted from PDF</summary>
    <ul>
      {exportFlow.processedAssets.failures
        .filter((failure) => failure.code === "compiler-rejected")
        .map((failure) => (
          <li key={failure.id}>
            <strong>{failure.id}</strong>: {failure.message}
          </li>
        ))}
    </ul>
  </details>
)}
```

Replace the single error paragraph with:

```tsx
<section className="compile-error">
  <p className="collection-error">{exportFlow.error}</p>
  {exportFlow.compileLog.trim() && (
    <details className="diagnostic-details">
      <summary>XeLaTeX error details</summary>
      <pre className="compile-log">{exportFlow.compileLog}</pre>
    </details>
  )}
</section>
```

Only render this raw log for `exportFlow.phase === "error"` and a non-empty
log.

- [ ] **Step 2: Add bounded log styles**

Append:

```css
.diagnostic-details {
  padding: 10px 12px;
  border: 1px solid #dfe4ec;
  border-radius: 10px;
  font-size: 12px;
}

.diagnostic-details summary {
  cursor: pointer;
  font-weight: 650;
}

.compile-log {
  max-height: 240px;
  margin: 10px 0 0;
  overflow: auto;
  padding: 10px;
  border-radius: 8px;
  background: #101827;
  color: #e7edf7;
  font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
```

- [ ] **Step 3: Run fresh full verification**

Run:

```bash
pnpm test
pnpm compile
pnpm build
git diff --check
```

Expected:

- all Vitest files and tests pass;
- TypeScript exits 0;
- WXT production build exits 0;
- no whitespace errors.

- [ ] **Step 4: Inspect the final diff for scope**

Run:

```bash
git status --short
git diff --stat HEAD
git diff HEAD -- src/features/compiler src/features/export src/features/assets/types.ts entrypoints/compiler/main.ts entrypoints/popup tests/features/compiler tests/features/export
```

Confirm the diff contains only the approved fallback, diagnostics, metadata,
popup presentation, and their tests.

- [ ] **Step 5: Commit the UI and verification result**

```bash
git add entrypoints/popup/App.tsx entrypoints/popup/style.css
git commit -m "feat: show XeLaTeX image diagnostics"
```
