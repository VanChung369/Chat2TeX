import {
  COMPILER_VERSION,
  MAX_PACKAGE_DOWNLOAD_BYTES_PER_JOB,
  MAX_PACKAGE_FILES_PER_JOB,
  MAX_PACKAGE_LOOKUPS_PER_PASS,
  MAX_PACKAGE_PASSES,
  packageLookupKey,
  type PackageLookup,
} from "./asset-manifest";
import { BusyTexCompileError } from "./busytex-engine";
import type { CompilerAssetCache } from "./compiler-asset-cache";
import type { CompilerAssetFetcher } from "./compiler-asset-fetcher";
import {
  GENERATED_CORE_ASSETS,
  type CoreAssetId,
} from "./compiler-core-assets.generated";
import {
  extractCompileDiagnostic,
  hasFatalCompileDiagnostic,
} from "./compile-diagnostics";
import type { SandboxCompilerClient } from "./sandbox-compiler-client";
import type {
  SandboxCompileResult,
  TexliveRemoteFile,
} from "./sandbox-protocol";
import type {
  LatexCompileProject,
  LatexEngine,
  LatexEngineOutput,
  SerializedCompileProject,
} from "./types";
import { bytesToBase64 } from "@/src/shared/base64";

const CORE_ASSET_IDS = new Set<CoreAssetId>(
  GENERATED_CORE_ASSETS.map((asset) => asset.id),
);
const UPGRADE_SMOKE_PROJECT: LatexCompileProject = {
  source:
    "\\documentclass{article}\\begin{document}Chat2TeX\\end{document}",
  files: [],
};

export type CompilerProgress =
  | {
      phase: "downloading-compiler";
      loaded: number;
      total: number;
      label: string;
    }
  | { phase: "initializing"; label: string }
  | {
      phase: "downloading-packages";
      current: number;
      total: number;
      label: string;
    }
  | { phase: "compiling"; pass: number; label: string };

export function serializeProject(
  project: LatexCompileProject,
): SerializedCompileProject {
  return {
    source: project.source,
    files: project.files.map((file) => ({
      path: file.path,
      base64: bytesToBase64(file.content),
    })),
  };
}

export function uniquePackageLookups(
  lookups: readonly PackageLookup[],
): PackageLookup[] {
  const unique = new Map<string, PackageLookup>();
  for (const lookup of lookups) {
    const key = packageLookupKey(lookup);
    if (!unique.has(key)) {
      unique.set(key, lookup);
    }
  }
  return [...unique.values()];
}

export function readFailureMessage(
  result: SandboxCompileResult,
): string {
  const diagnostic = extractCompileDiagnostic(result.log);
  if (diagnostic) {
    return `XeLaTeX compilation failed. ${diagnostic}`;
  }
  const names = uniquePackageLookups(result.packageLookups).map(
    (lookup) => lookup.name,
  );
  if (names.length > 0) {
    return `Required TeX Live file${
      names.length === 1 ? "" : "s"
    } not found: ${names.join(", ")}.`;
  }
  return `XeLaTeX compilation failed with exit code ${result.exitCode}.`;
}

export class OnDemandBusyTexEngine implements LatexEngine {
  private initializePromise: Promise<void> | null = null;
  private initialized = false;

  constructor(
    private readonly client: SandboxCompilerClient,
    private readonly cache: CompilerAssetCache,
    private readonly fetcher: CompilerAssetFetcher,
    private readonly onProgress?: (progress: CompilerProgress) => void,
  ) {}

  initialize(signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    if (this.initialized) {
      return Promise.resolve();
    }
    this.initializePromise ??= this.initializeOnce(signal).catch(
      (error) => {
        this.initializePromise = null;
        throw error;
      },
    );
    return this.initializePromise;
  }

  async compile(
    project: LatexCompileProject,
    signal?: AbortSignal,
  ): Promise<LatexEngineOutput> {
    throwIfAborted(signal);
    await this.initialize(signal);

    const compileLogs: string[] = [];
    const seenLookups = new Set<string>();
    let downloadedPackageBytes = 0;
    const serializedProject = serializeProject(project);

    for (let pass = 1; pass <= MAX_PACKAGE_PASSES; pass += 1) {
      throwIfAborted(signal);
      this.onProgress?.({
        phase: "compiling",
        pass,
        label: `XeTeX pass ${pass}`,
      });
      const result = await this.client.compile(serializedProject);
      throwIfAborted(signal);
      compileLogs.push(result.log);

      const fatalDiagnostic = hasFatalCompileDiagnostic(result.log)
        ? extractCompileDiagnostic(result.log)
        : null;
      if (result.success && result.pdf && !fatalDiagnostic) {
        const pdf = new Uint8Array(result.pdf);
        if (!startsWithPdfHeader(pdf)) {
          throw new BusyTexCompileError(
            "XeLaTeX returned an invalid PDF.",
            compileLogs.join("\n\n"),
          );
        }
        return {
          pdf,
          log: compileLogs.join("\n\n"),
        };
      }

      const lookups = uniquePackageLookups(result.packageLookups);
      if (lookups.length > MAX_PACKAGE_LOOKUPS_PER_PASS) {
        throw new BusyTexCompileError(
          "XeTeX requested more than 256 files in one pass.",
          compileLogs.join("\n\n"),
        );
      }
      for (const lookup of lookups) {
        seenLookups.add(packageLookupKey(lookup));
      }
      if (seenLookups.size > MAX_PACKAGE_FILES_PER_JOB) {
        throw new BusyTexCompileError(
          "XeTeX requested more than 512 files in one job.",
          compileLogs.join("\n\n"),
        );
      }
      if (lookups.length === 0) {
        throw new BusyTexCompileError(
          fatalDiagnostic
            ? `XeLaTeX compilation failed. ${fatalDiagnostic}`
            : readFailureMessage(result),
          compileLogs.join("\n\n"),
        );
      }

      const remoteFiles: TexliveRemoteFile[] = [];
      for (let index = 0; index < lookups.length; index += 1) {
        throwIfAborted(signal);
        const lookup = lookups[index]!;
        this.onProgress?.({
          phase: "downloading-packages",
          current: index + 1,
          total: lookups.length,
          label: lookup.name,
        });
        const resolved = await this.cache.getOrFetchPackage(
          lookup,
          this.fetcher,
          signal,
        );
        if (!resolved) {
          continue;
        }
        if (resolved.source === "network") {
          downloadedPackageBytes += resolved.content.byteLength;
        }
        if (
          downloadedPackageBytes >
          MAX_PACKAGE_DOWNLOAD_BYTES_PER_JOB
        ) {
          throw new BusyTexCompileError(
            "On-demand package downloads exceeded 160 MiB.",
            compileLogs.join("\n\n"),
          );
        }
        remoteFiles.push({
          ...lookup,
          content: resolved.content,
        });
      }
      if (remoteFiles.length === 0) {
        throw new BusyTexCompileError(
          readFailureMessage(result),
          compileLogs.join("\n\n"),
        );
      }
      await this.client.writeRemoteFiles(remoteFiles);
    }

    throw new BusyTexCompileError(
      `Package resolution exceeded ${MAX_PACKAGE_PASSES} passes.`,
      compileLogs.join("\n\n"),
    );
  }

