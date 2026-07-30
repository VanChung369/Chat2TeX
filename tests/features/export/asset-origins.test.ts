import { describe, expect, it } from "vitest";

import { getAssetOriginPatterns } from "@/src/features/export/asset-origins";

describe("getAssetOriginPatterns", () => {
  it("returns unique HTTPS origin patterns", () => {
    expect(
      getAssetOriginPatterns([
        {
          id: "image-001",
          kind: "image",
          sourceUrl: "https://cdn.example.com/a.png",
          outputPath: "assets/image-001.png",
          alt: "",
        },
        {
          id: "image-002",
          kind: "image",
          sourceUrl: "https://cdn.example.com/b.png",
          outputPath: "assets/image-002.png",
          alt: "",
        },
        {
          id: "image-003",
          kind: "image",
          sourceUrl: "blob:https://chatgpt.com/id",
          outputPath: "assets/image-003.png",
          alt: "",
        },
      ]),
    ).toEqual(["https://cdn.example.com/*"]);
  });
});
