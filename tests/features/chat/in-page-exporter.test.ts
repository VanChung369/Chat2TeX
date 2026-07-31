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
      expect(document.querySelector("#late-share")?.previousElementSibling).toBe(
        root,
      );
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

    const panel = document.querySelector<HTMLElement>(
      "#chat2tex-inpage-panel",
    );
    expect(panel?.parentElement).toBe(document.body);
    expect(panel?.style.left).toBe("12px");
    expect(panel?.style.top).toBe("60px");
    expect(panel?.style.width).toBe("366px");
    expect(panel?.style.maxHeight).toBe("772px");
  });
});