  terminate(): void {
    this.client.terminate();
    this.initialized = false;
    this.initializePromise = null;
  }

  restartAfterCrash(): void {
    this.client.restart();
    this.initialized = false;
    this.initializePromise = null;
  }

  private async initializeOnce(signal?: AbortSignal): Promise<void> {
    const status = await this.cache.status();
    throwIfAborted(signal);

    if (status.compilerVersion === COMPILER_VERSION) {
      const assets = await this.loadCurrentCore(signal);
      this.onProgress?.({
        phase: "initializing",
        label: "Initializing XeTeX",
      });
      await this.client.initialize(assets);
      this.initialized = true;
      return;
    }

    const previousAssets = await this.cache.readActiveCoreAssets();
    let staged = false;
    try {
      await this.cache.stageCompilerVersion(COMPILER_VERSION);
      staged = true;
      const candidateAssets = await this.loadCurrentCore(signal);
      this.onProgress?.({
        phase: "initializing",
        label: "Validating XeTeX update",
      });
      await this.client.initialize(candidateAssets);
      const smokeResult = await this.client.compile(
        serializeProject(UPGRADE_SMOKE_PROJECT),
      );
      const smokePdf = smokeResult.pdf
        ? new Uint8Array(smokeResult.pdf)
        : null;
      if (
        !smokeResult.success ||
        !smokePdf ||
        !startsWithPdfHeader(smokePdf) ||
        hasFatalCompileDiagnostic(smokeResult.log)
      ) {
        throw new Error(
          `Compiler update smoke test failed. ${readFailureMessage(
            smokeResult,
          )}`,
        );
      }
      await this.cache.activateStagedCompilerVersion(
        COMPILER_VERSION,
      );
      this.initialized = true;
    } catch (error) {
      if (staged) {
        await this.cache
          .discardStagedCompilerVersion(COMPILER_VERSION)
          .catch(() => undefined);
      }
      if (isAbortError(error) || signal?.aborted) {
        throw error;
      }
      if (!previousAssets) {
        throw error;
      }
      this.client.restart();
      this.onProgress?.({
        phase: "initializing",
        label: "Restoring previous XeTeX version",
      });
      await this.client.initialize(previousAssets);
      this.initialized = true;
    }
  }

  private async loadCurrentCore(
    signal?: AbortSignal,
  ): Promise<Record<CoreAssetId, Uint8Array>> {
    const total = GENERATED_CORE_ASSETS.reduce(
      (sum, asset) => sum + asset.byteLength,
      0,
    );
    let completedBytes = 0;
    const assets = {} as Record<CoreAssetId, Uint8Array>;

    for (const asset of GENERATED_CORE_ASSETS) {
      throwIfAborted(signal);
      let currentLoaded = 0;
      const bytes = await this.cache.getOrFetchCore(
        asset,
        this.fetcher,
        signal,
        (loaded) => {
          currentLoaded = Math.min(loaded, asset.byteLength);
          this.onProgress?.({
            phase: "downloading-compiler",
            loaded: completedBytes + currentLoaded,
            total,
            label: asset.filename,
          });
        },
      );
      assets[asset.id] = bytes;
      completedBytes += asset.byteLength;
      if (currentLoaded !== asset.byteLength) {
        this.onProgress?.({
          phase: "downloading-compiler",
          loaded: completedBytes,
          total,
          label: asset.filename,
        });
      }
    }

    if (
      Object.keys(assets).length !== CORE_ASSET_IDS.size ||
      ![...CORE_ASSET_IDS].every((id) => assets[id] instanceof Uint8Array)
    ) {
      throw new Error("Verified compiler core is incomplete.");
    }
    return assets;
  }
}

function startsWithPdfHeader(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 5 &&
    bytes[0] === 37 &&
    bytes[1] === 80 &&
    bytes[2] === 68 &&
    bytes[3] === 70 &&
    bytes[4] === 45
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException
      ? error.name === "AbortError"
      : error instanceof Error && error.name === "AbortError"
  );
}
