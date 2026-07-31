import { base64ToBytes } from "@/src/shared/base64";

import type { CompilerAssetCache } from "./compiler-asset-cache";
import type { CompilerCacheStatus } from "./compiler-asset-cache";
import type { CompilerJobStore } from "./compiler-job-store";
import {
  isTerminalCompilerJobPhase,
  type CompilerJobArtifactPayload,
  type CompilerJobDiagnostics,
  type CompilerJobSnapshot,
  type StartCompilerJobPayload,
} from "./compiler-job-types";
import type { LatexCompiler } from "./latex-compiler";
import type { CompilerProgress } from "./on-demand-busytex-engine";
import { readCompileLog } from "./compile-diagnostics";
import type {
  DownloadArtifactDescriptor,
  PrepareDownloadResult,
  StartedDownload,
} from "../export/download-types";
import { applyCompileOmissions } from "../export/compile-omissions";

const RETAIN_PRIVATE_DATA_MS = 10 * 60 * 1000;

interface RetainedJob {
  snapshot: CompilerJobSnapshot;
  payload: StartCompilerJobPayload | null;
  pdf: Uint8Array | null;
  compileLog: string;
  controller: AbortController;
  artifacts: DownloadArtifactDescriptor[];
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

export interface CompilerJobCoordinatorDependencies {
  store: CompilerJobStore;
  cache: CompilerAssetCache;
  createCompiler(
    onProgress: (progress: CompilerProgress) => Promise<void>,
  ): LatexCompiler;
  prepareArtifacts(
    payload: CompilerJobArtifactPayload,
    signal: AbortSignal,
  ): Promise<PrepareDownloadResult>;
  notify?(snapshot: CompilerJobSnapshot): Promise<void> | void;
  randomUUID?: () => string;
  now?: () => number;
  revokeObjectUrl?: (url: string) => void;
  retentionMs?: number;
}

export class CompilerJobCoordinator {
  private readonly store: CompilerJobStore;
  private readonly cache: CompilerAssetCache;
  private readonly createCompiler: CompilerJobCoordinatorDependencies["createCompiler"];
  private compiler: LatexCompiler;
  private compilerTerminated = false;
  private readonly prepareArtifactPayload: CompilerJobCoordinatorDependencies["prepareArtifacts"];
  private readonly notify: NonNullable<
    CompilerJobCoordinatorDependencies["notify"]
  >;
  private readonly randomUUID: () => string;
  private readonly now: () => number;
  private readonly revokeObjectUrl: (url: string) => void;
  private readonly retentionMs: number;
  private readonly ready: Promise<void>;
  private retained: RetainedJob | null = null;
  private progressQueue: Promise<void> = Promise.resolve();

  constructor(dependencies: CompilerJobCoordinatorDependencies) {
    this.store = dependencies.store;
    this.cache = dependencies.cache;
    this.createCompiler = dependencies.createCompiler;
    this.prepareArtifactPayload = dependencies.prepareArtifacts;
    this.notify = dependencies.notify ?? (() => undefined);
    this.randomUUID =
      dependencies.randomUUID ?? (() => crypto.randomUUID());
    this.now = dependencies.now ?? Date.now;
    this.revokeObjectUrl =
      dependencies.revokeObjectUrl ?? URL.revokeObjectURL;
    this.retentionMs =
      dependencies.retentionMs ?? RETAIN_PRIVATE_DATA_MS;
    this.compiler = this.createCompilerInstance();
    this.ready = this.store
      .recoverInterrupted(this.now())
      .then(() => undefined);
  }

  async start(
    payload: StartCompilerJobPayload,
  ): Promise<CompilerJobSnapshot> {
    await this.ready;
    const existing = await this.get();
    if (existing && !isTerminalCompilerJobPhase(existing.phase)) {
      throw new Error(
        "Another Chat2TeX export is already running.",
      );
    }
    this.releasePrivateData();
    if (this.compilerTerminated) {
      this.compiler = this.createCompilerInstance();
      this.compilerTerminated = false;
    }

    const startedAt = this.now();
    const snapshot: CompilerJobSnapshot = {
      jobId: this.randomUUID(),
      phase: "preparing",
      title: payload.title,
      messageCount: payload.messageCount,
      assetCount: payload.files.length,
      outputKinds: [...payload.outputKinds],
      progress: null,
      error: null,
      pdfByteLength: null,
      omittedFiles: [],
      downloadedFiles: [],
      startedAt,
      updatedAt: startedAt,
    };
    this.retained = {
      snapshot,
      payload: structuredClone(payload),
      pdf: null,
      compileLog: "",
      controller: new AbortController(),
      artifacts: [],
      cleanupTimer: null,
    };
    await this.persist(snapshot);
    void this.runJob(snapshot.jobId).catch(() => undefined);
    return structuredClone(snapshot);
  }

