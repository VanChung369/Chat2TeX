import type { FailedExportAsset } from "./types";

import type { ResolvedAssetFile } from "@/src/features/assets/types";

export interface DownloadExportPayload {
  title: string;
  url: string;
  exportedAtIso: string;
  latexSource: string;
  pdfBase64: string;
  files: ResolvedAssetFile[];
  failures: FailedExportAsset[];
}

export interface DownloadArtifactDescriptor {
  kind: "pdf" | "tex" | "source";
  filename: string;
  mimeType: string;
  objectUrl: string;
  byteLength: number;
}

export interface StartedDownload {
  filename: string;
  downloadId: number | null;
  error: string | null;
}

export type PrepareDownloadResult =
  | {
      ok: true;
      artifacts: DownloadArtifactDescriptor[];
    }
  | {
      ok: false;
      error: string;
    };

export type DownloadExportResult =
  | {
      ok: true;
      downloads: StartedDownload[];
    }
  | {
      ok: false;
      error: string;
      downloads: StartedDownload[];
    };
