import { browser } from "wxt/browser";

import {
  CHATTEX_COMPILER_STORAGE,
  type ChatTexCompilerStorageRequest,
  type ChatTexCompilerStorageResponse,
  type CompilerStorageAreaName,
} from "@/src/shared/messages";

interface RuntimeMessenger {
  sendMessage(message: unknown): Promise<unknown>;
}

export interface BrowserStorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
  setAccessLevel?(options: {
    accessLevel: "TRUSTED_CONTEXTS";
  }): Promise<void>;
}

export interface BrowserStorageAreas {
  local: BrowserStorageAreaLike;
  session: BrowserStorageAreaLike;
}

export class RuntimeStorageArea {
  constructor(
    private readonly area: CompilerStorageAreaName,
    private readonly runtime: RuntimeMessenger = browser.runtime,
  ) {}

  async get(key: string): Promise<Record<string, unknown>> {
    const response = await this.request({
      type: CHATTEX_COMPILER_STORAGE,
      area: this.area,
      operation: "get",
      key,
    });
    if (
      !response.values ||
      typeof response.values !== "object" ||
      Array.isArray(response.values)
    ) {
      throw new Error("Compiler storage returned invalid values.");
    }
    return response.values;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    await this.request({
      type: CHATTEX_COMPILER_STORAGE,
      area: this.area,
      operation: "set",
      items,
    });
  }

  async remove(key: string): Promise<void> {
    await this.request({
      type: CHATTEX_COMPILER_STORAGE,
      area: this.area,
      operation: "remove",
      key,
    });
  }

  async setAccessLevel(_options: {
    accessLevel: "TRUSTED_CONTEXTS";
  }): Promise<void> {
    await this.request({
      type: CHATTEX_COMPILER_STORAGE,
      area: this.area,
      operation: "set-access-level",
    });
  }

  private async request(
    message: ChatTexCompilerStorageRequest,
  ): Promise<Extract<ChatTexCompilerStorageResponse, { ok: true }>> {
    const response = (await this.runtime.sendMessage(
      message,
    )) as ChatTexCompilerStorageResponse | null;
    if (!response || response.ok !== true) {
      throw new Error(
        response?.error ?? "Compiler storage did not respond.",
      );
    }
    return response;
  }
}

export async function runCompilerStorageRequest(
  request: ChatTexCompilerStorageRequest,
  areas: BrowserStorageAreas,
): Promise<ChatTexCompilerStorageResponse> {
  try {
    const area = areas[request.area];
    if (request.operation === "get") {
      return {
        ok: true,
        values: await area.get(request.key!),
      };
    }
    if (request.operation === "set") {
      await area.set(request.items!);
    } else if (request.operation === "remove") {
      await area.remove(request.key!);
    } else {
      await area.setAccessLevel?.({
        accessLevel: "TRUSTED_CONTEXTS",
      });
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Compiler storage operation failed.",
    };
  }
}
