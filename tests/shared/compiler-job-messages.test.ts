import { describe, expect, it } from "vitest";

import {
  CHATTEX_CANCEL_COMPILER_JOB,
  CHATTEX_COMPILER_OFFSCREEN_TARGET,
  CHATTEX_COMPILER_STORAGE,
  CHATTEX_RECORD_COMPILER_JOB_DOWNLOADS,
  CHATTEX_START_COMPILER_JOB,
  isCancelCompilerJobRequest,
  isCompilerOffscreenTargetedMessage,
  isCompilerStorageRequest,
  isRecordCompilerJobDownloadsRequest,
  isStartCompilerJobRequest,
} from "@/src/shared/messages";

describe("compiler job runtime messages", () => {
  it("accepts a complete start payload and rejects missing private input", () => {
    const valid = {
      type: CHATTEX_START_COMPILER_JOB,
      payload: {
        title: "Title",
        url: "https://chatgpt.com/c/test",
        messageCount: 1,
        exportedAtIso: "2026-07-31T00:00:00.000Z",
        latexSource: "\\begin{document}x\\end{document}",
        files: [],
        failures: [],
        outputKinds: ["pdf"],
      },
    };

    expect(isStartCompilerJobRequest(valid)).toBe(true);
    expect(
      isStartCompilerJobRequest({
        ...valid,
        payload: { ...valid.payload, latexSource: undefined },
      }),
    ).toBe(false);
  });

  it("validates job IDs for cancellation", () => {
    expect(
      isCancelCompilerJobRequest({
        type: CHATTEX_CANCEL_COMPILER_JOB,
        jobId: "job-1",
      }),
    ).toBe(true);
    expect(
      isCancelCompilerJobRequest({
        type: CHATTEX_CANCEL_COMPILER_JOB,
        jobId: "",
      }),
    ).toBe(false);
  });

  it("rejects malformed internal download records", () => {
    expect(
      isRecordCompilerJobDownloadsRequest({
        type: CHATTEX_RECORD_COMPILER_JOB_DOWNLOADS,
        jobId: "job-1",
        downloads: [
          { filename: "a.pdf", downloadId: 1, error: null },
        ],
      }),
    ).toBe(true);
    expect(
      isRecordCompilerJobDownloadsRequest({
        type: CHATTEX_RECORD_COMPILER_JOB_DOWNLOADS,
        jobId: "job-1",
        downloads: [{ filename: "a.pdf", downloadId: "bad" }],
      }),
    ).toBe(false);
  });

  it("distinguishes public commands from background-targeted commands", () => {
    expect(
      isCompilerOffscreenTargetedMessage({
        type: CHATTEX_CANCEL_COMPILER_JOB,
        jobId: "job-1",
      }),
    ).toBe(false);
    expect(
      isCompilerOffscreenTargetedMessage({
        type: CHATTEX_CANCEL_COMPILER_JOB,
        jobId: "job-1",
        target: CHATTEX_COMPILER_OFFSCREEN_TARGET,
      }),
    ).toBe(true);
    expect(
      isCompilerOffscreenTargetedMessage({
        target: "another-target",
      }),
    ).toBe(false);
  });

  it("validates internal compiler storage operations", () => {
    expect(
      isCompilerStorageRequest({
        type: CHATTEX_COMPILER_STORAGE,
        area: "session",
        operation: "get",
        key: "snapshot",
      }),
    ).toBe(true);
    expect(
      isCompilerStorageRequest({
        type: CHATTEX_COMPILER_STORAGE,
        area: "local",
        operation: "set",
        items: { metadata: { schemaVersion: 1 } },
      }),
    ).toBe(true);
    expect(
      isCompilerStorageRequest({
        type: CHATTEX_COMPILER_STORAGE,
        area: "sync",
        operation: "get",
        key: "snapshot",
      }),
    ).toBe(false);
    expect(
      isCompilerStorageRequest({
        type: CHATTEX_COMPILER_STORAGE,
        area: "local",
        operation: "set",
      }),
    ).toBe(false);
  });
});
