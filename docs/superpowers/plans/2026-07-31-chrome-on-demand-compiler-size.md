# Chrome On-Demand Compiler and Size Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 503 MB bundled Chrome extension with a Chrome 116+ package no larger than 5 MiB that downloads, isolates, verifies, and caches an XeTeX-only compiler on demand.

**Architecture:** The offscreen document owns a persistent compiler job coordinator, verified asset cache, and restricted TeX Live fetch proxy. It transfers pinned BusyTeX core bytes into a manifest-declared sandbox; the sandbox runs a Blob-backed worker, records synchronous TeX Live misses, and retries compilation after the coordinator supplies cached or HTTPS-fetched files. Popup and in-page export clients reconnect to job snapshots rather than owning long-running compilation state.

**Tech Stack:** TypeScript 5.9, WXT 0.20 Chrome MV3, React 19, Chrome offscreen documents and `storage.session`, Cache Storage, Web Crypto SHA-256, BusyTeX/TeX Live 2026, `texlyre-busytex@1.2.3`, JSZip, Vitest 4, Node 22 release tooling.

## Global Constraints

- Work directly in `/Users/duongchung/Downloads/code/test/Chat2TeX` on `main`.
- Do not create a worktree, stage files, commit, push, tag, publish a release, open a pull request, or change repository visibility.
- Replace every normal commit checkpoint with `git diff --check`, focused tests, and `git status --short`.
- Support Chrome MV3 only and set `minimum_chrome_version` to `116`.
- The production Chrome extension ZIP must be no larger than 5 MiB.
- The extension ZIP must contain no BusyTeX `.wasm` or TeX Live `.data` file.
- The first-use XeTeX/basic core cache must be no larger than 140 MiB.
- The default total compiler cache budget is 300 MiB.
- Request `unlimitedStorage`, call `navigator.storage.persist()`, and check
  `navigator.storage.estimate()` before staging a compiler upgrade.
- Use only `texlyre-busytex@1.2.3` and `engineMode: "xetex"` assets; do not ship pdfTeX, LuaTeX, or the combined engine.
- Pin every core asset by exact byte length and SHA-256.
- Trust a TeX Live file only after the first HTTPS response from `https://texlive2026.texlyre.org` has been size-limited and hashed; retain that hash after byte eviction and reject later mismatches.
- Allow TeX Live formats `3`, `4`, `6`, `7`, `10`, `11`, `26`, `32`, `33`, `35`, `39`, `43`, `44`, and `46`.
- Allow TeX Live filenames only when they match `[A-Za-z0-9._-]{1,255}`.
- Limit one on-demand TeX Live response to 32 MiB and one compilation to 32 package-resolution passes.
- Limit one pass to 256 unique lookups, one job to 512 unique package files,
  and new package downloads to 160 MiB per job.
- Keep shell escape disabled and load no remote shell-handler script.
- The sandbox has no Chrome APIs, extension-origin storage, ChatGPT DOM access, or direct network access.
- Never send LaTeX source, conversation text, images, PDF bytes, ZIP bytes, cookies, authorization headers, or compiler logs to a remote server.
- Preserve existing image fallback diagnostics and generated PDF/TEX/ZIP behavior.
- PDF-only must not build a source ZIP; TEX/ZIP-only must not initialize BusyTeX.
- Use AGPL-3.0-or-later for the distributed project and preserve third-party notices.
- A public production release remains blocked while the user requires an uncommitted working tree.

---

## File Structure

### Create

- `scripts/prepare-compiler-assets.mjs` — downloads the fixed upstream BusyTeX archive, extracts only XeTeX/basic files, hashes them, and writes a generated manifest.
- `scripts/check-extension-package.mjs` — enforces ZIP size, archive contents, manifest policy, and URL allowlist.
- `src/features/compiler/compiler-core-assets.generated.ts` — generated exact core filenames, byte lengths, and SHA-256 values.
- `src/features/compiler/asset-manifest.ts` — manifest schema, constants, and package-lookup validation.
- `src/features/compiler/asset-integrity.ts` — streaming size limits and SHA-256 helpers.
- `src/features/compiler/compiler-asset-store.ts` — storage port plus the Chrome Cache Storage/`storage.local` adapter.
- `src/features/compiler/compiler-asset-cache.ts` — versioned core cache, package TOFU ledger, LRU, negative cache, and cleanup.
- `src/features/compiler/compiler-asset-fetcher.ts` — fixed-origin core/package HTTP client.
- `src/features/compiler/sandbox-protocol.ts` — typed `MessagePort` requests, responses, progress, and lookup records.
- `src/features/compiler/sandbox-worker-source.ts` — BusyTeX worker composition and synchronous XHR recording shim.
- `src/features/compiler/sandbox-compiler-client.ts` — offscreen iframe handshake and compiler RPC client.
- `src/features/compiler/on-demand-busytex-engine.ts` — `LatexEngine` implementation with bounded package-resolution passes.
- `src/features/compiler/compiler-job-types.ts` — job IDs, phases, sanitized snapshots, start payloads, and results.
- `src/features/compiler/compiler-job-store.ts` — session snapshots plus a minimal text-free local crash marker.
- `src/features/compiler/compiler-job-coordinator.ts` — single-job lifecycle, cancellation, crash retry, and cache status.
- `src/features/export/output-plan.ts` — output-kind validation and compile/package short-circuit decisions.
- `src/config/extension-manifest.ts` — pure Chrome dev/production manifest policy factory used by WXT and tests.
- `entrypoints/compiler.sandbox/index.html` — WXT sandbox entrypoint.
- `entrypoints/compiler.sandbox/main.ts` — sandbox bootstrap and `MessagePort` runtime.
- `entrypoints/popup/export-flow-state.ts` — pure reducer for reconnectable export UI state.
- `LICENSE` — GNU Affero General Public License v3 text.
- `THIRD_PARTY_NOTICES.md` — BusyTeX, TeXlyre, Emscripten, and TeX Live notices.
- `PRIVACY.md` — local-processing and compiler/package download disclosure.
- `public/legal.html` — packaged privacy, license, third-party, and source links available from the popup.
- Focused tests mirroring every new module under `tests/features/compiler`, `tests/features/export`, `tests/entrypoints/popup`, and `tests/scripts`.

### Modify

- `package.json`, `pnpm-lock.yaml` — replace the old BusyTeX alias, remove Firefox-only tooling, add asset and verification commands.
- `.gitignore` — ignore `.compiler-assets/` while retaining `public/texlive`.
- `wxt.config.ts` — Chrome 116+, reduced permissions/origins, sandbox CSP, and production core URL.
- `src/features/compiler/busytex-engine.ts` — remove the extension-page runner; keep compile-error compatibility or replace imports with the new engine.
- `src/features/compiler/types.ts` — compiler progress and serialized project/result types.
- `src/shared/messages.ts` — replace one-shot compile/download messages with job, cache, cancel, and update messages.
- `entrypoints/compiler/main.ts` — instantiate the cache, fetcher, sandbox client, engine, coordinator, and output builder.
- `entrypoints/background.ts` — ensure the offscreen document and route job/cache/download commands.
- `src/features/export/download-types.ts` — explicit output kinds and optional PDF data.
- `entrypoints/popup/use-export-flow.ts` — start and reconnect to offscreen jobs.
- `entrypoints/popup/App.tsx`, `entrypoints/popup/style.css`, `entrypoints/popup/index.html` — progress, cancellation, cache controls, source link, local fonts, and correct title.
- `entrypoints/chatgpt.content.ts` — Chrome-only match list and job-based in-page compile/download.
- `README.md` — Chrome-only installation, first-use download, cache, privacy, license, and release preparation.

### Remove after the feasibility gate passes

- `public/texlive/` — ignored 648 MB legacy compiler payload.
- Firefox scripts from `package.json`.
- `web-ext` from development dependencies.
- The remote Google Fonts import.

---

### Task 1: Reproducible XeTeX/Basic Asset Preparation

**Files:**
- Create: `scripts/prepare-compiler-assets.mjs`
- Create: `tests/scripts/prepare-compiler-assets.test.ts`
- Create: `src/features/compiler/compiler-core-assets.generated.ts`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes the immutable upstream archive:

```text
URL: https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v1.2.3/busytex-assets.tar.gz
Size: 503733339 bytes
SHA-256: 96dbacb42037472827f2f481d3bc0f44cc2f4a532abcc019dc2f407805a307f4
```

- Produces exactly these local release assets:

```ts
export type CoreAssetId =
  | "busytex-worker"
  | "busytex-pipeline"
  | "xetex-js"
  | "xetex-wasm"
  | "texlive-basic-js"
  | "texlive-basic-data";

export interface GeneratedCoreAsset {
  id: CoreAssetId;
  filename: string;
  byteLength: number;
  sha256: string;
  mimeType: string;
}

export const GENERATED_CORE_ASSETS: readonly GeneratedCoreAsset[];
```

- Writes asset bytes only under `.compiler-assets/1.2.3/`; normal WXT builds never copy that directory.

- [ ] **Step 1: Replace the BusyTeX dependency and add the archive reader**

Run:

```bash
pnpm remove texlyre-busytex
pnpm add --save-exact texlyre-busytex@1.2.3
pnpm add --save-dev --save-exact tar@7.5.22
```

Expected: `package.json` contains `"texlyre-busytex": "1.2.3"` and
`"tar": "7.5.22"`; the scoped `@vanabel` alias is gone.

