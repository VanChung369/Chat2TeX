import type {
  AssetHostPermissionChecker,
  ImageAssetRequest,
  ImageConverter,
  ResolveAssetResult,
} from "./types";

export interface AssetManagerOptions {
  maximumInputBytes?: number;
  maximumImageDimension?: number;
}

const DEFAULT_OPTIONS: Required<AssetManagerOptions> = {
  maximumInputBytes: 15 * 1024 * 1024,
  maximumImageDimension: 2_400,
};

type AssetFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class AssetManager {
  private readonly options: Required<AssetManagerOptions>;

  constructor(
    private readonly permissionChecker: AssetHostPermissionChecker,

    private readonly fetcher: AssetFetcher = fetch,

    private readonly imageConverter: ImageConverter,

    options: AssetManagerOptions = {},
  ) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  async resolve(asset: ImageAssetRequest): Promise<ResolveAssetResult> {
    if (!isSafeOutputPath(asset.outputPath)) {
      return {
        ok: false,
        code: "invalid-url",
        message: "Invalid asset output path.",
      };
    }

    const parsedUrl = parseAssetUrl(asset.sourceUrl);

    if (!parsedUrl) {
      return {
        ok: false,
        code: "invalid-url",
        message: "The image URL is invalid.",
      };
    }

    if (parsedUrl.protocol === "blob:" || parsedUrl.protocol === "data:") {
      return {
        ok: false,
        code: "page-read-required",
        message: "This image must be read from the ChatGPT page.",
      };
    }

    if (parsedUrl.protocol !== "https:") {
      return {
        ok: false,
        code: "invalid-url",
        message: "Only secure HTTPS image URLs are supported.",
      };
    }

    const originPattern = `${parsedUrl.origin}/*`;

    const hasPermission = await this.permissionChecker.contains(originPattern);

    if (!hasPermission) {
      return {
        ok: false,
        code: "permission-required",
        message: "Permission is required to download this image.",
        originPattern,
      };
    }

    let response: Response;

    try {
      response = await this.fetcher.call(globalThis, parsedUrl.href, {
        method: "GET",
        credentials: "omit",
        redirect: "follow",
        cache: "no-store",

        headers: {
          Accept:
            "image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/*",
        },
      });
    } catch (error) {
      console.log("Fetching image from URL:", error);
      return {
        ok: false,
        code: "download-failed",
        message: readErrorMessage(error, "Unable to download the image."),
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        code: "download-failed",
        message: `Image download failed with HTTP ${response.status}.`,
      };
    }

    const declaredLength = readContentLength(response);

    if (
      declaredLength !== null &&
      declaredLength > this.options.maximumInputBytes
    ) {
      return {
        ok: false,
        code: "asset-too-large",
        message: "The image exceeds the maximum allowed size.",
      };
    }

    const contentType = normalizeContentType(
      response.headers.get("content-type"),
    );

    if (!isAllowedImageType(contentType)) {
      return {
        ok: false,
        code: "invalid-content-type",
        message: `Unsupported image content type: ${contentType || "unknown"}.`,
      };
    }

    const inputBlob = await response.blob();

    if (inputBlob.size > this.options.maximumInputBytes) {
      return {
        ok: false,
        code: "asset-too-large",
        message: "The image exceeds the maximum allowed size.",
      };
    }

    try {
      const converted = await this.imageConverter.convert(inputBlob, {
        maxDimension: this.options.maximumImageDimension,
      });

      return {
        ok: true,

        file: {
          id: asset.id,
          outputPath: asset.outputPath,
          mimeType: "image/png",
          base64: uint8ArrayToBase64(converted.bytes),
          byteLength: converted.bytes.byteLength,
          width: converted.width,
          height: converted.height,
        },
      };
    } catch (error) {
      return {
        ok: false,
        code: "decode-failed",
        message: readErrorMessage(error, "Unable to decode the image."),
      };
    }
  }
}

function parseAssetUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isSafeOutputPath(value: string): boolean {
  return (
    value.startsWith("assets/") &&
    !value.includes("..") &&
    !value.startsWith("/") &&
    !value.includes("\\")
  );
}

function readContentLength(response: Response): number | null {
  const value = response.headers.get("content-length");

  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeContentType(value: string | null): string {
  return (value ?? "").split(";")[0].trim().toLowerCase();
}

function isAllowedImageType(contentType: string): boolean {
  return (
    contentType.startsWith("image/") ||
    contentType === "application/octet-stream" ||
    contentType === "binary/octet-stream"
  );
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 32_768;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);

    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
