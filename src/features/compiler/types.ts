export interface CompilerFile {
  path: string;
  content: Uint8Array;
}

export interface LatexCompileProject {
  source: string;
  files: CompilerFile[];
}

export interface LatexEngineOutput {
  pdf: Uint8Array;
  log: string;
}

export interface LatexCompileOutput extends LatexEngineOutput {
  omittedFiles: string[];
}

export interface LatexEngine {
  initialize(signal?: AbortSignal): Promise<void>;

  compile(
    project: LatexCompileProject,
    signal?: AbortSignal,
  ): Promise<LatexEngineOutput>;

  terminate(): void;

  restartAfterCrash?(): void;
}

export interface SerializedCompilerFile {
  path: string;
  base64: string;
}

export interface SerializedCompileProject {
  source: string;
  files: SerializedCompilerFile[];
}

export type CompileLatexResult =
  | {
      ok: true;
      pdfBase64: string;
      byteLength: number;
      log: string;
      omittedFiles: string[];
    }
  | {
      ok: false;
      error: string;
      log: string;
    };
