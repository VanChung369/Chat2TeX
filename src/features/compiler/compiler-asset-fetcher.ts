import type { GeneratedCoreAsset } from "./compiler-core-assets.generated";
import {
  MAX_PACKAGE_FILE_BYTES,
  PACKAGE_ENDPOINT,
  type PackageLookup,
} from "./asset-manifest";
import {
  assertAssetIntegrity,
  readLimitedResponseBytes,
} from "./asset-integrity";

const TRUSTED_ASSET_ORIGINS = new Set([
  "https://github.com",
  "https://release-assets.githubusercontent.com",
  "https://texlive2026.texlyre.org",
  ...(import.meta.env.DEV ? ["http://127.0.0.1:4178"] : []),
]);

export class CompilerAssetFetcher {
  constructor(
    private readonly fetcher: typeof fetch,
    private readonly coreBaseUrl: string,
    private readonly packageEndpoint = PACKAGE_ENDPOINT,
  ) {}

  async fetchCore(
    asset: GeneratedCoreAsset,
    signal?: AbortSignal,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<Uint8Array> {
    let previousError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.fetchCoreOnce(asset, signal, onProgress);
      } catch (error) {
        previousError = error;
        if (signal?.aborted) {
          throw error;
        }
      }
    }

    throw previousError;
  }

  async fetchPackage(
    lookup: PackageLookup,
    signal?: AbortSignal,
  ): Promise<Uint8Array | null> {
    const url = new URL(
      `${lookup.format}/${encodeURIComponent(lookup.name)}`,
      ensureTrailingSlash(this.packageEndpoint),
    );
    const response = await this.fetcher.call(globalThis, url.href, {
      method: "GET",
      redirect: "follow",
      credentials: "omit",
      cache: "no-store",
      signal,
    });
    assertTrustedResponseOrigin(response, url);

    if (response.status === 404) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(
        `TeX Live package request failed with HTTP ${response.status}.`,
      );
    }

    return readLimitedResponseBytes(response, MAX_PACKAGE_FILE_BYTES);
  }

  private async fetchCoreOnce(
    asset: GeneratedCoreAsset,
    signal?: AbortSignal,
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<Uint8Array> {
    const url = new URL(
      asset.filename,
      ensureTrailingSlash(this.coreBaseUrl),
    );
    const response = await this.fetcher.call(globalThis, url.href, {
      method: "GET",
      redirect: "follow",
      credentials: "omit",
      cache: "no-store",
      signal,
    });
    assertTrustedResponseOrigin(response, url);
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(
        `${asset.filename} request failed with HTTP ${response.status}.`,
      );
    }

    const bytes = await readLimitedResponseBytes(
      response,
      asset.byteLength,
      onProgress,
    );
    await assertAssetIntegrity(bytes, asset);
    return bytes;
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function assertTrustedResponseOrigin(
  response: Response,
  requestedUrl: URL,
): void {
  const finalUrl = new URL(response.url || requestedUrl.href);
  if (!TRUSTED_ASSET_ORIGINS.has(finalUrl.origin)) {
    throw new Error(
      `Untrusted compiler asset origin after redirect: ${finalUrl.origin}`,
    );
  }
}
