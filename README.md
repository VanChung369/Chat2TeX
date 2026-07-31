# Chat2TeX Exporter

Chat2TeX is a Chrome extension that exports ChatGPT conversations as
professionally typeset PDF, LaTeX, and source ZIP files. XeTeX compilation,
image conversion, packaging, and generated output stay inside the extension.

## Requirements and behavior

- Chrome 116 or newer; Firefox is not supported.
- The first PDF export downloads six pinned and hash-verified BusyTeX/TeX Live
  core files (about 120 MiB, with a strict 140 MiB core limit).
- Missing TeX Live packages are downloaded individually as needed.
- The local compiler cache has a 300 MiB budget and evicts least-recently-used
  optional packages before core files.
- Previously cached compiler/package files work offline.
- PDF-only export does not build a source ZIP. TEX/source-only work does not
  initialize the compiler.

The `unlimitedStorage` permission is used to keep the verified Cache Storage
compiler core stable across browser storage pressure. The extension also uses
`storage`, `downloads`, and `offscreen`; it does not request `scripting`.

See [PRIVACY.md](PRIVACY.md) for the exact network and local-retention
behavior.

## Development

Install dependencies and run the checks:

```bash
pnpm install
pnpm run compile
pnpm test
pnpm run build
pnpm run zip
```

The development compiler URL is fixed to `http://127.0.0.1:4178/`. Serve the
prepared files from `.compiler-assets/1.2.3` on that address before the first
development PDF export.

To prepare the six release assets from the fixed upstream BusyTeX archive:

```bash
pnpm run compiler:prepare
```

The preparation command verifies the upstream archive size and SHA-256,
extracts only the six approved core files, enforces the core size budget, and
regenerates the pinned TypeScript manifest. Normal extension builds never
bundle or download those large files.

## Architecture

- `entrypoints/background.ts`: trusted message routing, offscreen lifecycle,
  restricted storage bridge, image processing, and browser downloads.
- `entrypoints/compiler/`: persistent single-job coordinator and verified
  asset cache.
- `entrypoints/compiler-sandbox.sandbox/`: network-isolated BusyTeX/XeTeX
  runtime.
- `entrypoints/popup/` and `entrypoints/chatgpt.content.ts`: reconnectable
  popup and in-page export controls.
- `src/features/compiler/`: integrity, cache, sandbox protocol, bounded
  package resolution, reconnectable jobs, and diagnostics.

## License and distribution

Chat2TeX is licensed under **AGPL-3.0-or-later**. See [LICENSE](LICENSE) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Any distributed extension version must have its corresponding complete
source available under the AGPL, including the source matching its compiler
asset manifest. The source repository is
<https://github.com/VanChung369/Chat2TeX>. Do not publish a store build until
the matching source and immutable compiler release assets are publicly
accessible.
