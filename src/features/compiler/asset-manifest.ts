export const COMPILER_VERSION = "busytex-1.2.3-tl2026-chat2tex.1";
export const PACKAGE_ENDPOINT = "https://texlive2026.texlyre.org";
export const PRODUCTION_COMPILER_CORE_BASE_URL =
  "https://github.com/VanChung369/Chat2TeX/releases/download/compiler-v1.2.3-chat2tex.1/";
export const DEVELOPMENT_COMPILER_CORE_BASE_URL = "http://127.0.0.1:4178/";

export const MAX_CORE_CACHE_BYTES = 140 * 1024 * 1024;
export const MAX_TOTAL_CACHE_BYTES = 300 * 1024 * 1024;
export const MAX_PACKAGE_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_PACKAGE_PASSES = 32;
export const MAX_PACKAGE_LOOKUPS_PER_PASS = 256;
export const MAX_PACKAGE_FILES_PER_JOB = 512;
export const MAX_PACKAGE_DOWNLOAD_BYTES_PER_JOB = 160 * 1024 * 1024;

export const ALLOWED_TEXLIVE_FORMATS = [
  3, 4, 6, 7, 10, 11, 26, 32, 33, 35, 39, 43, 44, 46,
] as const;

export interface PackageLookup {
  format: (typeof ALLOWED_TEXLIVE_FORMATS)[number];
  name: string;
}

export function parsePackageLookup(value: unknown): PackageLookup {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid TeX Live lookup.");
  }

  const { format, name } = value as {
    format?: unknown;
    name?: unknown;
  };
  if (
    typeof format !== "number" ||
    !ALLOWED_TEXLIVE_FORMATS.includes(format as PackageLookup["format"])
  ) {
    throw new Error("Unsupported TeX Live format.");
  }
  if (
    typeof name !== "string" ||
    !/^[A-Za-z0-9._-]{1,255}$/.test(name)
  ) {
    throw new Error("Invalid TeX Live filename.");
  }

  return {
    format: format as PackageLookup["format"],
    name,
  };
}

export function packageLookupKey(lookup: PackageLookup): string {
  return `${lookup.format}/${lookup.name}`;
}

export function resolveCompilerCoreBaseUrl({
  development,
  configuredBaseUrl,
}: {
  development: boolean;
  configuredBaseUrl: string | undefined;
}): string {
  if (development) {
    if (configuredBaseUrl !== DEVELOPMENT_COMPILER_CORE_BASE_URL) {
      throw new Error(
        `Development requires WXT_COMPILER_ASSET_BASE_URL=${DEVELOPMENT_COMPILER_CORE_BASE_URL}`,
      );
    }
    return DEVELOPMENT_COMPILER_CORE_BASE_URL;
  }

  if (configuredBaseUrl === undefined) {
    return PRODUCTION_COMPILER_CORE_BASE_URL;
  }
  if (configuredBaseUrl !== PRODUCTION_COMPILER_CORE_BASE_URL) {
    throw new Error(
      "Production compiler assets must use the immutable production compiler directory.",
    );
  }
  return PRODUCTION_COMPILER_CORE_BASE_URL;
}
