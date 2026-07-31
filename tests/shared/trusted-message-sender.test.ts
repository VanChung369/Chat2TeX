import { describe, expect, it } from "vitest";

import {
  isBackgroundRuntimeSender,
  isCompilerDocumentRuntimeSender,
  isTrustedPublicRuntimeSender,
} from "@/src/shared/trusted-message-sender";

const runtimeId = "extension-id";
const backgroundUrl =
  "chrome-extension://extension-id/background.js";

describe("trusted runtime senders", () => {
  it.each([
    "https://chatgpt.com/c/abc",
    "https://chat.openai.com/c/abc",
  ])("accepts the supported content-script host %s", (url) => {
    expect(
      isTrustedPublicRuntimeSender(
        { id: runtimeId, tab: { url } },
        runtimeId,
      ),
    ).toBe(true);
  });

  it.each([
    "https://evil.chatgpt.com/c/abc",
    "https://platform.openai.com/",
    "https://openai.com/",
    "https://chatgpt.com.evil.test/",
  ])("rejects unsupported content-script host %s", (url) => {
    expect(
      isTrustedPublicRuntimeSender(
        { id: runtimeId, tab: { url } },
        runtimeId,
      ),
    ).toBe(false);
  });

  it("accepts extension pages but identifies only background.js as internal", () => {
    expect(
      isTrustedPublicRuntimeSender(
        {
          id: runtimeId,
          url: "chrome-extension://extension-id/popup.html",
        },
        runtimeId,
      ),
    ).toBe(true);
    expect(
      isBackgroundRuntimeSender(
        { id: runtimeId, url: backgroundUrl },
        runtimeId,
        backgroundUrl,
      ),
    ).toBe(true);
    expect(
      isBackgroundRuntimeSender(
        {
          id: runtimeId,
          url: "chrome-extension://extension-id/popup.html",
        },
        runtimeId,
        backgroundUrl,
      ),
    ).toBe(false);
  });

  it("accepts an extension page opened in a browser tab", () => {
    expect(
      isTrustedPublicRuntimeSender(
        {
          id: runtimeId,
          url: "chrome-extension://extension-id/popup.html",
          tab: {
            url: "chrome-extension://extension-id/popup.html",
          },
        },
        runtimeId,
      ),
    ).toBe(true);
  });

  it("rejects senders without an owned extension URL or supported tab", () => {
    expect(
      isTrustedPublicRuntimeSender({ id: runtimeId }, runtimeId),
    ).toBe(false);
    expect(
      isTrustedPublicRuntimeSender(
        {
          id: runtimeId,
          url: "chrome-extension://another-extension/popup.html",
        },
        runtimeId,
      ),
    ).toBe(false);
  });

  it("identifies only the exact offscreen compiler document", () => {
    const compilerUrl =
      "chrome-extension://extension-id/compiler.html";
    expect(
      isCompilerDocumentRuntimeSender(
        { id: runtimeId, url: compilerUrl },
        runtimeId,
        compilerUrl,
      ),
    ).toBe(true);
    expect(
      isCompilerDocumentRuntimeSender(
        {
          id: runtimeId,
          url: compilerUrl,
          tab: { url: compilerUrl },
        },
        runtimeId,
        compilerUrl,
      ),
    ).toBe(false);
    expect(
      isCompilerDocumentRuntimeSender(
        {
          id: runtimeId,
          url: "chrome-extension://extension-id/popup.html",
        },
        runtimeId,
        compilerUrl,
      ),
    ).toBe(false);
  });
});
