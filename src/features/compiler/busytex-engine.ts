import { BusyTexRunner, XeLatex } from "texlyre-busytex";

import { browser } from "wxt/browser";

import type {
  LatexCompileOutput,
  LatexCompileProject,
  LatexEngine,
} from "./types";

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
     * true: BusyTeX chạy trong Web Worker,
     * tránh khóa offscreen page.
     */
    await runner.initialize(true);

    this.runner = runner;
    this.xelatex = new XeLatex(runner, false);
  }

  async compile(project: LatexCompileProject): Promise<LatexCompileOutput> {
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

    if (!result.success || !result.pdf) {
      throw new BusyTexCompileError(
        `XeLaTeX compilation failed with exit code ${
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
