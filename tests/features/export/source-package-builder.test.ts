import JSZip from "jszip";

import { describe, expect, it } from "vitest";

import { SourcePackageBuilder } from "@/src/features/export/source-package-builder";

describe("SourcePackageBuilder", () => {
  it("packages main.tex, assets and metadata", async () => {
    const builder = new SourcePackageBuilder();

    const result = await builder.build({
      title: "Binary Search",
      url: "https://chatgpt.com/c/example",

      exportedAtIso: "2026-07-30T11:30:00.000+07:00",

      latexSource: "\\begin{document}Hello\\end{document}",

      files: [
        {
          id: "image-001",
          outputPath: "assets/image-001.png",

          mimeType: "image/png",
          base64: "iVBORw==",
          byteLength: 4,
          width: 800,
          height: 600,
        },
      ],

      failures: [],
    });

    const zip = await JSZip.loadAsync(result);

    expect(zip.file("main.tex")).not.toBeNull();

    expect(zip.file("assets/image-001.png")).not.toBeNull();

    expect(zip.file("metadata.json")).not.toBeNull();

    expect(zip.file("README.md")).not.toBeNull();

    const latexSource = await zip.file("main.tex")!.async("string");

    expect(latexSource).toContain("\\begin{document}");

    const metadata = JSON.parse(
      await zip.file("metadata.json")!.async("string"),
    );

    expect(metadata).toMatchObject({
      title: "Binary Search",
      assetCount: 1,
      missingAssetCount: 0,
      generator: "ChatTeX Exporter",
    });
  });
});
