import type { LatexAssetRequest } from "@/src/features/latex/types";

export interface ResolvedAssetFile {
  id: string;
  outputPath: string;
  mimeType: "image/png";
  base64: string;
  byteLength: number;
  width: number;
  height: number;
}

export type AssetFailureCode =
  | "invalid-url"
  | "permission-required"
  | "page-read-required"
  | "download-failed"
  | "invalid-content-type"
  | "asset-too-large"
  | "decode-failed";

export type ResolveAssetResult =
  | {
      ok: true;
      file: ResolvedAssetFile;
    }
  | {
      ok: false;
      code: AssetFailureCode;
      message: string;
      originPattern?: string;
    };

export interface AssetHostPermissionChecker {
  contains(originPattern: string): Promise<boolean>;
}

export interface ImageConversionOptions {
  maxDimension: number;
}

export interface ConvertedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface ImageConverter {
  convert(
    input: Blob,
    options: ImageConversionOptions,
  ): Promise<ConvertedImage>;
}

export type ImageAssetRequest = LatexAssetRequest;