- [ ] **Step 2: Write failing selection and manifest tests**

Create `tests/scripts/prepare-compiler-assets.test.ts` with:

```ts
import { describe, expect, it } from "vitest";

import {
  EXPECTED_CORE_FILES,
  createGeneratedManifest,
  selectCoreArchiveEntries,
} from "../../scripts/prepare-compiler-assets.mjs";

describe("prepare-compiler-assets", () => {
  it("selects only the XeTeX/basic runtime", () => {
    const selected = selectCoreArchiveEntries([
      "busytex/busytex_worker.js",
      "busytex/busytex_pipeline.js",
      "busytex/xetex.js",
      "busytex/xetex.wasm",
      "busytex/pdftex.wasm",
      "busytex/luahbtex.wasm",
      "busytex/texlive-basic.js",
      "busytex/texlive-basic.data",
      "busytex/texlive-recommended.data",
      "busytex/texlive-extra.data",
    ]);

    expect(selected.map((entry) => entry.split("/").at(-1))).toEqual(
      EXPECTED_CORE_FILES,
    );
  });

  it("writes lowercase 64-character hashes and exact sizes", () => {
    const manifest = createGeneratedManifest([
      {
        id: "xetex-wasm",
        filename: "xetex.wasm",
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "application/wasm",
      },
    ]);

    expect(manifest[0]).toMatchObject({
      id: "xetex-wasm",
      filename: "xetex.wasm",
      byteLength: 3,
      mimeType: "application/wasm",
    });
    expect(manifest[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
pnpm exec vitest run tests/scripts/prepare-compiler-assets.test.ts
```

Expected: FAIL because `scripts/prepare-compiler-assets.mjs` does not exist.

- [ ] **Step 4: Implement the asset preparation script**

Export these constants and functions:

```js
export const UPSTREAM_ARCHIVE = Object.freeze({
  url: "https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v1.2.3/busytex-assets.tar.gz",
  byteLength: 503_733_339,
  sha256: "96dbacb42037472827f2f481d3bc0f44cc2f4a532abcc019dc2f407805a307f4",
});

export const EXPECTED_CORE_FILES = Object.freeze([
  "busytex_worker.js",
  "busytex_pipeline.js",
  "xetex.js",
  "xetex.wasm",
  "texlive-basic.js",
  "texlive-basic.data",
]);

export function selectCoreArchiveEntries(entries) {
  const selected = entries.filter((entry) =>
    EXPECTED_CORE_FILES.includes(entry.split("/").at(-1)),
  );
  const names = selected.map((entry) => entry.split("/").at(-1));
  for (const filename of EXPECTED_CORE_FILES) {
    if (names.filter((name) => name === filename).length !== 1) {
      throw new Error(`Expected exactly one ${filename} in BusyTeX archive.`);
    }
  }
  return selected.sort(
    (left, right) =>
      EXPECTED_CORE_FILES.indexOf(left.split("/").at(-1)) -
      EXPECTED_CORE_FILES.indexOf(right.split("/").at(-1)),
  );
}
```

The CLI must:

1. stream the archive to a `mkdtemp` directory;
2. reject a size other than `503733339`;
3. reject a SHA-256 mismatch;
4. list the tar archive and select the six basenames above;
5. extract only those entries;
6. copy them to `.compiler-assets/1.2.3/`;
7. assert their total byte length is at most `146800640`;
8. write `compiler-core-assets.generated.ts` with literal sizes and hashes;
9. remove the temporary archive and extraction directory in `finally`.

Add:

```json
{
  "scripts": {
    "compiler:prepare": "node scripts/prepare-compiler-assets.mjs"
  }
}
```

Add `.compiler-assets/` to `.gitignore`.

- [ ] **Step 5: Run focused tests and prepare the real slim asset set**

Run:

```bash
pnpm exec vitest run tests/scripts/prepare-compiler-assets.test.ts
pnpm run compiler:prepare
du -ch .compiler-assets/1.2.3/* | tail -1
```

Expected: tests PASS; all six files exist; total is at most `140M`; no
pdfTeX, LuaTeX, recommended, or extra file exists in the output directory.

- [ ] **Step 6: Run the no-commit checkpoint**

Run:

```bash
git diff --check
git status --short
```

Expected: source and lockfile changes are unstaged; `.compiler-assets/` is
absent from `git status`.

---

### Task 2: Manifest Validation, Integrity, Fetching, and Persistent Cache

**Files:**
- Create: `src/features/compiler/asset-manifest.ts`
- Create: `src/features/compiler/asset-integrity.ts`
- Create: `src/features/compiler/compiler-asset-store.ts`
- Create: `src/features/compiler/compiler-asset-fetcher.ts`
- Create: `src/features/compiler/compiler-asset-cache.ts`
- Create: `tests/features/compiler/asset-manifest.test.ts`
- Create: `tests/features/compiler/asset-integrity.test.ts`
- Create: `tests/features/compiler/compiler-asset-fetcher.test.ts`
- Create: `tests/features/compiler/compiler-asset-cache.test.ts`

**Interfaces:**
- Produces:

```ts
export const COMPILER_VERSION = "busytex-1.2.3-tl2026-chat2tex.1";
export const PACKAGE_ENDPOINT = "https://texlive2026.texlyre.org";
export const MAX_CORE_CACHE_BYTES = 140 * 1024 * 1024;
export const MAX_TOTAL_CACHE_BYTES = 300 * 1024 * 1024;
export const MAX_PACKAGE_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_PACKAGE_PASSES = 32;
export const MAX_PACKAGE_LOOKUPS_PER_PASS = 256;
export const MAX_PACKAGE_FILES_PER_JOB = 512;
export const MAX_PACKAGE_DOWNLOAD_BYTES_PER_JOB = 160 * 1024 * 1024;
export const ALLOWED_TEXLIVE_FORMATS = [
  3, 4, 6, 7, 10, 11, 26, 32, 33, 35, 39, 43, 44, 46,
] as const;

export interface PackageLookup {
  format: (typeof ALLOWED_TEXLIVE_FORMATS)[number];
  name: string;
}

export function parsePackageLookup(value: unknown): PackageLookup;
export function packageLookupKey(lookup: PackageLookup): string;
```

```ts
export interface CompilerAssetStore {
  readBytes(key: string): Promise<Uint8Array | null>;
  writeBytes(key: string, bytes: Uint8Array): Promise<void>;
  deleteBytes(key: string): Promise<void>;
  readMetadata(): Promise<CompilerCacheMetadata>;
  writeMetadata(metadata: CompilerCacheMetadata): Promise<void>;
}

export interface CompilerCacheStatus {
  compilerVersion: string;
  coreBytes: number;
  packageBytes: number;
  totalBytes: number;
  packageCount: number;
  quotaBytes: number | null;
  usageBytes: number | null;
  persisted: boolean;
}

export interface ResolvedPackageAsset {
  content: Uint8Array;
  source: "cache" | "network";
}
```

```ts
export class CompilerAssetFetcher {
  constructor(
    fetcher: typeof fetch,
    coreBaseUrl: string,
    packageEndpoint?: string,
  );

  fetchCore(
    asset: GeneratedCoreAsset,
    signal?: AbortSignal,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<Uint8Array>;

  fetchPackage(
    lookup: PackageLookup,
    signal?: AbortSignal,
  ): Promise<Uint8Array | null>;
}
```

```ts
export class CompilerAssetCache {
  getOrFetchCore(
    asset: GeneratedCoreAsset,
    fetcher: CompilerAssetFetcher,
    signal?: AbortSignal,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<Uint8Array>;

  getOrFetchPackage(
    lookup: PackageLookup,
    fetcher: CompilerAssetFetcher,
    signal?: AbortSignal,
  ): Promise<ResolvedPackageAsset | null>;

  acceptPackageBytes(
    lookup: PackageLookup,
    bytes: Uint8Array,
  ): Promise<void>;

  readActiveCoreAssets(): Promise<Record<CoreAssetId, Uint8Array> | null>;
  stageCompilerVersion(version: string): Promise<void>;
  activateStagedCompilerVersion(version: string): Promise<void>;
  discardStagedCompilerVersion(version: string): Promise<void>;
  status(): Promise<CompilerCacheStatus>;
  clearAll(): Promise<void>;
}
```

- [ ] **Step 1: Write failing validation, fetch, and TOFU tests**

Cover the exact boundaries:

```ts
it("rejects traversal and unknown formats", () => {
  expect(() => parsePackageLookup({ format: 26, name: "../secret.tex" }))
    .toThrow("Invalid TeX Live filename");
  expect(() => parsePackageLookup({ format: 999, name: "article.cls" }))
    .toThrow("Unsupported TeX Live format");
});

it("keeps a package hash after byte eviction", async () => {
  const first = new Uint8Array([1, 2, 3]);
  const changed = new Uint8Array([1, 2, 4]);
  await cache.acceptPackageBytes({ format: 26, name: "article.cls" }, first);
  await store.deleteBytes("package:busytex-1.2.3-tl2026-chat2tex.1:26/article.cls");

  await expect(
    cache.acceptPackageBytes({ format: 26, name: "article.cls" }, changed),
  ).rejects.toThrow("TeX Live package integrity mismatch");
});

it("rejects an oversized streamed response before caching it", async () => {
  const fetcher = new CompilerAssetFetcher(
    vi.fn().mockResolvedValue(
      new Response(new Uint8Array(33 * 1024 * 1024), {
        status: 200,
      }),
    ) as typeof fetch,
    "https://github.com/VanChung369/Chat2TeX/releases/download/compiler-v1.2.3-chat2tex.1/",
  );

  await expect(
    fetcher.fetchPackage({ format: 26, name: "huge.sty" }),
  ).rejects.toThrow("exceeds 33554432 bytes");
});
```