  async get(jobId?: string): Promise<CompilerJobSnapshot | null> {
    await this.ready;
    const snapshot =
      this.retained?.snapshot ?? (await this.store.read());
    if (!snapshot || (jobId && snapshot.jobId !== jobId)) {
      return null;
    }
    return structuredClone(snapshot);
  }

  async diagnostics(jobId: string): Promise<CompilerJobDiagnostics> {
    await this.ready;
    const snapshot = await this.requireSnapshot(jobId);
    return {
      jobId,
      error: snapshot.error,
      compileLog:
        this.retained?.snapshot.jobId === jobId
          ? this.retained.compileLog
          : "",
      omittedFiles: [...snapshot.omittedFiles],
    };
  }

  async cancel(jobId: string): Promise<CompilerJobSnapshot> {
    await this.ready;
    const retained = this.requireRetained(jobId);
    if (isTerminalCompilerJobPhase(retained.snapshot.phase)) {
      return structuredClone(retained.snapshot);
    }
    retained.controller.abort(
      new DOMException("The export was cancelled.", "AbortError"),
    );
    this.compiler.terminate();
    this.compilerTerminated = true;
    const cancelled = await this.transition(jobId, {
      phase: "cancelled",
      progress: null,
      error: null,
    });
    this.releasePrivateData(jobId);
    return cancelled;
  }

  async prepareArtifacts(
    jobId: string,
  ): Promise<PrepareDownloadResult> {
    await this.ready;
    const retained = this.requireRetained(jobId);
    if (retained.snapshot.phase !== "completed" || !retained.payload) {
      throw new Error(
        "Private export data is no longer available for this job.",
      );
    }
    if (retained.cleanupTimer) {
      clearTimeout(retained.cleanupTimer);
      retained.cleanupTimer = null;
    }
    await this.transition(jobId, {
      phase: "packaging",
      progress: null,
    });
    const payload: CompilerJobArtifactPayload = {
      title: retained.payload.title,
      url: retained.payload.url,
      exportedAtIso: retained.payload.exportedAtIso,
      latexSource: retained.payload.latexSource,
      ...(retained.pdf ? { pdfBytes: retained.pdf } : {}),
      files: retained.payload.files,
      failures: retained.payload.failures,
      outputKinds: retained.payload.outputKinds,
    };
    let result: PrepareDownloadResult;
    try {
      result = await this.prepareArtifactPayload(
        payload,
        retained.controller.signal,
      );
    } catch (error) {
      await this.transition(jobId, {
        phase: "completed",
        error:
          error instanceof Error
            ? error.message
            : "Unable to package export files.",
      });
      this.schedulePrivateDataCleanup(retained);
      throw error;
    }
    if (!result.ok) {
      await this.transition(jobId, {
        phase: "completed",
        error: result.error,
      });
      this.schedulePrivateDataCleanup(retained);
      return result;
    }
    retained.artifacts = result.artifacts;
    await this.transition(jobId, {
      phase: "downloading-output",
      error: null,
    });
    this.schedulePrivateDataCleanup(retained);
    return result;
  }

  async recordDownloads(
    jobId: string,
    downloads: StartedDownload[],
  ): Promise<CompilerJobSnapshot> {
    await this.ready;
    const retained = this.requireRetained(jobId);
    const successful = downloads
      .filter((download) => download.error === null)
      .map((download) => download.filename);
    const failed = downloads.filter(
      (download) => download.error !== null,
    );
    const snapshot = await this.transition(jobId, {
      phase: "completed",
      downloadedFiles: successful,
      error:
        failed.length > 0
          ? `${failed.length} file downloads failed.`
          : null,
    });
    if (
      failed.length === 0 &&
      downloads.length === retained.artifacts.length
    ) {
      this.releasePrivateData(jobId);
    } else {
      this.revokeArtifacts(retained);
    }
    return snapshot;
  }

  cacheStatus(): Promise<CompilerCacheStatus> {
    return this.cache.status();
  }

  async clearCache(): Promise<CompilerCacheStatus> {
    await this.ready;
    const snapshot = await this.get();
    if (snapshot && !isTerminalCompilerJobPhase(snapshot.phase)) {
      throw new Error(
        "Cannot clear compiler cache while an export is running.",
      );
    }
    this.compiler.terminate();
    this.compilerTerminated = true;
    await this.cache.clearAll();
    return this.cache.status();
  }

  async reportProgress(
    progress: CompilerProgress,
  ): Promise<void> {
    this.progressQueue = this.progressQueue.then(async () => {
      const retained = this.retained;
      if (
        !retained ||
        isTerminalCompilerJobPhase(retained.snapshot.phase)
      ) {
        return;
      }
      await this.transition(retained.snapshot.jobId, {
        phase: progress.phase,
        progress,
      });
    });
    return this.progressQueue;
  }

