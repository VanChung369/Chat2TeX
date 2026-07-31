import type { CompilerJobSnapshot } from "@/src/features/compiler/compiler-job-types";
import type {
  PreparedExport,
  ProcessedExportAssets,
} from "@/src/features/export/types";

export type ExportPhase =
  | "idle"
  | "preparing"
  | "permission-required"
  | "processing-assets"
  | "ready"
  | "downloading-compiler"
  | "downloading-packages"
  | "initializing"
  | "compiling"
  | "compiled"
  | "packaging"
  | "downloading-output"
  | "downloaded"
  | "cancelled"
  | "error";

export interface ExportFlowState {
  runId: number;
  phase: ExportPhase;
  prepared: PreparedExport | null;
  processedAssets: ProcessedExportAssets | null;
  activeJob: CompilerJobSnapshot | null;
  error: string | null;
  compileLog: string;
  downloadedFiles: string[];
}

export type ExportFlowAction =
  | { type: "prepare-started"; runId: number }
  | {
      type: "prepared";
      runId: number;
      prepared: PreparedExport;
      permissionRequired: boolean;
    }
  | { type: "assets-processing"; runId: number }
  | {
      type: "assets-ready";
      runId: number;
      processedAssets: ProcessedExportAssets;
    }
  | {
      type: "prepare-failed";
      runId: number;
      error: string;
    }
  | {
      type: "job-updated";
      runId: number;
      snapshot: CompilerJobSnapshot;
    }
  | {
      type: "diagnostics-loaded";
      runId: number;
      compileLog: string;
    }
  | { type: "downloads-started"; runId: number }
  | {
      type: "downloads-completed";
      runId: number;
      downloadedFiles: string[];
    }
  | {
      type: "operation-failed";
      runId: number;
      error: string;
    };

export const initialExportFlowState: ExportFlowState = {
  runId: 0,
  phase: "idle",
  prepared: null,
  processedAssets: null,
  activeJob: null,
  error: null,
  compileLog: "",
  downloadedFiles: [],
};

export function exportFlowReducer(
  state: ExportFlowState,
  action: ExportFlowAction,
): ExportFlowState {
  if (action.runId < state.runId) {
    return state;
  }
  const current =
    action.runId > state.runId
      ? { ...state, runId: action.runId }
      : state;

  switch (action.type) {
    case "prepare-started":
      if (action.runId < state.runId) {
        return current;
      }
      return {
        ...initialExportFlowState,
        runId: action.runId,
        phase: "preparing",
      };
    case "prepared":
      return {
        ...current,
        prepared: action.prepared,
        phase: action.permissionRequired
          ? "permission-required"
          : current.phase,
      };
    case "assets-processing":
      return { ...current, phase: "processing-assets" };
    case "assets-ready":
      return {
        ...current,
        phase: "ready",
        processedAssets: action.processedAssets,
      };
    case "prepare-failed":
    case "operation-failed":
      return {
        ...current,
        phase: "error",
        error: action.error,
      };
    case "job-updated":
      return {
        ...current,
        activeJob: action.snapshot,
        phase: phaseFromSnapshot(action.snapshot),
        error:
          action.snapshot.phase === "failed"
            ? action.snapshot.error
            : null,
        downloadedFiles: [...action.snapshot.downloadedFiles],
      };
    case "diagnostics-loaded":
      return {
        ...current,
        compileLog: action.compileLog,
      };
    case "downloads-started":
      return {
        ...current,
        phase: "packaging",
        error: null,
        downloadedFiles: [],
      };
    case "downloads-completed":
      return {
        ...current,
        phase: "downloaded",
        downloadedFiles: action.downloadedFiles,
      };
  }
}

function phaseFromSnapshot(
  snapshot: CompilerJobSnapshot,
): ExportPhase {
  switch (snapshot.phase) {
    case "preparing":
      return "compiling";
    case "downloading-compiler":
    case "downloading-packages":
    case "initializing":
    case "compiling":
    case "packaging":
    case "downloading-output":
      return snapshot.phase;
    case "completed":
      return snapshot.downloadedFiles.length > 0
        ? "downloaded"
        : "compiled";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "error";
  }
}
