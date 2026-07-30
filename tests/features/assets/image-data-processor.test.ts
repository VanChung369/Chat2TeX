import { describe, expect, it, vi } from "vitest";

import { ImageDataProcessor } from "@/src/features/assets/image-data-processor";

import type { ImageConverter } from "@/src/features/assets/types";

const converter: ImageConverter = {
  convert: vi.fn().mockResolvedValue({
    bytes: new Uint8Array([137, 80, 78, 71]),
    width: 500,
    height: 300,
  }),
};

describe("ImageDataProcessor", () => {
  it("converts base64 image data to PNG", async () => {
    const processor = new ImageDataProcessor(converter);

    const result = await processor.process(
      {
        id: "image-001",
        kind: "image",
        sourceUrl: "blob:https://chatgpt.com/example",
        outputPath: "assets/image-001.png",
        alt: "Example",
      },
      {
        mimeType: "image/webp",
        base64: "aW1hZ2U=",
        byteLength: 5,
      },
    );

    expect(result).toMatchObject({
      ok: true,

      file: {
        id: "image-001",
        outputPath: "assets/image-001.png",
        mimeType: "image/png",
        width: 500,
        height: 300,
      },
    });
  });
});
