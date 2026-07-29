# Chrome Extension Manifest V3 Scaffold Design

## Goal

Create a loadable Chrome Extension Manifest V3 scaffold named Chat2TeX in the
current repository. The scaffold uses Vite and TypeScript, has no product
features, and is ready for later development.

## Scope

The scaffold will provide:

- A typed Manifest V3 configuration.
- A minimal popup built with HTML, CSS, and TypeScript.
- An empty extension service worker as a future background entry point.
- Vite development and production builds through CRXJS.
- Type checking, repository hygiene, and setup documentation.
- Placeholder extension icons in the sizes referenced by the manifest.

The scaffold will not provide:

- React or another UI framework.
- Content scripts.
- Host permissions or Chrome API permissions.
- Chat2TeX conversion behavior.
- Automated publishing to the Chrome Web Store.

## Architecture

`@crxjs/vite-plugin` will connect a TypeScript manifest configuration to Vite.
The manifest will declare the popup and background service worker source files
as extension entry points. CRXJS will compile those sources and emit a loadable
extension in `dist/`, including the generated `manifest.json`.

The popup will use framework-free TypeScript to keep the initial dependency and
runtime footprint small. The service worker will contain no business logic. It
will exist only so future background behavior has a clear home.

## Project Structure

```text
.
├── public/
│   └── icons/
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
├── .gitignore
├── manifest.config.ts
├── package.json
├── package-lock.json
├── README.md
├── tsconfig.json
└── vite.config.ts
```

## Components

### Manifest configuration

`manifest.config.ts` will define Manifest V3 metadata, icon paths, the action
popup, and the module service worker. It will request no permissions.

### Popup

The popup will display only the extension name and a short scaffold status
message. Its TypeScript entry point will import the stylesheet and contain no
Chrome API calls.

### Service worker

`src/background.ts` will be a valid TypeScript module without listeners or
background behavior.

### Build configuration

`vite.config.ts` will register CRXJS with the typed manifest. `package.json`
will expose:

- `npm run dev` for the development build server.
- `npm run build` for a production extension in `dist/`.
- `npm run typecheck` for TypeScript validation without emitting files.

The installed dependency versions will be recorded in `package-lock.json` for
reproducible installs.

## Data Flow

There is no application data flow in this scaffold. Clicking the extension
action opens the static popup. Chrome may start the empty service worker, but it
does not read, store, or transmit data.

## Error Handling

There are no runtime operations that require recovery behavior. Configuration
or source errors will fail during type checking or the Vite build. The README
will explain that Chrome should load the generated `dist/` directory rather
than the source repository.

## Verification

The implementation is complete when:

1. Dependencies install successfully with npm.
2. `npm run typecheck` exits successfully.
3. `npm run build` exits successfully.
4. `dist/manifest.json` declares Manifest V3, the popup, the service worker,
   and no permissions.
5. Every file referenced by `dist/manifest.json` exists inside `dist/`.
6. README instructions explain development, production build, and Chrome's
   Load unpacked workflow.
