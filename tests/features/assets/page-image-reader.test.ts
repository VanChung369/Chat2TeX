import { describe, expect, it, vi } from "vitest";

import { PageImageReader } from "@/src/features/assets/page-image-reader";

import type { LatexAssetRequest } from "@/src/features/latex/types";

const asset: LatexAssetRequest = {
  id: "image-001",
  kind: "image",
  sourceUrl: "blob:https://chatgpt.com/example-image",
  outputPath: "assets/image-001.png",
  alt: "Example",
};

describe("PageImageReader", () => {
  it("reads image bytes from a page URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      }),
    );

    const reader = new PageImageReader(fetcher);

    const result = await reader.read(asset);

    expect(result).toEqual({
      ok: true,
      data: {
        mimeType: "image/png",
        base64: "iVBORw==",
        byteLength: 4,
      },
    });
  });

  it("rejects non-page URLs", async () => {
    const reader = new PageImageReader(vi.fn());

    const result = await reader.read({
      ...asset,
      sourceUrl: "https://cdn.example.com/image.png",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "invalid-url",
    });
  });

  it("rejects oversized images", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(new Uint8Array(2_000), {
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      }),
    );

    const reader = new PageImageReader(fetcher, {
      maximumInputBytes: 1_000,
    });

    const result = await reader.read(asset);

    expect(result).toMatchObject({
      ok: false,
      code: "asset-too-large",
    });
  });
});
