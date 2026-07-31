import type { CoreAssetId } from "./compiler-core-assets.generated";
import {
  getSandboxCommandTransferables,
  parseSandboxEvent,
  SANDBOX_CONNECTED_MESSAGE,
  SANDBOX_CONNECT_MESSAGE,
  type SandboxCommand,
  type SandboxCompileResult,
  type SandboxEvent,
  type TexliveRemoteFile,
} from "./sandbox-protocol";
import type { SerializedCompileProject } from "./types";

interface ConnectedSandbox {
  port: MessagePort;
  removeFrame: () => void;
}

interface SandboxCompilerClientDependencies {
  connect?: (
    hostDocument: Document,
    sandboxUrl: string,
    nonce: string,
    timeoutMs: number,
  ) => Promise<ConnectedSandbox>;
  randomUUID?: () => string;
}

interface PendingRequest {
  expectedType: SandboxEvent["type"];
  resolve: (event: SandboxEvent) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_INITIALIZE_TIMEOUT_MS = 120_000;
const DEFAULT_COMPILE_TIMEOUT_MS = 180_000;

export class SandboxCompilerCrashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxCompilerCrashError";
  }
}

export class SandboxCompilerClient {
  private readonly connect: NonNullable<
    SandboxCompilerClientDependencies["connect"]
  >;
  private readonly randomUUID: () => string;
  private connectionPromise: Promise<ConnectedSandbox> | null = null;
  private connected: ConnectedSandbox | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private terminated = false;
  private generation = 0;

  constructor(
    private readonly hostDocument: Document,
    private readonly sandboxUrl: string,
    private readonly timeoutMs = DEFAULT_INITIALIZE_TIMEOUT_MS,
    dependencies: SandboxCompilerClientDependencies = {},
  ) {
    this.connect = dependencies.connect ?? connectSandboxFrame;
    this.randomUUID =
      dependencies.randomUUID ?? (() => crypto.randomUUID());
  }

  async initialize(
    assets: Record<CoreAssetId, Uint8Array>,
  ): Promise<void> {
    const copiedAssets = Object.fromEntries(
      Object.entries(assets).map(([id, bytes]) => [
        id,
        copyToArrayBuffer(bytes),
      ]),
    ) as Record<CoreAssetId, ArrayBuffer>;
    const requestId = this.randomUUID();
    await this.sendRequest(
      {
        type: "initialize",
        requestId,
        assets: copiedAssets,
      },
      "ready",
      this.timeoutMs,
    );
  }

  async compile(
    project: SerializedCompileProject,
  ): Promise<SandboxCompileResult> {
    const requestId = this.randomUUID();
    const event = await this.sendRequest(
      {
        type: "compile",
        requestId,
        project,
      },
      "compile-result",
      this.timeoutMs === DEFAULT_INITIALIZE_TIMEOUT_MS
        ? DEFAULT_COMPILE_TIMEOUT_MS
        : this.timeoutMs,
    );
    if (event.type !== "compile-result") {
      throw new Error("Invalid sandbox compile response.");
    }
    return {
      success: event.success,
      ...(event.pdf === undefined ? {} : { pdf: event.pdf }),
      log: event.log,
      exitCode: event.exitCode,
      packageLookups: event.packageLookups,
    };
  }

  async writeRemoteFiles(files: TexliveRemoteFile[]): Promise<void> {
    const requestId = this.randomUUID();
    await this.sendRequest(
      {
        type: "write-remote-files",
        requestId,
        files: files.map((file) => ({
          format: file.format,
          name: file.name,
          content: copyToArrayBuffer(file.content),
        })),
      },
      "remote-files-written",
      this.timeoutMs,
    );
  }

  terminate(): void {
    if (this.terminated) {
      return;
    }
    this.terminated = true;
    this.closeConnection(
      new SandboxCompilerCrashError(
        "Sandbox compiler client was terminated.",
      ),
    );
  }

  restart(): void {
    this.closeConnection(
      new SandboxCompilerCrashError(
        "Sandbox compiler client is restarting after a failure.",
      ),
    );
    this.terminated = false;
  }

  private closeConnection(error: Error): void {
    this.generation += 1;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();

    const connection = this.connected;
    this.connected = null;
    this.connectionPromise = null;
    if (connection) {
      this.postTermination(connection.port);
      connection.port.close();
      connection.removeFrame();
    }
  }