Also test: core size/hash match, core mismatch, package 404, cross-origin
redirect rejection, negative-cache reuse, LRU ordering, 300 MiB eviction, and
full reset clearing the TOFU ledger. Add an upgrade fixture that stages a new
core version without changing the active version, activates it only after a
caller-reported smoke success, and discards the staged version while retaining
the previous active core after a smoke failure.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm exec vitest run \
  tests/features/compiler/asset-manifest.test.ts \
  tests/features/compiler/asset-integrity.test.ts \
  tests/features/compiler/compiler-asset-fetcher.test.ts \
  tests/features/compiler/compiler-asset-cache.test.ts
```

Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Implement manifest and integrity helpers**

Use Web Crypto and lowercase hexadecimal:

```ts
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input.buffer);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export function parsePackageLookup(value: unknown): PackageLookup {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid TeX Live lookup.");
  }
  const { format, name } = value as { format?: unknown; name?: unknown };
  if (
    typeof format !== "number" ||
    !ALLOWED_TEXLIVE_FORMATS.includes(
      format as PackageLookup["format"],
    )
  ) {
    throw new Error("Unsupported TeX Live format.");
  }
  if (
    typeof name !== "string" ||
    !/^[A-Za-z0-9._-]{1,255}$/.test(name)
  ) {
    throw new Error("Invalid TeX Live filename.");
  }
  return { format: format as PackageLookup["format"], name };
}
```

The streaming reader must cancel the body and throw as soon as the configured
limit is exceeded; it must not allocate based only on `Content-Length`.

- [ ] **Step 4: Implement the store adapter**

Use Cache Storage `chat2tex-compiler-v1` for bytes and
`browser.storage.local` key `chat2tex.compiler-cache.metadata.v1` for:

```ts
export interface CompilerCacheMetadata {
  schemaVersion: 1;
  activeCompilerVersion: string;
  stagedCompilerVersion: string | null;
  previousCompilerVersion: string | null;
  assets: Record<
    string,
    {
      kind: "core" | "package";
      byteLength: number;
      sha256: string;
      lastUsedAt: number;
    }
  >;
  packageHashes: Record<string, string>;
  negativePackages: Record<string, number>;
}
```

At startup call `browser.storage.local.setAccessLevel({
accessLevel: "TRUSTED_CONTEXTS" })` before reading metadata, so content
scripts cannot access compiler-cache metadata directly.

Store bytes under synthetic extension URLs returned by
`browser.runtime.getURL(`/__compiler_cache__/${encodeURIComponent(key)}`)`.
`Cache.put()` is the atomic visibility boundary: write bytes first, then write
metadata. A metadata record without bytes is treated as a miss and repaired.

- [ ] **Step 5: Implement the fetcher and cache**

Core URL construction is:

```ts
new URL(asset.filename, ensureTrailingSlash(coreBaseUrl))
```

Package URL construction is:

```ts
new URL(
  `${lookup.format}/${encodeURIComponent(lookup.name)}`,
  ensureTrailingSlash(PACKAGE_ENDPOINT),
)
```

Require final response origins to remain in:

```ts
new Set([
  "https://github.com",
  "https://release-assets.githubusercontent.com",
  "https://texlive2026.texlyre.org",
  ...(import.meta.env.DEV ? ["http://127.0.0.1:4178"] : []),
]);
```

Core downloads retry one time on transport or integrity failure. Package
downloads use HTTPS TOFU: compare against `packageHashes[key]` when present;
otherwise record the first hash. Keep the hash after LRU byte deletion. Cache
404 for 24 hours under `negativePackages`.

Call `navigator.storage.persist()` during cache initialization and include
`navigator.storage.estimate()` in `CompilerCacheStatus`. Before staging an
upgrade, require reported free quota for the current core, candidate core, and
a 32 MiB safety margin. If it is insufficient, keep the active version and
return the actionable storage error from the design.

Resolve core configuration exactly as follows: development requires
`WXT_COMPILER_ASSET_BASE_URL=http://127.0.0.1:4178/`; production uses the
built-in immutable GitHub release directory when the variable is absent, and
accepts an override only when it is that same HTTPS directory. Fail config
validation for a missing development value, malformed URL, or any other
origin/path. Store a new compiler version as `stagedCompilerVersion`; do not
delete or replace the active core until Task 4 completes a sandbox smoke compile and calls
`activateStagedCompilerVersion()`. On failure, call
`discardStagedCompilerVersion()` and retain the previous active core.

- [ ] **Step 6: Run cache tests and the no-commit checkpoint**

Run:

```bash
pnpm exec vitest run \
  tests/features/compiler/asset-manifest.test.ts \
  tests/features/compiler/asset-integrity.test.ts \
  tests/features/compiler/compiler-asset-fetcher.test.ts \
  tests/features/compiler/compiler-asset-cache.test.ts
pnpm run compile
git diff --check
git status --short
```

Expected: focused tests and TypeScript compilation PASS; all changes remain
unstaged.

---

### Task 3: Production-Shaped Sandbox Feasibility Gate

**Files:**
- Create: `src/features/compiler/sandbox-protocol.ts`
- Create: `src/features/compiler/sandbox-worker-source.ts`
- Create: `src/features/compiler/sandbox-compiler-client.ts`
- Create: `entrypoints/compiler.sandbox/index.html`
- Create: `entrypoints/compiler.sandbox/main.ts`
- Create: `tests/features/compiler/sandbox-protocol.test.ts`
- Create: `tests/features/compiler/sandbox-worker-source.test.ts`
- Create: `tests/features/compiler/sandbox-compiler-client.test.ts`
- Modify: `entrypoints/compiler/main.ts`
- Modify: `wxt.config.ts`

**Interfaces:**
- Offscreen to sandbox:

```ts
export type SandboxCommand =
  | {
      type: "initialize";
      requestId: string;
      assets: Record<CoreAssetId, ArrayBuffer>;
    }
  | {
      type: "compile";
      requestId: string;
      project: SerializedCompileProject;
    }
  | {
      type: "write-remote-files";
      requestId: string;
      files: Array<{
        format: PackageLookup["format"];
        name: string;
        content: ArrayBuffer;
      }>;
    }
  | { type: "terminate"; requestId: string };
```

- Sandbox to offscreen:

```ts
export type SandboxEvent =
  | { type: "ready"; requestId: string }
  | {
      type: "progress";
      requestId: string;
      message: string;
      loaded?: number;
      total?: number;
    }
  | {
      type: "compile-result";
      requestId: string;
      success: boolean;
      pdf?: ArrayBuffer;
      log: string;
      exitCode: number;
      packageLookups: PackageLookup[];
    }
  | { type: "remote-files-written"; requestId: string }
  | { type: "error"; requestId: string; message: string; log: string };

export interface SandboxCompileResult {
  success: boolean;
  pdf?: ArrayBuffer;
  log: string;
  exitCode: number;
  packageLookups: PackageLookup[];
}

export interface TexliveRemoteFile {
  format: PackageLookup["format"];
  name: string;
  content: Uint8Array;
}

export interface SandboxHandshakeGate {
  accept(source: WindowProxy | null, nonce: string): boolean;
}

export function createSandboxHandshakeGate(
  expectedParent: WindowProxy,
): SandboxHandshakeGate;
```

```ts
export class SandboxCompilerClient {
  constructor(
    hostDocument: Document,
    sandboxUrl: string,
    timeoutMs?: number,
  );

  initialize(assets: Record<CoreAssetId, Uint8Array>): Promise<void>;
  compile(project: SerializedCompileProject): Promise<SandboxCompileResult>;
  writeRemoteFiles(files: TexliveRemoteFile[]): Promise<void>;
  terminate(): void;
}
```

- [ ] **Step 1: Write failing protocol and worker-shim tests**

Test nonce/source validation, unknown messages, transfer lists, timeout
cleanup, and the synchronous TeX Live interception:

```ts
it("records only the synthetic package endpoint", () => {
  const source = createSandboxWorkerSource({
    pipelineSource: "class BusytexPipeline {}",
    workerSource: "onmessage = () => postMessage({ pdf: new Uint8Array() });",
    basicDataUrl: "blob:basic-data",
  });

  expect(source).toContain("https://chat2tex.invalid");
  expect(source).toContain("packageLookups");
  expect(source).toContain("NativeXMLHttpRequest");
  expect(source).not.toContain("connect-src");
});

it("rejects a second window handshake", () => {
  const gate = createSandboxHandshakeGate(parent);
  expect(gate.accept(parent, "nonce-1")).toBe(true);
  expect(gate.accept(parent, "nonce-2")).toBe(false);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm exec vitest run \
  tests/features/compiler/sandbox-protocol.test.ts \
  tests/features/compiler/sandbox-worker-source.test.ts \
  tests/features/compiler/sandbox-compiler-client.test.ts
```

Expected: FAIL because the sandbox modules do not exist.

- [ ] **Step 3: Implement the WXT sandbox entrypoint and CSP**

