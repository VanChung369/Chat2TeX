import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_PACKAGE_DOWNLOAD_BYTES_PER_JOB,
  MAX_PACKAGE_PASSES,
} from "@/src/features/compiler/asset-manifest";
import { BusyTexCompileError } from "@/src/features/compiler/busytex-engine";
import {
  OnDemandBusyTexEngine,
  readFailureMessage,
  serializeProject,
  uniquePackageLookups,
} from "@/src/features/compiler/on-demand-busytex-engine";

import type { CompilerAssetCache } from "@/src/features/compiler/compiler-asset-cache";
import type { CompilerAssetFetcher } from "@/src/features/compiler/compiler-asset-fetcher";
import type { CoreAssetId } from "@/src/features/compiler/compiler-core-assets.generated";
import type { SandboxCompilerClient } from "@/src/features/compiler/sandbox-compiler-client";
import type { SandboxCompileResult } from "@/src/features/compiler/sandbox-protocol";

const PDF = new Uint8Array([37, 80, 68, 70, 45]);
const SUCCESS: SandboxCompileResult = {
  success: true,
  pdf: PDF.buffer,
  log: "Output written on main.pdf",
  exitCode: 0,
  packageLookups: [],
};

function coreAssets(): Record<CoreAssetId, Uint8Array> {
  return {
    "busytex-worker": new Uint8Array([1]),
    "busytex-pipeline": new Uint8Array([2]),
    "busytex-js": new Uint8Array([3]),
    "busytex-wasm": new Uint8Array([4]),
    "texlive-basic-js": new Uint8Array([5]),
    "texlive-basic-data": new Uint8Array([6]),
  };
}

function createHarness() {
  const client = {
    initialize: vi.fn().mockResolvedValue(undefined),
    compile: vi.fn().mockResolvedValue(SUCCESS),
    writeRemoteFiles: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn(),
    terminate: vi.fn(),
  };
  const cache = {
    status: vi.fn().mockResolvedValue({
      compilerVersion: "busytex-1.2.3-tl2026-chat2tex.1",
    }),
    getOrFetchCore: vi
      .fn()
      .mockImplementation(async (_asset, _fetcher, _signal, onProgress) => {
        onProgress?.(1, 1);
        return new Uint8Array([1]);
      }),
    readActiveCoreAssets: vi.fn().mockResolvedValue(coreAssets()),
    stageCompilerVersion: vi.fn().mockResolvedValue(undefined),
    activateStagedCompilerVersion: vi.fn().mockResolvedValue(undefined),
    discardStagedCompilerVersion: vi.fn().mockResolvedValue(undefined),
    getOrFetchPackage: vi.fn().mockResolvedValue(null),
  };
  const fetcher = {
    fetchCore: vi.fn(),
    fetchPackage: vi.fn(),
  };
  const progress = vi.fn();
  const engine = new OnDemandBusyTexEngine(
    client as unknown as SandboxCompilerClient,
    cache as unknown as CompilerAssetCache,
    fetcher as unknown as CompilerAssetFetcher,
    progress,
  );

  return { cache, client, engine, fetcher, progress };
}

function missing(
  name: string,
  format = 26 as const,
): SandboxCompileResult {
  return {
    success: false,
    log: `! LaTeX Error: File \`${name}' not found.`,
    exitCode: 1,
    packageLookups: [{ format, name }],
  };
}

describe("on-demand compiler helpers", () => {
  it("serializes a project without sharing mutable file buffers", () => {
    const bytes = new Uint8Array([0, 1, 2, 255]);

    const serialized = serializeProject({
      source: "\\documentclass{article}",
      files: [{ path: "image.bin", content: bytes }],
    });
    bytes.fill(9);

    expect(serialized).toEqual({
      source: "\\documentclass{article}",
      files: [{ path: "image.bin", base64: "AAEC/w==" }],
    });
  });

  it("deduplicates canonical package lookups in first-seen order", () => {
    expect(
      uniquePackageLookups([
        { format: 26, name: "xcolor.sty" },
        { format: 3, name: "article.cls" },
        { format: 26, name: "xcolor.sty" },
      ]),
    ).toEqual([
      { format: 26, name: "xcolor.sty" },
      { format: 3, name: "article.cls" },
    ]);
  });

  it("reports canonical missing filenames", () => {
    expect(readFailureMessage(missing("xcolor.sty"))).toContain(
      "xcolor.sty",
    );
  });
});

