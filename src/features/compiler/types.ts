export interface CompilerFile {
  path: string;
  content: Uint8Array;
}

export interface LatexCompileProject {
  source: string;
  files: CompilerFile[];
}

export interface LatexCompileOutput {
  pdf: Uint8Array;
  log: string;
}

export interface LatexEngine {
  initialize(): Promise<void>;

  compile(project: LatexCompileProject): Promise<LatexCompileOutput>;

  terminate(): void;
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
    }
  | {
      ok: false;
      error: string;
      log: string;
    };
