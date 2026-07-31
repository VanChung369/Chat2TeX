import type { CoreAssetId } from "./compiler-core-assets.generated";
import {
  parsePackageLookup,
  type PackageLookup,
} from "./asset-manifest";
import type { SerializedCompileProject } from "./types";

export const SANDBOX_CONNECT_MESSAGE = "CHAT2TEX_SANDBOX_CONNECT";
export const SANDBOX_CONNECTED_MESSAGE =
  "CHAT2TEX_SANDBOX_CONNECTED";

export type SandboxCommand =
  | {
      type: "initialize";
      requestId: string;
      assets: Record<CoreAssetId, ArrayBuffer>;
    }
  | {
      type: "compile";
      requestId: string;
      project: SerializedCompileProject;
    }
  | {
      type: "write-remote-files";
      requestId: string;
      files: Array<{
        format: PackageLookup["format"];
        name: string;
        content: ArrayBuffer;
      }>;
    }
  | { type: "terminate"; requestId: string };

export type SandboxEvent =
  | { type: "ready"; requestId: string }
  | {
      type: "progress";
      requestId: string;
      message: string;
      loaded?: number;
      total?: number;
    }
  | {
      type: "compile-result";
      requestId: string;
      success: boolean;
      pdf?: ArrayBuffer;
      log: string;
      exitCode: number;
      packageLookups: PackageLookup[];
    }
  | { type: "remote-files-written"; requestId: string }
  | {
      type: "error";
      requestId: string;
      message: string;
      log: string;
    };

export interface SandboxCompileResult {
  success: boolean;
  pdf?: ArrayBuffer;
  log: string;
  exitCode: number;
  packageLookups: PackageLookup[];
}

export interface TexliveRemoteFile {
  format: PackageLookup["format"];
  name: string;
  content: Uint8Array;
}

export interface SandboxHandshakeGate {
  accept(source: WindowProxy | null, nonce: string): boolean;
}

const CORE_ASSET_IDS = [
  "busytex-worker",
  "busytex-pipeline",
  "busytex-js",
  "busytex-wasm",
  "texlive-basic-js",
  "texlive-basic-data",
] as const satisfies readonly CoreAssetId[];

export function createSandboxHandshakeGate(
  expectedParent: WindowProxy,
): SandboxHandshakeGate {
  let accepted = false;
  return {
    accept(source, nonce) {
      if (
        accepted ||
        source !== expectedParent ||
        typeof nonce !== "string" ||
        nonce.length === 0 ||
        nonce.length > 255
      ) {
        return false;
      }
      accepted = true;
      return true;
    },
  };
}

export function parseSandboxCommand(value: unknown): SandboxCommand {
  if (!isRecord(value) || !isRequestId(value.requestId)) {
    throw new Error("Invalid sandbox command.");
  }

  if (value.type === "initialize") {
    if (!isRecord(value.assets)) {
      throw new Error("Invalid sandbox command.");
    }
    const assets = value.assets;
    const keys = Object.keys(assets);
    if (
      keys.length !== CORE_ASSET_IDS.length ||
      !CORE_ASSET_IDS.every((id) => isArrayBuffer(assets[id]))
    ) {
      throw new Error("Invalid sandbox command.");
    }
    return {
      type: "initialize",
      requestId: value.requestId,
      assets: assets as unknown as Record<CoreAssetId, ArrayBuffer>,
    };
  }

  if (value.type === "compile") {
    if (!isSerializedCompileProject(value.project)) {
      throw new Error("Invalid sandbox command.");
    }
    return value as SandboxCommand;
  }

  if (value.type === "write-remote-files") {
    if (!Array.isArray(value.files)) {
      throw new Error("Invalid sandbox command.");
    }
    const files = value.files.map((file) => {
      if (!isRecord(file) || !isArrayBuffer(file.content)) {
        throw new Error("Invalid sandbox command.");
      }
      const lookup = parsePackageLookup(file);
      return { ...lookup, content: file.content };
    });
    return {
      type: "write-remote-files",
      requestId: value.requestId,
      files,
    };
  }

  if (value.type === "terminate") {
    return {
      type: "terminate",
      requestId: value.requestId,
    };
  }

  throw new Error("Invalid sandbox command.");
}

export function parseSandboxEvent(value: unknown): SandboxEvent {
  if (
    !isRecord(value) ||
    !isRequestId(value.requestId) ||
    typeof value.type !== "string"
  ) {
    throw new Error("Invalid sandbox event.");
  }

  if (
    value.type === "ready" ||
    value.type === "remote-files-written"
  ) {
    return {
      type: value.type,
      requestId: value.requestId,
    };
  }

  if (value.type === "progress" && typeof value.message === "string") {
    if (
      (value.loaded !== undefined && typeof value.loaded !== "number") ||
      (value.total !== undefined && typeof value.total !== "number")
    ) {
      throw new Error("Invalid sandbox event.");
    }
    return value as unknown as SandboxEvent;
  }

  if (
    value.type === "compile-result" &&
    typeof value.success === "boolean" &&
    typeof value.log === "string" &&
    typeof value.exitCode === "number" &&
    (value.pdf === undefined || isArrayBuffer(value.pdf)) &&
    Array.isArray(value.packageLookups)
  ) {
    return {
      type: "compile-result",
      requestId: value.requestId,
      success: value.success,
      ...(value.pdf === undefined ? {} : { pdf: value.pdf }),
      log: value.log,
      exitCode: value.exitCode,
      packageLookups: value.packageLookups.map(parsePackageLookup),
    };
  }

  if (
    value.type === "error" &&
    typeof value.message === "string" &&
    typeof value.log === "string"
  ) {
    return {
      type: "error",
      requestId: value.requestId,
      message: value.message,
      log: value.log,
    };
  }

  throw new Error("Invalid sandbox event.");
}

export function getSandboxCommandTransferables(
  command: SandboxCommand,
): Transferable[] {
  if (command.type === "initialize") {
    return CORE_ASSET_IDS.map((id) => command.assets[id]);
  }
  if (command.type === "write-remote-files") {
    return command.files.map((file) => file.content);
  }
  return [];
}

export function getSandboxEventTransferables(
  event: SandboxEvent,
): Transferable[] {
  return event.type === "compile-result" && event.pdf
    ? [event.pdf]
    : [];
}

function isSerializedCompileProject(
  value: unknown,
): value is SerializedCompileProject {
  return (
    isRecord(value) &&
    typeof value.source === "string" &&
    Array.isArray(value.files) &&
    value.files.every(
      (file) =>
        isRecord(file) &&
        typeof file.path === "string" &&
        typeof file.base64 === "string",
    )
  );
}

function isRequestId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255
  );
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return Object.prototype.toString.call(value) === "[object ArrayBuffer]";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
