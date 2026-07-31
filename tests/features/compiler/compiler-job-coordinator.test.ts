import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompilerJobCoordinator } from "@/src/features/compiler/compiler-job-coordinator";

import type { CompilerAssetCache } from "@/src/features/compiler/compiler-asset-cache";
import type { CompilerJobStore } from "@/src/features/compiler/compiler-job-store";
import type {
  CompilerJobSnapshot,
  StartCompilerJobPayload,
} from "@/src/features/compiler/compiler-job-types";
import type { LatexCompiler } from "@/src/features/compiler/latex-compiler";

function payload(
  outputKinds: StartCompilerJobPayload["outputKinds"] = ["pdf"],
): StartCompilerJobPayload {
  return {
    title: "Private title",
    url: "https://chatgpt.com/c/private",
    messageCount: 2,
    exportedAtIso: "2026-07-31T00:00:00.000Z",
    latexSource: "\\documentclass{article}\\begin{document}Secret\\end{document}",
    files: [
      {
        id: "image-1",
        outputPath: "assets/image-1.png",
        mimeType: "image/png",
        base64: "AQID",
        byteLength: 3,
        width: 1,
        height: 1,
      },
    ],
    failures: [],
    outputKinds,
  };
}

function createHarness() {
  let snapshot: CompilerJobSnapshot | null = null;
  let progressHandler:
    | Parameters<
        ConstructorParameters<typeof CompilerJobCoordinator>[0]["createCompiler"]
      >[0]
    | null = null;
  const store = {
    recoverInterrupted: vi.fn().mockResolvedValue(null),
    read: vi.fn(async () => snapshot),
    write: vi.fn(async (value: CompilerJobSnapshot) => {
      snapshot = structuredClone(value);
    }),
    writeRecoveryMarker: vi.fn().mockResolvedValue(undefined),
    clearRecoveryMarker: vi.fn().mockResolvedValue(undefined),
  };
  const compiler = {
    compile: vi.fn().mockResolvedValue({
      pdf: new Uint8Array([37, 80, 68, 70, 45]),
      log: "compile log",
      omittedFiles: [],
    }),
    terminate: vi.fn(),
  };
  const cache = {
    status: vi.fn().mockResolvedValue({
      compilerVersion: "v1",
      coreBytes: 1,
      packageBytes: 2,
      totalBytes: 3,
      packageCount: 1,
      quotaBytes: null,
      usageBytes: null,
      persisted: true,
    }),
    clearAll: vi.fn().mockResolvedValue(undefined),
  };
  const prepareArtifacts = vi.fn().mockResolvedValue({
    ok: true,
    artifacts: [
      {
        kind: "pdf",
        filename: "private.pdf",
        mimeType: "application/pdf",
        objectUrl: "blob:private",
        byteLength: 5,
      },
    ],
  });
  const notify = vi.fn().mockResolvedValue(undefined);
  const revokeObjectUrl = vi.fn();
  let now = 100;
  const coordinator = new CompilerJobCoordinator({
    store: store as unknown as CompilerJobStore,
    cache: cache as unknown as CompilerAssetCache,
    createCompiler(handler) {
      progressHandler = handler;
      return compiler as unknown as LatexCompiler;
    },
    prepareArtifacts,
    notify,
    randomUUID: () => "job-1",
    now: () => now++,
    revokeObjectUrl,
  });

  return {
    cache,
    compiler,
    coordinator,
    get progressHandler() {
      return progressHandler;
    },
    notify,
    prepareArtifacts,
    revokeObjectUrl,
    store,
  };
}

async function waitForPhase(
  coordinator: CompilerJobCoordinator,
  phase: CompilerJobSnapshot["phase"],
): Promise<CompilerJobSnapshot> {
  let result: CompilerJobSnapshot | null = null;
  await vi.waitFor(async () => {
    result = await coordinator.get();
    expect(result?.phase).toBe(phase);
  });
  return result!;
}

