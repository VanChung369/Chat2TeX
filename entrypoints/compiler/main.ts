import { browser } from "wxt/browser";

import {
  BusyTexCompileError,
  BusyTexEngine,
} from "@/src/features/compiler/busytex-engine";

import { LatexCompiler } from "@/src/features/compiler/latex-compiler";

import { base64ToBytes, bytesToBase64 } from "@/src/shared/base64";

import {
  isCompileInOffscreenRequest,
  type ChatTexCompileInOffscreenResponse,
} from "@/src/shared/messages";

const compiler = new LatexCompiler(new BusyTexEngine());

/*
 * Đảm bảo chỉ có một lần compile
 * chạy tại một thời điểm.
 */
let compilationQueue: Promise<void> = Promise.resolve();

browser.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (!isCompileInOffscreenRequest(message)) {
      return;
    }

    compilationQueue = compilationQueue
      .catch(() => undefined)
      .then(async () => {
        const response = await compileProject(message.project);

        sendResponse(response);
      });

    return true;
  },
);

async function compileProject(project: {
  source: string;

  files: Array<{
    path: string;
    base64: string;
  }>;
}): Promise<ChatTexCompileInOffscreenResponse> {
  try {
    const result = await compiler.compile({
      source: project.source,

      files: project.files.map((file) => ({
        path: file.path,

        content: base64ToBytes(file.base64),
      })),
    });

    return {
      ok: true,
      pdfBase64: bytesToBase64(result.pdf),

      byteLength: result.pdf.byteLength,

      log: result.log,
    };
  } catch (error) {
    return {
      ok: false,

      error: error instanceof Error ? error.message : "Unknown XeLaTeX error.",

      log: error instanceof BusyTexCompileError ? error.compileLog : "",
    };
  }
}
