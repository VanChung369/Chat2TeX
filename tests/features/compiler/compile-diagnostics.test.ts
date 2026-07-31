import { describe, expect, it } from "vitest";

import {
  combineCompileLogs,
  extractCompileDiagnostic,
  findFailingProjectPaths,
  formatCompileFailure,
  hasFatalCompileDiagnostic,
  readCompileLog,
} from "@/src/features/compiler/compile-diagnostics";

describe("compile diagnostics", () => {
  it("finds only project paths mentioned near fatal diagnostics", () => {
    const log = [
      "File: assets/good.png Graphic file",
      "xdvipdfmx:fatal: Image inclusion failed.",
      'Unable to load "assets/bad.png".',
    ].join("\n");

    expect(
      findFailingProjectPaths(log, [
        "assets/good.png",
        "assets/bad.png",
      ]),
    ).toEqual(["assets/bad.png"]);
  });

  it("extracts a concise TeX diagnostic with its source line", () => {
    const log = [
      "! LaTeX Error: File `missing.sty' not found.",
      "Type X to quit.",
      "l.42 \\usepackage{missing}",
    ].join("\n");

    expect(extractCompileDiagnostic(log)).toBe(
      "LaTeX Error: File `missing.sty' not found. (l.42 \\usepackage{missing})",
    );
  });

  it("extracts a concise xdvipdfmx fatal diagnostic", () => {
    expect(
      extractCompileDiagnostic(
        "xdvipdfmx:fatal: Image inclusion failed for assets/image.png.",
      ),
    ).toBe("Image inclusion failed for assets/image.png.");
  });

  it("distinguishes fatal diagnostics from package metadata", () => {
    expect(
      hasFatalCompileDiagnostic(
        "Package: infwarerr Providing info/warning/error messages",
      ),
    ).toBe(false);

    expect(
      hasFatalCompileDiagnostic(
        "! Package Listings Error: Couldn't load requested language.",
      ),
    ).toBe(true);
  });

  it("does not duplicate a diagnostic already present in the message", () => {
    expect(
      formatCompileFailure(
        "Image inclusion failed.",
        "xdvipdfmx:fatal: Image inclusion failed.",
      ),
    ).toBe("Image inclusion failed.");
  });

  it("reads compileLog structurally from compiler errors", () => {
    expect(readCompileLog({ compileLog: "raw log" })).toBe("raw log");

    expect(readCompileLog(new Error("plain error"))).toBe("");
  });

  it("labels initial and fallback compile logs", () => {
    expect(combineCompileLogs("first log", "second log")).toContain(
      "===== Initial compilation =====\nfirst log",
    );

    expect(combineCompileLogs("first log", "second log")).toContain(
      "===== Fallback compilation =====\nsecond log",
    );
  });
});
