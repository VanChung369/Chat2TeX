# Chrome Extension Manifest V3 Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a loadable Chat2TeX Chrome Extension Manifest V3 scaffold with Vite, TypeScript, CRXJS, a static popup, and an empty service worker.

**Architecture:** A typed CRXJS manifest declares the popup, background service worker, and local icons as Vite entry points. Vite compiles the framework-free TypeScript sources into `dist/`, while a Node test validates the generated extension package and its documentation.

**Tech Stack:** Node.js 22.14.0, npm 10.9.2, Vite 8.1.5, TypeScript 7.0.2, CRXJS Vite Plugin 2.7.1, Chrome Extension Manifest V3, Node test runner

## Global Constraints

- The extension name is `Chat2TeX`.
- Use Chrome Extension Manifest V3.
- Use Vite and TypeScript without React or another UI framework.
- Do not add content scripts, host permissions, Chrome API permissions, conversion behavior, data storage, network calls, or publishing automation.
- Keep the popup static and the service worker free of business logic.
- Emit a loadable production extension to `dist/`.
- Pin dependency versions in `package.json` and `package-lock.json`.

---

## File Structure

```text
.
├── public/
│   └── icons/
│       ├── icon-source.svg
│       ├── icon-16.png
│       ├── icon-32.png
│       ├── icon-48.png
│       └── icon-128.png
├── src/
│   ├── background.ts
│   └── popup/
│       ├── index.html
│       ├── main.ts
│       └── style.css
├── tests/
│   └── scaffold.test.mjs
├── .gitignore
├── manifest.config.ts
├── package.json
├── package-lock.json
├── README.md
├── tsconfig.json
└── vite.config.ts
```

- `manifest.config.ts` owns all extension metadata and entry-point declarations.
- `vite.config.ts` connects CRXJS to Vite.
- `src/popup/` owns the extension action popup and no other behavior.
- `src/background.ts` is the intentionally empty future background entry point.
- `public/icons/` contains the reusable vector icon source and committed PNG sizes.
- `tests/scaffold.test.mjs` validates the built extension package and repository instructions.
- `README.md` documents local development, verification, and Chrome loading.

### Task 1: Build the Loadable Extension Scaffold

**Files:**

- Create: `tests/scaffold.test.mjs`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `manifest.config.ts`
- Create: `src/background.ts`
- Create: `src/popup/index.html`
- Create: `src/popup/main.ts`
- Create: `src/popup/style.css`
- Create: `public/icons/icon-source.svg`
- Generate: `public/icons/icon-16.png`
- Generate: `public/icons/icon-32.png`
- Generate: `public/icons/icon-48.png`
- Generate: `public/icons/icon-128.png`
- Generate: `package-lock.json`

**Interfaces:**

- Consumes: Node.js 22.14.0, npm 10.9.2, and `/usr/bin/sips`.
- Produces: `npm run dev`, `npm run build`, `npm run typecheck`, and `npm test`.
- Produces: a loadable extension at `dist/` whose manifest points to an existing popup, service worker, and icons.

- [ ] **Step 1: Write the failing build-artifact test**

Create `tests/scaffold.test.mjs`:

```js
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'

const distDirectory = resolve('dist')
const manifestPath = join(distDirectory, 'manifest.json')

function readManifest() {
  assert.ok(
    existsSync(manifestPath),
    'dist/manifest.json must exist after the production build',
  )

  return JSON.parse(readFileSync(manifestPath, 'utf8'))
}

function resolveExtensionFile(relativePath) {
  return join(distDirectory, ...relativePath.split('/'))
}

function readPngDimensions(filePath) {
  const contents = readFileSync(filePath)

  assert.equal(
    contents.subarray(1, 4).toString('ascii'),
    'PNG',
    `${filePath} must be a PNG file`,
  )

  return {
    width: contents.readUInt32BE(16),
    height: contents.readUInt32BE(20),
  }
}

test('production build emits a permission-free Manifest V3 extension', () => {
  const manifest = readManifest()

  assert.equal(manifest.manifest_version, 3)
  assert.equal(manifest.name, 'Chat2TeX')
  assert.equal(manifest.version, '0.1.0')
  assert.equal(manifest.action.default_popup, 'src/popup/index.html')
  assert.equal(typeof manifest.background.service_worker, 'string')
  assert.equal(manifest.background.type, 'module')
  assert.ok(!Object.hasOwn(manifest, 'permissions'))
  assert.ok(!Object.hasOwn(manifest, 'host_permissions'))
  assert.ok(!Object.hasOwn(manifest, 'content_scripts'))

  const referencedFiles = new Set([
    manifest.action.default_popup,
    manifest.background.service_worker,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ])

  for (const relativePath of referencedFiles) {
    assert.ok(
      existsSync(resolveExtensionFile(relativePath)),
      `${relativePath} must exist in dist`,
    )
  }
})

test('production build contains correctly sized PNG icons', () => {
  const manifest = readManifest()

  for (const [size, relativePath] of Object.entries(manifest.icons)) {
    assert.deepEqual(
      readPngDimensions(resolveExtensionFile(relativePath)),
      { width: Number(size), height: Number(size) },
    )
  }
})
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```bash
node --test tests/scaffold.test.mjs
```

Expected: FAIL with `dist/manifest.json must exist after the production build`.

- [ ] **Step 3: Create the pinned npm project**

Create `package.json`:

```json
{
  "name": "chat2tex",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test": "npm run build && node --test"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "2.7.1",
    "typescript": "7.0.2",
    "vite": "8.1.5"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM"],
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": [
    "src",
    "manifest.config.ts",
    "vite.config.ts"
  ]
}
```

- [ ] **Step 4: Create the Vite and Manifest V3 configuration**

Create `vite.config.ts`:

```ts
import { crx } from '@crxjs/vite-plugin'
import { defineConfig } from 'vite'

