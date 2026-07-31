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
  )
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase();
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
  const stableShareControl = Array.from(
    documentRoot.querySelectorAll<HTMLElement>(
      'button[data-testid*="share-chat"], [role="button"][data-testid*="share-chat"]',
    ),
  ).find((control) => isVisible(control) && hasShareIdentity(control));
  if (stableShareControl) {
    return stableShareControl;
  }

  const semanticHeaderControl =
    Array.from(
      documentRoot.querySelectorAll<HTMLElement>(
        'header button, header [role="button"]',
      ),
    ).find((control) => isVisible(control) && hasShareIdentity(control)) ?? null;
  if (semanticHeaderControl) {
    return semanticHeaderControl;
  }

  return (
    Array.from(
      documentRoot.querySelectorAll<HTMLElement>('button, [role="button"]'),
    )
      .filter((control) => isVisible(control) && hasShareIdentity(control))
      .filter((control) => {
        const { top, bottom } = control.getBoundingClientRect();
        return top <= 160 && bottom >= 0;
      })
      .sort(
        (left, right) =>
          left.getBoundingClientRect().top -
          right.getBoundingClientRect().top,
      )[0] ?? null
  );
}

function findShareToolbarItem(shareControl: HTMLElement): HTMLElement {
  const toolbar = shareControl.closest<HTMLElement>(
    '#conversation-header-actions, [data-testid="thread-header-right-actions"]',
  );
  if (!toolbar) {
    return shareControl;
  }

  let toolbarItem = shareControl;
  while (toolbarItem.parentElement && toolbarItem.parentElement !== toolbar) {
    toolbarItem = toolbarItem.parentElement;
  }

  return toolbarItem.parentElement === toolbar ? toolbarItem : shareControl;
}

export function placeExportTrigger(
  root: HTMLElement,
  documentRoot: Document,
): TriggerPlacement {
  const shareControl = findShareControl(documentRoot);
  if (shareControl?.parentElement) {
    const shareToolbarItem = findShareToolbarItem(shareControl);
    if (
      root.parentElement !== shareToolbarItem.parentElement ||
      root.nextElementSibling !== shareToolbarItem
    ) {
      shareToolbarItem.insertAdjacentElement("beforebegin", root);
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
