import { base64ToBytes } from "@/src/shared/base64";

import type {
  DownloadArtifactDescriptor,
  DownloadExportPayload,
  PrepareDownloadResult,
} from "./download-types";
import { createExportFileStem } from "./export-file-name";
import { createExportWorkPlan } from "./output-plan";
import type { SourcePackageBuilder } from "./source-package-builder";

export interface PrepareDownloadDependencies {
  sourcePackageBuilder: Pick<SourcePackageBuilder, "build">;
  createObjectUrl?: (blob: Blob) => string;
  signal?: AbortSignal;
}

export interface PrepareDownloadPayload
  extends Omit<DownloadExportPayload, "pdfBase64"> {
  pdfBase64?: string;
  pdfBytes?: Uint8Array;
}

interface PendingArtifact {
  kind: DownloadArtifactDescriptor["kind"];
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

export async function prepareDownloadArtifacts(
  payload: PrepareDownloadPayload,
  dependencies: PrepareDownloadDependencies,
): Promise<PrepareDownloadResult> {
  throwIfAborted(dependencies.signal);
  const plan = createExportWorkPlan(payload.outputKinds);
  const exportedAt = new Date(payload.exportedAtIso);
  const fileStem = createExportFileStem(
    payload.title,
    Number.isNaN(exportedAt.getTime()) ? new Date() : exportedAt,
  );
  const pending: PendingArtifact[] = [];

  if (plan.needsPdfArtifact) {
    if (!payload.pdfBytes && !payload.pdfBase64) {
      throw new Error("PDF bytes are unavailable for this export.");
    }
    const bytes =
      payload.pdfBytes ?? base64ToBytes(payload.pdfBase64!);
    throwIfAborted(dependencies.signal);
    pending.push({
      kind: "pdf",
      filename: `${fileStem}.pdf`,
      mimeType: "application/pdf",
      bytes,
    });
  }

  if (plan.needsTexArtifact) {
    throwIfAborted(dependencies.signal);
    const bytes = new TextEncoder().encode(payload.latexSource);
    throwIfAborted(dependencies.signal);
    pending.push({
      kind: "tex",
      filename: `${fileStem}.tex`,
      mimeType: "application/x-tex",
      bytes,
    });
  }

  if (plan.needsSourceArchive) {
    throwIfAborted(dependencies.signal);
    const bytes = await dependencies.sourcePackageBuilder.build({
      title: payload.title,
      url: payload.url,
      exportedAtIso: payload.exportedAtIso,
      latexSource: payload.latexSource,
      files: payload.files,
      failures: payload.failures,
    });
    throwIfAborted(dependencies.signal);
    pending.push({
      kind: "source",
      filename: `${fileStem}-source.zip`,
      mimeType: "application/zip",
      bytes,
    });
  }

  const createObjectUrl =
    dependencies.createObjectUrl ?? URL.createObjectURL;
  const artifacts = pending.map((artifact) => {
    throwIfAborted(dependencies.signal);
    const objectUrl = createObjectUrl(
      new Blob([copyToArrayBuffer(artifact.bytes)], {
        type: artifact.mimeType,
      }),
    );
    return {
      kind: artifact.kind,
      filename: artifact.filename,
      mimeType: artifact.mimeType,
      objectUrl,
      byteLength: artifact.bytes.byteLength,
    };
  });

  return { ok: true, artifacts };
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");
}