describe("CompilerJobCoordinator", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("starts in the background and completes without a popup connection", async () => {
    const { compiler, coordinator, notify } = createHarness();

    const started = await coordinator.start(payload());
    const completed = await waitForPhase(coordinator, "completed");

    expect(started).toMatchObject({
      jobId: "job-1",
      phase: "preparing",
      title: "Private title",
    });
    expect(compiler.compile).toHaveBeenCalledOnce();
    expect(completed.pdfByteLength).toBe(5);
    expect(notify).toHaveBeenCalledWith(completed);
  });

  it("rejects a second job while the first is active", async () => {
    const { compiler, coordinator } = createHarness();
    let finish!: (value: {
      pdf: Uint8Array;
      log: string;
      omittedFiles: string[];
    }) => void;
    compiler.compile.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    await coordinator.start(payload());

    await expect(coordinator.start(payload())).rejects.toThrow(
      "Another Chat2TeX export is already running.",
    );
    finish({ pdf: new Uint8Array([37, 80, 68, 70, 45]), log: "", omittedFiles: [] });
    await waitForPhase(coordinator, "completed");
  });

  it("persists compiler progress and emits job updates", async () => {
    const { compiler, coordinator, notify, progressHandler } =
      createHarness();
    let finish!: (value: {
      pdf: Uint8Array;
      log: string;
      omittedFiles: string[];
    }) => void;
    compiler.compile.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await coordinator.start(payload());

    await progressHandler?.({
      phase: "downloading-packages",
      current: 1,
      total: 2,
      label: "xcolor.sty",
    });

    expect(await coordinator.get()).toMatchObject({
      phase: "downloading-packages",
      progress: {
        phase: "downloading-packages",
        label: "xcolor.sty",
      },
    });
    expect(notify).toHaveBeenCalled();
    finish({ pdf: new Uint8Array([37, 80, 68, 70, 45]), log: "", omittedFiles: [] });
    await waitForPhase(coordinator, "completed");
  });

  it("skips compiler initialization for TEX/source-only jobs", async () => {
    const { compiler, coordinator } = createHarness();

    await coordinator.start(payload(["tex", "source"]));
    const completed = await waitForPhase(coordinator, "completed");

    expect(compiler.compile).not.toHaveBeenCalled();
    expect(completed.pdfByteLength).toBeNull();
  });

  it("cancels an active job and terminates its sandbox", async () => {
    const { compiler, coordinator } = createHarness();
    compiler.compile.mockImplementation(
      async (_project, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    await coordinator.start(payload());

    const cancelled = await coordinator.cancel("job-1");

    expect(cancelled.phase).toBe("cancelled");
    expect(compiler.terminate).toHaveBeenCalledOnce();
    await waitForPhase(coordinator, "cancelled");
  });

  it("keeps diagnostics in memory and never sends them to the store", async () => {
    const { coordinator, store } = createHarness();
    await coordinator.start(payload());
    await waitForPhase(coordinator, "completed");

    await expect(coordinator.diagnostics("job-1")).resolves.toEqual({
      jobId: "job-1",
      error: null,
      compileLog: "compile log",
      omittedFiles: [],
    });
    expect(JSON.stringify(store.write.mock.calls)).not.toContain(
      "compile log",
    );
  });

  it("rejects cache clearing while active and clears it after completion", async () => {
    const { cache, compiler, coordinator } = createHarness();
    let finish!: (value: {
      pdf: Uint8Array;
      log: string;
      omittedFiles: string[];
    }) => void;
    compiler.compile.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await coordinator.start(payload());

    await expect(coordinator.clearCache()).rejects.toThrow(
      "Cannot clear compiler cache while an export is running.",
    );
    finish({ pdf: new Uint8Array([37, 80, 68, 70, 45]), log: "", omittedFiles: [] });
    await waitForPhase(coordinator, "completed");

    await coordinator.clearCache();

    expect(compiler.terminate).toHaveBeenCalledOnce();
    expect(cache.clearAll).toHaveBeenCalledOnce();
  });

  it("prepares artifacts and releases retained private data after successful downloads", async () => {
    const {
      coordinator,
      prepareArtifacts,
      revokeObjectUrl,
    } = createHarness();
    await coordinator.start(payload());
    await waitForPhase(coordinator, "completed");

    await expect(coordinator.prepareArtifacts("job-1")).resolves.toMatchObject({
      ok: true,
    });
    expect(prepareArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        latexSource: expect.stringContaining("Secret"),
        pdfBytes: new Uint8Array([37, 80, 68, 70, 45]),
        outputKinds: ["pdf"],
      }),
      expect.any(AbortSignal),
    );

    await coordinator.recordDownloads("job-1", [
      { filename: "private.pdf", downloadId: 1, error: null },
    ]);

    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:private");
    await expect(
      coordinator.prepareArtifacts("job-1"),
    ).rejects.toThrow("no longer available");
    await expect(coordinator.diagnostics("job-1")).resolves.toMatchObject({
      compileLog: "",
    });
  });

  it("removes compiler-rejected images before building source artifacts", async () => {
    const { compiler, coordinator, prepareArtifacts } = createHarness();
    compiler.compile.mockResolvedValueOnce({
      pdf: new Uint8Array([37, 80, 68, 70, 45]),
      log: "fallback compile log",
      omittedFiles: ["assets/image-1.png"],
    });

    await coordinator.start(payload(["pdf", "source"]));
    await waitForPhase(coordinator, "completed");
    await coordinator.prepareArtifacts("job-1");

    expect(prepareArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [],
        failures: [
          expect.objectContaining({
            id: "image-1",
            code: "compiler-rejected",
          }),
        ],
      }),
      expect.any(AbortSignal),
    );
  });
});
