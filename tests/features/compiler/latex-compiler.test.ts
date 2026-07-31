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

function createCompileError(message: string, compileLog: string): Error {
  return Object.assign(new Error(message), {
    compileLog,
  });
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

    expect(result.omittedFiles).toEqual([]);
  });

  it("retries after removing only the image named in the failure log", async () => {
    const engine = createEngine();

    vi.mocked(engine.compile)
      .mockRejectedValueOnce(
        createCompileError(
          "Initial compilation failed.",
          'xdvipdfmx:fatal: Unable to load "assets/image-002.png".',
        ),
      )
      .mockResolvedValueOnce({
        pdf: new Uint8Array([37, 80, 68, 70]),
        log: "Fallback completed",
      });

    const compiler = new LatexCompiler(engine);

    const result = await compiler.compile({
      source: "\\begin{document}Test\\end{document}",
      files: [
        {
          path: "assets/image-001.png",
          content: new Uint8Array([1]),
        },
        {
          path: "assets/image-002.png",
          content: new Uint8Array([2]),
        },
      ],
    });

    expect(result.omittedFiles).toEqual(["assets/image-002.png"]);

    expect(vi.mocked(engine.compile).mock.calls[1]?.[0].files).toEqual([
      {
        path: "assets/image-001.png",
        content: new Uint8Array([1]),
      },
    ]);
  });

  it("retries without files when the failure log names no project image", async () => {
    const engine = createEngine();

    vi.mocked(engine.compile)
      .mockRejectedValueOnce(
        createCompileError(
          "Initial compilation failed.",
          "xdvipdfmx:fatal: Unknown image error.",
        ),
      )
      .mockResolvedValueOnce({
        pdf: new Uint8Array([37, 80, 68, 70]),
        log: "Fallback completed",
      });

    const compiler = new LatexCompiler(engine);

    const result = await compiler.compile({
      source: "\\begin{document}Test\\end{document}",
      files: [
        {
          path: "assets/image-001.png",
          content: new Uint8Array([1]),
        },
      ],
    });

    expect(result.omittedFiles).toEqual(["assets/image-001.png"]);

    expect(vi.mocked(engine.compile).mock.calls[1]?.[0].files).toEqual([]);
  });

  it("does not retry a failed project without files", async () => {
    const engine = createEngine();

    vi.mocked(engine.compile).mockRejectedValue(new Error("Source failed."));

    const compiler = new LatexCompiler(engine);

    await expect(
      compiler.compile({
        source: "\\badcommand",
        files: [],
      }),
    ).rejects.toThrow("Source failed.");

    expect(engine.compile).toHaveBeenCalledTimes(1);
  });

  it("preserves both logs when the fallback also fails", async () => {
    const engine = createEngine();

    vi.mocked(engine.compile)
      .mockRejectedValueOnce(
        createCompileError(
          "Initial compilation failed.",
          "Initial log: includegraphics error",
        ),
      )
      .mockRejectedValueOnce(
        createCompileError("Fallback compilation failed.", "Fallback log"),
      );

    const compiler = new LatexCompiler(engine);

    await expect(
      compiler.compile({
        source: "\\badcommand",
        files: [
          {
            path: "assets/image-001.png",
            content: new Uint8Array([1]),
          },
        ],
      }),
    ).rejects.toMatchObject({
      message: "Fallback compilation failed.",
      compileLog: expect.stringContaining("Initial log"),
    });
  });

  it("does not drop images when the failure is unrelated to graphics", async () => {
    const engine = createEngine();

    vi.mocked(engine.compile).mockRejectedValueOnce(
      createCompileError(
        "Initial compilation failed.",
        "! Undefined control sequence.\nl.42 \\badcommand",
      ),
    );

    const compiler = new LatexCompiler(engine);

    await expect(
      compiler.compile({
        source: "\\badcommand",
        files: [
          {
            path: "assets/image-001.png",
            content: new Uint8Array([1]),
          },
        ],
      }),
    ).rejects.toMatchObject({
      message: "Initial compilation failed.",
    });

    expect(engine.compile).toHaveBeenCalledTimes(1);
  });
});
