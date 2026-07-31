import { describe, expect, it } from "vitest";

import { BusyTexCompileError } from "@/src/features/compiler/busytex-engine";

describe("BusyTexCompileError", () => {
  it("preserves the compiler log without adding it to the message", () => {
    const error = new BusyTexCompileError(
      "XeLaTeX compilation failed.",
      "private compiler log",
    );

    expect(error).toMatchObject({
      name: "BusyTexCompileError",
      message: "XeLaTeX compilation failed.",
      compileLog: "private compiler log",
    });
    expect(error.message).not.toContain("private compiler log");
  });
});
