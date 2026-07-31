import type {
  LatexCompileOutput,
  LatexCompileProject,
  LatexEngine,
} from "./types";

import {
  combineCompileLogs,
  FallbackCompileError,
  findFailingProjectPaths,
  isGraphicsRelatedFailure,
  readCompileLog,
} from "./compile-diagnostics";
import { SandboxCompilerCrashError } from "./sandbox-compiler-client";

export class LatexCompiler {
  private initializePromise: Promise<void> | null = null;

  constructor(private readonly engine: LatexEngine) {}

  async compile(
    project: LatexCompileProject,
    signal?: AbortSignal,
  ): Promise<LatexCompileOutput> {
    for (let crashAttempt = 0; crashAttempt < 2; crashAttempt += 1) {
      try {
        return await this.compileWithImageFallback(project, signal);
      } catch (error) {
        if (
          crashAttempt > 0 ||
          !(error instanceof SandboxCompilerCrashError) ||
          signal?.aborted ||
          !this.engine.restartAfterCrash
        ) {
          throw error;
        }
        this.engine.restartAfterCrash();
        this.initializePromise = null;
      }
    }

    throw new Error("Unreachable compiler retry state.");
  }

  private async compileWithImageFallback(
    project: LatexCompileProject,
    signal?: AbortSignal,
  ): Promise<LatexCompileOutput> {
    await this.ensureInitialized(signal);
    try {
      const result = await this.engine.compile(project, signal);

      return {
        ...result,
        omittedFiles: [],
      };
    } catch (firstError) {
      if (
        firstError instanceof SandboxCompilerCrashError ||
        isAbortError(firstError)
      ) {
        throw firstError;
      }
      if (project.files.length === 0) {
        throw firstError;
      }

      const firstLog = readCompileLog(firstError);

      const mentionedPaths = findFailingProjectPaths(
        firstLog,
        project.files.map((file) => file.path),
      );

      // Only drop every asset as a last resort when the failure looks
      // graphics-related; otherwise a text error would needlessly strip images.
      if (mentionedPaths.length === 0 && !isGraphicsRelatedFailure(firstLog)) {
        throw firstError;
      }

      const omittedFiles =
        mentionedPaths.length > 0
          ? mentionedPaths
          : project.files.map((file) => file.path);

      const omittedSet = new Set(omittedFiles);

      try {
        const fallback = await this.engine.compile(
          {
            ...project,

            files: project.files.filter(
              (file) => !omittedSet.has(file.path),
            ),
          },
          signal,
        );

        return {
          ...fallback,

          log: combineCompileLogs(firstLog, fallback.log),

          omittedFiles,
        };
      } catch (fallbackError) {
        if (
          fallbackError instanceof SandboxCompilerCrashError ||
          isAbortError(fallbackError)
        ) {
          throw fallbackError;
        }
        throw new FallbackCompileError(
          fallbackError instanceof Error
            ? fallbackError.message
            : "XeLaTeX fallback compilation failed.",

          combineCompileLogs(firstLog, readCompileLog(fallbackError)),
        );
      }
    }
  }

  terminate(): void {
    this.engine.terminate();
    this.initializePromise = null;
  }

  private ensureInitialized(signal?: AbortSignal): Promise<void> {
    if (!this.initializePromise) {
      this.initializePromise = this.engine
        .initialize(signal)
        .catch((error) => {
          this.initializePromise = null;
          throw error;
        });
    }

    return this.initializePromise;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException
      ? error.name === "AbortError"
      : error instanceof Error && error.name === "AbortError"
  );
}
