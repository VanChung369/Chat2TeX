import { BusyTexRunner, XeLatex } from "texlyre-busytex";

import { browser } from "wxt/browser";

import type {
  LatexEngineOutput,
  LatexCompileProject,
  LatexEngine,
} from "./types";

import {
  extractCompileDiagnostic,
  hasFatalCompileDiagnostic,
} from "./compile-diagnostics";

interface BusyTexCompileResult {
  success: boolean;
  pdf?: Uint8Array;
  log?: string;
  exitCode?: number;
}

export class BusyTexEngine implements LatexEngine {
  private runner: BusyTexRunner | null = null;

  private xelatex: XeLatex | null = null;

  async initialize(): Promise<void> {
    if (this.runner && this.xelatex) {
      return;
    }

    const basePath = new URL(
      "texlive/busytex",
      browser.runtime.getURL("/"),
    ).href;

    const runner = new BusyTexRunner({
      busytexBasePath: basePath,
      verbose: false,
    });

    /*
     * true: BusyTeX runs in a Web Worker so it does not block the
     * offscreen page.
     */
    await runner.initialize(true);

    this.runner = runner;
    this.xelatex = new XeLatex(runner, false);
  }

  async compile(project: LatexCompileProject): Promise<LatexEngineOutput> {
    if (!this.xelatex) {
      throw new Error("BusyTeX has not been initialized.");
    }

    const result = (await this.xelatex.compile({
      input: project.source,
      bibtex: false,
      verbose: "silent",

      additionalFiles: project.files.map((file) => ({
        path: file.path,
        content: file.content,
      })),
    })) as BusyTexCompileResult;

    const log = result.log ?? "";

    const fatalDiagnostic = hasFatalCompileDiagnostic(log)
      ? extractCompileDiagnostic(log)
      : null;

    if (!result.success || !result.pdf || fatalDiagnostic) {
      throw new BusyTexCompileError(
        fatalDiagnostic
          ? `XeLaTeX compilation failed. ${fatalDiagnostic}`
          : `XeLaTeX compilation failed with exit code ${
              result.exitCode ?? "unknown"
            }.`,
        log,
      );
    }

    return {
      pdf: result.pdf,
      log,
    };
  }

  terminate(): void {
    this.runner?.terminate();

    this.runner = null;
    this.xelatex = null;
  }
}

export class BusyTexCompileError extends Error {
  constructor(
    message: string,
    readonly compileLog: string,
  ) {
    super(message);
    this.name = "BusyTexCompileError";
  }
}
