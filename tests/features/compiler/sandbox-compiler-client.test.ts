import { afterEach, describe, expect, it, vi } from "vitest";

import { SandboxCompilerClient } from "@/src/features/compiler/sandbox-compiler-client";

class FakeMessagePort {
  onmessage: ((event: MessageEvent) => void) | null = null;
  readonly postMessage = vi.fn();
  readonly start = vi.fn();
  readonly close = vi.fn();

  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("SandboxCompilerClient", () => {
  it("transfers core buffers and correlates compile results by request ID", async () => {
    const port = new FakeMessagePort();
    const removeFrame = vi.fn();
    let requestNumber = 0;
    const client = new SandboxCompilerClient(
      document,
      "chrome-extension://test/compiler-sandbox.html",
      100,
      {
        connect: vi.fn().mockResolvedValue({
          port: port as unknown as MessagePort,
          removeFrame,
        }),
        randomUUID: () => `request-${++requestNumber}`,
      },
    );
    const assets = createCoreAssets();

    const initialize = client.initialize(assets);
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledOnce());
    const [initializeCommand, initializeTransfer] =
      port.postMessage.mock.calls[0];
    expect(initializeCommand).toMatchObject({
      type: "initialize",
      requestId: "request-1",
    });
    expect(initializeTransfer).toHaveLength(6);
    port.emit({ type: "ready", requestId: "request-1" });
    await initialize;

    const compiling = client.compile({
      source: "\\begin{document}Xin chào\\end{document}",
      files: [],
    });
    await vi.waitFor(() =>
      expect(port.postMessage).toHaveBeenCalledTimes(2),
    );
    const compileRequestId =
      port.postMessage.mock.calls[1][0].requestId;
    port.emit({
      type: "compile-result",
      requestId: compileRequestId,
      success: true,
      pdf: new Uint8Array([37, 80, 68, 70]).buffer,
      log: "",
      exitCode: 0,
      packageLookups: [],
    });

    await expect(compiling).resolves.toMatchObject({
      success: true,
      exitCode: 0,
    });
    client.terminate();
    expect(port.close).toHaveBeenCalledOnce();
    expect(removeFrame).toHaveBeenCalledOnce();
  });

  it("rejects timed-out and pending requests during cleanup", async () => {
    vi.useFakeTimers();
    const port = new FakeMessagePort();
    const client = new SandboxCompilerClient(
      document,
      "chrome-extension://test/compiler-sandbox.html",
      10,
      {
        connect: vi.fn().mockResolvedValue({
          port: port as unknown as MessagePort,
          removeFrame: vi.fn(),
        }),
        randomUUID: () => "timeout-request",
      },
    );

    const initialize = client.initialize(createCoreAssets());
    const timedOut = expect(initialize).rejects.toThrow("timed out");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(11);
    await timedOut;

    const compile = client.compile({ source: "test", files: [] });
    await Promise.resolve();
    client.terminate();
    await expect(compile).rejects.toThrow("terminated");
  });

  it("rejects unknown and mismatched events without settling another request", async () => {
    const port = new FakeMessagePort();
    const client = new SandboxCompilerClient(
      document,
      "chrome-extension://test/compiler-sandbox.html",
      100,
      {
        connect: vi.fn().mockResolvedValue({
          port: port as unknown as MessagePort,
          removeFrame: vi.fn(),
        }),
        randomUUID: () => "request-1",
      },
    );
    const initialize = client.initialize(createCoreAssets());
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledOnce());

    port.emit({ type: "ready", requestId: "other-request" });
    port.emit({ type: "unknown", requestId: "request-1" });
    port.emit({ type: "ready", requestId: "request-1" });

    await expect(initialize).resolves.toBeUndefined();
  });

  it("replaces its frame and connection when restarted", async () => {
    const firstPort = new FakeMessagePort();
    const secondPort = new FakeMessagePort();
    const firstRemoveFrame = vi.fn();
    const secondRemoveFrame = vi.fn();
    const connect = vi
      .fn()
      .mockResolvedValueOnce({
        port: firstPort as unknown as MessagePort,
        removeFrame: firstRemoveFrame,
      })
      .mockResolvedValueOnce({
        port: secondPort as unknown as MessagePort,
        removeFrame: secondRemoveFrame,
      });
    let requestNumber = 0;
    const client = new SandboxCompilerClient(
      document,
      "chrome-extension://test/compiler-sandbox.html",
      100,
      {
        connect,
        randomUUID: () => `request-${++requestNumber}`,
      },
    );

    const firstInitialize = client.initialize(createCoreAssets());
    await vi.waitFor(() =>
      expect(firstPort.postMessage).toHaveBeenCalledOnce(),
    );
    firstPort.emit({ type: "ready", requestId: "request-1" });
    await firstInitialize;

    client.restart();
    expect(firstPort.close).toHaveBeenCalledOnce();
    expect(firstRemoveFrame).toHaveBeenCalledOnce();

    const secondInitialize = client.initialize(createCoreAssets());
    await vi.waitFor(() =>
      expect(secondPort.postMessage).toHaveBeenCalledOnce(),
    );
    secondPort.emit({
      type: "ready",
      requestId: secondPort.postMessage.mock.calls[0][0].requestId,
    });
    await secondInitialize;

    expect(connect).toHaveBeenCalledTimes(2);
    client.terminate();
    expect(secondPort.close).toHaveBeenCalledOnce();
    expect(secondRemoveFrame).toHaveBeenCalledOnce();
  });
});

function createCoreAssets() {
  return {
    "busytex-worker": new Uint8Array([1]),
    "busytex-pipeline": new Uint8Array([2]),
    "busytex-js": new Uint8Array([3]),
    "busytex-wasm": new Uint8Array([4]),
    "texlive-basic-js": new Uint8Array([5]),
    "texlive-basic-data": new Uint8Array([6]),
  };
}
