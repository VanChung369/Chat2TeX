# Chat2TeX Exporter

**Chat2TeX Exporter** is a browser extension (WXT + React + TypeScript) that enables users to export ChatGPT conversations into beautifully typeset **PDF** and **LaTeX** documents using an offline-first WebAssembly XeLaTeX compiler.

---

## 🌟 Key Features

- 📑 **Offline XeLaTeX Compiler**: Compiles high-quality PDFs locally in an offscreen document via WebAssembly (`texlyre-busytex`), requiring no external TeX server.
- 🎨 **Beautiful Typesetting**: Professional layout with customizable themes, code highlighting, tables, callout blocks, and bilingual support (English / Vietnamese).
- 🖼️ **Image & Diagram Asset Management**: Automatically extracts, converts, and bundles images/diagrams from ChatGPT turns into the PDF document.
- 📦 **Complete Source Bundling**: Downloads a ready-to-compiling `.zip` source package containing LaTeX source files, images, and metadata alongside the compiled PDF.
- 🔒 **Privacy First**: Processing happens locally in your browser.

---

## 🛠️ Architecture Overview

```
Chat2TeX/
├── entrypoints/
│   ├── background.ts          # Service worker for asset handling & messaging
│   ├── chatgpt.content.ts     # Content script injected into ChatGPT pages
│   ├── compiler/              # Offscreen document running XeLaTeX WASM engine
│   └── popup/                 # React UI popup for export control flow
├── src/
│   ├── features/
│   │   ├── assets/            # Image fetching, permission checking & PNG conversion
│   │   ├── chat/              # ChatGPT DOM adapter & API reader
│   │   ├── compiler/          # XeLaTeX compiler interface & diagnostics
│   │   ├── document/          # HTML to AST parser & element normalizer
│   │   ├── export/            # Zip packaging & download descriptors
│   │   └── latex/             # LaTeX code generator & document templates
│   └── shared/                # Message definitions & base64 utilities
└── tests/                     # Unit test suite powered by Vitest
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v18+`
- **Package Manager**: `npm` or `pnpm`

### Installation & Development

```bash
# Install dependencies
npm install

# Run extension in development mode (Chrome)
npm run dev

# Run extension in development mode (Firefox)
npm run dev:firefox
```

### Building & Testing

```bash
# Type check TypeScript code
npm run compile

# Run Vitest test suite
npm test

# Build extension packages
npm run build
npm run zip
```

---

## 📄 License

Private repository. All rights reserved.
