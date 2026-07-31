import { describe, expect, it, vi } from "vitest";

import {
  COMPILER_VERSION,
  packageLookupKey,
} from "@/src/features/compiler/asset-manifest";
import {
  CompilerAssetCache,
  packageAssetKey,
} from "@/src/features/compiler/compiler-asset-cache";
import {
  BrowserCompilerAssetStore,
  compilerCacheRequestUrl,
  createEmptyCompilerCacheMetadata,
  type CompilerAssetStore,
  type CompilerCacheMetadata,
} from "@/src/features/compiler/compiler-asset-store";

class MemoryCompilerAssetStore implements CompilerAssetStore {
  readonly bytes = new Map<string, Uint8Array>();
  metadata = createEmptyCompilerCacheMetadata();

  async readBytes(key: string): Promise<Uint8Array | null> {
    return this.bytes.get(key)?.slice() ?? null;
  }

  async writeBytes(key: string, bytes: Uint8Array): Promise<void> {
    this.bytes.set(key, bytes.slice());
  }

  async deleteBytes(key: string): Promise<void> {
    this.bytes.delete(key);
  }

  async readMetadata(): Promise<CompilerCacheMetadata> {
    return structuredClone(this.metadata);
  }

  async writeMetadata(metadata: CompilerCacheMetadata): Promise<void> {
    this.metadata = structuredClone(metadata);
  }
}

