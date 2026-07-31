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

  it("finds ChatGPT's stable Share test id in a non-semantic toolbar", () => {
    document.body.innerHTML = `
      <div class="top-toolbar">
        <button id="stable-share" data-testid="share-chat-button">
          <svg aria-hidden="true"></svg>
        </button>
      </div>
    `;

    expect(findShareControl(document)?.id).toBe("stable-share");
  });

  it("finds a text Share control in a non-semantic top toolbar", () => {
    document.body.innerHTML = `
      <div class="top-toolbar">
        <button id="text-share">Share</button>
      </div>
    `;

    expect(findShareControl(document)?.id).toBe("text-share");
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

  it("places the trigger beside ChatGPT's Share wrapper instead of inside it", () => {
    document.body.innerHTML = `
      <div data-testid="thread-header-right-actions">
        <div id="conversation-header-actions">
          <div id="share-wrapper">
            <div>
              <span>
                <button data-testid="share-chat-button" aria-label="Share"></button>
              </span>
            </div>
          </div>
          <div id="options-wrapper">
            <button aria-label="Open conversation options"></button>
          </div>
        </div>
      </div>
    `;
    const root = document.createElement("div");
    root.id = "chat2tex-inpage-root";

    expect(placeExportTrigger(root, document)).toBe("toolbar");
    expect(root.parentElement?.id).toBe("conversation-header-actions");
    expect(root.nextElementSibling?.id).toBe("share-wrapper");
    expect(document.querySelector("#share-wrapper")?.contains(root)).toBe(false);
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
