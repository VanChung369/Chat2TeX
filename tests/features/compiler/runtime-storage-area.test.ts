import { describe, expect, it, vi } from "vitest";

import {
  RuntimeStorageArea,
  runCompilerStorageRequest,
} from "@/src/features/compiler/runtime-storage-area";
import {
  CHATTEX_COMPILER_STORAGE,
  type ChatTexCompilerStorageRequest,
} from "@/src/shared/messages";

describe("RuntimeStorageArea", () => {
  it("proxies storage operations through runtime messaging", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        values: { snapshot: { phase: "completed" } },
      })
      .mockResolvedValue({ ok: true });
    const storage = new RuntimeStorageArea("session", {
      sendMessage,
    });

    await expect(storage.get("snapshot")).resolves.toEqual({
      snapshot: { phase: "completed" },
    });
    await storage.set({ snapshot: { phase: "compiling" } });
    await storage.remove("snapshot");
    await storage.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS",
    });

    expect(sendMessage.mock.calls.map(([message]) => message)).toEqual([
      {
        type: CHATTEX_COMPILER_STORAGE,
        area: "session",
        operation: "get",
        key: "snapshot",
      },
      {
        type: CHATTEX_COMPILER_STORAGE,
        area: "session",
        operation: "set",
        items: { snapshot: { phase: "compiling" } },
      },
      {
        type: CHATTEX_COMPILER_STORAGE,
        area: "session",
        operation: "remove",
        key: "snapshot",
      },
      {
        type: CHATTEX_COMPILER_STORAGE,
        area: "session",
        operation: "set-access-level",
      },
    ]);
  });

  it("surfaces background storage failures", async () => {
    const storage = new RuntimeStorageArea("local", {
      sendMessage: vi.fn().mockResolvedValue({
        ok: false,
        error: "Storage unavailable.",
      }),
    });

    await expect(storage.get("metadata")).rejects.toThrow(
      "Storage unavailable.",
    );
  });
});

describe("runCompilerStorageRequest", () => {
  it("executes only the requested browser storage operation", async () => {
    const values = { metadata: { schemaVersion: 1 } };
    const local = {
      get: vi.fn().mockResolvedValue(values),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      setAccessLevel: vi.fn().mockResolvedValue(undefined),
    };
    const session = {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      setAccessLevel: vi.fn(),
    };
    const request: ChatTexCompilerStorageRequest = {
      type: CHATTEX_COMPILER_STORAGE,
      area: "local",
      operation: "get",
      key: "metadata",
    };

    await expect(
      runCompilerStorageRequest(request, { local, session }),
    ).resolves.toEqual({ ok: true, values });
    expect(local.get).toHaveBeenCalledWith("metadata");
    expect(session.get).not.toHaveBeenCalled();
  });
});
