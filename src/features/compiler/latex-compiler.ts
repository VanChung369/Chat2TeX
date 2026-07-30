import type {
  LatexCompileOutput,
  LatexCompileProject,
  LatexEngine,
} from "./types";

import {
  combineCompileLogs,
  FallbackCompileError,
  findFailingProjectPaths,
  readCompileLog,
} from "./compile-diagnostics";

export class LatexCompiler {
  private initializePromise: Promise<void> | null = null;

  constructor(private readonly engine: LatexEngine) {}

  async compile(project: LatexCompileProject): Promise<LatexCompileOutput> {
    await this.ensureInitialized();

    try {
      const result = await this.engine.compile(project);

      return {
        ...result,
        omittedFiles: [],
      };
    } catch (firstError) {
      if (project.files.length === 0) {
        throw firstError;
      }

      const firstLog = readCompileLog(firstError);

      const mentionedPaths = findFailingProjectPaths(
        firstLog,
        project.files.map((file) => file.path),
      );

      const omittedFiles =
        mentionedPaths.length > 0
          ? mentionedPaths
          : project.files.map((file) => file.path);

      const omittedSet = new Set(omittedFiles);

      try {
        const fallback = await this.engine.compile({
          ...project,

          files: project.files.filter(
            (file) => !omittedSet.has(file.path),
          ),
        });

        return {
          ...fallback,

          log: combineCompileLogs(firstLog, fallback.log),

          omittedFiles,
        };
      } catch (fallbackError) {
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

  private ensureInitialized(): Promise<void> {
    if (!this.initializePromise) {
      this.initializePromise = this.engine.initialize().catch((error) => {
        this.initializePromise = null;
        throw error;
      });
    }

    return this.initializePromise;
  }
}
