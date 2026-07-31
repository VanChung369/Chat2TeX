# Chrome On-Demand Compiler and Size Optimization Design

## Context

Chat2TeX is a WXT, React, and TypeScript browser extension that exports
ChatGPT conversations to LaTeX, ZIP, and locally compiled PDF files. The
current Chrome MV3 production ZIP is approximately 503 MB because it bundles
about 648 MB of BusyTeX and TeX Live assets under `public/texlive`.

The bundled assets include three TeX Live data sets:

- `texlive-basic`, approximately 91 MB;
- `texlive-recommended`, approximately 199 MB;
- `texlive-extra`, approximately 340 MB.

The current runner references `basic` and `extra`, while `recommended` is
copied into every build without being referenced. Removing only that unused
file is insufficient: the resulting extension would remain hundreds of
megabytes and would continue to ship engines and packages that most exports
never use.

The Firefox MV2 build contains the same assets, exceeds Mozilla's per-file
lint limit, and calls the Chrome-only offscreen API. Firefox is therefore not
a functional or size-compatible target for this change.

The selected design makes the extension Chrome-only and moves the compiler
and TeX Live payload to versioned, integrity-checked, on-demand downloads.
Compilation remains local in the browser. The user has approved a first-use
download, Chrome-only support, and the AGPL licensing implications of the
new BusyTeX release.

## Goals

- Reduce the Chrome distribution ZIP from approximately 503 MB to no more
  than 5 MiB.
- Keep XeLaTeX compilation inside the browser.
- Download only the XeTeX engine, the basic TeX Live data set, and packages
  required by the current document.
- Cache verified compiler assets so subsequent exports do not redownload
  them.
- Continue an export when the popup closes.
- Preserve PDF, TEX, and ZIP output behavior while avoiding work for output
  types the user did not request.
- Prevent downloaded compiler code from accessing Chrome extension APIs,
  extension storage, or unrestricted network access.
- Ensure document source, images, generated archives, and PDFs are never sent
  to a compiler server.
- Make size, remote-code isolation, and network allowlisting enforceable build
  gates rather than manual expectations.
- Re-license the distributed project and corresponding source as
  AGPL-3.0-or-later.

## Non-Goals

- Supporting Firefox or another browser in this change.
- Supporting pdfTeX, LuaTeX, or the BusyTeX combined-engine bundle.
- Moving compilation to a server.
- Adding accounts, cloud sync, export history, or cross-device compiler cache.
- Resuming an interrupted compilation after the entire browser restarts.
- Redesigning the generated document or changing conversation collection.
- Refactoring unrelated LaTeX rendering and popup UI code.

## Considered Approaches

### Selected: isolated, on-demand browser compiler

The extension downloads a pinned XeTeX-only BusyTeX runtime and basic data on
first use. Missing TeX Live packages are fetched from a fixed package
endpoint. All remote executable material runs only in a manifest-declared
sandbox without Chrome APIs. Assets and packages are cached by version and
content hash.

This approach reaches the distribution-size target, keeps local compilation,
and preserves broad package compatibility after on-demand downloads. It adds
an initial download, cache management, and a stricter compiler boundary.

### Rejected: bundle a minimal compiler pack

Bundling only XeTeX and `texlive-basic` would be simpler and remain fully
offline from installation, but the package would still contain roughly
90-140 MB of raw compiler data. It cannot meet the 5 MiB distribution target.

### Rejected: remote compilation service

A server-side compiler would make the extension package smallest and avoid
local WASM complexity, but it would upload private conversation content and
create an ongoing service dependency. That conflicts with the product's
local-processing promise.

## Target Architecture

### Chrome MV3 application shell

The packaged extension contains only:

- the popup and content-script application code;
- the background service worker;
- an offscreen compiler coordinator;
- a local sandbox bootstrap and typed message protocol;
- a small pinned asset manifest;
- license, privacy, and source-availability notices.

`public/texlive` and every BusyTeX WASM or TeX Live `.data` file are excluded
from the extension archive. The manifest sets `minimum_chrome_version` to
`116`, because the coordinator uses `runtime.getContexts()` to safely detect
the offscreen document.

The manifest retains only permissions used by the application:

- `downloads`;
- `offscreen`;
- `storage`.

The unused `scripting` permission is removed. Existing optional HTTPS host
permission remains user-triggered for conversation images that require it.
The content script matches only `https://chatgpt.com/*` and the legacy
`https://chat.openai.com/*` surface. Required network origins are limited to:

- `https://chatgpt.com`;
- `https://chat.openai.com`;
- `https://github.com` for versioned Chat2TeX release URLs;
- `https://release-assets.githubusercontent.com` for GitHub's release
  redirect;
- `https://texlive2026.texlyre.org` for TeX Live 2026 lookups.