describe("CompilerAssetCache", () => {
  it("uses an HTTPS synthetic Cache Storage key instead of an unsupported extension URL", () => {
    expect(compilerCacheRequestUrl("package:26/article.cls")).toBe(
      "https://chatgpt.com/__chat2tex_compiler_cache__/package%3A26%2Farticle.cls",
    );
  });

  it("stores bytes in Cache Storage and restricts metadata before reading it", async () => {
    const responses = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (request: Request) =>
        responses.get(request.url)?.clone(),
      ),
      put: vi.fn(async (request: Request, response: Response) => {
        responses.set(request.url, response.clone());
      }),
      delete: vi.fn(async (request: Request) =>
        responses.delete(request.url),
      ),
    };
    const cacheStorage = {
      open: vi.fn().mockResolvedValue(cache),
    };
    const storageValues: Record<string, unknown> = {};
    const calls: string[] = [];
    const storageArea = {
      setAccessLevel: vi.fn(async () => {
        calls.push("access");
      }),
      get: vi.fn(async (key: string) => {
        calls.push("get");
        return { [key]: storageValues[key] };
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(storageValues, items);
      }),
    };
    const store = new BrowserCompilerAssetStore(
      cacheStorage as unknown as CacheStorage,
      storageArea,
      (key) =>
        `https://extension.test/cache/${encodeURIComponent(key)}`,
    );

    await store.writeBytes("package:test", new Uint8Array([1, 2, 3]));
    await expect(store.readBytes("package:test")).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    await expect(store.readMetadata()).resolves.toEqual(
      createEmptyCompilerCacheMetadata(),
    );
    expect(calls).toEqual(["access", "get"]);
    expect(storageArea.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: "TRUSTED_CONTEXTS",
    });

    await store.deleteBytes("package:test");
    await expect(store.readBytes("package:test")).resolves.toBeNull();
  });

  it("repairs missing core bytes and fetches a verified replacement", async () => {
    const store = new MemoryCompilerAssetStore();
    const cache = new CompilerAssetCache(store);
    const bytes = new Uint8Array([1, 2, 3]);
    const asset = {
      id: "busytex-wasm" as const,
      filename: "busytex.wasm",
      byteLength: 3,
      sha256:
        "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
      mimeType: "application/wasm",
    };
    const key = `core:${COMPILER_VERSION}:busytex-wasm`;
    store.metadata.assets[key] = {
      kind: "core",
      byteLength: 3,
      sha256: asset.sha256,
      lastUsedAt: 1,
    };
    const fetchCore = vi.fn().mockResolvedValue(bytes);

    await expect(
      cache.getOrFetchCore(asset, { fetchCore }),
    ).resolves.toEqual(bytes);
    expect(fetchCore).toHaveBeenCalledOnce();
    expect(await store.readBytes(key)).toEqual(bytes);

    await expect(
      cache.getOrFetchCore(asset, { fetchCore }),
    ).resolves.toEqual(bytes);
    expect(fetchCore).toHaveBeenCalledOnce();
  });

  it("keeps a package hash after byte eviction and rejects changed bytes", async () => {
    const store = new MemoryCompilerAssetStore();
    const cache = new CompilerAssetCache(store);
    const lookup = { format: 26 as const, name: "article.cls" };
    const first = new Uint8Array([1, 2, 3]);
    const changed = new Uint8Array([1, 2, 4]);

    await cache.acceptPackageBytes(lookup, first);
    await store.deleteBytes(packageAssetKey(COMPILER_VERSION, lookup));

    await expect(cache.acceptPackageBytes(lookup, changed)).rejects.toThrow(
      "TeX Live package integrity mismatch",
    );
    expect(
      store.metadata.packageHashes[packageLookupKey(lookup)],
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reuses a 24-hour negative cache entry without fetching again", async () => {
    const store = new MemoryCompilerAssetStore();
    let now = 1_000;
    const cache = new CompilerAssetCache(store, { now: () => now });
    const fetchPackage = vi.fn().mockResolvedValue(null);
    const fetcher = { fetchPackage };
    const lookup = { format: 26 as const, name: "missing.sty" };

    await expect(
      cache.getOrFetchPackage(lookup, fetcher),
    ).resolves.toBeNull();
    now += 60_000;
    await expect(
      cache.getOrFetchPackage(lookup, fetcher),
    ).resolves.toBeNull();
    expect(fetchPackage).toHaveBeenCalledOnce();
  });

  it("evicts least-recently-used package bytes but retains their hashes", async () => {
    const store = new MemoryCompilerAssetStore();
    let now = 1;
    const cache = new CompilerAssetCache(store, {
      maxTotalBytes: 5,
      now: () => now++,
    });
    const first = { format: 26 as const, name: "first.sty" };
    const second = { format: 26 as const, name: "second.sty" };

    await cache.acceptPackageBytes(first, new Uint8Array([1, 2, 3]));
    await cache.acceptPackageBytes(second, new Uint8Array([4, 5, 6]));

    expect(
      await store.readBytes(packageAssetKey(COMPILER_VERSION, first)),
    ).toBeNull();
    expect(
      await store.readBytes(packageAssetKey(COMPILER_VERSION, second)),
    ).toEqual(new Uint8Array([4, 5, 6]));
    expect(store.metadata.packageHashes[packageLookupKey(first)]).toBeDefined();
  });

  it("clears bytes, negative entries, and the TOFU ledger on full reset", async () => {
    const store = new MemoryCompilerAssetStore();
    const cache = new CompilerAssetCache(store);
    const lookup = { format: 26 as const, name: "article.cls" };
    await cache.acceptPackageBytes(lookup, new Uint8Array([1, 2, 3]));
    store.metadata.negativePackages["26/missing.sty"] = Date.now();

    await cache.clearAll();

    expect(store.bytes.size).toBe(0);
    expect(store.metadata.packageHashes).toEqual({});
    expect(store.metadata.negativePackages).toEqual({});
    expect(store.metadata.assets).toEqual({});
  });

  it("stages and discards an upgrade without replacing the active core", async () => {
    const store = new MemoryCompilerAssetStore();
    const storageManager = {
      persist: vi.fn().mockResolvedValue(true),
      estimate: vi
        .fn()
        .mockResolvedValue({ quota: 1024 * 1024 * 1024, usage: 0 }),
    };
    const cache = new CompilerAssetCache(store, { storageManager });

    await cache.stageCompilerVersion("candidate-v2");
    expect(store.metadata.activeCompilerVersion).toBe(COMPILER_VERSION);
    expect(store.metadata.stagedCompilerVersion).toBe("candidate-v2");

    await cache.discardStagedCompilerVersion("candidate-v2");
    expect(store.metadata.activeCompilerVersion).toBe(COMPILER_VERSION);
    expect(store.metadata.stagedCompilerVersion).toBeNull();
  });

  it("activates only the matching staged version and retains rollback metadata", async () => {
    const store = new MemoryCompilerAssetStore();
    const cache = new CompilerAssetCache(store, {
      storageManager: {
        persist: vi.fn().mockResolvedValue(true),
        estimate: vi
          .fn()
          .mockResolvedValue({ quota: 1024 * 1024 * 1024, usage: 0 }),
      },
    });

    await cache.stageCompilerVersion("candidate-v2");
    await expect(
      cache.activateStagedCompilerVersion("wrong-v3"),
    ).rejects.toThrow("not staged");
    await cache.activateStagedCompilerVersion("candidate-v2");

    expect(store.metadata.activeCompilerVersion).toBe("candidate-v2");
    expect(store.metadata.previousCompilerVersion).toBe(COMPILER_VERSION);
    expect(store.metadata.stagedCompilerVersion).toBeNull();
  });

  it("refuses to stage an upgrade when reported free quota is insufficient", async () => {
    const cache = new CompilerAssetCache(
      new MemoryCompilerAssetStore(),
      {
        storageManager: {
          persist: vi.fn().mockResolvedValue(false),
          estimate: vi.fn().mockResolvedValue({
            quota: 200 * 1024 * 1024,
            usage: 100 * 1024 * 1024,
          }),
        },
      },
    );

    await expect(
      cache.stageCompilerVersion("candidate-v2"),
    ).rejects.toThrow("Not enough browser storage");
  });
});