  private async runJob(jobId: string): Promise<void> {
    const retained = this.requireRetained(jobId);
    try {
      if (retained.payload?.outputKinds.includes("pdf")) {
        const result = await this.compiler.compile(
          {
            source: retained.payload.latexSource,
            files: retained.payload.files.map((file) => ({
              path: file.outputPath,
              content: base64ToBytes(file.base64),
            })),
          },
          retained.controller.signal,
        );
        await this.progressQueue;
        if (retained.snapshot.phase === "cancelled") {
          return;
        }
        retained.pdf = result.pdf;
        retained.compileLog = result.log;
        const processedAssets = applyCompileOmissions(
          {
            title: retained.payload.title,
            url: retained.payload.url,
            messageCount: retained.payload.messageCount,
            latexSource: retained.payload.latexSource,
            assets: [],
          },
          {
            files: retained.payload.files,
            failures: retained.payload.failures,
          },
          result.omittedFiles,
        );
        retained.payload.files = processedAssets.files;
        retained.payload.failures = processedAssets.failures;
        await this.transition(jobId, {
          phase: "completed",
          progress: null,
          pdfByteLength: result.pdf.byteLength,
          omittedFiles: [...result.omittedFiles],
          error: null,
        });
      } else {
        await this.transition(jobId, {
          phase: "completed",
          progress: null,
          pdfByteLength: null,
          error: null,
        });
      }
      this.schedulePrivateDataCleanup(retained);
    } catch (error) {
      if (
        retained.snapshot.phase === "cancelled" ||
        retained.controller.signal.aborted
      ) {
        if (retained.snapshot.phase !== "cancelled") {
          await this.transition(jobId, {
            phase: "cancelled",
            progress: null,
            error: null,
          });
        }
        this.releasePrivateData(jobId);
        return;
      }
      retained.compileLog = readCompileLog(error);
      await this.transition(jobId, {
        phase: "failed",
        progress: null,
        error:
          error instanceof Error
            ? error.message
            : "The compiler job failed.",
      });
      this.schedulePrivateDataCleanup(retained);
    }
  }

  private async transition(
    jobId: string,
    patch: Partial<CompilerJobSnapshot>,
  ): Promise<CompilerJobSnapshot> {
    const retained = this.requireRetained(jobId);
    retained.snapshot = {
      ...retained.snapshot,
      ...patch,
      jobId,
      updatedAt: this.now(),
    };
    await this.persist(retained.snapshot);
    return structuredClone(retained.snapshot);
  }

  private async persist(
    snapshot: CompilerJobSnapshot,
  ): Promise<void> {
    await this.store.write(snapshot);
    if (isTerminalCompilerJobPhase(snapshot.phase)) {
      await this.store.clearRecoveryMarker();
    } else {
      await this.store.writeRecoveryMarker(snapshot);
    }
    await Promise.resolve(this.notify(structuredClone(snapshot))).catch(
      () => undefined,
    );
  }

  private async requireSnapshot(
    jobId: string,
  ): Promise<CompilerJobSnapshot> {
    const snapshot = await this.get(jobId);
    if (!snapshot) {
      throw new Error(`Compiler job ${jobId} was not found.`);
    }
    return snapshot;
  }

  private requireRetained(jobId: string): RetainedJob {
    if (!this.retained || this.retained.snapshot.jobId !== jobId) {
      throw new Error(
        "Private export data is no longer available for this job.",
      );
    }
    return this.retained;
  }

  private schedulePrivateDataCleanup(retained: RetainedJob): void {
    if (retained.cleanupTimer) {
      clearTimeout(retained.cleanupTimer);
    }
    retained.cleanupTimer = setTimeout(() => {
      this.releasePrivateData(retained.snapshot.jobId);
    }, this.retentionMs);
  }

  private releasePrivateData(jobId?: string): void {
    const retained = this.retained;
    if (!retained || (jobId && retained.snapshot.jobId !== jobId)) {
      return;
    }
    if (retained.cleanupTimer) {
      clearTimeout(retained.cleanupTimer);
    }
    this.revokeArtifacts(retained);
    retained.controller.abort(
      new DOMException(
        "Private compiler job data was released.",
        "AbortError",
      ),
    );
    retained.payload = null;
    retained.pdf = null;
    retained.compileLog = "";
  }

  private revokeArtifacts(retained: RetainedJob): void {
    for (const artifact of retained.artifacts) {
      this.revokeObjectUrl(artifact.objectUrl);
    }
    retained.artifacts = [];
  }

  private createCompilerInstance(): LatexCompiler {
    return this.createCompiler((progress) =>
      this.reportProgress(progress),
    );
  }
}