import manifest from './manifest.config'

export default defineConfig({
  plugins: [crx({ manifest })],
  server: {
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
})
```

Create `manifest.config.ts`:

```ts
import { defineManifest } from '@crxjs/vite-plugin'

const icons = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
}

export default defineManifest({
  manifest_version: 3,
  name: 'Chat2TeX',
  description: 'Chrome Extension Manifest V3 scaffold.',
  version: '0.1.0',
  icons,
  action: {
    default_title: 'Chat2TeX',
    default_popup: 'src/popup/index.html',
    default_icon: icons,
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
})
```

- [ ] **Step 5: Create the empty service worker and static popup**

Create `src/background.ts`:

```ts
export {}
```

Create `src/popup/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chat2TeX</title>
  </head>
  <body>
    <main class="popup">
      <h1>Chat2TeX</h1>
      <p>Manifest V3 scaffold is ready.</p>
    </main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

Create `src/popup/main.ts`:

```ts
import './style.css'
```

Create `src/popup/style.css`:

```css
:root {
  color: #172033;
  background: #f7f9fc;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
}

body {
  margin: 0;
}

.popup {
  box-sizing: border-box;
  min-width: 280px;
  padding: 24px;
}

.popup h1 {
  margin: 0;
  font-size: 1.25rem;
}

.popup p {
  margin: 8px 0 0;
  color: #5d677a;
  font-size: 0.875rem;
}
```

- [ ] **Step 6: Create and rasterize the placeholder icon**

Create `public/icons/icon-source.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#3157d5"/>
  <rect x="30" y="30" width="68" height="16" rx="8" fill="#ffffff"/>
  <rect x="56" y="38" width="16" height="60" rx="8" fill="#ffffff"/>
</svg>
```

Generate all committed PNG sizes from the vector source:

```bash
sips -s format png -z 16 16 public/icons/icon-source.svg --out public/icons/icon-16.png
sips -s format png -z 32 32 public/icons/icon-source.svg --out public/icons/icon-32.png
sips -s format png -z 48 48 public/icons/icon-source.svg --out public/icons/icon-48.png
sips -s format png -z 128 128 public/icons/icon-source.svg --out public/icons/icon-128.png
```

Expected: each command reports that it wrote the corresponding PNG file.

- [ ] **Step 7: Install dependencies and generate the lockfile**

Run:

```bash
npm install
```

Expected: exit code 0 and a new `package-lock.json` that pins the dependency
tree.

- [ ] **Step 8: Verify the implementation is green**

Run:

```bash
npm run typecheck
npm test
```

Expected: both commands exit 0; the Node test runner reports 2 passing tests.

- [ ] **Step 9: Commit the loadable scaffold**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts manifest.config.ts src public/icons tests/scaffold.test.mjs
git commit -m "feat: scaffold Manifest V3 extension"
```

### Task 2: Add Repository Hygiene and Usage Documentation

**Files:**

- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**

- Consumes: the npm scripts and `dist/` output produced by Task 1.
- Produces: documented install, development, build, type-check, test, and Load unpacked workflows.
- Produces: ignore rules for dependencies, generated builds, logs, and macOS metadata.

- [ ] **Step 1: Add repository ignore rules**

Create `.gitignore`:

```gitignore
node_modules/
dist/
.DS_Store
*.log
```

- [ ] **Step 2: Write the usage documentation**

Create `README.md`:

```markdown
# Chat2TeX

A minimal Chrome Extension Manifest V3 scaffold built with Vite, TypeScript,
and CRXJS. It intentionally contains no product features yet.

## Requirements

- Node.js 22.12 or newer
- npm
- Google Chrome

## Install

\`\`\`bash
npm install
\`\`\`

## Development

Start the Vite development build:

\`\`\`bash
npm run dev
\`\`\`

Then load the generated `dist/` directory in Chrome. Keep the development
process running while editing source files.

## Production build

\`\`\`bash
npm run build
\`\`\`

The loadable extension is emitted to `dist/`.

## Verification

\`\`\`bash
npm run typecheck
npm test
\`\`\`

## Load unpacked in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project's `dist/` directory.

The Chat2TeX extension icon will appear in Chrome. Its popup contains only a
scaffold status message.
```

- [ ] **Step 3: Verify documentation and repository hygiene**

Run:

```bash
npm run typecheck
npm test
git status --short
```

Expected:

- Type checking exits 0.
- The Node test runner reports 2 passing tests.
- `.DS_Store`, `node_modules/`, and `dist/` are absent from `git status`.
- Only `.gitignore` and `README.md` are uncommitted.

- [ ] **Step 4: Commit the documentation**

```bash
git add .gitignore README.md
git commit -m "docs: add extension setup guide"
```

### Task 3: Run the Clean-Install Acceptance Check

**Files:**

- Verify only; no source changes expected.

**Interfaces:**

- Consumes: all files produced by Tasks 1 and 2.
- Produces: evidence that the committed repository installs, type-checks,
  builds, and passes its artifact assertions from a clean dependency install.

- [ ] **Step 1: Reinstall exactly from the lockfile**

Run:

```bash
npm ci
```

Expected: exit code 0 with dependencies installed from `package-lock.json`.

- [ ] **Step 2: Run the full verification suite**

Run:

```bash
npm run typecheck
npm test
git diff --check
git status --short
```

Expected:

- Type checking exits 0.
- The production build succeeds.
- The Node test runner reports 2 passing tests.
- `git diff --check` produces no output.
- `git status --short` produces no output.
