import { describe, expect, it } from "vitest";

import {
  exportFlowReducer,
  initialExportFlowState,
} from "@/entrypoints/popup/export-flow-state";

import type { CompilerJobSnapshot } from "@/src/features/compiler/compiler-job-types";

function snapshot(
  phase: CompilerJobSnapshot["phase"],
): CompilerJobSnapshot {
  return {
    jobId: "job-1",
    phase,
    title: "Export",
    messageCount: 2,
    assetCount: 0,
    outputKinds: ["pdf"],
    progress:
      phase === "downloading-packages"
        ? {
            phase: "downloading-packages",
            current: 1,
            total: 2,
            label: "xcolor.sty",
          }
        : null,
    error: phase === "failed" ? "Compilation failed." : null,
    pdfByteLength: phase === "completed" ? 5 : null,
    omittedFiles: [],
    downloadedFiles: [],
    startedAt: 1,
    updatedAt: 2,
  };
}

describe("exportFlowReducer", () => {
  it("ignores an older async run", () => {
    const newer = exportFlowReducer(initialExportFlowState, {
      type: "prepare-started",
      runId: 2,
    });
    const result = exportFlowReducer(newer, {
      type: "prepare-failed",
      runId: 1,
      error: "stale",
    });

    expect(result).toBe(newer);
  });

  it("maps a restored package download snapshot to visible progress", () => {
    const packageDownloadSnapshot = snapshot(
      "downloading-packages",
    );
    const result = exportFlowReducer(initialExportFlowState, {
      type: "job-updated",
      runId: 1,
      snapshot: packageDownloadSnapshot,
    });

    expect(result.phase).toBe("downloading-packages");
    expect(result.activeJob?.jobId).toBe("job-1");
  });

  it("maps interrupted, cancelled, completed and downloaded snapshots", () => {
    expect(
      exportFlowReducer(initialExportFlowState, {
        type: "job-updated",
        runId: 0,
        snapshot: snapshot("failed"),
      }),
    ).toMatchObject({
      phase: "error",
      error: "Compilation failed.",
    });
    expect(
      exportFlowReducer(initialExportFlowState, {
        type: "job-updated",
        runId: 0,
        snapshot: snapshot("cancelled"),
      }).phase,
    ).toBe("cancelled");
    expect(
      exportFlowReducer(initialExportFlowState, {
        type: "job-updated",
        runId: 0,
        snapshot: snapshot("completed"),
      }).phase,
    ).toBe("compiled");
    expect(
      exportFlowReducer(initialExportFlowState, {
        type: "job-updated",
        runId: 0,
        snapshot: {
          ...snapshot("completed"),
          downloadedFiles: ["export.pdf"],
        },
      }).phase,
    ).toBe("downloaded");
  });

  it("stores diagnostics without requiring persisted source data", () => {
    const result = exportFlowReducer(initialExportFlowState, {
      type: "diagnostics-loaded",
      runId: 0,
      compileLog: "private log",
    });

    expect(result.compileLog).toBe("private log");
    expect(result.prepared).toBeNull();
    expect(result.processedAssets).toBeNull();
  });
});
