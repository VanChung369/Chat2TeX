import { describe, expect, it } from "vitest";

import {
  ALLOWED_TEXLIVE_FORMATS,
  COMPILER_VERSION,
  MAX_CORE_CACHE_BYTES,
  MAX_PACKAGE_DOWNLOAD_BYTES_PER_JOB,
  MAX_PACKAGE_FILES_PER_JOB,
  MAX_PACKAGE_FILE_BYTES,
  MAX_PACKAGE_LOOKUPS_PER_PASS,
  MAX_PACKAGE_PASSES,
  MAX_TOTAL_CACHE_BYTES,
  PACKAGE_ENDPOINT,
  packageLookupKey,
  parsePackageLookup,
  resolveCompilerCoreBaseUrl,
} from "@/src/features/compiler/asset-manifest";

describe("compiler asset manifest", () => {
  it("pins compiler, endpoint, cache, and package-resolution limits", () => {
    expect(COMPILER_VERSION).toBe("busytex-1.2.3-tl2026-chat2tex.1");
    expect(PACKAGE_ENDPOINT).toBe("https://texlive2026.texlyre.org");
    expect(MAX_CORE_CACHE_BYTES).toBe(140 * 1024 * 1024);
    expect(MAX_TOTAL_CACHE_BYTES).toBe(300 * 1024 * 1024);
    expect(MAX_PACKAGE_FILE_BYTES).toBe(32 * 1024 * 1024);
    expect(MAX_PACKAGE_PASSES).toBe(32);
    expect(MAX_PACKAGE_LOOKUPS_PER_PASS).toBe(256);
    expect(MAX_PACKAGE_FILES_PER_JOB).toBe(512);
    expect(MAX_PACKAGE_DOWNLOAD_BYTES_PER_JOB).toBe(160 * 1024 * 1024);
    expect(ALLOWED_TEXLIVE_FORMATS).toEqual([
      3, 4, 6, 7, 10, 11, 26, 32, 33, 35, 39, 43, 44, 46,
    ]);
  });

  it("parses a valid lookup and builds a stable cache key", () => {
    const lookup = parsePackageLookup({ format: 26, name: "article.cls" });

    expect(lookup).toEqual({ format: 26, name: "article.cls" });
    expect(packageLookupKey(lookup)).toBe("26/article.cls");
  });

  it("rejects traversal, malformed names, and unknown formats", () => {
    expect(() =>
      parsePackageLookup({ format: 26, name: "../secret.tex" }),
    ).toThrow("Invalid TeX Live filename");
    expect(() =>
      parsePackageLookup({ format: 999, name: "article.cls" }),
    ).toThrow("Unsupported TeX Live format");
    expect(() =>
      parsePackageLookup({ format: 26, name: "folder/article.cls" }),
    ).toThrow("Invalid TeX Live filename");
    expect(() => parsePackageLookup(null)).toThrow("Invalid TeX Live lookup");
  });

  it("accepts only the fixed development and production asset directories", () => {
    expect(
      resolveCompilerCoreBaseUrl({
        development: true,
        configuredBaseUrl: "http://127.0.0.1:4178/",
      }),
    ).toBe("http://127.0.0.1:4178/");

    expect(
      resolveCompilerCoreBaseUrl({
        development: false,
        configuredBaseUrl: undefined,
      }),
    ).toBe(
      "https://github.com/VanChung369/Chat2TeX/releases/download/compiler-v1.2.3-chat2tex.1/",
    );

    expect(() =>
      resolveCompilerCoreBaseUrl({
        development: true,
        configuredBaseUrl: undefined,
      }),
    ).toThrow("WXT_COMPILER_ASSET_BASE_URL");
    expect(() =>
      resolveCompilerCoreBaseUrl({
        development: false,
        configuredBaseUrl: "https://cdn.example.test/compiler/",
      }),
    ).toThrow("immutable production compiler directory");
  });
});
