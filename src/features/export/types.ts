import type { LatexAssetRequest } from "@/src/features/latex/types";

import type {
  AssetFailureCode,
  ResolvedAssetFile,
} from "@/src/features/assets/types";

export interface PreparedExport {
  title: string;
  url: string;
  latexSource: string;
  assets: LatexAssetRequest[];
}

export interface FailedExportAsset {
  id: string;
  sourceUrl: string;
  code: AssetFailureCode;
  message: string;
}

export interface ProcessedExportAssets {
  files: ResolvedAssetFile[];
  failures: FailedExportAsset[];
}

export interface ExportProgress {
  current: number;
  total: number;
  label: string;
}
