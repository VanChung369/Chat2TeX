import { describe, expect, it } from "vitest";

import { applyCompileOmissions } from "@/src/features/export/compile-omissions";

describe("applyCompileOmissions", () => {
  it("moves omitted files to compiler-rejected failures", () => {
    const result = applyCompileOmissions(
      {
        title: "Test",
        url: "https://chatgpt.com/c/test",
        messageCount: 2,
        latexSource: "source",
        assets: [
          {
            id: "image-001",
            kind: "image",
            sourceUrl: "https://example.com/one.png",
            outputPath: "assets/image-001.png",
            alt: "One",
          },
          {
            id: "image-002",
            kind: "image",
            sourceUrl: "https://example.com/two.png",
            outputPath: "assets/image-002.png",
            alt: "Two",
          },
        ],
      },
      {
        files: [
          {
            id: "image-001",
            outputPath: "assets/image-001.png",
            mimeType: "image/png",
            base64: "AQ==",
            byteLength: 1,
            width: 1,
            height: 1,
          },
          {
            id: "image-002",
            outputPath: "assets/image-002.png",
            mimeType: "image/png",
            base64: "Ag==",
            byteLength: 1,
            width: 1,
            height: 1,
          },
        ],
        failures: [],
      },
      ["assets/image-002.png"],
    );

    expect(result.files.map((file) => file.id)).toEqual(["image-001"]);

    expect(result.failures).toEqual([
      {
        id: "image-002",
        sourceUrl: "https://example.com/two.png",
        code: "compiler-rejected",
        message:
          "XeLaTeX could not embed this image; it was omitted from the PDF.",
      },
    ]);
  });

  it("keeps existing asset failures while adding compiler omissions", () => {
    const result = applyCompileOmissions(
      {
        title: "Test",
        url: "https://chatgpt.com/c/test",
        messageCount: 2,
        latexSource: "source",
        assets: [
          {
            id: "image-001",
            kind: "image",
            sourceUrl: "https://example.com/one.png",
            outputPath: "assets/image-001.png",
            alt: "One",
          },
        ],
      },
      {
        files: [
          {
            id: "image-001",
            outputPath: "assets/image-001.png",
            mimeType: "image/png",
            base64: "AQ==",
            byteLength: 1,
            width: 1,
            height: 1,
          },
        ],
        failures: [
          {
            id: "image-002",
            sourceUrl: "https://example.com/two.png",
            code: "download-failed",
            message: "HTTP 403",
          },
        ],
      },
      ["assets/image-001.png"],
    );

    expect(result.failures.map((failure) => failure.id)).toEqual([
      "image-002",
      "image-001",
    ]);
  });
});
