import type { LatexAssetRequest } from "@/src/features/latex/types";

import type { AssetFailureCode } from "./types";

export interface PageImageData {
  mimeType: string;
  base64: string;
  byteLength: number;
}

export type PageImageReadResult =
  | {
      ok: true;
      data: PageImageData;
    }
  | {
      ok: false;
      code: AssetFailureCode;
      message: string;
    };

export interface PageImageReaderOptions {
  maximumInputBytes?: number;
}

type PageImageFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const DEFAULT_OPTIONS: Required<PageImageReaderOptions> = {
  maximumInputBytes: 15 * 1024 * 1024,
};

export class PageImageReader {
  private readonly options: Required<PageImageReaderOptions>;

  constructor(
    private readonly fetcher: PageImageFetcher = fetch,

    options: PageImageReaderOptions = {},
  ) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  async read(asset: LatexAssetRequest): Promise<PageImageReadResult> {
    const url = parseUrl(asset.sourceUrl);

    if (!url || (url.protocol !== "blob:" && url.protocol !== "data:")) {
      return {
        ok: false,
        code: "invalid-url",
        message: "Only blob and data image URLs can be read from the page.",
      };
    }

    let response: Response;

    try {
      response = await this.fetcher(asset.sourceUrl);
    } catch (error) {
      return {
        ok: false,
        code: "download-failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to read the page image.",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        code: "download-failed",
        message: `Unable to read image: HTTP ${response.status}.`,
      };
    }

    const blob = await response.blob();

    if (blob.size > this.options.maximumInputBytes) {
      return {
        ok: false,
        code: "asset-too-large",
        message: "The image exceeds the maximum allowed size.",
      };
    }

    const mimeType = (blob.type || response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!mimeType.startsWith("image/")) {
      return {
        ok: false,
        code: "invalid-content-type",
        message: "The page resource is not an image.",
      };
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());

    return {
      ok: true,

      data: {
        mimeType,
        base64: uint8ArrayToBase64(bytes),
        byteLength: bytes.byteLength,
      },
    };
  }
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 32_768;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}
