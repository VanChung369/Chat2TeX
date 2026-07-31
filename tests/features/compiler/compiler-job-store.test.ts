import { describe, expect, it, vi } from "vitest";

import {
  CompilerJobStore,
  type StorageAreaLike,
} from "@/src/features/compiler/compiler-job-store";

import type {
  CompilerJobRecoveryMarker,
  CompilerJobSnapshot,
} from "@/src/features/compiler/compiler-job-types";

function activeSnapshot(): CompilerJobSnapshot {
  return {
    jobId: "job-1",
    phase: "compiling",
    title: "Private conversation",
    messageCount: 2,
    assetCount: 1,
    outputKinds: ["pdf"],
    progress: null,
    error: null,
    pdfByteLength: null,
    omittedFiles: [],
    downloadedFiles: [],
    startedAt: 1,
    updatedAt: 2,
  };
}

function createStorageArea(): StorageAreaLike & {
  values: Record<string, unknown>;
} {
  const values: Record<string, unknown> = {};
  return {
    values,
    get: vi.fn(async (key: string) => ({ [key]: values[key] })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(values, structuredClone(items));
    }),
    remove: vi.fn(async (key: string) => {
      delete values[key];
    }),
    setAccessLevel: vi.fn().mockResolvedValue(undefined),
  };
}

describe("CompilerJobStore", () => {
  it("never persists source or binary payloads", async () => {
    const storageSession = createStorageArea();
    const storageLocal = createStorageArea();
    const store = new CompilerJobStore(storageSession, storageLocal);

    await store.write(activeSnapshot());

    const serialized = JSON.stringify(
      vi.mocked(storageSession.set).mock.calls[0]?.[0],
    );
    expect(serialized).not.toContain("latexSource");
    expect(serialized).not.toContain("pdfBase64");
    expect(serialized).not.toContain('"files"');
    expect(serialized).not.toContain("https://chatgpt.com");
    expect(storageSession.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: "TRUSTED_CONTEXTS",
    });
  });

  it("persists no conversation metadata in the restart marker", async () => {
    const storageSession = createStorageArea();
    const storageLocal = createStorageArea();
    const store = new CompilerJobStore(storageSession, storageLocal);
    const snapshot = activeSnapshot();

    await store.writeRecoveryMarker(snapshot);

    const serialized = JSON.stringify(
      vi.mocked(storageLocal.set).mock.calls[0]?.[0],
    );
    expect(serialized).toContain("job-1");
    expect(serialized).not.toContain("Private conversation");
    expect(serialized).not.toContain("https://chatgpt.com");
    expect(serialized).not.toContain("latexSource");
    expect(storageLocal.setAccessLevel).toHaveBeenCalledWith({
      accessLevel: "TRUSTED_CONTEXTS",
    });
  });

  it("turns a stale nonterminal session snapshot into a failed job", async () => {
    const storageSession = createStorageArea();
    const storageLocal = createStorageArea();
    const store = new CompilerJobStore(storageSession, storageLocal);
    await store.write(activeSnapshot());
    await store.writeRecoveryMarker(activeSnapshot());

    const recovered = await store.recoverInterrupted(100);

    expect(recovered).toMatchObject({
      jobId: "job-1",
      phase: "failed",
      error: "Previous export was interrupted.",
      updatedAt: 100,
    });
    await expect(store.readRecoveryMarker()).resolves.toBeNull();
  });

  it("recovers a text-free local marker when session storage is empty", async () => {
    const storageSession = createStorageArea();
    const storageLocal = createStorageArea();
    const store = new CompilerJobStore(storageSession, storageLocal);
    const marker: CompilerJobRecoveryMarker = {
      schemaVersion: 1,
      jobId: "job-restart",
      phase: "downloading-compiler",
      startedAt: 10,
      updatedAt: 20,
    };
    storageLocal.values["chat2tex.compiler-job.recovery.v1"] = marker;

    const recovered = await store.recoverInterrupted(30);

    expect(recovered).toEqual({
      jobId: "job-restart",
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
      startedAt: 10,
      updatedAt: 30,
    });
  });
});
