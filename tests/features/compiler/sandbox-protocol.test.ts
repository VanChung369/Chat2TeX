import { describe, expect, it } from "vitest";

import {
  createSandboxHandshakeGate,
  getSandboxCommandTransferables,
  parseSandboxCommand,
  parseSandboxEvent,
} from "@/src/features/compiler/sandbox-protocol";

describe("sandbox protocol", () => {
  it("accepts exactly one nonce from the expected parent window", () => {
    const expectedParent = {} as WindowProxy;
    const otherWindow = {} as WindowProxy;
    const gate = createSandboxHandshakeGate(expectedParent);

    expect(gate.accept(otherWindow, "nonce-1")).toBe(false);
    expect(gate.accept(expectedParent, "")).toBe(false);
    expect(gate.accept(expectedParent, "nonce-1")).toBe(true);
    expect(gate.accept(expectedParent, "nonce-2")).toBe(false);
  });

  it("rejects unknown commands and malformed package lookups", () => {
    expect(() =>
      parseSandboxCommand({ type: "execute-code", requestId: "1" }),
    ).toThrow("Invalid sandbox command");
    expect(() =>
      parseSandboxCommand({
        type: "write-remote-files",
        requestId: "1",
        files: [
          {
            format: 26,
            name: "../secret.tex",
            content: new ArrayBuffer(1),
          },
        ],
      }),
    ).toThrow("Invalid TeX Live filename");
  });

  it("validates events and returns only owned transferable buffers", () => {
    const wasm = new ArrayBuffer(3);
    const data = new ArrayBuffer(4);
    const command = parseSandboxCommand({
      type: "initialize",
      requestId: "init-1",
      assets: {
        "busytex-worker": new ArrayBuffer(1),
        "busytex-pipeline": new ArrayBuffer(2),
        "busytex-js": new ArrayBuffer(2),
        "busytex-wasm": wasm,
        "texlive-basic-js": new ArrayBuffer(2),
        "texlive-basic-data": data,
      },
    });
    if (command.type !== "initialize") {
      throw new Error("Expected initialize command.");
    }

    expect(getSandboxCommandTransferables(command)).toEqual([
      command.assets["busytex-worker"],
      command.assets["busytex-pipeline"],
      command.assets["busytex-js"],
      wasm,
      command.assets["texlive-basic-js"],
      data,
    ]);
    expect(
      parseSandboxEvent({
        type: "compile-result",
        requestId: "compile-1",
        success: false,
        log: "missing",
        exitCode: 1,
        packageLookups: [{ format: 26, name: "xcolor.sty" }],
      }),
    ).toMatchObject({
      type: "compile-result",
      packageLookups: [{ format: 26, name: "xcolor.sty" }],
    });
    expect(() =>
      parseSandboxEvent({ type: "ready", requestId: "" }),
    ).toThrow("Invalid sandbox event");
  });
});
