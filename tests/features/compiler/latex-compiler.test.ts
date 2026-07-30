import { describe, expect, it, vi } from "vitest";

import { LatexCompiler } from "@/src/features/compiler/latex-compiler";

import type { LatexEngine } from "@/src/features/compiler/types";

function createEngine(): LatexEngine {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),

    compile: vi.fn().mockResolvedValue({
      pdf: new Uint8Array([37, 80, 68, 70]),

      log: "Compilation completed",
    }),

    terminate: vi.fn(),
  };
}

describe("LatexCompiler", () => {
  it("initializes the engine only once", async () => {
    const engine = createEngine();

    const compiler = new LatexCompiler(engine);

    await compiler.compile({
      source: "\\begin{document}A\\end{document}",
      files: [],
    });

    await compiler.compile({
      source: "\\begin{document}B\\end{document}",
      files: [],
    });

    expect(engine.initialize).toHaveBeenCalledTimes(1);

    expect(engine.compile).toHaveBeenCalledTimes(2);
  });

  it("returns the generated PDF", async () => {
    const compiler = new LatexCompiler(createEngine());

    const result = await compiler.compile({
      source: "\\begin{document}Hello\\end{document}",

      files: [
        {
          path: "assets/image-001.png",

          content: new Uint8Array([137, 80, 78, 71]),
        },
      ],
    });

    expect(result.pdf).toEqual(new Uint8Array([37, 80, 68, 70]));

    expect(result.log).toBe("Compilation completed");
  });
});
