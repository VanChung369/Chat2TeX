import {
  GENERATED_CORE_ASSETS,
  type CoreAssetId,
  type GeneratedCoreAsset,
} from "./compiler-core-assets.generated";
import {
  COMPILER_VERSION,
  MAX_CORE_CACHE_BYTES,
  MAX_TOTAL_CACHE_BYTES,
  packageLookupKey,
  parsePackageLookup,
  type PackageLookup,
} from "./asset-manifest";
import { assertAssetIntegrity, sha256Hex } from "./asset-integrity";
import {
  createEmptyCompilerCacheMetadata,
  type CompilerAssetStore,
  type CompilerCacheMetadata,
} from "./compiler-asset-store";

const NEGATIVE_PACKAGE_TTL_MS = 24 * 60 * 60 * 1000;
const UPGRADE_SAFETY_BYTES = 32 * 1024 * 1024;

interface StorageManagerLike {
  persist(): Promise<boolean>;
  estimate(): Promise<StorageEstimate>;
}

interface CompilerAssetCacheOptions {
  maxTotalBytes?: number;
  now?: () => number;
  storageManager?: StorageManagerLike;
}

interface PackageFetcher {
  fetchPackage(
    lookup: PackageLookup,
    signal?: AbortSignal,
  ): Promise<Uint8Array | null>;
}

interface CoreFetcher {
  fetchCore(
    asset: GeneratedCoreAsset,
    signal?: AbortSignal,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<Uint8Array>;
}

export interface CompilerCacheStatus {
  compilerVersion: string;
  coreBytes: number;
  packageBytes: number;
  totalBytes: number;
  packageCount: number;
  quotaBytes: number | null;
  usageBytes: number | null;
  persisted: boolean;
}

export interface ResolvedPackageAsset {
  content: Uint8Array;
  source: "cache" | "network";
}

export function coreAssetKey(version: string, assetId: CoreAssetId): string {
  return `core:${version}:${assetId}`;
}

export function packageAssetKey(
  version: string,
  lookup: PackageLookup,
): string {
  return `package:${version}:${packageLookupKey(lookup)}`;
}

export class CompilerAssetCache {
  private readonly maxTotalBytes: number;
  private readonly now: () => number;
  private readonly storageManager: StorageManagerLike;
  private persistencePromise: Promise<boolean> | null = null;

  constructor(
    private readonly store: CompilerAssetStore,
    options: CompilerAssetCacheOptions = {},
  ) {
    this.maxTotalBytes =
      options.maxTotalBytes ?? MAX_TOTAL_CACHE_BYTES;
    this.now = options.now ?? Date.now;
    this.storageManager =
      options.storageManager ?? defaultStorageManager();
  }

