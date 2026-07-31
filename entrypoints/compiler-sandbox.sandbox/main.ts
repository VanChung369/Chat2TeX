import { base64ToBytes } from "@/src/shared/base64";
import {
  createSandboxHandshakeGate,
  getSandboxEventTransferables,
  parseSandboxCommand,
  SANDBOX_CONNECTED_MESSAGE,
  SANDBOX_CONNECT_MESSAGE,
  type SandboxCommand,
  type SandboxEvent,
} from "@/src/features/compiler/sandbox-protocol";
import { createSandboxWorkerSource } from "@/src/features/compiler/sandbox-worker-source";

const ASSET_MIME_TYPES = {
  "busytex-worker": "text/javascript",
  "busytex-pipeline": "text/javascript",
  "busytex-js": "text/javascript",
  "busytex-wasm": "application/wasm",
  "texlive-basic-js": "text/javascript",
  "texlive-basic-data": "application/octet-stream",
} as const;

interface ActiveWorkerRequest {
  type: "initialize" | "compile" | "write-remote-files";
  requestId: string;
}

const handshakeGate = createSandboxHandshakeGate(parent);
let commandPort: MessagePort | null = null;
let worker: Worker | null = null;
let assetUrls: string[] = [];
let activeWorkerRequest: ActiveWorkerRequest | null = null;
let texliveBasicJsUrl: string | null = null;

window.addEventListener("message", acceptConnection);

function acceptConnection(event: MessageEvent): void {
  const data = event.data as {
    type?: unknown;
    nonce?: unknown;
  };
  if (
    data?.type !== SANDBOX_CONNECT_MESSAGE ||
    typeof data.nonce !== "string" ||
    event.ports.length !== 1 ||
    !handshakeGate.accept(event.source as WindowProxy | null, data.nonce)
  ) {
    return;
  }

  window.removeEventListener("message", acceptConnection);
  commandPort = event.ports[0];
  commandPort.onmessage = (portEvent) => {
    handleCommandValue(portEvent.data);
  };
  commandPort.start();
  parent.postMessage(
    {
      type: SANDBOX_CONNECTED_MESSAGE,
      nonce: data.nonce,
    },
    "*",
  );
}