Use `entrypoints/compiler.sandbox/index.html` so WXT automatically writes
`sandbox.pages`. Its body contains only:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Chat2TeX Compiler Sandbox</title>
  </head>
  <body>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

Make `manifest` a function of WXT context. Use this CSP, adding the loopback
origin only in development:

```ts
manifest: ({ mode }) => {
  const developmentCoreOrigin =
    mode === "development" ? " http://127.0.0.1:4178" : "";
  return {
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'none'; frame-src 'self'; " +
        "connect-src https://github.com https://release-assets.githubusercontent.com " +
        `https://texlive2026.texlyre.org${developmentCoreOrigin};`,
      sandbox:
        "sandbox allow-scripts; default-src 'none'; " +
        "script-src 'self' 'unsafe-eval' " +
        "'wasm-unsafe-eval' blob:; worker-src blob:; connect-src blob:; " +
        "object-src 'none'; child-src 'none'; frame-src 'none'; " +
        "img-src 'none'; media-src 'none'; font-src 'none'; " +
        "style-src 'none'; base-uri 'none'; form-action 'none';",
    },
  };
},
```

The sandbox accepts exactly one
`CHAT2TEX_SANDBOX_CONNECT` message from `parent`, consumes its transferred
`MessagePort`, removes the window listener, and handles all later traffic on
that port.

- [ ] **Step 4: Implement Blob-backed BusyTeX worker composition**

`createSandboxWorkerSource()` must:

1. define `NativeXMLHttpRequest`;
2. replace XHR only for origin `https://chat2tex.invalid`;
3. accept only `GET`, synchronous mode, safe format, and safe filename;
4. record each unique `{format, name}` and return local status `404`;
5. preserve native XHR for Blob URLs used by Emscripten;
6. define `BusytexPipeline` from the supplied pipeline source;
7. override `BusytexPipeline.locateFile()` so
   `texlive-basic.data` resolves to its actual Blob URL;
8. append the upstream worker source after removing the single
   `importScripts('busytex_pipeline.js')` statement;
9. attach recorded `packageLookups` to terminal compile messages;
10. clear recorded lookups at the start of each compile.

The sandbox adapter, not the offscreen page, creates the composite worker and
sends the upstream initialization payload with:

```ts
{
  busytex_js: xetexJsBlobUrl,
  busytex_wasm: xetexWasmBlobUrl,
  preload_data_packages_js: [texliveBasicJsBlobUrl],
  data_packages_js: [texliveBasicJsBlobUrl],
  texmf_local: [],
  preload: true,
}
```

Compilation always uses driver `xetex_bibtex8_dvipdfmx`,
`remote_endpoint: "https://chat2tex.invalid"`, `shell_escape: false`, and no
shell-handler scripts. Translate `SerializedCompileProject` into BusyTeX's
`files`/`main_tex_path` payload, and translate `write-remote-files` into the
upstream `write_texlive_remote_files` message. No `BusyTexRunner` instance
runs in an extension-privileged page.

Create Blob URLs with these MIME types:

```ts
{
  "busytex-worker": "text/javascript",
  "busytex-pipeline": "text/javascript",
  "xetex-js": "text/javascript",
  "xetex-wasm": "application/wasm",
  "texlive-basic-js": "text/javascript",
  "texlive-basic-data": "application/octet-stream",
}
```

Revoke every URL on terminate or initialization failure.

- [ ] **Step 5: Implement the offscreen sandbox client**

The client creates:

```html
<iframe hidden src="chrome-extension://<id>/compiler-sandbox.html"></iframe>
```

It sends a random `crypto.randomUUID()` nonce with a transferred
`MessageChannel.port2`. It accepts `window` replies only when
`event.source === iframe.contentWindow` and `event.origin === "null"`.
After the port handshake, correlate every RPC by `requestId`, enforce a
120-second initialization timeout and 180-second compile timeout, and reject
all pending promises on termination.

- [ ] **Step 6: Run the production-shaped local smoke test**

Start the static core server:

```bash
python3 -m http.server 4178 --bind 127.0.0.1 \
  --directory .compiler-assets/1.2.3
```

In another terminal run:

```bash
WXT_COMPILER_ASSET_BASE_URL=http://127.0.0.1:4178/ pnpm dev
```

Load the unpacked extension in Chrome 116+ and invoke the temporary
development-only offscreen smoke request first with:

```ts
{
  source:
    "\\documentclass{article}\\begin{document}Xin chào Việt Nam\\end{document}",
  files: [],
}
```

Then run a second request with
`"\\documentclass{article}\\usepackage{xcolor}\\begin{document}\\color{blue}Xin chào\\end{document}"`.
The development smoke handler must explicitly take the recorded
`{ format: 26, name: "xcolor.sty" }` lookup, fetch it in the offscreen page,
write it into the sandbox VFS, and retry the identical project.

Pass conditions:

- `compiler-sandbox.html` appears in `manifest.sandbox.pages`;
- the sandbox initializes XeTeX/basic from transferred bytes;
- both PDFs begin with `%PDF-`;
- `{format: 26, name: "xcolor.sty"}` is recorded, fetched by offscreen, written,
  and satisfied on retry;
- DevTools shows no sandbox-origin network request;
- the second initialization reads core bytes from Cache Storage;
- the cache core total is at most 140 MiB.

If any condition fails, stop execution and return to the design. Do not
continue to Task 4.

- [ ] **Step 7: Run automated tests and the no-commit checkpoint**

Run:

```bash
pnpm exec vitest run \
  tests/features/compiler/sandbox-protocol.test.ts \
  tests/features/compiler/sandbox-worker-source.test.ts \
  tests/features/compiler/sandbox-compiler-client.test.ts
pnpm run compile
pnpm run build
git diff --check
git status --short
```

Expected: all commands PASS and the working tree remains unstaged.

- [ ] **Step 8: Move the verified-obsolete legacy payload to Trash**

Only after the manual sandbox gate and automated checks above pass, verify the
exact target. Stop the temporary WXT/core-server sessions first:

```bash
test "$(pwd)" = "/Users/duongchung/Downloads/code/test/Chat2TeX"
du -sh /Users/duongchung/Downloads/code/test/Chat2TeX/public/texlive
```

Use a recoverable macOS Trash operation on only that ignored directory:

```bash
osascript -e 'tell application "Finder" to delete POSIX file "/Users/duongchung/Downloads/code/test/Chat2TeX/public/texlive"'
```

Expected: approximately 648 MB moves to Trash; it remains recoverable until
Trash is emptied. Report this removal to the user and do not empty Trash.
Confirm `public/texlive` is absent before continuing, so every later build is
the slim production shape.

---

### Task 4: On-Demand XeTeX Engine and Bounded Package Resolution

**Files:**
- Create: `src/features/compiler/on-demand-busytex-engine.ts`
- Create: `tests/features/compiler/on-demand-busytex-engine.test.ts`
- Modify: `src/features/compiler/busytex-engine.ts`
- Modify: `src/features/compiler/types.ts`
- Modify: `src/features/compiler/latex-compiler.ts`
- Modify: `tests/features/compiler/busytex-engine.test.ts`
- Modify: `tests/features/compiler/latex-compiler.test.ts`

**Interfaces:**
- Produces:

```ts
export type CompilerProgress =
  | { phase: "downloading-compiler"; loaded: number; total: number; label: string }
  | { phase: "initializing"; label: string }
  | { phase: "downloading-packages"; current: number; total: number; label: string }
  | { phase: "compiling"; pass: number; label: string };

export function serializeProject(
  project: LatexCompileProject,
): SerializedCompileProject;
export function uniquePackageLookups(
  lookups: readonly PackageLookup[],
): PackageLookup[];
export function readFailureMessage(result: SandboxCompileResult): string;

export interface LatexEngine {
  initialize(signal?: AbortSignal): Promise<void>;
  compile(
    project: LatexCompileProject,
    signal?: AbortSignal,
  ): Promise<LatexEngineOutput>;
  terminate(): void;
}

export class OnDemandBusyTexEngine implements LatexEngine {
  constructor(
    client: SandboxCompilerClient,
    cache: CompilerAssetCache,
    fetcher: CompilerAssetFetcher,
    onProgress?: (progress: CompilerProgress) => void,
  );

  initialize(signal?: AbortSignal): Promise<void>;
  compile(
    project: LatexCompileProject,
    signal?: AbortSignal,
  ): Promise<LatexEngineOutput>;
  terminate(): void;
}

export class LatexCompiler {
  compile(
    project: LatexCompileProject,
    signal?: AbortSignal,
  ): Promise<LatexCompileOutput>;
  terminate(): void;
}
```

- Preserves `BusyTexCompileError` with `.compileLog`.

- [ ] **Step 1: Write failing cold/warm/offline/bounded-pass tests**

Use fake client/cache/fetcher ports:

```ts
it("fetches a miss, writes it, and retries the same project", async () => {
  client.compile
    .mockResolvedValueOnce({
      success: false,
      log: "! LaTeX Error: File `xcolor.sty' not found.",
      exitCode: 1,
      packageLookups: [{ format: 26, name: "xcolor.sty" }],
    })
    .mockResolvedValueOnce({
      success: true,
      pdf: new Uint8Array([37, 80, 68, 70, 45]),
      log: "",
      exitCode: 0,
      packageLookups: [],
    });
  cache.getOrFetchPackage.mockResolvedValue({
    content: new Uint8Array([1, 2]),
    source: "network",
  });

  const result = await engine.compile({ source: "\\documentclass{article}", files: [] });

  expect(client.writeRemoteFiles).toHaveBeenCalledWith([
    { format: 26, name: "xcolor.sty", content: new Uint8Array([1, 2]) },
  ]);
  expect(client.compile).toHaveBeenCalledTimes(2);
  expect(result.pdf.slice(0, 5)).toEqual(new Uint8Array([37, 80, 68, 70, 45]));
});