  async getOrFetchCore(
    asset: GeneratedCoreAsset,
    fetcher: CoreFetcher,
    signal?: AbortSignal,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<Uint8Array> {
    await this.ensurePersistenceRequested();
    const metadata = await this.store.readMetadata();
    const version =
      metadata.stagedCompilerVersion ?? metadata.activeCompilerVersion;
    const key = coreAssetKey(version, asset.id);
    const cached = await this.readVerifiedCore(key, asset, metadata);
    if (cached) {
      return cached;
    }

    const bytes = await fetcher.fetchCore(
      asset,
      signal,
      onProgress,
    );
    await this.store.writeBytes(key, bytes);
    metadata.assets[key] = {
      kind: "core",
      byteLength: bytes.byteLength,
      sha256: asset.sha256,
      lastUsedAt: this.now(),
    };
    await this.store.writeMetadata(metadata);
    return bytes;
  }

  async getOrFetchPackage(
    value: PackageLookup,
    fetcher: PackageFetcher,
    signal?: AbortSignal,
  ): Promise<ResolvedPackageAsset | null> {
    await this.ensurePersistenceRequested();
    const lookup = parsePackageLookup(value);
    const lookupKey = packageLookupKey(lookup);
    const metadata = await this.store.readMetadata();
    const key = packageAssetKey(
      metadata.activeCompilerVersion,
      lookup,
    );
    const cached = await this.readVerifiedPackage(
      key,
      lookupKey,
      metadata,
    );
    if (cached) {
      return { content: cached, source: "cache" };
    }

    const negativeExpiry = metadata.negativePackages[lookupKey];
    if (negativeExpiry !== undefined && negativeExpiry > this.now()) {
      return null;
    }
    if (negativeExpiry !== undefined) {
      delete metadata.negativePackages[lookupKey];
      await this.store.writeMetadata(metadata);
    }

    const downloaded = await fetcher.fetchPackage(lookup, signal);
    if (!downloaded) {
      const latest = await this.store.readMetadata();
      latest.negativePackages[lookupKey] =
        this.now() + NEGATIVE_PACKAGE_TTL_MS;
      await this.store.writeMetadata(latest);
      return null;
    }

    await this.acceptPackageBytes(lookup, downloaded);
    return { content: downloaded, source: "network" };
  }

  async acceptPackageBytes(
    value: PackageLookup,
    bytes: Uint8Array,
  ): Promise<void> {
    await this.ensurePersistenceRequested();
    const lookup = parsePackageLookup(value);
    const lookupKey = packageLookupKey(lookup);
    const metadata = await this.store.readMetadata();
    const hash = await sha256Hex(bytes);
    const trustedHash = metadata.packageHashes[lookupKey];
    if (trustedHash !== undefined && trustedHash !== hash) {
      throw new Error(
        `TeX Live package integrity mismatch for ${lookupKey}.`,
      );
    }

    const key = packageAssetKey(
      metadata.activeCompilerVersion,
      lookup,
    );
    await this.store.writeBytes(key, bytes);
    metadata.packageHashes[lookupKey] ??= hash;
    metadata.assets[key] = {
      kind: "package",
      byteLength: bytes.byteLength,
      sha256: hash,
      lastUsedAt: this.now(),
    };
    delete metadata.negativePackages[lookupKey];
    await this.evictLeastRecentlyUsedPackages(metadata);
    await this.store.writeMetadata(metadata);
  }

  async readActiveCoreAssets(): Promise<Record<
    CoreAssetId,
    Uint8Array
  > | null> {
    const metadata = await this.store.readMetadata();
    const result = {} as Record<CoreAssetId, Uint8Array>;

    for (const asset of GENERATED_CORE_ASSETS) {
      const key = coreAssetKey(
        metadata.activeCompilerVersion,
        asset.id,
      );
      const bytes = await this.readVerifiedCore(key, asset, metadata);
      if (!bytes) {
        return null;
      }
      result[asset.id] = bytes;
    }
    return result;
  }

  async stageCompilerVersion(version: string): Promise<void> {
    await this.ensurePersistenceRequested();
    if (!version) {
      throw new Error("Compiler version must not be empty.");
    }

    const estimate = await this.storageManager.estimate();
    if (
      estimate.quota !== undefined &&
      estimate.usage !== undefined &&
      estimate.quota - estimate.usage <
        MAX_CORE_CACHE_BYTES * 2 + UPGRADE_SAFETY_BYTES
    ) {
      throw new Error(
        "Not enough browser storage to stage the compiler update. Clear compiler cache or free disk space and retry.",
      );
    }

    const metadata = await this.store.readMetadata();
    metadata.stagedCompilerVersion = version;
    await this.store.writeMetadata(metadata);
  }

  async activateStagedCompilerVersion(version: string): Promise<void> {
    const metadata = await this.store.readMetadata();
    if (metadata.stagedCompilerVersion !== version) {
      throw new Error(`Compiler version ${version} is not staged.`);
    }
    metadata.previousCompilerVersion =
      metadata.activeCompilerVersion;
    metadata.activeCompilerVersion = version;
    metadata.stagedCompilerVersion = null;
    await this.store.writeMetadata(metadata);
  }

  async discardStagedCompilerVersion(version: string): Promise<void> {
    const metadata = await this.store.readMetadata();
    if (metadata.stagedCompilerVersion !== version) {
      throw new Error(`Compiler version ${version} is not staged.`);
    }
    for (const [key, asset] of Object.entries(metadata.assets)) {
      if (asset.kind === "core" && key.startsWith(`core:${version}:`)) {
        await this.store.deleteBytes(key);
        delete metadata.assets[key];
      }
    }
    metadata.stagedCompilerVersion = null;
    await this.store.writeMetadata(metadata);
  }

  async status(): Promise<CompilerCacheStatus> {
    const persisted = await this.ensurePersistenceRequested();
    const [metadata, estimate] = await Promise.all([
      this.store.readMetadata(),
      this.storageManager.estimate(),
    ]);
    let coreBytes = 0;
    let packageBytes = 0;
    let packageCount = 0;
    for (const asset of Object.values(metadata.assets)) {
      if (asset.kind === "core") {
        coreBytes += asset.byteLength;
      } else {
        packageBytes += asset.byteLength;
        packageCount += 1;
      }
    }

    return {
      compilerVersion: metadata.activeCompilerVersion,
      coreBytes,
      packageBytes,
      totalBytes: coreBytes + packageBytes,
      packageCount,
      quotaBytes: estimate.quota ?? null,
      usageBytes: estimate.usage ?? null,
      persisted,
    };
  }

  async clearAll(): Promise<void> {
    const metadata = await this.store.readMetadata();
    for (const key of Object.keys(metadata.assets)) {
      await this.store.deleteBytes(key);
    }
    await this.store.writeMetadata(
      createEmptyCompilerCacheMetadata(),
    );
  }

  private async readVerifiedCore(
    key: string,
    asset: GeneratedCoreAsset,
    metadata: CompilerCacheMetadata,
  ): Promise<Uint8Array | null> {
    const record = metadata.assets[key];
    if (!record || record.kind !== "core") {
      return null;
    }
    const bytes = await this.store.readBytes(key);
    if (!bytes) {
      delete metadata.assets[key];
      await this.store.writeMetadata(metadata);
      return null;
    }

    try {
      await assertAssetIntegrity(bytes, asset);
    } catch {
      await this.store.deleteBytes(key);
      delete metadata.assets[key];
      await this.store.writeMetadata(metadata);
      return null;
    }

    record.lastUsedAt = this.now();
    await this.store.writeMetadata(metadata);
    return bytes;
  }

  private async readVerifiedPackage(
    key: string,
    lookupKey: string,
    metadata: CompilerCacheMetadata,
  ): Promise<Uint8Array | null> {
    const record = metadata.assets[key];
    if (!record || record.kind !== "package") {
      return null;
    }
    const bytes = await this.store.readBytes(key);
    if (!bytes) {
      delete metadata.assets[key];
      await this.store.writeMetadata(metadata);
      return null;
    }
    const actualHash = await sha256Hex(bytes);
    if (
      bytes.byteLength !== record.byteLength ||
      actualHash !== record.sha256 ||
      actualHash !== metadata.packageHashes[lookupKey]
    ) {
      await this.store.deleteBytes(key);
      delete metadata.assets[key];
      await this.store.writeMetadata(metadata);
      return null;
    }

    record.lastUsedAt = this.now();
    await this.store.writeMetadata(metadata);
    return bytes;
  }

  private async evictLeastRecentlyUsedPackages(
    metadata: CompilerCacheMetadata,
  ): Promise<void> {
    let totalBytes = Object.values(metadata.assets).reduce(
      (sum, asset) => sum + asset.byteLength,
      0,
    );
    const packages = Object.entries(metadata.assets)
      .filter(([, asset]) => asset.kind === "package")
      .sort(
        ([, left], [, right]) =>
          left.lastUsedAt - right.lastUsedAt,
      );

    for (const [key, asset] of packages) {
      if (totalBytes <= this.maxTotalBytes) {
        break;
      }
      await this.store.deleteBytes(key);
      delete metadata.assets[key];
      totalBytes -= asset.byteLength;
    }
  }

  private ensurePersistenceRequested(): Promise<boolean> {
    this.persistencePromise ??= this.storageManager
      .persist()
      .catch(() => false);
    return this.persistencePromise;
  }
}

function defaultStorageManager(): StorageManagerLike {
  const storage =
    typeof navigator === "undefined"
      ? undefined
      : (
          navigator as Navigator & {
            storage?: Partial<StorageManagerLike>;
          }
        ).storage;
  if (
    typeof storage?.persist === "function" &&
    typeof storage.estimate === "function"
  ) {
    return {
      persist: () => storage.persist!(),
      estimate: () => storage.estimate!(),
    };
  }
  return {
    persist: async () => false,
    estimate: async () => ({}),
  };
}
