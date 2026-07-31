import type { ResolvedAssetFile } from "../assets/types";
import type { FailedExportAsset } from "../export/types";
import type {
  PrepareDownloadResult,
  StartedDownload,
} from "../export/download-types";
import type { OutputKind } from "../export/output-plan";
import type { CompilerProgress } from "./on-demand-busytex-engine";

export type CompilerJobPhase =
  | "preparing"
  | "downloading-compiler"
  | "downloading-packages"
  | "initializing"
  | "compiling"
  | "packaging"
  | "downloading-output"
  | "completed"
  | "cancelled"
  | "failed";

export interface CompilerJobSnapshot {
  jobId: string;
  phase: CompilerJobPhase;
  title: string;
  messageCount: number;
  assetCount: number;
  outputKinds: OutputKind[];
  progress: CompilerProgress | null;
  error: string | null;
  pdfByteLength: number | null;
  omittedFiles: string[];
  downloadedFiles: string[];
  startedAt: number;
  updatedAt: number;
}

export interface StartCompilerJobPayload {
  title: string;
  url: string;
  messageCount: number;
  exportedAtIso: string;
  latexSource: string;
  files: ResolvedAssetFile[];
  failures: FailedExportAsset[];
  outputKinds: OutputKind[];
}

export interface CompilerJobRecoveryMarker {
  schemaVersion: 1;
  jobId: string;
  phase: CompilerJobPhase;
  startedAt: number;
  updatedAt: number;
}

export interface CompilerJobDiagnostics {
  jobId: string;
  error: string | null;
  compileLog: string;
  omittedFiles: string[];
}

export interface CompilerJobArtifactPayload {
  title: string;
  url: string;
  exportedAtIso: string;
  latexSource: string;
  pdfBytes?: Uint8Array;
  files: ResolvedAssetFile[];
  failures: FailedExportAsset[];
  outputKinds: OutputKind[];
}

export interface CompilerJobCoordinatorApi {
  start(payload: StartCompilerJobPayload): Promise<CompilerJobSnapshot>;
  get(jobId?: string): Promise<CompilerJobSnapshot | null>;
  diagnostics(jobId: string): Promise<CompilerJobDiagnostics>;
  cancel(jobId: string): Promise<CompilerJobSnapshot>;
  prepareArtifacts(jobId: string): Promise<PrepareDownloadResult>;
  recordDownloads(
    jobId: string,
    downloads: StartedDownload[],
  ): Promise<CompilerJobSnapshot>;
}

export const TERMINAL_COMPILER_JOB_PHASES =
  new Set<CompilerJobPhase>(["completed", "cancelled", "failed"]);

export function isTerminalCompilerJobPhase(
  phase: CompilerJobPhase,
): boolean {
  return TERMINAL_COMPILER_JOB_PHASES.has(phase);
}
