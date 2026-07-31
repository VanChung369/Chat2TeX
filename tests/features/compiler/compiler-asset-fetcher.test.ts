import { describe, expect, it, vi } from "vitest";

import { sha256Hex } from "@/src/features/compiler/asset-integrity";
import { CompilerAssetFetcher } from "@/src/features/compiler/compiler-asset-fetcher";

const coreBaseUrl =
  "https://github.com/VanChung369/Chat2TeX/releases/download/compiler-v1.2.3-chat2tex.1/";

describe("CompilerAssetFetcher", () => {
  it("invokes the browser fetch function with its global receiver", async () => {
    const bytes = new Uint8Array([1]);
    const receiverAwareFetch = vi.fn(function (
      this: typeof globalThis,
    ) {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve(
        responseWithUrl(bytes, `${coreBaseUrl}busytex.wasm`),
      );
    }) as unknown as typeof fetch;
    const fetcher = new CompilerAssetFetcher(
      receiverAwareFetch,
      coreBaseUrl,
    );

    await expect(
      fetcher.fetchCore({
        id: "busytex-wasm",
        filename: "busytex.wasm",
        byteLength: 1,
        sha256: await sha256Hex(bytes),
        mimeType: "application/wasm",
      }),
    ).resolves.toEqual(bytes);
  });

  it("fetches a pinned core asset and reports byte progress", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetcherMock = vi.fn().mockResolvedValue(
      responseWithUrl(bytes, `${coreBaseUrl}busytex.wasm`, {
        "content-length": "3",
      }),
    );
    const progress: Array<[number, number]> = [];
    const fetcher = new CompilerAssetFetcher(
      fetcherMock as typeof fetch,
      coreBaseUrl,
    );

    await expect(
      fetcher.fetchCore(
        {
          id: "busytex-wasm",
          filename: "busytex.wasm",
          byteLength: 3,
          sha256: await sha256Hex(bytes),
          mimeType: "application/wasm",
        },
        undefined,
        (loaded, total) => progress.push([loaded, total]),
      ),
    ).resolves.toEqual(bytes);
    expect(fetcherMock).toHaveBeenCalledWith(
      `${coreBaseUrl}busytex.wasm`,
      expect.objectContaining({ redirect: "follow" }),
    );
    expect(progress.at(-1)).toEqual([3, 3]);
  });

  it("retries core integrity failure once and then rejects", async () => {
    const fetcherMock = vi.fn().mockImplementation(async () =>
      responseWithUrl(
        new Uint8Array([9]),
        `${coreBaseUrl}busytex.wasm`,
      ),
    );
    const fetcher = new CompilerAssetFetcher(
      fetcherMock as typeof fetch,
      coreBaseUrl,
    );

    await expect(
      fetcher.fetchCore({
        id: "busytex-wasm",
        filename: "busytex.wasm",
        byteLength: 1,
        sha256: "0".repeat(64),
        mimeType: "application/wasm",
      }),
    ).rejects.toThrow("integrity mismatch");
    expect(fetcherMock).toHaveBeenCalledTimes(2);
  });

  it("returns null for a missing package", async () => {
    const fetcher = new CompilerAssetFetcher(
      vi.fn().mockResolvedValue(
        responseWithUrl(
          null,
          "https://texlive2026.texlyre.org/26/missing.sty",
          {},
          404,
        ),
      ) as typeof fetch,
      coreBaseUrl,
    );

    await expect(
      fetcher.fetchPackage({ format: 26, name: "missing.sty" }),
    ).resolves.toBeNull();
  });

  it("rejects an oversized streamed package before returning it", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let emitted = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
        emitted += chunk.byteLength;
        if (emitted === 33 * 1024 * 1024) {
          controller.close();
        }
      },
    });
    const response = new Response(body, { status: 200 });
    Object.defineProperty(response, "url", {
      value: "https://texlive2026.texlyre.org/26/huge.sty",
    });
    const fetcher = new CompilerAssetFetcher(
      vi.fn().mockResolvedValue(response) as typeof fetch,
      coreBaseUrl,
    );

    await expect(
      fetcher.fetchPackage({ format: 26, name: "huge.sty" }),
    ).rejects.toThrow("exceeds 33554432 bytes");
  });

  it("rejects a cross-origin redirect before consuming bytes", async () => {
    const fetcher = new CompilerAssetFetcher(
      vi.fn().mockResolvedValue(
        responseWithUrl(
          new Uint8Array([1]),
          "https://evil.example.test/compiler.wasm",
        ),
      ) as typeof fetch,
      coreBaseUrl,
    );

    await expect(
      fetcher.fetchPackage({ format: 26, name: "article.cls" }),
    ).rejects.toThrow("Untrusted compiler asset origin");
  });
});

function responseWithUrl(
  body: BodyInit | null,
  url: string,
  headers: HeadersInit = {},
  status = 200,
): Response {
  const response = new Response(body, { status, headers });
  Object.defineProperty(response, "url", { value: url });
  return response;
}
