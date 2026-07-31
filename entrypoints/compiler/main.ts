import { browser } from "wxt/browser";

import { BusyTexEngine } from "@/src/features/compiler/busytex-engine";

import { LatexCompiler } from "@/src/features/compiler/latex-compiler";

import { readCompileLog } from "@/src/features/compiler/compile-diagnostics";

import { base64ToBytes, bytesToBase64 } from "@/src/shared/base64";

import { createExportFileStem } from "@/src/features/export/export-file-name";

import { SourcePackageBuilder } from "@/src/features/export/source-package-builder";

import type {
  DownloadArtifactDescriptor,
  DownloadExportPayload,
} from "@/src/features/export/download-types";

import {
  isCompileInOffscreenRequest,
  type ChatTexCompileInOffscreenResponse,
  isPrepareDownloadsOffscreenRequest,
  type ChatTexPrepareDownloadsOffscreenResponse,
} from "@/src/shared/messages";

const compiler = new LatexCompiler(new BusyTexEngine());

const sourcePackageBuilder = new SourcePackageBuilder();

/*
 * Ensure only one compilation runs at a time.
 */
let compilationQueue: Promise<void> = Promise.resolve();

browser.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (isCompileInOffscreenRequest(message)) {
      compilationQueue = compilationQueue
        .catch(() => undefined)
        .then(async () => {
          const response = await compileProject(message.project);

          sendResponse(response);
        });

      return true;
    }

    if (isPrepareDownloadsOffscreenRequest(message)) {
      void prepareDownloadArtifacts(message.payload)
        .then(sendResponse)
        .catch((error) => {
          const response: ChatTexPrepareDownloadsOffscreenResponse = {
            ok: false,

            error:
              error instanceof Error
                ? error.message
                : "Unable to package export files.",
          };

          sendResponse(response);
        });

      return true;
    }

    return;
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

      omittedFiles: result.omittedFiles,
    };
  } catch (error) {
    return {
      ok: false,

      error: error instanceof Error ? error.message : "Unknown XeLaTeX error.",

      log: readCompileLog(error),
    };
  }
}

async function prepareDownloadArtifacts(
  payload: DownloadExportPayload,
): Promise<ChatTexPrepareDownloadsOffscreenResponse> {
  const exportedAt = new Date(payload.exportedAtIso);

  const fileStem = createExportFileStem(
    payload.title,
    Number.isNaN(exportedAt.getTime()) ? new Date() : exportedAt,
  );

  const sourceZip = await sourcePackageBuilder.build({
    title: payload.title,
    url: payload.url,

    exportedAtIso: payload.exportedAtIso,

    latexSource: payload.latexSource,

    files: payload.files,
    failures: payload.failures,
  });

  const artifacts: DownloadArtifactDescriptor[] = [
    createArtifactDescriptor(
      "pdf",
      `${fileStem}.pdf`,
      "application/pdf",

      base64ToBytes(payload.pdfBase64),
    ),

    createArtifactDescriptor(
      "tex",
      `${fileStem}.tex`,
      "application/x-tex",

      new TextEncoder().encode(payload.latexSource),
    ),

    createArtifactDescriptor(
      "source",

      `${fileStem}-source.zip`,

      "application/zip",
      sourceZip,
    ),
  ];

  return {
    ok: true,
    artifacts,
  };
}

function createArtifactDescriptor(
  kind: DownloadArtifactDescriptor["kind"],

  filename: string,
  mimeType: string,
  bytes: Uint8Array,
): DownloadArtifactDescriptor {
  const blob = new Blob([copyToArrayBuffer(bytes)], {
    type: mimeType,
  });

  const objectUrl = URL.createObjectURL(blob);

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 120_000);

  return {
    kind,
    filename,
    mimeType,
    objectUrl,
    byteLength: bytes.byteLength,
  };
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);

  copy.set(bytes);

  return copy.buffer;
}
