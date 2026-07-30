import type {
  LatexCompileOutput,
  LatexCompileProject,
  LatexEngine,
} from "./types";

export class LatexCompiler {
  private initializePromise: Promise<void> | null = null;

  constructor(private readonly engine: LatexEngine) {}

  async compile(project: LatexCompileProject): Promise<LatexCompileOutput> {
    await this.ensureInitialized();

    return this.engine.compile(project);
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
