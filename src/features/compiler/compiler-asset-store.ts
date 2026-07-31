import { browser } from "wxt/browser";

import { COMPILER_VERSION } from "./asset-manifest";

const CACHE_NAME = "chat2tex-compiler-v1";
const METADATA_KEY = "chat2tex.compiler-cache.metadata.v1";
const CACHE_KEY_BASE_URL =
  "https://chatgpt.com/__chat2tex_compiler_cache__/";

export interface CompilerCacheAssetMetadata {
  kind: "core" | "package";
  byteLength: number;
  sha256: string;
  lastUsedAt: number;
}

export interface CompilerCacheMetadata {
  schemaVersion: 1;
  activeCompilerVersion: string;
  stagedCompilerVersion: string | null;
  previousCompilerVersion: string | null;
  assets: Record<string, CompilerCacheAssetMetadata>;
  packageHashes: Record<string, string>;
  negativePackages: Record<string, number>;
}

export interface CompilerAssetStore {
  readBytes(key: string): Promise<Uint8Array | null>;
  writeBytes(key: string, bytes: Uint8Array): Promise<void>;
  deleteBytes(key: string): Promise<void>;
  readMetadata(): Promise<CompilerCacheMetadata>;
  writeMetadata(metadata: CompilerCacheMetadata): Promise<void>;
}

interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  setAccessLevel?(options: {
    accessLevel: "TRUSTED_CONTEXTS";
  }): Promise<void>;
}

export function createEmptyCompilerCacheMetadata(
  activeCompilerVersion = COMPILER_VERSION,
): CompilerCacheMetadata {
  return {
    schemaVersion: 1,
    activeCompilerVersion,
    stagedCompilerVersion: null,
    previousCompilerVersion: null,
    assets: {},
    packageHashes: {},
    negativePackages: {},
  };
}

export function compilerCacheRequestUrl(key: string): string {
  return `${CACHE_KEY_BASE_URL}${encodeURIComponent(key)}`;
}

export class BrowserCompilerAssetStore implements CompilerAssetStore {
  private cachePromise: Promise<Cache> | null = null;
  private accessLevelPromise: Promise<void> | null = null;

  constructor(
    private readonly cacheStorage: CacheStorage = caches,
    private readonly storageArea: StorageAreaLike = browser.storage
      .local as StorageAreaLike,
    private readonly getCacheUrl: (key: string) => string =
      compilerCacheRequestUrl,
  ) {}

  async readBytes(key: string): Promise<Uint8Array | null> {
    const cache = await this.openCache();
    const response = await cache.match(this.requestFor(key));
    if (!response) {
      return null;
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async writeBytes(key: string, bytes: Uint8Array): Promise<void> {
    const cache = await this.openCache();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    await cache.put(this.requestFor(key), new Response(copy));
  }

  async deleteBytes(key: string): Promise<void> {
    const cache = await this.openCache();
    await cache.delete(this.requestFor(key));
  }

  async readMetadata(): Promise<CompilerCacheMetadata> {
    await this.restrictMetadataAccess();
    const stored = (await this.storageArea.get(METADATA_KEY))[METADATA_KEY];
    return isCompilerCacheMetadata(stored)
      ? structuredClone(stored)
      : createEmptyCompilerCacheMetadata();
  }

  async writeMetadata(metadata: CompilerCacheMetadata): Promise<void> {
    await this.restrictMetadataAccess();
    await this.storageArea.set({
      [METADATA_KEY]: structuredClone(metadata),
    });
  }

  private openCache(): Promise<Cache> {
    this.cachePromise ??= this.cacheStorage.open(CACHE_NAME);
    return this.cachePromise;
  }

  private restrictMetadataAccess(): Promise<void> {
    this.accessLevelPromise ??= this.storageArea.setAccessLevel
      ? this.storageArea.setAccessLevel({
          accessLevel: "TRUSTED_CONTEXTS",
        })
      : Promise.resolve();
    return this.accessLevelPromise;
  }

  private requestFor(key: string): Request {
    return new Request(this.getCacheUrl(key));
  }
}

function isCompilerCacheMetadata(
  value: unknown,
): value is CompilerCacheMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }
  const metadata = value as Partial<CompilerCacheMetadata>;
  return (
    metadata.schemaVersion === 1 &&
    typeof metadata.activeCompilerVersion === "string" &&
    (typeof metadata.stagedCompilerVersion === "string" ||
      metadata.stagedCompilerVersion === null) &&
    (typeof metadata.previousCompilerVersion === "string" ||
      metadata.previousCompilerVersion === null) &&
    isRecord(metadata.assets) &&
    isRecord(metadata.packageHashes) &&
    isRecord(metadata.negativePackages)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