function handleCommandValue(value: unknown): void {
  let command: SandboxCommand;
  try {
    command = parseSandboxCommand(value);
  } catch {
    return;
  }

  if (command.type === "terminate") {
    terminateRuntime();
    commandPort?.close();
    commandPort = null;
    return;
  }
  if (activeWorkerRequest) {
    postEvent({
      type: "error",
      requestId: command.requestId,
      message: "The compiler sandbox is already processing a request.",
      log: "",
    });
    return;
  }

  try {
    if (command.type === "initialize") {
      initializeWorker(command);
    } else if (command.type === "compile") {
      compileProject(command);
    } else {
      writeRemoteFiles(command);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sandbox command failed.";
    activeWorkerRequest = null;
    if (command.type === "initialize") {
      terminateRuntime();
    }
    postEvent({
      type: "error",
      requestId: command.requestId,
      message,
      log: "",
    });
  }
}

function initializeWorker(
  command: Extract<SandboxCommand, { type: "initialize" }>,
): void {
  terminateRuntime();
  const urls = Object.fromEntries(
    Object.entries(command.assets).map(([id, bytes]) => {
      const url = URL.createObjectURL(
        new Blob([bytes], {
          type: ASSET_MIME_TYPES[id as keyof typeof ASSET_MIME_TYPES],
        }),
      );
      assetUrls.push(url);
      return [id, url];
    }),
  ) as Record<keyof typeof ASSET_MIME_TYPES, string>;

  const decoder = new TextDecoder();
  const compositeSource = createSandboxWorkerSource({
    pipelineSource: decoder.decode(
      command.assets["busytex-pipeline"],
    ),
    workerSource: decoder.decode(command.assets["busytex-worker"]),
    basicDataUrl: urls["texlive-basic-data"],
  });
  const compositeWorkerUrl = URL.createObjectURL(
    new Blob([compositeSource], { type: "text/javascript" }),
  );
  assetUrls.push(compositeWorkerUrl);

  texliveBasicJsUrl = urls["texlive-basic-js"];
  worker = new Worker(compositeWorkerUrl);
  worker.onmessage = handleWorkerMessage;
  worker.onerror = (event) => {
    event.preventDefault();
    failActiveRequest("BusyTeX worker failed.", event.message);
  };
  activeWorkerRequest = {
    type: "initialize",
    requestId: command.requestId,
  };
  worker.postMessage({
    busytex_js: urls["busytex-js"],
    busytex_wasm: urls["busytex-wasm"],
    preload_data_packages_js: [urls["texlive-basic-js"]],
    data_packages_js: [urls["texlive-basic-js"]],
    texmf_local: [],
    preload: true,
  });
}

function compileProject(
  command: Extract<SandboxCommand, { type: "compile" }>,
): void {
  const activeWorker = requireWorker();
  const basicJsUrl = requireTexliveBasicJsUrl();
  activeWorkerRequest = {
    type: "compile",
    requestId: command.requestId,
  };
  activeWorker.postMessage({
    files: [
      {
        path: "main.tex",
        contents: command.project.source,
      },
      ...command.project.files.map((file) => ({
        path: file.path,
        contents: base64ToBytes(file.base64),
      })),
    ],
    main_tex_path: "main.tex",
    bibtex: null,
    makeindex: null,
    rerun: null,
    verbose: "silent",
    driver: "xetex_bibtex8_dvipdfmx",
    data_packages_js: [basicJsUrl],
    remote_endpoint: "https://chat2tex.invalid",
    shell_escape: false,
  });
}

function writeRemoteFiles(
  command: Extract<
    SandboxCommand,
    { type: "write-remote-files" }
  >,
): void {
  const activeWorker = requireWorker();
  activeWorkerRequest = {
    type: "write-remote-files",
    requestId: command.requestId,
  };
  activeWorker.postMessage({
    write_texlive_remote_files: command.files.map((file) => ({
      format: file.format,
      name: file.name,
      contents: new Uint8Array(file.content),
    })),
  });
}

function handleWorkerMessage(event: MessageEvent): void {
  const data = event.data as Record<string, unknown>;
  const active = activeWorkerRequest;
  if (!active) {
    return;
  }

  if (typeof data.print === "string") {
    postEvent({
      type: "progress",
      requestId: active.requestId,
      message: data.print,
    });
    return;
  }
  if (data.exception !== undefined) {
    failActiveRequest(
      "BusyTeX sandbox operation failed.",
      String(data.exception),
    );
    return;
  }
  if (active.type === "initialize" && data.initialized !== undefined) {
    activeWorkerRequest = null;
    postEvent({ type: "ready", requestId: active.requestId });
    return;
  }
  if (
    active.type === "write-remote-files" &&
    data.texlive_remote_written === true
  ) {
    activeWorkerRequest = null;
    postEvent({
      type: "remote-files-written",
      requestId: active.requestId,
    });
    return;
  }
  if (active.type === "compile" && data.pdf !== undefined) {
    const pdf = copyToArrayBuffer(data.pdf);
    activeWorkerRequest = null;
    postEvent({
      type: "compile-result",
      requestId: active.requestId,
      success: data.exit_code === 0 && pdf.byteLength > 0,
      ...(pdf.byteLength === 0 ? {} : { pdf }),
      log: typeof data.log === "string" ? data.log : "",
      exitCode:
        typeof data.exit_code === "number" ? data.exit_code : -1,
      packageLookups: Array.isArray(data.packageLookups)
        ? data.packageLookups
        : [],
    });
  }
}

function failActiveRequest(message: string, log: string): void {
  const active = activeWorkerRequest;
  if (!active) {
    return;
  }
  activeWorkerRequest = null;
  if (active.type === "initialize") {
    terminateRuntime();
  }
  postEvent({
    type: "error",
    requestId: active.requestId,
    message,
    log,
  });
}

function postEvent(event: SandboxEvent): void {
  commandPort?.postMessage(event, getSandboxEventTransferables(event));
}

function requireWorker(): Worker {
  if (!worker) {
    throw new Error("BusyTeX sandbox has not been initialized.");
  }
  return worker;
}

function requireTexliveBasicJsUrl(): string {
  if (!texliveBasicJsUrl) {
    throw new Error("BusyTeX basic data has not been initialized.");
  }
  return texliveBasicJsUrl;
}

function terminateRuntime(): void {
  worker?.terminate();
  worker = null;
  activeWorkerRequest = null;
  texliveBasicJsUrl = null;
  for (const url of assetUrls) {
    URL.revokeObjectURL(url);
  }
  assetUrls = [];
}

function copyToArrayBuffer(value: unknown): ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    );
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
  }
  return new ArrayBuffer(0);
}