The broad `*.openai.com`, `*.chatgpt.com`, and `*.gstatic.com` requirements are
removed. The popup's remote Google Fonts import is also removed in favor of
the existing system-font fallback, eliminating a nonessential network request.

### Compiler coordinator

The offscreen document owns one `CompilerJobCoordinator`. It is the only
extension component that may:

- create and destroy the sandbox;
- fetch compiler assets and package files;
- read and write the compiler cache;
- submit source files to the sandbox;
- receive PDF bytes and compiler logs.

Only one compilation runs at a time. A second request receives a deterministic
`compiler-busy` result instead of creating a second WASM runtime and exhausting
memory.

The background service worker creates the offscreen document when necessary
and routes typed job messages. It does not own long-running compilation state,
so service-worker suspension does not terminate an active export.

### Sandbox compiler

The compiler runs inside a page listed in the manifest's `sandbox.pages`.
That page has a unique origin and no access to `chrome.*` APIs. Its CSP permits
the local bootstrap, Blob-backed workers, and WebAssembly execution, but sets
direct network access to `connect-src 'none'`.

The coordinator transfers verified asset bytes to the sandbox. A
`SandboxAssetAdapter` creates sandbox-origin Blob URLs and maps BusyTeX's
worker, JavaScript, WASM, and data requests to those verified bytes. The
adapter may patch the upstream loader boundary, but it must not modify the
TeX engine or permit code execution outside the sandbox.

The runtime uses `texlyre-busytex@1.2.3` with:

- `engineMode: "xetex"`;
- `texlive-basic` as the only preloaded data package;
- the TeX Live 2026 endpoint for on-demand files;
- shell escape disabled;
- no remote shell-handler scripts.

The sandbox cannot fetch the endpoint directly. A restricted request proxy
accepts only exact asset or TeX Live lookup messages, performs validation in
the coordinator, returns bytes, and exposes no general HTTP method.

### Asset distribution and integrity

The upstream BusyTeX release is a single approximately 503 MB archive, so it
is not downloaded directly at runtime. A release-preparation script produces
a slim, split asset set containing only:

- BusyTeX pipeline and worker files required by XeTeX;
- `xetex.js` and `xetex.wasm`;
- `texlive-basic.js` and `texlive-basic.data`;
- any fixed XeTeX driver assets proven necessary by the smoke test.

These immutable files are published as public release assets for the
corresponding Chat2TeX compiler version. Production URLs are versioned and
never point to a mutable `latest` resource.

The extension packages a small root manifest containing:

- Chat2TeX compiler manifest version;
- `texlyre-busytex` version;
- TeX Live year;
- immutable base URLs;
- expected size and SHA-256 for every core asset;
- URL, size, and SHA-256 for the remote package catalog.

The package catalog is downloaded as data and accepted only when its SHA-256
matches the root manifest. Each catalog entry maps an allowed TeX lookup to an
immutable URL, maximum size, and SHA-256. No remote manifest may change the
asset origin, introduce a new executable category, or relax the request
allowlist without an extension update.

The default package endpoint is
`https://texlive2026.texlyre.org`. The endpoint receives ordinary static file
requests only. It never receives source text, images, generated files,
cookies, authorization headers, or request bodies.

### Cache

The coordinator stores bytes in the extension origin, not in the sandbox.
Core assets are keyed by compiler version and content hash. Package entries
are keyed by TeX Live version, canonical lookup path, and content hash.

Every cache read verifies metadata and byte length. A first download also
verifies SHA-256 before the entry becomes visible to compilation. Partially
downloaded or unverified entries are never reused.

Core assets are not evicted during ordinary cleanup. Optional packages use
least-recently-used eviction. The default total cache budget is 300 MiB, while
the first-use core cache limit is 140 MiB. The settings
UI provides:

- current compiler-cache size;
- a clear-cache action;
- a concise explanation that clearing requires a later redownload.

An upgrade is staged under a new version key. The prior core remains available
until the new version passes initialization and a smoke compile. If storage
cannot temporarily hold both versions, the update is deferred with an
actionable storage message instead of deleting the working version first.

## Export Data Flow

1. The popup or in-page action sends an export request to the background
   service worker.
2. The background assigns a `jobId`, ensures the offscreen document exists,
   and forwards the request.
3. The coordinator records job metadata in `chrome.storage.session` and keeps
   source and binary payloads only in offscreen memory.
4. The coordinator loads the pinned root manifest and checks the core cache.
5. Missing assets are downloaded, size-limited, hashed, and atomically cached.
6. The coordinator creates the sandbox and transfers the verified assets.
7. The sandbox initializes the XeTeX-only runner.
8. The coordinator sends LaTeX source and project images to the sandbox.
9. When XeTeX needs an uncached file, the restricted proxy validates the
   canonical lookup against the catalog, returns a cached entry or downloads
   and verifies it, then supplies it to the sandbox.
