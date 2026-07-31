# Share-Toolbar Export Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bottom-right Chat2TeX pill with a compact, accessible trigger that mounts beside ChatGPT's Share control and remains usable across responsive layouts and header re-renders.

**Architecture:** Add a focused DOM-placement module with pure panel geometry, then let `InPageExporterUI` own trigger lifecycle, a debounced header observer, and a body-portaled export panel. The placement module selects only visible Share controls inside headers, uses a top-right fallback when necessary, and keeps geometry testable without a real browser.

**Tech Stack:** TypeScript 5.9, WXT content scripts, browser DOM APIs, Vitest 4, jsdom 30.

## Global Constraints

- The trigger is icon-only and exactly 32 by 32 pixels.
- Its `title` and `aria-label` are exactly `Chat2TeX Export`.
- Prefer the visible Share control in a ChatGPT header; support `Share` and `Chia sẻ`.
- Never fall back to the bottom-right composer area; fallback is top-right.
- The panel width is at most 380 pixels and keeps 12-pixel viewport margins.
- Preserve all existing export form state, controls, runner behavior, and download behavior.
- Do not add a runtime or development dependency.
- Do not create a Git commit.

---

## File Map

- Create `src/features/chat/in-page-exporter-placement.ts`: locate the visible Share control, mount the trigger beside it or in fallback mode, and calculate viewport-safe panel geometry.
- Create `tests/features/chat/in-page-exporter-placement.test.ts`: unit coverage for Share matching, fallback behavior, idempotent placement, and panel geometry.
- Create `tests/features/chat/in-page-exporter.test.ts`: lifecycle and DOM integration coverage for the accessible icon trigger, header re-render recovery, panel portal, and responsive position.
- Modify `src/features/chat/in-page-exporter.ts`: compact styles, placement observer, panel portal/repositioning, and cleanup.

### Task 1: Isolate and Test Trigger Placement

**Files:**
- Create: `src/features/chat/in-page-exporter-placement.ts`
- Create: `tests/features/chat/in-page-exporter-placement.test.ts`

**Interfaces:**
- Produces:
  - `type TriggerPlacement = "toolbar" | "fallback"`
  - `interface PanelViewport { width: number; height: number }`
  - `interface PanelPlacement { left: number; top: number; width: number; maxHeight: number }`
  - `findShareControl(documentRoot: Document): HTMLElement | null`
  - `placeExportTrigger(root: HTMLElement, documentRoot: Document): TriggerPlacement`
  - `calculatePanelPlacement(triggerRect: Pick<DOMRect, "left" | "right" | "bottom">, viewport: PanelViewport): PanelPlacement`
- Consumes: standard DOM APIs only.

- [ ] **Step 1: Write failing tests for Share lookup and placement**

Create `tests/features/chat/in-page-exporter-placement.test.ts` with cases equivalent to:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  calculatePanelPlacement,
  findShareControl,
  placeExportTrigger,
} from "@/src/features/chat/in-page-exporter-placement";

