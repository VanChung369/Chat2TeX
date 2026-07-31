import { beforeEach, describe, expect, it, vi } from "vitest";

const busyTexMocks = vi.hoisted(() => ({
  compile: vi.fn(),
  initialize: vi.fn(),
  terminate: vi.fn(),
}));

vi.mock("texlyre-busytex", () => ({
  BusyTexRunner: class {
    initialize = busyTexMocks.initialize;

    terminate = busyTexMocks.terminate;
  },
  XeLatex: class {
    compile = busyTexMocks.compile;
  },
}));

vi.mock("wxt/browser", () => ({
  browser: {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
  },
}));

import { BusyTexEngine } from "@/src/features/compiler/busytex-engine";

describe("BusyTexEngine", () => {
  beforeEach(() => {
    busyTexMocks.initialize.mockResolvedValue(undefined);
    busyTexMocks.compile.mockReset();
  });

  it("rejects a partial PDF when the XeLaTeX log contains an error", async () => {
    busyTexMocks.compile.mockResolvedValue({
      success: true,
      exitCode: 0,
      pdf: new Uint8Array([37, 80, 68, 70]),
      log: [
        "! Package Listings Error: Couldn't load requested language.",
        "l.427 \\begin{lstlisting}[language=ChatTypeScript]",
        "Output written on main.xdv (6 pages, 76480 bytes).",
      ].join("\n"),
    });

    const engine = new BusyTexEngine();

    await engine.initialize();

    await expect(
      engine.compile({
        source: "\\begin{document}Incomplete",
        files: [],
      }),
    ).rejects.toMatchObject({
      name: "BusyTexCompileError",
      message: expect.stringContaining(
        "Couldn't load requested language",
      ),
    });
  });

  it("accepts an error-free BusyTeX result", async () => {
    busyTexMocks.compile.mockResolvedValue({
      success: true,
      exitCode: 0,
      pdf: new Uint8Array([37, 80, 68, 70]),
      log: "Output written on main.xdv (12 pages, 100000 bytes).",
    });

    const engine = new BusyTexEngine();

    await engine.initialize();

    await expect(
      engine.compile({
        source: "\\begin{document}Complete\\end{document}",
        files: [],
      }),
    ).resolves.toMatchObject({
      pdf: new Uint8Array([37, 80, 68, 70]),
    });
  });
});