10. The sandbox returns PDF bytes, logs, and structured diagnostics.
11. The coordinator creates only the requested artifacts.
12. The background downloads the resulting files and updates the terminal job
    state.

Job phases are:

- `preparing`;
- `downloading-compiler`;
- `downloading-packages`;
- `initializing`;
- `compiling`;
- `packaging`;
- `downloading-output`;
- `completed`;
- `cancelled`;
- `failed`.

Progress contains completed bytes, total known bytes, and an asset or package
label. Reopening the popup reads `chrome.storage.session` and reconnects to
the active `jobId`. Closing the popup therefore does not cancel the job.
Closing Chrome may terminate the offscreen document; on the next popup open,
an unfinished session record becomes a clear `interrupted` failure rather
than pretending the export is still running.

## Output-Specific Work

The export request explicitly lists requested output kinds.

- TEX-only skips compiler initialization and compilation.
- ZIP-only prepares project files and creates the source archive without
  initializing the compiler.
- PDF-only compiles but does not construct or serialize a source ZIP.
- Mixed output creates each requested artifact once and reuses the same
  prepared project.

This removes the current behavior in which PDF-only exports still build TEX
and ZIP artifacts and filter them out afterward.

## Security and Privacy Boundaries

- Remote JavaScript, worker code, WASM, and TeX macros execute only inside the
  sandbox.
- The sandbox has no Chrome extension APIs, extension-origin storage, DOM
  access to ChatGPT, or direct network access.
- The coordinator never evaluates downloaded bytes.
- Every core asset and on-demand package is size-limited and hash-verified.
- The package proxy accepts only `GET`-equivalent lookups present in the pinned
  catalog. It rejects traversal, query strings, fragments, alternate origins,
  redirects outside the allowlist, request bodies, and unknown formats.
- Source, images, compiler logs, PDF bytes, and ZIP bytes are not written to
  persistent compiler cache.
- Errors and telemetry do not include raw source, cookies, access tokens,
  response bodies, or generated binary content.
- The privacy policy discloses that the CDN sees normal request metadata such
  as IP address, user agent, and names of static compiler/package files.
- Store submission notes explain the sandboxed remote-code architecture and
  identify every remote origin to make manual review reproducible.

## Error Handling

### Network unavailable

Compilation proceeds when the core and all required packages are cached. If a
required package is absent, the job fails with the canonical package name and
a retry action. Existing valid cache entries remain untouched.

### Integrity or malformed asset failure

The failing entry is deleted, downloaded once more, and verified again. A
second mismatch becomes a terminal integrity error. The system never falls
back to executing unverified bytes.

### Compiler crash or timeout

The coordinator terminates and recreates the sandbox once, then retries the
same job with verified cached assets. A second crash returns structured
diagnostics and the accumulated log.

### Storage pressure

The cache evicts least-recently-used optional packages and retries the write.
It never evicts the active or prior-known-good core during a job. If the
required space still cannot be obtained, the UI reports the approximate
additional space needed and offers cache cleanup.

### Package not found

Unknown catalog entries and endpoint misses are negative-cached for the
compiler version to avoid repeated requests. The compile result names the
missing package or file and preserves the XeTeX log.

### Cancellation

Cancellation terminates the active sandbox and marks the job `cancelled`.
Verified assets already committed to cache remain available. Partial downloads
and temporary output blobs are discarded.

### Upgrade failure

The staged version is removed and the previous verified version remains
active. A failed update does not invalidate existing offline compilation.

## Licensing and Distribution

`texlyre-busytex@1.2.3` is AGPL-3.0-or-later. The project will:

- replace the private/all-rights-reserved notice with
  `AGPL-3.0-or-later`;
- include the complete AGPL license text and required third-party notices;
- make the corresponding Chat2TeX source publicly available for each
  distributed version;
- link the exact source tag from the extension's About surface and Chrome Web
  Store listing;
- preserve BusyTeX, TeXlyre, Emscripten, and TeX Live attribution and license
  material in the source and release artifacts.

Publishing the extension is blocked until the source repository and compiler
release assets for that version are publicly accessible.

## Repository Changes

The implementation is expected to introduce focused units with narrow
interfaces:

- `CompilerAssetManifest` for pinned metadata and validation;
- `CompilerAssetCache` for atomic persistence, versioning, and LRU eviction;
- `CompilerAssetFetcher` for allowlisted, size-limited, hash-checked downloads;
- `CompilerJobCoordinator` for state transitions and cancellation;
- `SandboxCompilerClient` for the typed `MessageChannel` boundary;
- sandbox bootstrap and worker asset adapter;
- output-kind planning that skips unused compiler and packaging work;
- cache status and cleanup UI.

