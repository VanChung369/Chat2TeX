import type { LatexAssetRequest } from "@/src/features/latex/types";

export function getAssetOriginPatterns(assets: LatexAssetRequest[]): string[] {
  const origins = new Set<string>();

  for (const asset of assets) {
    try {
      const url = new URL(asset.sourceUrl);

      if (url.protocol === "https:") {
        origins.add(`${url.origin}/*`);
      }
    } catch {
      // Ignore invalid URLs
    }
  }

  return [...origins].sort();
}