it("stops after 32 resolution passes", async () => {
  client.compile.mockImplementation(async () => ({
    success: false,
    log: "missing",
    exitCode: 1,
    packageLookups: [{ format: 26, name: "loop.sty" }],
  }));
  cache.getOrFetchPackage.mockResolvedValue({
    content: new Uint8Array([1]),
    source: "cache",
  });

  await expect(engine.compile({ source: "x", files: [] }))
    .rejects.toThrow("Package resolution exceeded 32 passes");
});
```

Also test core integrity retry, cached package offline, 404 with canonical name,
duplicate lookup de-duplication, abort, one sandbox-crash recreation, and
non-package compile errors going directly to `BusyTexCompileError`. Reject a
pass with 257 unique lookups, a job that reaches 513 unique files, or more than
160 MiB of newly downloaded package bytes; cached bytes do not count against
the download-byte limit.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm exec vitest run \
  tests/features/compiler/on-demand-busytex-engine.test.ts \
  tests/features/compiler/busytex-engine.test.ts \
  tests/features/compiler/latex-compiler.test.ts
```

Expected: FAIL because `OnDemandBusyTexEngine` does not exist.

- [ ] **Step 3: Implement initialization**

Load `GENERATED_CORE_ASSETS` in deterministic order, call
`cache.getOrFetchCore()` for each, report byte progress, and then call
`client.initialize()` once. Keep one shared initialization promise and clear
it after rejection, matching the existing `LatexCompiler` retry semantics.

Reject initialization unless all six `CoreAssetId` values are present.
If `COMPILER_VERSION` differs from the active cache version, stage the six
assets, initialize the sandbox, and compile
`"\\documentclass{article}\\begin{document}Chat2TeX\\end{document}"`. Activate
the staged version only when the result succeeds and starts with `%PDF-`. On
failure, terminate the candidate sandbox, discard only the staged core,
reload `readActiveCoreAssets()`, and initialize the previous active version.
If no previous active core exists (first installation), surface the candidate
failure instead. Test activation, rollback, and first-install failure paths;
never delete the previous core before the new version passes this smoke
compile.

- [ ] **Step 4: Implement bounded package passes**

Use:

```ts
async compile(project: LatexCompileProject, signal?: AbortSignal) {
const compileLogs: string[] = [];
const seenLookups = new Set<string>();
let downloadedPackageBytes = 0;
for (let pass = 1; pass <= MAX_PACKAGE_PASSES; pass += 1) {
  this.onProgress?.({ phase: "compiling", pass, label: `XeTeX pass ${pass}` });
  const result = await this.client.compile(serializeProject(project));
  compileLogs.push(result.log);
  if (result.success && result.pdf) {
    return { pdf: new Uint8Array(result.pdf), log: compileLogs.join("\n\n") };
  }

  const lookups = uniquePackageLookups(result.packageLookups);
  if (lookups.length > MAX_PACKAGE_LOOKUPS_PER_PASS) {
    throw new BusyTexCompileError(
      "XeTeX requested more than 256 files in one pass.",
      result.log,
    );
  }
  for (const lookup of lookups) {
    seenLookups.add(packageLookupKey(lookup));
  }
  if (seenLookups.size > MAX_PACKAGE_FILES_PER_JOB) {
    throw new BusyTexCompileError(
      "XeTeX requested more than 512 files in one job.",
      result.log,
    );
  }
  if (lookups.length === 0) {
    throw new BusyTexCompileError(readFailureMessage(result), result.log);
  }

  const remoteFiles: TexliveRemoteFile[] = [];
  for (const lookup of lookups) {
    const resolved = await this.cache.getOrFetchPackage(
      lookup,
      this.fetcher,
      signal,
    );
    if (resolved) {
      if (resolved.source === "network") {
        downloadedPackageBytes += resolved.content.byteLength;
      }
      if (downloadedPackageBytes > MAX_PACKAGE_DOWNLOAD_BYTES_PER_JOB) {
        throw new BusyTexCompileError(
          "On-demand package downloads exceeded 160 MiB.",
          result.log,
        );
      }
      remoteFiles.push({ ...lookup, content: resolved.content });
    }
  }
  if (remoteFiles.length === 0) {
    throw new BusyTexCompileError(readFailureMessage(result), result.log);
  }
  await this.client.writeRemoteFiles(remoteFiles);
}
throw new BusyTexCompileError(
  `Package resolution exceeded ${MAX_PACKAGE_PASSES} passes.`,
  compileLogs.join("\n\n"),
);
}
```

Never pass the real package endpoint or a shell-handler URL into the sandbox.
The worker receives only `https://chat2tex.invalid` as its synthetic remote
endpoint.

- [ ] **Step 5: Preserve image fallback and crash recovery**

Keep `LatexCompiler` as the image-omission wrapper around the new engine.
When the sandbox throws a timeout/crash error, terminate/recreate it and retry
the entire `LatexCompiler.compile()` call once. Integrity failures, 404
failures, ordinary XeTeX errors, and user aborts are not crash-retried.

- [ ] **Step 6: Run compiler tests and checkpoint**

Run:

```bash
pnpm exec vitest run tests/features/compiler
pnpm run compile
git diff --check
git status --short
```

Expected: compiler tests and TypeScript compilation PASS; no staged files.

---

### Task 5: Persistent Single-Job Coordinator and Runtime Messages

**Files:**
- Create: `src/features/compiler/compiler-job-types.ts`
- Create: `src/features/compiler/compiler-job-store.ts`
- Create: `src/features/compiler/compiler-job-coordinator.ts`
- Create: `tests/features/compiler/compiler-job-store.test.ts`
- Create: `tests/features/compiler/compiler-job-coordinator.test.ts`
- Modify: `src/shared/messages.ts`
- Modify: `entrypoints/compiler/main.ts`
- Modify: `entrypoints/background.ts`

**Interfaces:**
- Produces:

```ts
export type CompilerJobPhase =
  | "preparing"
  | "downloading-compiler"
  | "downloading-packages"
  | "initializing"
  | "compiling"
  | "packaging"
  | "downloading-output"
  | "completed"
  | "cancelled"
  | "failed";

export interface CompilerJobSnapshot {
  jobId: string;
  phase: CompilerJobPhase;
  title: string;
  messageCount: number;
  assetCount: number;
  outputKinds: OutputKind[];
  progress: CompilerProgress | null;
  error: string | null;
  pdfByteLength: number | null;
  omittedFiles: string[];
  downloadedFiles: string[];
  startedAt: number;
  updatedAt: number;
}

export interface StartCompilerJobPayload {
  title: string;
  url: string;
  messageCount: number;
  exportedAtIso: string;
  latexSource: string;
  files: ResolvedAssetFile[];
  failures: FailedExportAsset[];
  outputKinds: OutputKind[];
}

export interface CompilerJobRecoveryMarker {
  schemaVersion: 1;
  jobId: string;
  phase: CompilerJobPhase;
  startedAt: number;
  updatedAt: number;
}

export interface CompilerJobDiagnostics {
  jobId: string;
  error: string | null;
  compileLog: string;
  omittedFiles: string[];
}
```

```ts
export class CompilerJobCoordinator {
  start(payload: StartCompilerJobPayload): Promise<CompilerJobSnapshot>;
  get(jobId?: string): Promise<CompilerJobSnapshot | null>;
  diagnostics(jobId: string): Promise<CompilerJobDiagnostics>;
  cancel(jobId: string): Promise<CompilerJobSnapshot>;
  prepareArtifacts(jobId: string): Promise<PrepareDownloadResult>;
  recordDownloads(
    jobId: string,
    downloads: StartedDownload[],
  ): Promise<CompilerJobSnapshot>;
  cacheStatus(): Promise<CompilerCacheStatus>;
  clearCache(): Promise<CompilerCacheStatus>;
}
```

- Runtime message constants:

```ts
CHATTEX_START_COMPILER_JOB
CHATTEX_GET_COMPILER_JOB
CHATTEX_GET_COMPILER_JOB_DIAGNOSTICS
CHATTEX_CANCEL_COMPILER_JOB
CHATTEX_DOWNLOAD_COMPILER_JOB
CHATTEX_COMPILER_JOB_UPDATED
CHATTEX_GET_COMPILER_CACHE_STATUS
CHATTEX_CLEAR_COMPILER_CACHE
CHATTEX_PREPARE_COMPILER_JOB_ARTIFACTS
CHATTEX_RECORD_COMPILER_JOB_DOWNLOADS
```

The first eight names are public background routes/events. The final two are
internal background-to-offscreen routes and must reject content-script or
popup senders.
Background applies trusted-sender validation before returning job, cache, or
diagnostic data. Diagnostics remain in offscreen memory and are never written
to either storage area.

- [ ] **Step 1: Write failing store and coordinator tests**

Cover sanitized persistence:

```ts
it("never persists source or binary payloads", async () => {
  await store.write({
    jobId: "job-1",
    phase: "compiling",
    title: "Private conversation",
    messageCount: 2,
    assetCount: 1,
    outputKinds: ["pdf"],
    progress: null,
    error: null,
    pdfByteLength: null,
    omittedFiles: [],
    downloadedFiles: [],
    startedAt: 1,
    updatedAt: 2,
  });

  const serialized = JSON.stringify(storageSession.set.mock.calls[0][0]);
  expect(serialized).not.toContain("latexSource");
  expect(serialized).not.toContain("pdfBase64");
  expect(serialized).not.toContain("files");
});

it("persists no conversation metadata in the restart marker", async () => {
  await store.writeRecoveryMarker(activeSnapshot);
  const serialized = JSON.stringify(storageLocal.set.mock.calls[0][0]);
  expect(serialized).toContain("job-1");
  expect(serialized).not.toContain("Private conversation");
  expect(serialized).not.toContain("https://chatgpt.com");
  expect(serialized).not.toContain("latexSource");
});
```

Cover single-job rejection, progress updates, popup-independent completion,
cancel, diagnostic retrieval, stale nonterminal snapshot becoming `failed` with
`"Previous export was interrupted."`, and clear-cache rejection while a job
is active. Use fake timers to prove terminal source/PDF/image/log memory is
released after download recording or a 10-minute fallback TTL.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm exec vitest run \
  tests/features/compiler/compiler-job-store.test.ts \
  tests/features/compiler/compiler-job-coordinator.test.ts
```

Expected: FAIL because job modules do not exist.

- [ ] **Step 3: Implement job storage**

Use `browser.storage.session` key `chat2tex.compiler-job.snapshot.v1` for the
full sanitized `CompilerJobSnapshot`. Use `browser.storage.local` key
`chat2tex.compiler-job.recovery.v1` only for `CompilerJobRecoveryMarker`.
Keep `StartCompilerJobPayload`, title/URL recovery data, PDF bytes, source
files, artifact object URLs, and logs in offscreen memory. Set both storage
areas to `"TRUSTED_CONTEXTS"` before the first read/write.

On offscreen startup:

```ts
const previous = await store.read();
if (previous && !["completed", "cancelled", "failed"].includes(previous.phase)) {
  await store.write({
    ...previous,
    phase: "failed",
    error: "Previous export was interrupted.",
    updatedAt: Date.now(),
  });
}
```

If session storage is empty but a nonterminal recovery marker exists, create a
failed session snapshot with title `"Interrupted export"`, zero content
counts, and error `"Previous export was interrupted."`. Delete the recovery
marker on every completed, cancelled, or failed transition.

- [ ] **Step 4: Implement the coordinator**

Generate job IDs with `crypto.randomUUID()`. Reject a second active job with
`"Another Chat2TeX export is already running."`. Attach an `AbortController`
to the active job. `start()` persists the initial snapshot, launches one
internally caught `runJob()` promise, and returns immediately; its promise must
convert every thrown error into a terminal snapshot so no rejection is left
unhandled. Pass the controller signal through `LatexCompiler`, core/package
fetches, and artifact preparation. Every transition:

1. updates the in-memory snapshot;
2. writes the sanitized snapshot;
3. sends `CHATTEX_COMPILER_JOB_UPDATED`.

If `outputKinds` excludes `pdf`, skip `LatexCompiler.compile()` and mark the
job completed with `pdfByteLength: null`.

Cancellation aborts fetches, terminates the sandbox, revokes temporary object
URLs, preserves verified cache entries, and sets `phase: "cancelled"`.
`clearCache()` rejects while a job is active; otherwise it terminates the
sandbox first, clears persistent bytes/metadata/TOFU hashes, and returns the
zeroed status so stale VFS files cannot survive the UI action.
Keep completed artifacts and failure diagnostics in offscreen memory for at
most 10 minutes so a reopened popup can act on them. A fully successful
`recordDownloads()`, a new job, cancellation, or TTL expiry immediately
revokes object URLs and drops source, image, PDF, ZIP, and log references;
retain failed-download artifacts until retry or TTL expiry.

- [ ] **Step 5: Replace compile/download routing**

The background remains responsible for:

- trusted-sender validation;
- creating/recreating `compiler.html`;
- forwarding job/cache commands;
- calling `browser.downloads.download()` for returned artifact descriptors.

The offscreen document owns coordinator instances and responds only to the
two internal artifact messages plus offscreen-targeted job/cache commands.
Its listener accepts internal commands only when
`sender.url === browser.runtime.getURL("background.js")`; test rejection from
the popup extension URL and both content-script hosts.
For `CHATTEX_DOWNLOAD_COMPILER_JOB`, background asks offscreen to
`prepareArtifacts(jobId)`, starts each download, then sends the exact
`StartedDownload[]` back through `CHATTEX_RECORD_COMPILER_JOB_DOWNLOADS`.
Remove
`CHATTEX_COMPILE_IN_OFFSCREEN` and
`CHATTEX_PREPARE_DOWNLOADS_OFFSCREEN` after all callers migrate.

Update trusted content-script hosts to only:

```ts
/^(?:chatgpt\.com|chat\.openai\.com)$/i
```

- [ ] **Step 6: Run coordinator/background tests and checkpoint**

Run:

```bash
pnpm exec vitest run \
  tests/features/compiler/compiler-job-store.test.ts \
  tests/features/compiler/compiler-job-coordinator.test.ts \
  tests/features/assets
pnpm run compile
git diff --check
git status --short
```

Expected: all commands PASS; source and binary payloads do not appear in
`chrome.storage.session`; no file is staged.

---

### Task 6: Output-Kind Planner and Zero-Waste Packaging

**Files:**
- Create: `src/features/export/output-plan.ts`
- Create: `tests/features/export/output-plan.test.ts`
- Modify: `src/features/export/download-types.ts`
- Modify: `entrypoints/compiler/main.ts`
- Modify: `entrypoints/background.ts`
- Modify: `tests/features/export/source-package-builder.test.ts`

**Interfaces:**
- Produces:

```ts
export type OutputKind = "pdf" | "tex" | "source";

export interface ExportWorkPlan {
  outputKinds: OutputKind[];
  needsCompiler: boolean;
  needsPdfArtifact: boolean;
  needsTexArtifact: boolean;
  needsSourceArchive: boolean;
}

export function createExportWorkPlan(kinds: readonly OutputKind[]): ExportWorkPlan;
```

```ts
export interface DownloadExportPayload {
  title: string;
  url: string;
  exportedAtIso: string;
  latexSource: string;
  pdfBase64?: string;
  files: ResolvedAssetFile[];
  failures: FailedExportAsset[];
  outputKinds: OutputKind[];
}

export interface PrepareDownloadDependencies {
  sourcePackageBuilder: SourcePackageBuilder;
  createObjectUrl?: (blob: Blob) => string;
  signal?: AbortSignal;
}

export function prepareDownloadArtifacts(
  payload: DownloadExportPayload,
  dependencies: PrepareDownloadDependencies,
): Promise<PrepareDownloadResult>;
```

- [ ] **Step 1: Write failing planner and packaging tests**

```ts
it.each([
  [["pdf"], true, false],
  [["tex"], false, false],
  [["source"], false, true],
  [["pdf", "tex", "source"], true, true],
] as const)(
  "plans %j without unused work",
  (kinds, needsCompiler, needsSourceArchive) => {
    expect(createExportWorkPlan(kinds)).toMatchObject({
      needsCompiler,
      needsSourceArchive,
    });
  },
);

it("does not call SourcePackageBuilder for PDF-only", async () => {
  const result = await prepareDownloadArtifacts(pdfOnlyPayload, {
    sourcePackageBuilder,
  });
  expect(sourcePackageBuilder.build).not.toHaveBeenCalled();
  expect(result.artifacts.map((artifact) => artifact.kind)).toEqual(["pdf"]);
});
```

Also test empty/duplicate/unknown kinds, TEX-only, source-only, mixed output,
missing PDF bytes for `"pdf"`, and exact artifact order `pdf`, `tex`, `source`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm exec vitest run \
  tests/features/export/output-plan.test.ts \
  tests/features/export/source-package-builder.test.ts
```

Expected: FAIL because `createExportWorkPlan` does not exist and packaging
still always creates every artifact.

- [ ] **Step 3: Implement the planner**

Normalize through a set and fixed order:

```ts
const OUTPUT_ORDER: readonly OutputKind[] = ["pdf", "tex", "source"];

export function createExportWorkPlan(
  requested: readonly OutputKind[],
): ExportWorkPlan {
  const selected = new Set(requested);
  if (selected.size === 0 || [...selected].some((kind) => !OUTPUT_ORDER.includes(kind))) {
    throw new Error("At least one valid export output is required.");
  }
  const outputKinds = OUTPUT_ORDER.filter((kind) => selected.has(kind));
  return {
    outputKinds,
    needsCompiler: selected.has("pdf"),
    needsPdfArtifact: selected.has("pdf"),
    needsTexArtifact: selected.has("tex"),
    needsSourceArchive: selected.has("source"),
  };
}
```

- [ ] **Step 4: Build only selected artifacts**

Call `SourcePackageBuilder.build()` only when `needsSourceArchive`. Decode
`pdfBase64` only when `needsPdfArtifact`. Create TEX bytes only when
`needsTexArtifact`. Remove background filtering by `exportPdfOnly`; the
offscreen artifact list is already exact. Check `dependencies.signal` before
and after each potentially expensive build/encode step and throw
`AbortError` without publishing partial descriptors.