describe("in-page exporter placement", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it.each([
    ['<button aria-label="Share">Share</button>'],
    ['<button aria-label="Chia sẻ">Chia sẻ</button>'],
    ['<button data-testid="share-chat-button"><svg /></button>'],
  ])("finds a visible header Share control: %s", (shareMarkup) => {
    document.body.innerHTML = `<header><div id="actions">${shareMarkup}</div></header>`;
    expect(findShareControl(document)?.closest("#actions")).not.toBeNull();
  });

  it("ignores hidden Share controls", () => {
    document.body.innerHTML = `
      <header>
        <button aria-label="Share" style="display:none">Share</button>
        <button id="visible-share" aria-label="Share">Share</button>
      </header>
    `;
    expect(findShareControl(document)?.id).toBe("visible-share");
  });

  it("inserts the trigger immediately before Share without duplicating it", () => {
    document.body.innerHTML =
      '<header><div id="actions"><button id="share" aria-label="Share">Share</button></div></header>';
    const root = document.createElement("div");
    root.id = "chat2tex-inpage-root";

    expect(placeExportTrigger(root, document)).toBe("toolbar");
    expect(document.querySelector("#share")?.previousElementSibling).toBe(root);
    expect(root.dataset.placement).toBe("toolbar");

    expect(placeExportTrigger(root, document)).toBe("toolbar");
    expect(document.querySelectorAll("#chat2tex-inpage-root")).toHaveLength(1);
  });

  it("uses a top-right fallback container when Share is absent", () => {
    const root = document.createElement("div");
    root.id = "chat2tex-inpage-root";

    expect(placeExportTrigger(root, document)).toBe("fallback");
    expect(root.parentElement).toBe(document.body);
    expect(root.dataset.placement).toBe("fallback");
  });

  it("clamps a 380px panel to 12px margins on a narrow viewport", () => {
    expect(
      calculatePanelPlacement(
        { left: 340, right: 372, bottom: 52 },
        { width: 390, height: 844 },
      ),
    ).toEqual({
      left: 12,
      top: 60,
      width: 366,
      maxHeight: 772,
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run tests/features/chat/in-page-exporter-placement.test.ts
```

Expected: FAIL because `@/src/features/chat/in-page-exporter-placement` does not exist.

- [ ] **Step 3: Implement the placement module**

Create `src/features/chat/in-page-exporter-placement.ts` with these exact rules:

```ts
export type TriggerPlacement = "toolbar" | "fallback";

export interface PanelViewport {
  width: number;
  height: number;
}

export interface PanelPlacement {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

const SHARE_NAMES = new Set(["share", "chia sẻ"]);
const PANEL_WIDTH = 380;
const VIEWPORT_MARGIN = 12;
const PANEL_GAP = 8;
const MIN_PANEL_HEIGHT = 120;

function normalizedName(control: HTMLElement): string {
  return (
    control.getAttribute("aria-label") ??
    control.getAttribute("title") ??
    control.textContent ??
    ""
  ).normalize("NFC").trim().toLocaleLowerCase();
}

function isVisible(control: HTMLElement): boolean {
  if (
    control.hidden ||
    control.getAttribute("aria-hidden") === "true" ||
    control.closest('[hidden], [aria-hidden="true"]')
  ) {
    return false;
  }
  const style = getComputedStyle(control);
  return style.display !== "none" && style.visibility !== "hidden";
}

function hasShareIdentity(control: HTMLElement): boolean {
  const testId = control.getAttribute("data-testid")?.toLowerCase() ?? "";
  return (
    SHARE_NAMES.has(normalizedName(control)) ||
    testId === "share" ||
    testId.includes("share-chat") ||
    testId.includes("chat-share")
  );
}

export function findShareControl(documentRoot: Document): HTMLElement | null {
  return (
    Array.from(
      documentRoot.querySelectorAll<HTMLElement>(
        'header button, header [role="button"]',
      ),
    ).find(
      (control) => isVisible(control) && hasShareIdentity(control),
    ) ?? null
  );
}

export function placeExportTrigger(
  root: HTMLElement,
  documentRoot: Document,
): TriggerPlacement {
  const shareControl = findShareControl(documentRoot);
  if (shareControl?.parentElement) {
    if (
      root.parentElement !== shareControl.parentElement ||
      root.nextElementSibling !== shareControl
    ) {
      shareControl.insertAdjacentElement("beforebegin", root);
    }
    root.dataset.placement = "toolbar";
    return "toolbar";
  }

  if (root.parentElement !== documentRoot.body) {
    documentRoot.body.appendChild(root);
  }
  root.dataset.placement = "fallback";
  return "fallback";
}

export function calculatePanelPlacement(
  triggerRect: Pick<DOMRect, "left" | "right" | "bottom">,
  viewport: PanelViewport,
): PanelPlacement {
  const width = Math.max(
    0,
    Math.min(PANEL_WIDTH, viewport.width - VIEWPORT_MARGIN * 2),
  );
  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, triggerRect.right - width),
    Math.max(VIEWPORT_MARGIN, viewport.width - width - VIEWPORT_MARGIN),
  );
  const top = triggerRect.bottom + PANEL_GAP;
  const maxHeight = Math.max(
    MIN_PANEL_HEIGHT,
    viewport.height - top - VIEWPORT_MARGIN,
  );
  return { left, top, width, maxHeight };
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run tests/features/chat/in-page-exporter-placement.test.ts
```

Expected: 7 tests pass with exit code 0.

- [ ] **Step 5: Review worktree without committing**

Run:

```bash
git diff --check
git status --short
```

Expected: only the approved spec/plan plus Task 1 files are uncommitted.

### Task 2: Integrate the Compact Trigger and Body-Portaled Panel

**Files:**
- Create: `tests/features/chat/in-page-exporter.test.ts`
- Modify: `src/features/chat/in-page-exporter.ts:1-520`

**Interfaces:**
- Consumes:
  - `placeExportTrigger(root, document): TriggerPlacement`
  - `calculatePanelPlacement(rect, { width, height }): PanelPlacement`
- Produces:
  - `InPageExporterUI.mount(): void`
  - `InPageExporterUI.unmount(): void`
- Preserves: `InPageExportRunner`, `MessageFetcher`, all form bindings, and `triggerExport()`.

- [ ] **Step 1: Write failing integration tests**

Create `tests/features/chat/in-page-exporter.test.ts` with:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InPageExporterUI } from "@/src/features/chat/in-page-exporter";

describe("InPageExporterUI trigger", () => {
  let ui: InPageExporterUI;

  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML =
      '<header><div id="actions"><button id="share" aria-label="Share">Share</button></div></header>';
    ui = new InPageExporterUI();
  });

  afterEach(() => {
    ui.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("mounts an icon-only accessible 32px trigger before Share", () => {
    ui.mount();

    const root = document.querySelector<HTMLElement>("#chat2tex-inpage-root");
    const trigger = document.querySelector<HTMLButtonElement>(
      "#chat2tex-inpage-trigger",
    );
    expect(document.querySelector("#share")?.previousElementSibling).toBe(root);
    expect(trigger?.getAttribute("aria-label")).toBe("Chat2TeX Export");
    expect(trigger?.title).toBe("Chat2TeX Export");
    expect(trigger?.textContent?.trim()).toBe("");
    expect(trigger?.querySelector("svg")).not.toBeNull();
    expect(getComputedStyle(trigger!).width).toBe("32px");
    expect(getComputedStyle(trigger!).height).toBe("32px");
  });

  it("keeps one trigger across repeated mounts", () => {
    ui.mount();
    ui.mount();
    expect(document.querySelectorAll("#chat2tex-inpage-root")).toHaveLength(1);
    expect(document.querySelector("#share")?.previousElementSibling?.id).toBe(
      "chat2tex-inpage-root",
    );
  });

  it("moves the same trigger beside Share after a header re-render", async () => {
    document.body.innerHTML = "<main>Conversation</main>";
    ui.mount();
    const root = document.querySelector<HTMLElement>("#chat2tex-inpage-root");
    expect(root?.dataset.placement).toBe("fallback");

    document.body.insertAdjacentHTML(
      "afterbegin",
      '<header><button id="late-share" aria-label="Share">Share</button></header>',
    );

    await vi.waitFor(() => {
      expect(
        document.querySelector("#late-share")?.previousElementSibling,
      ).toBe(root);
    });
    expect(document.querySelectorAll("#chat2tex-inpage-root")).toHaveLength(1);
  });

  it("portals and clamps the panel below the trigger", () => {
    ui.mount();
    const trigger = document.querySelector<HTMLButtonElement>(
      "#chat2tex-inpage-trigger",
    )!;
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      left: 340,
      right: 372,
      bottom: 52,
    } as DOMRect);
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);

    trigger.click();

    const panel = document.querySelector<HTMLElement>("#chat2tex-inpage-panel");
    expect(panel?.parentElement).toBe(document.body);
    expect(panel?.style.left).toBe("12px");
    expect(panel?.style.top).toBe("60px");
    expect(panel?.style.width).toBe("366px");
    expect(panel?.style.maxHeight).toBe("772px");
  });
});
```

- [ ] **Step 2: Run the integration test and verify RED**

Run:

```bash
pnpm exec vitest run tests/features/chat/in-page-exporter.test.ts
```

Expected: FAIL because `unmount()` is missing, the trigger still contains text
and large pill styles, late Share controls do not trigger re-placement, and the
panel is still appended inside the root.

- [ ] **Step 3: Replace the trigger and root styles**

In `INPAGE_STYLE`, replace the root/trigger/panel declarations with:

```css
#chat2tex-inpage-root,
#chat2tex-inpage-root *,
#chat2tex-inpage-panel,
#chat2tex-inpage-panel * {
  box-sizing: border-box;
  font-family: system-ui, -apple-system, sans-serif;
}

#chat2tex-inpage-root {
  display: inline-flex;
  align-items: center;
  z-index: 999999;
}
#chat2tex-inpage-root[data-placement="toolbar"] {
  position: relative;
  margin-right: 4px;
}
#chat2tex-inpage-root[data-placement="fallback"] {
  position: fixed;
  top: 12px;
  right: 12px;
}

#chat2tex-inpage-trigger {
  width: 32px;
  height: 32px;
  padding: 0;
  display: inline-grid;
  place-items: center;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.92);
  color: #4f46e5;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease,
    box-shadow 0.15s ease;
}
#chat2tex-inpage-trigger:hover {
  background: #f5f3ff;
  box-shadow: 0 2px 7px rgba(79, 70, 229, 0.2);
}
#chat2tex-inpage-trigger:active { transform: scale(0.96); }
#chat2tex-inpage-trigger:focus-visible {
  outline: 2px solid #818cf8;
  outline-offset: 2px;
}
#chat2tex-inpage-trigger svg {
  width: 17px;
  height: 17px;
  pointer-events: none;
}

#chat2tex-inpage-panel {
  position: fixed;
  width: 380px;
  max-width: calc(100vw - 24px);
  overflow-y: auto;
}
```

Keep the panel's existing colors, border, radius, shadow, animation, and
content styles. Remove its old `position: absolute`, `bottom: 60px`, and
`right: 0` declarations.

- [ ] **Step 4: Add trigger lifecycle, observer, and accessible icon**

Import the Task 1 functions:

```ts
import {
  calculatePanelPlacement,
  placeExportTrigger,
} from "./in-page-exporter-placement";
```

Add these fields to `InPageExporterUI`:

```ts
private placementObserver: MutationObserver | null = null;
private placementTimer: ReturnType<typeof setTimeout> | null = null;
private triggerButton: HTMLButtonElement | null = null;
private readonly handleViewportResize = () => {
  this.positionOpenPanel();
};
```

Update `mount()` to remove stale UI, create the root without fixed bottom
styles, and create this exact button:

```ts
this.unmount();
document.getElementById("chat2tex-inpage-root")?.remove();
document.getElementById("chat2tex-inpage-panel")?.remove();
injectStyle();

const root = document.createElement("div");
root.id = "chat2tex-inpage-root";

const button = document.createElement("button");
button.id = "chat2tex-inpage-trigger";
button.type = "button";
button.title = "Chat2TeX Export";
button.setAttribute("aria-label", "Chat2TeX Export");
button.innerHTML = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M7 3.75h6.75L18.25 8v12.25H7z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M13.5 3.75V8h4.75M9.75 12h5M9.75 15.25h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;
button.onclick = () => { this.togglePanel(); };

root.appendChild(button);
document.body.appendChild(root);
this.container = root;
this.triggerButton = button;
placeExportTrigger(root, document);

this.placementObserver = new MutationObserver((records) => {
  const belongsToChat2Tex = (node: Node): boolean =>
    node === this.container ||
    node === this.statusPanel ||
    Boolean(this.container?.contains(node)) ||
    Boolean(this.statusPanel?.contains(node));
  if (records.every((record) => belongsToChat2Tex(record.target))) return;
  this.scheduleTriggerPlacement();
});
this.placementObserver.observe(document.body, {
  childList: true,
  subtree: true,
});
```

Add:

```ts
unmount(): void {
  this.placementObserver?.disconnect();
  this.placementObserver = null;
  if (this.placementTimer) clearTimeout(this.placementTimer);
  this.placementTimer = null;
  window.removeEventListener("resize", this.handleViewportResize);
  this.statusPanel?.remove();
  this.container?.remove();
  this.statusPanel = null;
  this.container = null;
  this.triggerButton = null;
}

private scheduleTriggerPlacement(): void {
  if (this.placementTimer) clearTimeout(this.placementTimer);
  this.placementTimer = setTimeout(() => {
    this.placementTimer = null;
    if (this.container) placeExportTrigger(this.container, document);
    this.positionOpenPanel();
  }, 50);
}
```

- [ ] **Step 5: Portal, position, and clean up the panel**

In `createStatusPanel()`, replace `this.container?.appendChild(panel)` with:

```ts
document.body.appendChild(panel);
this.statusPanel = panel;
this.positionOpenPanel();
window.addEventListener("resize", this.handleViewportResize);
```

Add:

```ts
private positionOpenPanel(): void {
  if (!this.statusPanel || !this.triggerButton) return;
  const placement = calculatePanelPlacement(
    this.triggerButton.getBoundingClientRect(),
    { width: window.innerWidth, height: window.innerHeight },
  );
  Object.assign(this.statusPanel.style, {
    left: `${placement.left}px`,
    top: `${placement.top}px`,
    width: `${placement.width}px`,
    maxHeight: `${placement.maxHeight}px`,
  });
}

private closePanel(): void {
  this.statusPanel?.remove();
  this.statusPanel = null;
  window.removeEventListener("resize", this.handleViewportResize);
}
```

Make `togglePanel()` and the existing close-button handler call `closePanel()`
instead of duplicating `remove()` and state updates.

- [ ] **Step 6: Run integration and placement tests**

Run:

```bash
pnpm exec vitest run \
  tests/features/chat/in-page-exporter-placement.test.ts \
  tests/features/chat/in-page-exporter.test.ts
```

Expected: 11 tests pass with exit code 0 and no unhandled observer errors.

- [ ] **Step 7: Review worktree without committing**

Run:

```bash
git diff --check
git diff --stat
git status --short
```

Expected: no whitespace errors; no staged changes; no commit created.

### Task 3: Full Verification and Responsive QA

**Files:**
- Modify only if verification exposes a defect in Task 1 or Task 2 files.
- Do not create screenshots, traces, or temporary QA scripts inside the repository.

**Interfaces:**
- Consumes: built Chrome MV3 extension and the existing `pnpm run verify` gate.
- Produces: verification evidence for desktop and narrow layouts.

- [ ] **Step 1: Run the complete automated verification gate**

Run:

```bash
pnpm run verify
```

Expected: TypeScript compile, all Vitest files, WXT Chrome build, ZIP creation,
and package policy check all exit 0.

- [ ] **Step 2: Confirm package size and forbidden-content gate**

Run:

```bash
stat -f '%z bytes %N' .output/chat2tex-0.1.0-chrome.zip
unzip -l .output/chat2tex-0.1.0-chrome.zip
```

Expected: the ZIP remains small, contains the updated content bundle, and does
not contain compiler `.wasm` or `.data` assets.

- [ ] **Step 3: Validate the rendered desktop flow**

Browser flow:

```text
ChatGPT conversation loads
→ header Share control renders
→ 32px Chat2TeX icon appears immediately before Share
→ click icon
→ export panel opens below the icon
→ close panel
→ panel disappears and icon remains
```

Check page identity, non-blank content, absence of framework overlays, relevant
console errors/warnings, a desktop screenshot, and the click/open/close state
change.

- [ ] **Step 4: Validate the narrow responsive flow**

At a 390 by 844 viewport:

```text
ChatGPT conversation loads
→ compact icon is in the header or top-right fallback
→ composer and Send control remain unobstructed
→ panel opens with 12px horizontal margins
→ panel content scrolls within the viewport
```

Capture screenshot evidence outside the repository. If the connected Browser
remains unavailable, use the project-compatible Playwright fallback without
adding dependencies and explicitly report the Browser connection failure.

- [ ] **Step 5: Confirm no commit or staging occurred**

Run:

```bash
git status --short --branch
git diff --cached --stat
```

Expected: the approved local changes are unstaged and no new commit exists.