  private assertNotTerminated(): void {
    if (this.terminated) {
      throw new SandboxCompilerCrashError(
      "Sandbox compiler client was terminated.",
      );
    }
  }

  private async sendRequest(
    command: SandboxCommand,
    expectedType: SandboxEvent["type"],
    timeoutMs: number,
  ): Promise<SandboxEvent> {
    this.assertNotTerminated();
    const connection = await this.ensureConnected();
    this.assertNotTerminated();

    return new Promise<SandboxEvent>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(command.requestId);
        reject(
          new SandboxCompilerCrashError(
            `Sandbox ${command.type} request timed out after ${timeoutMs}ms.`,
          ),
        );
      }, timeoutMs);
      this.pending.set(command.requestId, {
        expectedType,
        resolve,
        reject,
        timeout,
      });
      connection.port.postMessage(
        command,
        getSandboxCommandTransferables(command),
      );
    });
  }

  private async ensureConnected(): Promise<ConnectedSandbox> {
    if (this.connected) {
      return this.connected;
    }
    const generation = this.generation;
    this.connectionPromise ??= this.connect(
      this.hostDocument,
      this.sandboxUrl,
      this.randomUUID(),
      this.timeoutMs,
    ).then((connection) => {
      if (this.terminated || generation !== this.generation) {
        this.postTermination(connection.port);
        connection.port.close();
        connection.removeFrame();
        throw new SandboxCompilerCrashError(
          "Sandbox connection was replaced before it became ready.",
        );
      }
      connection.port.onmessage = (event) => {
        this.handleMessage(event.data);
      };
      connection.port.start();
      this.connected = connection;
      return connection;
    });
    return this.connectionPromise;
  }

  private handleMessage(value: unknown): void {
    let event: SandboxEvent;
    try {
      event = parseSandboxEvent(value);
    } catch {
      return;
    }
    if (event.type === "progress") {
      return;
    }

    const pending = this.pending.get(event.requestId);
    if (!pending) {
      return;
    }
    if (event.type === "error") {
      clearTimeout(pending.timeout);
      this.pending.delete(event.requestId);
      pending.reject(new SandboxCompilerCrashError(event.message));
      return;
    }
    if (event.type !== pending.expectedType) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(event.requestId);
    pending.resolve(event);
  }

  private postTermination(port: MessagePort): void {
    const command: SandboxCommand = {
      type: "terminate",
      requestId: this.randomUUID(),
    };
    port.postMessage(command);
  }
}

export async function connectSandboxFrame(
  hostDocument: Document,
  sandboxUrl: string,
  nonce: string,
  timeoutMs: number,
): Promise<ConnectedSandbox> {
  const hostWindow = hostDocument.defaultView;
  if (!hostWindow) {
    throw new Error("Sandbox host window is unavailable.");
  }

  const iframe = hostDocument.createElement("iframe");
  iframe.hidden = true;
  iframe.src = sandboxUrl;
  iframe.setAttribute("aria-hidden", "true");
  const channel = new MessageChannel();

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Sandbox connection timed out."));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timeout);
        hostWindow.removeEventListener("message", onMessage);
        iframe.removeEventListener("load", onLoad);
      };
      const onMessage = (event: MessageEvent) => {
        if (
          event.source !== iframe.contentWindow ||
          event.origin !== "null" ||
          !isConnectedMessage(event.data, nonce)
        ) {
          return;
        }
        cleanup();
        resolve();
      };
      const onLoad = () => {
        if (!iframe.contentWindow) {
          cleanup();
          reject(new Error("Sandbox frame window is unavailable."));
          return;
        }
        iframe.contentWindow.postMessage(
          {
            type: SANDBOX_CONNECT_MESSAGE,
            nonce,
          },
          "*",
          [channel.port2],
        );
      };

      hostWindow.addEventListener("message", onMessage);
      iframe.addEventListener("load", onLoad);
      (hostDocument.body ?? hostDocument.documentElement).append(iframe);
    });
  } catch (error) {
    channel.port1.close();
    channel.port2.close();
    iframe.remove();
    throw error;
  }

  return {
    port: channel.port1,
    removeFrame: () => iframe.remove(),
  };
}

function isConnectedMessage(value: unknown, nonce: string): boolean {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === SANDBOX_CONNECTED_MESSAGE &&
    (value as { nonce?: unknown }).nonce === nonce
  );
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