Keep current object URL revocation at 120 seconds and revoke immediately after
the background starts or fails each download.

- [ ] **Step 5: Run export tests and checkpoint**

Run:

```bash
pnpm exec vitest run tests/features/export
pnpm run compile
git diff --check
git status --short
```

Expected: export tests PASS; PDF-only makes no ZIP; TEX/source-only makes no
compiler call; no files are staged.

---

### Task 7: Reconnectable Popup, In-Page Flow, Progress, Cancel, and Cache UI

**Files:**
- Create: `entrypoints/popup/export-flow-state.ts`
- Create: `tests/entrypoints/popup/export-flow-state.test.ts`
- Modify: `entrypoints/popup/use-export-flow.ts`
- Modify: `entrypoints/popup/App.tsx`
- Modify: `entrypoints/popup/style.css`
- Modify: `entrypoints/chatgpt.content.ts`

**Interfaces:**
- Produces:

```ts
export interface ExportFlowState {
  runId: number;
  phase: ExportPhase;
  prepared: PreparedExport | null;
  processedAssets: ProcessedExportAssets | null;
  activeJob: CompilerJobSnapshot | null;
  error: string | null;
  compileLog: string;
  downloadedFiles: string[];
}

export function exportFlowReducer(
  state: ExportFlowState,
  action: ExportFlowAction,
): ExportFlowState;
```

The hook adds:

```ts
cancel(): Promise<void>;
refreshJob(): Promise<void>;
getCacheStatus(): Promise<CompilerCacheStatus>;
clearCompilerCache(): Promise<CompilerCacheStatus>;
```

- [ ] **Step 1: Write failing reducer and reconnect tests**

Test stale run protection and snapshot mapping:

```ts
it("ignores an older async run", () => {
  const newer = exportFlowReducer(initialExportFlowState, {
    type: "prepare-started",
    runId: 2,
  });
  const result = exportFlowReducer(newer, {
    type: "prepare-failed",
    runId: 1,
    error: "stale",
  });
  expect(result).toBe(newer);
});

it("maps a restored package download snapshot to visible progress", () => {
  const result = exportFlowReducer(initialExportFlowState, {
    type: "job-updated",
    runId: 1,
    snapshot: packageDownloadSnapshot,
  });
  expect(result.phase).toBe("downloading-packages");
  expect(result.activeJob?.jobId).toBe("job-1");
});
```

Also test interrupted, cancelled, completed, compile error log, successful
downloads, and reconnect without `PreparedExport` source persistence.

- [ ] **Step 2: Run the reducer test and verify RED**

Run:

```bash
pnpm exec vitest run tests/entrypoints/popup/export-flow-state.test.ts
```

Expected: FAIL because the reducer does not exist.

- [ ] **Step 3: Refactor the hook to the job protocol**

Keep conversation collection, permission request, and image processing in the
popup until assets are ready. On compile:

```ts
const outputKinds: OutputKind[] = exportOptions?.exportPdfOnly
  ? ["pdf"]
  : ["pdf", "tex", "source"];

const response = await browser.runtime.sendMessage({
  type: CHATTEX_START_COMPILER_JOB,
  payload: {
    title: prepared.title,
    url: prepared.url,
    messageCount: prepared.messageCount,
    exportedAtIso: new Date().toISOString(),
    latexSource: prepared.latexSource,
    files: processedAssets.files,
    failures: processedAssets.failures,
    outputKinds,
  },
});
```

Listen for `CHATTEX_COMPILER_JOB_UPDATED`. On mount, request the current job;
if it is active or completed, restore its sanitized snapshot. Retrieve compile
logs and omitted-file diagnostics only through
`CHATTEX_GET_COMPILER_JOB_DIAGNOSTICS` when needed. PDF bytes never return to
the popup; background downloads them through the internal artifact flow.

Do not persist source or processed image bytes in React storage or
`chrome.storage`.

- [ ] **Step 4: Update popup presentation**

Render distinct text for:

- downloading compiler with byte progress;
- initializing XeTeX;
- downloading packages with filename/count;
- compiling with pass number;
- cancelled;
- interrupted;
- integrity mismatch;
- offline missing package.

Show a Cancel button only for nonterminal jobs. Add a compact cache disclosure
in the footer:

```text
Compiler cache: 126.4 MB
[Clear cache]
```

Disable Clear cache during an active job. Confirm in copy that clearing the
cache requires a later download; the button's click is the confirmation
gesture and does not need a modal.

- [ ] **Step 5: Migrate the in-page exporter**

After existing asset processing, call `CHATTEX_START_COMPILER_JOB`, subscribe
or poll `CHATTEX_GET_COMPILER_JOB` every 350 ms, update the in-page status from
the snapshot, and call `CHATTEX_DOWNLOAD_COMPILER_JOB` after completion.
Abort polling on terminal failure or cancellation.

The in-page flow uses `["pdf"]` when `exportPdfOnly` is true and
`["pdf", "tex", "source"]` otherwise.

- [ ] **Step 6: Run UI-focused tests and checkpoint**

Run:

```bash
pnpm exec vitest run \
  tests/entrypoints/popup/export-flow-state.test.ts \
  tests/features/assets \
  tests/features/export
pnpm run compile
git diff --check
git status --short
```

Expected: tests and compilation PASS; closing and reopening the popup in the
manual Chrome run reconnects to the same `jobId`; no staged files.

---

### Task 8: Chrome-Only Manifest, Permissions, Fonts, License, and Documentation

**Files:**
- Create: `LICENSE`
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `PRIVACY.md`
- Create: `public/legal.html`
- Create: `src/config/extension-manifest.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `wxt.config.ts`
- Modify: `entrypoints/chatgpt.content.ts`
- Modify: `entrypoints/popup/index.html`
- Modify: `entrypoints/popup/style.css`
- Modify: `entrypoints/popup/App.tsx`
- Modify: `README.md`

**Interfaces:**
- Final manifest permissions:

```json
["storage", "unlimitedStorage", "downloads", "offscreen"]
```

- Final required origins:

```text
https://chatgpt.com/*
https://chat.openai.com/*
https://github.com/*
https://release-assets.githubusercontent.com/*
https://texlive2026.texlyre.org/*
```

- Optional image origin remains:

```text
https://*/*
```

- [ ] **Step 1: Write a failing manifest-policy test**

Create `tests/scripts/manifest-policy.test.ts` that imports the pure
`createExtensionManifest({ mode: "production" })` factory used by
`wxt.config.ts` and asserts:

```ts
expect(manifest.minimum_chrome_version).toBe("116");
expect(manifest.permissions).toEqual([
  "storage",
  "unlimitedStorage",
  "downloads",
  "offscreen",
]);
expect(manifest.host_permissions).not.toContain("https://*.openai.com/*");
expect(manifest.host_permissions).not.toContain("https://*.gstatic.com/*");
expect(manifest.content_security_policy.sandbox).toContain("connect-src blob:");
expect(manifest.content_security_policy.sandbox).toContain("default-src 'none'");
expect(manifest.content_security_policy.sandbox).not.toMatch(
  /connect-src[^;]*https?:/,
);
expect(existsSync("entrypoints/compiler.sandbox/index.html")).toBe(true);
```

WXT owns the generated `sandbox.pages` entry; assert its final value after the
production build and again in Task 9's archive gate.

- [ ] **Step 2: Run the policy test and verify RED**

Run:

```bash
pnpm exec vitest run tests/scripts/manifest-policy.test.ts
```

Expected: FAIL because the current manifest has `scripting`, broad domains,
no sandbox page, and no Chrome version floor.

- [ ] **Step 3: Remove Firefox and remote font dependencies**

Run:

```bash
pnpm remove web-ext
```

Remove `dev:firefox`, `build:firefox`, and `zip:firefox`. Remove the
`fonts.googleapis.com` `@import`; use:

```css
font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
  "Segoe UI", sans-serif;
```

Change popup title to:

```html
<title>Chat2TeX Exporter</title>
```

- [ ] **Step 4: Narrow the manifest and content-script matches**

Set WXT `targetBrowsers: ["chrome"]`, `manifestVersion: 3`,
`minimum_chrome_version: "116"`, exact permissions/origins above, and
content-script matches:

```ts
matches: ["https://chatgpt.com/*", "https://chat.openai.com/*"]
```

Keep sandbox `connect-src blob:` so Emscripten may read verified local Blob
URLs, and assert that its `connect-src` contains no HTTP, HTTPS, WebSocket, or
other network source. Only the offscreen extension page may connect to
compiler/package origins.

- [ ] **Step 5: Add AGPL and privacy documents**

Use `apply_patch` to create `LICENSE` with the verbatim contents of
`node_modules/texlyre-busytex/LICENSE`, then verify:

```bash
cmp LICENSE node_modules/texlyre-busytex/LICENSE
```

`THIRD_PARTY_NOTICES.md` names and links:

- TeXlyre BusyTeX 1.2.3 — AGPL-3.0-or-later;
- BusyTeX — MIT-derived upstream;
- Emscripten — MIT/University of Illinois/NCSA;
- TeX Live 2026 components — package-specific free software licenses.

`PRIVACY.md` states:

- conversation and generated outputs remain local;
- GitHub release/CDN receives core asset requests;
- `texlive2026.texlyre.org` receives only numeric format and static filename
  lookups;
- those servers can observe IP address, user agent, and requested filenames;
- no analytics or source upload is added;
- Clear cache removes package bytes and first-seen hash ledger.

Create `public/legal.html` with the same concise privacy disclosure, the
AGPL-3.0-or-later project license, third-party notice names, and links to the
source repository plus full license/notices in the repository. Keep it static:
no script, external stylesheet, remote font, or analytics.

Update README with Chrome 116+, approximately 140 MiB first-use core,
300 MiB cache budget, offline-after-cache behavior, Chrome-only status,
why `unlimitedStorage` is required for Cache Storage stability, AGPL source
obligation, and the local asset preparation command.

- [ ] **Step 6: Add source/license UI**

Change footer copy from `Offline-first · XeLaTeX` to:

```text
Local XeLaTeX · AGPL-3.0
```

Add links to the packaged legal page and the exact source repository
`https://github.com/VanChung369/Chat2TeX`. The legal link must use
`browser.runtime.getURL("legal.html")`; do not point at an unpackaged Markdown
file. Do not claim a public release tag until one exists.

