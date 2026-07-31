import { describe, expect, it, vi } from "vitest";

import {
  assertAssetIntegrity,
  readLimitedResponseBytes,
  sha256Hex,
} from "@/src/features/compiler/asset-integrity";

describe("compiler asset integrity", () => {
  it("computes lowercase SHA-256 and accepts exact bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const sha256 = await sha256Hex(bytes);

    expect(sha256).toBe(
      "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
    );
    await expect(
      assertAssetIntegrity(bytes, {
        filename: "busytex.wasm",
        byteLength: 3,
        sha256,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects either a size or hash mismatch", async () => {
    const bytes = new Uint8Array([1, 2, 3]);

    await expect(
      assertAssetIntegrity(bytes, {
        filename: "busytex.wasm",
        byteLength: 4,
        sha256: "0".repeat(64),
      }),
    ).rejects.toThrow("size mismatch");
    await expect(
      assertAssetIntegrity(bytes, {
        filename: "busytex.wasm",
        byteLength: 3,
        sha256: "0".repeat(64),
      }),
    ).rejects.toThrow("integrity mismatch");
  });

  it("streams bytes with progress without trusting Content-Length", async () => {
    const progress: Array<[number, number]> = [];
    const response = new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-length": "3" },
    });

    await expect(
      readLimitedResponseBytes(response, 4, (loaded, total) => {
        progress.push([loaded, total]);
      }),
    ).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(progress.at(-1)).toEqual([3, 3]);
  });

  it("cancels a streamed response as soon as its byte limit is exceeded", async () => {
    const cancel = vi.fn();
    const response = {
      body: {
        getReader: () => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new Uint8Array([1, 2, 3]),
            })
            .mockResolvedValueOnce({
              done: false,
              value: new Uint8Array([4, 5]),
            }),
          cancel,
        }),
      },
      headers: new Headers(),
    } as unknown as Response;

    await expect(readLimitedResponseBytes(response, 4)).rejects.toThrow(
      "exceeds 4 bytes",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });
});
