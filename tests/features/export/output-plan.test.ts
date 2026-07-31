import { describe, expect, it, vi } from "vitest";

import {
  createExportWorkPlan,
  type OutputKind,
} from "@/src/features/export/output-plan";
import { prepareDownloadArtifacts } from "@/src/features/export/prepare-download-artifacts";

import type { DownloadExportPayload } from "@/src/features/export/download-types";

function payload(outputKinds: OutputKind[]): DownloadExportPayload {
  return {
    title: "Export",
    url: "https://chatgpt.com/c/test",
    exportedAtIso: "2026-07-31T00:00:00.000Z",
    latexSource: "\\begin{document}Hello\\end{document}",
    pdfBase64: "JVBERi0=",
    files: [],
    failures: [],
    outputKinds,
  };
}

describe("createExportWorkPlan", () => {
  it.each([
    [["pdf"], true, false],
    [["tex"], false, false],
    [["source"], false, true],
    [["pdf", "tex", "source"], true, true],
  ] as const)(
    "plans %j without unused work",
    (kinds, needsCompiler, needsSourceArchive) => {
      expect(createExportWorkPlan(kinds)).toMatchObject({
        needsCompiler,
        needsSourceArchive,
      });
    },
  );

  it("normalizes duplicates into fixed artifact order", () => {
    expect(
      createExportWorkPlan(["source", "pdf", "pdf", "tex"]).outputKinds,
    ).toEqual(["pdf", "tex", "source"]);
  });

  it("rejects empty and unknown output selections", () => {
    expect(() => createExportWorkPlan([])).toThrow(
      "At least one valid export output is required.",
    );
    expect(() =>
      createExportWorkPlan(["html" as OutputKind]),
    ).toThrow("At least one valid export output is required.");
  });
});

describe("prepareDownloadArtifacts", () => {
  it("does not call SourcePackageBuilder for PDF-only", async () => {
    const sourcePackageBuilder = {
      build: vi.fn(),
    };

    const result = await prepareDownloadArtifacts(payload(["pdf"]), {
      sourcePackageBuilder,
      createObjectUrl: (blob) => `blob:${blob.type}`,
    });

    expect(sourcePackageBuilder.build).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      artifacts: [{ kind: "pdf" }],
    });
  });

  it("builds TEX-only without decoding a PDF or building a ZIP", async () => {
    const sourcePackageBuilder = {
      build: vi.fn(),
    };
    const texOnly = payload(["tex"]);
    delete texOnly.pdfBase64;

    const result = await prepareDownloadArtifacts(texOnly, {
      sourcePackageBuilder,
      createObjectUrl: (blob) => `blob:${blob.type}`,
    });

    expect(result).toMatchObject({
      ok: true,
      artifacts: [{ kind: "tex" }],
    });
    expect(sourcePackageBuilder.build).not.toHaveBeenCalled();
  });

  it("builds source-only without requiring PDF bytes", async () => {
    const sourcePackageBuilder = {
      build: vi.fn().mockResolvedValue(new Uint8Array([80, 75])),
    };
    const sourceOnly = payload(["source"]);
    delete sourceOnly.pdfBase64;

    const result = await prepareDownloadArtifacts(sourceOnly, {
      sourcePackageBuilder,
      createObjectUrl: (blob) => `blob:${blob.type}`,
    });

    expect(sourcePackageBuilder.build).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      ok: true,
      artifacts: [{ kind: "source" }],
    });
  });

  it("returns artifacts in exact PDF, TEX, source order", async () => {
    const result = await prepareDownloadArtifacts(
      payload(["source", "tex", "pdf"]),
      {
        sourcePackageBuilder: {
          build: vi.fn().mockResolvedValue(new Uint8Array([80, 75])),
        },
        createObjectUrl: (blob) => `blob:${blob.type}`,
      },
    );

    expect(result.ok && result.artifacts.map((artifact) => artifact.kind)).toEqual([
      "pdf",
      "tex",
      "source",
    ]);
  });

  it("rejects a PDF output without PDF bytes", async () => {
    const missingPdf = payload(["pdf"]);
    delete missingPdf.pdfBase64;

    await expect(
      prepareDownloadArtifacts(missingPdf, {
        sourcePackageBuilder: { build: vi.fn() },
      }),
    ).rejects.toThrow("PDF bytes are unavailable");
  });

  it("checks cancellation before publishing descriptors", async () => {
    const controller = new AbortController();
    controller.abort();
    const createObjectUrl = vi.fn();

    await expect(
      prepareDownloadArtifacts(payload(["pdf"]), {
        sourcePackageBuilder: { build: vi.fn() },
        createObjectUrl,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(createObjectUrl).not.toHaveBeenCalled();
  });
});