- [ ] **Step 7: Run policy, build, and checkpoint**

Run:

```bash
pnpm exec vitest run tests/scripts/manifest-policy.test.ts
pnpm run compile
pnpm run build
node -e "const m=require('./.output/chrome-mv3/manifest.json'); if(!m.sandbox.pages.includes('compiler-sandbox.html')) process.exit(1)"
git diff --check
git status --short
```

Expected: tests, compile, and Chrome build PASS; generated manifest has the
exact version, permission, origin, and sandbox values; no commit is created.

---

### Task 9: Package-Size and Remote-Code Policy Gates

**Files:**
- Create: `scripts/check-extension-package.mjs`
- Create: `tests/scripts/check-extension-package.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces:

```js
export const MAX_EXTENSION_ZIP_BYTES = 5 * 1024 * 1024;
export async function inspectExtensionZip(path) {
  return {
    byteLength,
    entries,
    manifest,
    forbiddenEntries,
    forbiddenUrls,
  };
}
export async function inspectExtensionBytes(bytes) {
  // Returns the same inspection result as inspectExtensionZip().
}
```

- [ ] **Step 1: Write failing package-gate tests**

Build in-memory JSZip fixtures and assert:

```ts
it("rejects TeX data and WASM in the extension archive", async () => {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(validManifest));
  zip.file("texlive-basic.data", new Uint8Array([1]));
  zip.file("xetex.wasm", new Uint8Array([1]));

  await expect(inspectExtensionBytes(await zip.generateAsync({
    type: "uint8array",
  }))).rejects.toThrow("forbidden compiler assets");
});

it("rejects a remote script outside the sandbox bootstrap", async () => {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(validManifest));
  zip.file("background.js", 'import("https://cdn.example.com/code.js")');

  await expect(inspectExtensionBytes(await zip.generateAsync({
    type: "uint8array",
  }))).rejects.toThrow("forbidden remote URL");
});
```

Also test 5 MiB overflow, missing Chrome 116 floor, extra permissions, broad
OpenAI/gstatic origins, missing sandbox CSP, a sandbox chunk shared with the
background, a synthetic endpoint outside the sandbox closure, and a valid
small fixture.

- [ ] **Step 2: Run the gate tests and verify RED**

Run:

```bash
pnpm exec vitest run tests/scripts/check-extension-package.test.ts
```

Expected: FAIL because the checker does not exist.

- [ ] **Step 3: Implement the checker**

Find the newest `.output/*-chrome.zip` excluding `*-sources.zip`. Check the
filesystem size before reading the archive. Reject case-insensitive entries
matching:

```js
[/\.wasm$/, /\.data$/, /texlive-(recommended|extra)/, /firefox/]
```

Scan `.js`, `.mjs`, `.html`, `.css`, and manifest text for `http://` or
`https://`. Allow these normal origins:

```js
[
  "https://chatgpt.com",
  "https://chat.openai.com",
  "https://github.com",
  "https://release-assets.githubusercontent.com",
  "https://texlive2026.texlyre.org",
  "https://github.com/VanChung369/Chat2TeX",
]
```

Treat only the exact DOM namespace literals
`http://www.w3.org/1999/xhtml`, `http://www.w3.org/2000/svg`, and
`http://www.w3.org/1998/Math/MathML` as inert non-network constants. They are
still forbidden in `fetch`, XHR, dynamic import, script/link source, form
action, or navigation contexts.

Build the static-import closure rooted at the JavaScript file referenced by
`compiler-sandbox.html`, and assert none of those files is referenced or
imported by background, popup, offscreen, or content-script entries. Allow the
synthetic `https://chat2tex.invalid` string only inside that sandbox-exclusive
closure, only when the closure contains the worker-shim signature
`NativeXMLHttpRequest`, and only when the manifest sandbox CSP contains
`connect-src blob:` with no network scheme or host. Reject it everywhere else.
Reject a remote `<script src>`, dynamic remote `import()`, `eval()` outside
that sandbox-exclusive closure, or any other unknown origin. Assert the final
manifest values from Task 8.

- [ ] **Step 4: Add verification scripts**

Run:

```bash
pnpm add --save-dev --save-exact es-module-lexer@2.3.1
```

Use `es-module-lexer` for static and dynamic import discovery rather than a
regular expression. Then add:

```json
{
  "scripts": {
    "check:package": "node scripts/check-extension-package.mjs",
    "verify": "pnpm run compile && pnpm test && pnpm run build && pnpm run zip && pnpm run check:package"
  }
}
```

- [ ] **Step 5: Run the complete local verification**

Run:

```bash
pnpm run verify
pnpm audit --prod
git diff --check
git status --short
```

Expected:

- TypeScript compilation PASS;
- every Vitest file PASS;
- Chrome MV3 production build PASS;
- Chrome extension ZIP is at most 5 MiB;
- no `.wasm` or `.data` entry exists;
- production dependency audit reports no known vulnerabilities;
- all changes remain unstaged and uncommitted.

---

### Task 10: Real Chrome Cold/Warm/Offline Validation and Release Boundary

**Files:**
- Modify only if a real-browser failure requires a focused fix covered by a failing test.
- Do not create release, tag, commit, or remote repository changes.

**Interfaces:**
- Uses `WXT_COMPILER_ASSET_BASE_URL=http://127.0.0.1:4178/` for local
  validation.
- A future production build uses immutable public assets under:

```text
https://github.com/VanChung369/Chat2TeX/releases/download/compiler-v1.2.3-chat2tex.1/
```

- [ ] **Step 1: Start the local asset server and production-shaped extension**

Run in separate sessions:

```bash
python3 -m http.server 4178 --bind 127.0.0.1 \
  --directory .compiler-assets/1.2.3
```

```bash
WXT_COMPILER_ASSET_BASE_URL=http://127.0.0.1:4178/ pnpm dev
```

Load `.output/chrome-mv3-dev` in Chrome 116+.

- [ ] **Step 2: Validate a cold export**

Clear the Chat2TeX compiler cache from the popup, then export one real
conversation containing:

- Vietnamese text;
- inline and display math;
- a table and list;
- TypeScript code;
- at least one image;
- `xcolor` and one additional package verified absent from the basic manifest.

Verify:

- core progress appears and stays at or below 140 MiB;
- on-demand progress names only static TeX files;
- the final PDF begins with `%PDF-` and visibly contains the representative
  content;
- requested TEX/ZIP outputs are valid;
- DevTools request bodies contain no conversation/source/image/output data;
- the sandbox has no direct request;
- closing/reopening the popup reconnects to the same job.

- [ ] **Step 3: Validate warm and offline exports**

Repeat the same export with network enabled. Verify no core request occurs.
Then disable network and repeat again. Verify cached core/packages compile and
download successfully.

Create a document requiring one uncached package while offline. Verify the
error names the file and offers retry rather than deleting valid cache.

- [ ] **Step 4: Validate failures and cancellation**

Using the deterministic local fixture server:

- serve a corrupted core file and confirm one retry then integrity failure;
- serve changed bytes for a first-seen package and confirm TOFU mismatch;
- delay a response, cancel, and confirm the sandbox terminates while verified
  cache remains;
- close Chrome during compilation, reopen, and confirm the job becomes
  `"Previous export was interrupted."`;
- fill the fake cache beyond 300 MiB and confirm optional LRU eviction.

- [ ] **Step 5: Validate output short circuits**

Exercise:

- PDF-only: no source ZIP construction or download;
- TEX-only through a direct job test: no compiler initialization;
- source-only through a direct job test: no compiler initialization;
- all outputs: exactly one PDF, TEX, and source ZIP.

- [ ] **Step 6: Re-run final evidence commands**

Run:

```bash
pnpm run verify
pnpm audit --prod
du -sh .output/chrome-mv3
stat -f '%z %N' .output/*-chrome.zip
git diff --check
git status --short
```

Record the exact ZIP size, core cache size, test counts, and audit result in
the final handoff.

- [ ] **Step 7: Stop at the public-release boundary**

Do not upload compiler assets or publish the extension. Report:

- local implementation and verification status;
- six release asset filenames, byte lengths, and SHA-256 values;
- the intended immutable release tag
  `compiler-v1.2.3-chat2tex.1`;
- that production publication requires explicit permission to make
  corresponding source publicly available and conflicts with the current
  no-commit instruction;
- that Chrome Web Store submission also requires a public privacy-policy URL
  matching the packaged disclosure.

Request separate authorization before any GitHub release, repository
visibility change, commit, tag, push, or Chrome Web Store action.
