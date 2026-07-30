import type { LatexAssetRequest } from "@/src/features/latex/types";

import type { PageImageData } from "./page-image-reader";

import type { ImageConverter, ResolveAssetResult } from "./types";

export interface ImageDataProcessorOptions {
  maximumInputBytes?: number;
  maximumImageDimension?: number;
}

const DEFAULT_OPTIONS: Required<ImageDataProcessorOptions> = {
  maximumInputBytes: 15 * 1024 * 1024,

  maximumImageDimension: 2_400,
};

export class ImageDataProcessor {
  private readonly options: Required<ImageDataProcessorOptions>;

  constructor(
    private readonly converter: ImageConverter,

    options: ImageDataProcessorOptions = {},
  ) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  async process(
    asset: LatexAssetRequest,
    data: PageImageData,
  ): Promise<ResolveAssetResult> {
    if (!data.mimeType.startsWith("image/")) {
      return {
        ok: false,
        code: "invalid-content-type",
        message: "The supplied data is not an image.",
      };
    }

    if (data.byteLength > this.options.maximumInputBytes) {
      return {
        ok: false,
        code: "asset-too-large",
        message: "The image exceeds the maximum allowed size.",
      };
    }

    let bytes: Uint8Array<ArrayBuffer>;

    try {
      bytes = base64ToUint8Array(data.base64);
    } catch {
      return {
        ok: false,
        code: "decode-failed",
        message: "The image contains invalid Base64 data.",
      };
    }

    try {
      const converted = await this.converter.convert(
        new Blob([bytes], {
          type: data.mimeType,
        }),
        {
          maxDimension: this.options.maximumImageDimension,
        },
      );

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
        message:
          error instanceof Error
            ? error.message
            : "Unable to convert the image.",
      };
    }
  }
}

function base64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32_768;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}