The project removes:

- `public/texlive`;
- Firefox development, build, and ZIP scripts;
- Firefox-specific documentation and validation expectations;
- the old scoped `@vanabel/texlyre-busytex` alias;
- unused `scripting` permission;
- the remote Google Fonts import and no-longer-needed `gstatic` host;
- placeholder popup HTML title.

A compiler-asset preparation command creates the slim release set and root
manifest from a fixed upstream BusyTeX release. It runs outside the extension
build. Normal `pnpm build` and `pnpm zip` never download or copy compiler
assets into the packaged extension.

## Feasibility Gate

The first implementation slice is a production-shaped sandbox spike. It must
prove all of the following before the remaining migration proceeds:

- the manifest-declared sandbox can initialize the XeTeX-only BusyTeX runtime
  from coordinator-supplied, hash-verified bytes;
- Blob-backed worker and WASM loading work under the final sandbox CSP;
- the sandbox can compile a minimal Vietnamese XeLaTeX document;
- the restricted proxy can supply one uncached TeX Live file;
- the sandbox performs no direct network request;
- a second initialization reads the coordinator's persistent cache.

If any condition fails, implementation stops and this design returns for
revision. The implementation must not silently bundle the compiler, relax the
sandbox, allow unrestricted network access, or move document compilation to a
server to bypass this gate.

## Testing

### Unit tests

- manifest schema, canonical paths, origin allowlist, sizes, and hashes;
- cache hit, miss, atomic commit, version isolation, LRU, and cleanup;
- job state transitions, stale-message rejection, cancellation, and popup
  reconnection;
- sandbox protocol origin, job, and message validation;
- output-kind planning and PDF/TEX/ZIP short circuits;
- redaction of source and sensitive response content from errors.

### Integration tests

- cold start downloads only XeTeX and basic core assets;
- warm start performs no core network requests;
- cached packages compile while offline;
- an uncached required package produces the correct download and progress;
- corrupted cache and corrupted download follow the one-retry policy;
- endpoint failure preserves valid cache;
- closing and reopening the popup reconnects to the active job;
- compiler timeout recreates the sandbox once;
- cache pressure evicts optional packages without deleting the core;
- PDF-only never creates a ZIP and TEX/ZIP-only never initializes BusyTeX.

Network integration tests use a deterministic local fixture server. They do
not depend on the production CDN.

### Real Chrome verification

An unpacked production build compiles representative exports containing:

- Vietnamese and Latin text;
- inline and display math;
- tables and lists;
- syntax-highlighted code;
- local and downloaded images;
- packages found in basic, recommended, and extra TeX Live sets.

The same representative project is compiled:

1. on a clean cache;
2. from a warm cache with network enabled;
3. from a warm cache with network disabled.

The generated PDF is non-empty and retains the existing expected content.
Chrome network inspection must show that no request contains source text,
image bytes, PDF bytes, ZIP bytes, cookies, or authorization headers.

### Build and policy gates

The verification sequence includes:

- `pnpm run compile`;
- `pnpm test`;
- `pnpm run build`;
- `pnpm run zip`;
- `pnpm audit --prod`;
- `git diff --check`;
- a package-size assertion of at most 5 MiB;
- an archive scan that rejects BusyTeX `.wasm`, TeX Live `.data`, and
  non-sandbox remote-code entrypoints;
- a compiled-bundle URL scan that rejects origins outside the documented
  allowlist;
- a manifest assertion for Chrome 116+, sandbox CSP, and the reduced
  permission and origin sets.

## Acceptance Criteria

- The production Chrome ZIP is no more than 5 MiB.
- The ZIP contains no TeX Live `.data` or BusyTeX `.wasm` files.
- Firefox scripts and claims of Firefox support are removed.
- The first compiler initialization downloads only the verified XeTeX/basic
  core and stores no more than 140 MiB of uncompressed core cache.
- A second initialization uses the core cache without redownloading it.
- A document using supported recommended or extra packages compiles by
  downloading only required on-demand files.
- Previously cached documents compile without network access.
- Closing the popup does not terminate an active export.
- TEX/ZIP-only exports do not initialize the compiler, and PDF-only exports do
  not build a source ZIP.
- Downloaded executable material never runs outside the sandbox.
- No document content or generated output is sent to a remote server.
- Cache corruption, network failure, timeout, cancellation, storage pressure,
  and upgrade failure produce deterministic, recoverable states.
- The repository, notices, and distributed source satisfy the approved
  AGPL-3.0-or-later distribution model.
- TypeScript compilation, all tests, production build, dependency audit, size
  gate, and policy scans pass.
