import { describe, expect, it, vi } from "vitest";

import { AssetManager } from "@/src/features/assets/asset-manager";

import type {
  AssetHostPermissionChecker,
  ImageConverter,
} from "@/src/features/assets/types";

import type { LatexAssetRequest } from "@/src/features/latex/types";

const asset: LatexAssetRequest = {
  id: "image-001",
  kind: "image",
  sourceUrl: "https://cdn.example.com/chat/image.webp",
  outputPath: "assets/image-001.png",
  alt: "Example image",
};

function createPermissionChecker(granted: boolean): AssetHostPermissionChecker {
  return {
    contains: vi.fn().mockResolvedValue(granted),
  };
}

function createConverter(): ImageConverter {
  return {
    convert: vi.fn().mockResolvedValue({
      bytes: new Uint8Array([137, 80, 78, 71]),
      width: 800,
      height: 600,
    }),
  };
}

describe("AssetManager", () => {
  it("downloads and converts an image to PNG", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("image-data", {
        status: 200,
        headers: {
          "content-type": "image/webp",
        },
      }),
    );

    const manager = new AssetManager(
      createPermissionChecker(true),
      fetcher,
      createConverter(),
    );

    const result = await manager.resolve(asset);

    expect(result).toEqual({
      ok: true,
      file: {
        id: "image-001",
        outputPath: "assets/image-001.png",
        mimeType: "image/png",
        base64: "iVBORw==",
        byteLength: 4,
        width: 800,
        height: 600,
      },
    });

    expect(fetcher).toHaveBeenCalledWith(
      asset.sourceUrl,
      expect.objectContaining({
        credentials: "omit",
      }),
    );
  });

  it("returns the required origin permission", async () => {
    const manager = new AssetManager(
      createPermissionChecker(false),
      vi.fn(),
      createConverter(),
    );

    const result = await manager.resolve(asset);

    expect(result).toEqual({
      ok: false,
      code: "permission-required",
      message: "Permission is required to download this image.",
      originPattern: "https://cdn.example.com/*",
    });
  });

  it("rejects non-image responses", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response("<html>Error</html>", {
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      }),
    );

    const manager = new AssetManager(
      createPermissionChecker(true),
      fetcher,
      createConverter(),
    );

    const result = await manager.resolve(asset);

    expect(result).toMatchObject({
      ok: false,
      code: "invalid-content-type",
    });
  });

  it("rejects images larger than the configured limit", async () => {
    const largeContent = new Uint8Array(2_000);

    const fetcher = vi.fn().mockResolvedValue(
      new Response(largeContent, {
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      }),
    );

    const manager = new AssetManager(
      createPermissionChecker(true),
      fetcher,
      createConverter(),
      {
        maximumInputBytes: 1_000,
      },
    );

    const result = await manager.resolve(asset);

    expect(result).toMatchObject({
      ok: false,
      code: "asset-too-large",
    });
  });

  it("requires the page to provide blob URL bytes", async () => {
    const manager = new AssetManager(
      createPermissionChecker(true),
      vi.fn(),
      createConverter(),
    );

    const result = await manager.resolve({
      ...asset,
      sourceUrl: "blob:https://chatgpt.com/example-id",
    });

    expect(result).toMatchObject({
      ok: false,
      code: "page-read-required",
    });
  });
});
