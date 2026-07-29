# Chat2TeX

A minimal Chrome Extension Manifest V3 scaffold built with Vite, TypeScript,
and CRXJS. It intentionally contains no product features yet.

## Requirements

- Node.js 22.12 or newer
- npm
- Google Chrome

## Install

```bash
npm install
```

## Development

Start the Vite development build:

```bash
npm run dev
```

Then load the generated `dist/` directory in Chrome. Keep the development
process running while editing source files.

## Production build

```bash
npm run build
```

The loadable extension is emitted to `dist/`.

## Verification

```bash
npm run typecheck
npm test
```

## Load unpacked in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project's `dist/` directory.

The Chat2TeX extension icon will appear in Chrome. Its popup contains only a
scaffold status message.