describe("OnDemandBusyTexEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads all six core assets once and reports byte progress", async () => {
    const { cache, client, engine, progress } = createHarness();

    await engine.initialize();
    await engine.initialize();

    expect(cache.getOrFetchCore).toHaveBeenCalledTimes(6);
    expect(client.initialize).toHaveBeenCalledOnce();
    expect(
      progress.mock.calls.some(
        ([event]) => event.phase === "downloading-compiler",
      ),
    ).toBe(true);
    expect(
      progress.mock.calls.some(
        ([event]) => event.phase === "initializing",
      ),
    ).toBe(true);
  });

  it("fetches a miss, writes it, and retries the same project", async () => {
    const { cache, client, engine } = createHarness();
    client.compile
      .mockResolvedValueOnce(missing("xcolor.sty"))
      .mockResolvedValueOnce(SUCCESS);
    cache.getOrFetchPackage.mockResolvedValue({
      content: new Uint8Array([1, 2]),
      source: "network",
    });
    const project = {
      source: "\\documentclass{article}",
      files: [],
    };

    const result = await engine.compile(project);

    expect(client.writeRemoteFiles).toHaveBeenCalledWith([
      {
        format: 26,
        name: "xcolor.sty",
        content: new Uint8Array([1, 2]),
      },
    ]);
    expect(client.compile).toHaveBeenNthCalledWith(
      1,
      serializeProject(project),
    );
    expect(client.compile).toHaveBeenNthCalledWith(
      2,
      serializeProject(project),
    );
    expect(result.pdf.slice(0, 5)).toEqual(PDF);
  });

  it("uses a cached package while offline", async () => {
    const { cache, client, engine, fetcher } = createHarness();
    client.compile
      .mockResolvedValueOnce(missing("offline.sty"))
      .mockResolvedValueOnce(SUCCESS);
    cache.getOrFetchPackage.mockResolvedValue({
      content: new Uint8Array([7]),
      source: "cache",
    });

    await expect(
      engine.compile({ source: "offline", files: [] }),
    ).resolves.toMatchObject({ pdf: PDF });

    expect(cache.getOrFetchPackage).toHaveBeenCalledWith(
      { format: 26, name: "offline.sty" },
      fetcher,
      undefined,
    );
  });

  it("deduplicates repeated lookups before fetching and writing", async () => {
    const { cache, client, engine } = createHarness();
    client.compile
      .mockResolvedValueOnce({
        ...missing("xcolor.sty"),
        packageLookups: [
          { format: 26, name: "xcolor.sty" },
          { format: 26, name: "xcolor.sty" },
        ],
      })
      .mockResolvedValueOnce(SUCCESS);
    cache.getOrFetchPackage.mockResolvedValue({
      content: new Uint8Array([1]),
      source: "cache",
    });

    await engine.compile({ source: "x", files: [] });

    expect(cache.getOrFetchPackage).toHaveBeenCalledOnce();
    expect(client.writeRemoteFiles).toHaveBeenCalledOnce();
  });

  it("returns a canonical package error after a cached 404", async () => {
    const { client, engine } = createHarness();
    client.compile.mockResolvedValue(missing("never-there.sty"));

    await expect(
      engine.compile({ source: "x", files: [] }),
    ).rejects.toMatchObject({
      name: "BusyTexCompileError",
      message: expect.stringContaining("never-there.sty"),
    });
    expect(client.compile).toHaveBeenCalledOnce();
  });

  it("stops after 32 resolution passes", async () => {
    const { cache, client, engine } = createHarness();
    client.compile.mockResolvedValue(missing("loop.sty"));
    cache.getOrFetchPackage.mockResolvedValue({
      content: new Uint8Array([1]),
      source: "cache",
    });

    await expect(
      engine.compile({ source: "x", files: [] }),
    ).rejects.toThrow(
      `Package resolution exceeded ${MAX_PACKAGE_PASSES} passes`,
    );
    expect(client.compile).toHaveBeenCalledTimes(MAX_PACKAGE_PASSES);
  });

  it("rejects more than 256 unique lookups in one pass", async () => {
    const { client, engine } = createHarness();
    client.compile.mockResolvedValue({
      ...missing("file-0.sty"),
      packageLookups: Array.from({ length: 257 }, (_, index) => ({
        format: 26 as const,
        name: `file-${index}.sty`,
      })),
    });

    await expect(
      engine.compile({ source: "x", files: [] }),
    ).rejects.toThrow("more than 256 files in one pass");
  });

  it("rejects more than 512 unique files in one job", async () => {
    const { cache, client, engine } = createHarness();
    client.compile
      .mockResolvedValueOnce({
        ...missing("first-0.sty"),
        packageLookups: Array.from({ length: 256 }, (_, index) => ({
          format: 26 as const,
          name: `first-${index}.sty`,
        })),
      })
      .mockResolvedValueOnce({
        ...missing("second-0.sty"),
        packageLookups: Array.from({ length: 256 }, (_, index) => ({
          format: 26 as const,
          name: `second-${index}.sty`,
        })),
      })
      .mockResolvedValueOnce(missing("overflow.sty"));
    cache.getOrFetchPackage.mockResolvedValue({
      content: new Uint8Array([1]),
      source: "cache",
    });

    await expect(
      engine.compile({ source: "x", files: [] }),
    ).rejects.toThrow("more than 512 files in one job");
  });

  it("limits newly downloaded package bytes but not cached bytes", async () => {
    const { cache, client, engine } = createHarness();
    client.compile.mockResolvedValue({
      ...missing("large-a.sty"),
      packageLookups: [
        { format: 26, name: "large-a.sty" },
        { format: 26, name: "large-b.sty" },
      ],
    });
    const large = {
      byteLength: MAX_PACKAGE_DOWNLOAD_BYTES_PER_JOB / 2 + 1,
    } as Uint8Array;
    cache.getOrFetchPackage.mockResolvedValue({
      content: large,
      source: "network",
    });

    await expect(
      engine.compile({ source: "x", files: [] }),
    ).rejects.toThrow("exceeded 160 MiB");
  });

  it("does not turn an ordinary XeTeX error into package retries", async () => {
    const { cache, client, engine } = createHarness();
    client.compile.mockResolvedValue({
      success: false,
      log: "! Undefined control sequence.\nl.1 \\\\bad",
      exitCode: 1,
      packageLookups: [],
    });

    await expect(
      engine.compile({ source: "\\bad", files: [] }),
    ).rejects.toBeInstanceOf(BusyTexCompileError);
    expect(cache.getOrFetchPackage).not.toHaveBeenCalled();
  });

  it("rejects a partial PDF with a fatal diagnostic", async () => {
    const { client, engine } = createHarness();
    client.compile.mockResolvedValue({
      ...SUCCESS,
      log: "! Undefined control sequence.\nl.1 \\\\bad",
    });

    await expect(
      engine.compile({ source: "\\bad", files: [] }),
    ).rejects.toMatchObject({
      name: "BusyTexCompileError",
      message: expect.stringContaining("Undefined control sequence"),
    });
  });

  it("honors an already-aborted job before initializing", async () => {
    const { cache, engine } = createHarness();
    const controller = new AbortController();
    controller.abort();

    await expect(
      engine.compile({ source: "x", files: [] }, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(cache.getOrFetchCore).not.toHaveBeenCalled();
  });

  it("does not roll back or retry an aborted staged download", async () => {
    const { cache, client, engine } = createHarness();
    const controller = new AbortController();
    cache.status.mockResolvedValue({ compilerVersion: "old-version" });
    cache.readActiveCoreAssets.mockResolvedValue(coreAssets());
    cache.getOrFetchCore.mockImplementationOnce(async () => {
      controller.abort();
      throw controller.signal.reason;
    });

    await expect(
      engine.initialize(controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(cache.discardStagedCompilerVersion).toHaveBeenCalledOnce();
    expect(client.restart).not.toHaveBeenCalled();
  });

  it("activates a staged compiler only after a PDF smoke compile", async () => {
    const { cache, client, engine } = createHarness();
    cache.status.mockResolvedValue({ compilerVersion: "old-version" });
    cache.readActiveCoreAssets.mockResolvedValue(coreAssets());

    await engine.initialize();

    expect(cache.stageCompilerVersion).toHaveBeenCalledWith(
      "busytex-1.2.3-tl2026-chat2tex.1",
    );
    expect(client.compile).toHaveBeenCalledWith(
      serializeProject({
        source:
          "\\documentclass{article}\\begin{document}Chat2TeX\\end{document}",
        files: [],
      }),
    );
    expect(cache.activateStagedCompilerVersion).toHaveBeenCalled();
  });

  it("discards a failed staged core and restores the previous active core", async () => {
    const { cache, client, engine } = createHarness();
    const previous = coreAssets();
    cache.status.mockResolvedValue({ compilerVersion: "old-version" });
    cache.readActiveCoreAssets.mockResolvedValue(previous);
    client.compile.mockResolvedValue({
      success: false,
      log: "candidate failed",
      exitCode: 1,
      packageLookups: [],
    });

    await expect(engine.initialize()).resolves.toBeUndefined();

    expect(cache.discardStagedCompilerVersion).toHaveBeenCalled();
    expect(client.restart).toHaveBeenCalledOnce();
    expect(client.initialize).toHaveBeenLastCalledWith(previous);
    expect(cache.activateStagedCompilerVersion).not.toHaveBeenCalled();
  });

  it("surfaces a first-install candidate failure when no previous core exists", async () => {
    const { cache, client, engine } = createHarness();
    cache.status.mockResolvedValue({ compilerVersion: "old-version" });
    cache.readActiveCoreAssets.mockResolvedValue(null);
    client.compile.mockResolvedValue({
      success: false,
      log: "candidate failed",
      exitCode: 1,
      packageLookups: [],
    });

    await expect(engine.initialize()).rejects.toThrow(
      "Compiler update smoke test failed",
    );
    expect(cache.discardStagedCompilerVersion).toHaveBeenCalled();
  });
});
