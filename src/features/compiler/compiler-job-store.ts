import { browser } from "wxt/browser";

import {
  isTerminalCompilerJobPhase,
  type CompilerJobPhase,
  type CompilerJobRecoveryMarker,
  type CompilerJobSnapshot,
} from "./compiler-job-types";
import type { OutputKind } from "../export/output-plan";

const SNAPSHOT_KEY = "chat2tex.compiler-job.snapshot.v1";
const RECOVERY_KEY = "chat2tex.compiler-job.recovery.v1";

export interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
  setAccessLevel?(options: {
    accessLevel: "TRUSTED_CONTEXTS";
  }): Promise<void>;
}

export class CompilerJobStore {
  private sessionAccessPromise: Promise<void> | null = null;
  private localAccessPromise: Promise<void> | null = null;

  constructor(
    private readonly storageSession: StorageAreaLike = browser.storage
      .session as StorageAreaLike,
    private readonly storageLocal: StorageAreaLike = browser.storage
      .local as StorageAreaLike,
  ) {}

  async read(): Promise<CompilerJobSnapshot | null> {
    await this.restrictSessionAccess();
    const value = (await this.storageSession.get(SNAPSHOT_KEY))[
      SNAPSHOT_KEY
    ];
    return isCompilerJobSnapshot(value)
      ? structuredClone(value)
      : null;
  }

  async write(snapshot: CompilerJobSnapshot): Promise<void> {
    await this.restrictSessionAccess();
    await this.storageSession.set({
      [SNAPSHOT_KEY]: sanitizeSnapshot(snapshot),
    });
  }

  async writeRecoveryMarker(
    snapshot: CompilerJobSnapshot,
  ): Promise<void> {
    await this.restrictLocalAccess();
    const marker: CompilerJobRecoveryMarker = {
      schemaVersion: 1,
      jobId: snapshot.jobId,
      phase: snapshot.phase,
      startedAt: snapshot.startedAt,
      updatedAt: snapshot.updatedAt,
    };
    await this.storageLocal.set({ [RECOVERY_KEY]: marker });
  }

  async readRecoveryMarker(): Promise<CompilerJobRecoveryMarker | null> {
    await this.restrictLocalAccess();
    const value = (await this.storageLocal.get(RECOVERY_KEY))[
      RECOVERY_KEY
    ];
    return isRecoveryMarker(value) ? structuredClone(value) : null;
  }

  async clearRecoveryMarker(): Promise<void> {
    await this.restrictLocalAccess();
    await this.storageLocal.remove(RECOVERY_KEY);
  }

  async recoverInterrupted(
    now = Date.now(),
  ): Promise<CompilerJobSnapshot | null> {
    const [snapshot, marker] = await Promise.all([
      this.read(),
      this.readRecoveryMarker(),
    ]);

    if (snapshot) {
      if (!isTerminalCompilerJobPhase(snapshot.phase)) {
        const failed: CompilerJobSnapshot = {
          ...snapshot,
          phase: "failed",
          progress: null,
          error: "Previous export was interrupted.",
          updatedAt: now,
        };
        await this.write(failed);
        await this.clearRecoveryMarker();
        return failed;
      }
      if (marker) {
        await this.clearRecoveryMarker();
      }
      return snapshot;
    }

    if (marker && !isTerminalCompilerJobPhase(marker.phase)) {
      const failed: CompilerJobSnapshot = {
        jobId: marker.jobId,
        phase: "failed",
        title: "Interrupted export",
        messageCount: 0,
        assetCount: 0,
        outputKinds: [],
        progress: null,
        error: "Previous export was interrupted.",
        pdfByteLength: null,
        omittedFiles: [],
        downloadedFiles: [],
        startedAt: marker.startedAt,
        updatedAt: now,
      };
      await this.write(failed);
      await this.clearRecoveryMarker();
      return failed;
    }

    if (marker) {
      await this.clearRecoveryMarker();
    }
    return null;
  }

  private restrictSessionAccess(): Promise<void> {
    this.sessionAccessPromise ??= this.storageSession.setAccessLevel
      ? this.storageSession.setAccessLevel({
          accessLevel: "TRUSTED_CONTEXTS",
        })
      : Promise.resolve();
    return this.sessionAccessPromise;
  }

  private restrictLocalAccess(): Promise<void> {
    this.localAccessPromise ??= this.storageLocal.setAccessLevel
      ? this.storageLocal.setAccessLevel({
          accessLevel: "TRUSTED_CONTEXTS",
        })
      : Promise.resolve();
    return this.localAccessPromise;
  }
}

function sanitizeSnapshot(
  snapshot: CompilerJobSnapshot,
): CompilerJobSnapshot {
  return {
    jobId: snapshot.jobId,
    phase: snapshot.phase,
    title: snapshot.title,
    messageCount: snapshot.messageCount,
    assetCount: snapshot.assetCount,
    outputKinds: [...snapshot.outputKinds],
    progress: snapshot.progress
      ? structuredClone(snapshot.progress)
      : null,
    error: snapshot.error,
    pdfByteLength: snapshot.pdfByteLength,
    omittedFiles: [...snapshot.omittedFiles],
    downloadedFiles: [...snapshot.downloadedFiles],
    startedAt: snapshot.startedAt,
    updatedAt: snapshot.updatedAt,
  };
}

function isCompilerJobSnapshot(
  value: unknown,
): value is CompilerJobSnapshot {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.jobId === "string" &&
    isCompilerJobPhase(value.phase) &&
    typeof value.title === "string" &&
    typeof value.messageCount === "number" &&
    typeof value.assetCount === "number" &&
    isOutputKinds(value.outputKinds) &&
    (value.progress === null || isRecord(value.progress)) &&
    (value.error === null || typeof value.error === "string") &&
    (value.pdfByteLength === null ||
      typeof value.pdfByteLength === "number") &&
    isStringArray(value.omittedFiles) &&
    isStringArray(value.downloadedFiles) &&
    typeof value.startedAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

function isRecoveryMarker(
  value: unknown,
): value is CompilerJobRecoveryMarker {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.jobId === "string" &&
    isCompilerJobPhase(value.phase) &&
    typeof value.startedAt === "number" &&
    typeof value.updatedAt === "number"
  );
}

function isCompilerJobPhase(value: unknown): value is CompilerJobPhase {
  return (
    typeof value === "string" &&
    [
      "preparing",
      "downloading-compiler",
      "downloading-packages",
      "initializing",
      "compiling",
      "packaging",
      "downloading-output",
      "completed",
      "cancelled",
      "failed",
    ].includes(value)
  );
}

function isOutputKinds(value: unknown): value is OutputKind[] {
  return (
    Array.isArray(value) &&
    value.every(
      (kind) =>
        kind === "pdf" || kind === "tex" || kind === "source",
    )
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
