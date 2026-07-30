import JSZip from "jszip";

import type { FailedExportAsset } from "./types";

import type { ResolvedAssetFile } from "@/src/features/assets/types";

import { base64ToBytes } from "@/src/shared/base64";

export interface SourcePackageInput {
  title: string;
  url: string;
  exportedAtIso: string;
  latexSource: string;
  files: ResolvedAssetFile[];
  failures: FailedExportAsset[];
}

export class SourcePackageBuilder {
  async build(input: SourcePackageInput): Promise<Uint8Array> {
    const zip = new JSZip();

    zip.file("main.tex", input.latexSource);

    for (const file of input.files) {
      if (!isSafeArchivePath(file.outputPath)) {
        throw new Error(`Unsafe asset path: ${file.outputPath}`);
      }

      zip.file(file.outputPath, base64ToBytes(file.base64), {
        binary: true,
      });
    }

    zip.file(
      "metadata.json",
      JSON.stringify(
        {
          title: input.title,
          sourceUrl: input.url,
          exportedAt: input.exportedAtIso,

          generator: "ChatTeX Exporter",

          assetCount: input.files.length,

          missingAssetCount: input.failures.length,

          missingAssets: input.failures,
        },
        null,
        2,
      ),
    );

    zip.file("README.md", createReadme(input));

    return zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",

      compressionOptions: {
        level: 6,
      },

      platform: "UNIX",
    });
  }
}

function createReadme(input: SourcePackageInput): string {
  return [
    "# ChatTeX source package",
    "",
    `Conversation: ${input.title}`,
    `Source: ${input.url}`,
    `Exported: ${input.exportedAtIso}`,
    "",
    "## Files",
    "",
    "- `main.tex`: XeLaTeX source file.",
    "- `assets/`: Images referenced by `main.tex`.",
    "- `metadata.json`: Export metadata and missing assets.",
    "",
    "## Compile",
    "",
    "```bash",
    "xelatex main.tex",
    "```",
    "",
    "Run XeLaTeX a second time when references or page numbers require it.",
    "",
  ].join("\n");
}

function isSafeArchivePath(path: string): boolean {
  return (
    path.startsWith("assets/") &&
    !path.includes("..") &&
    !path.startsWith("/") &&
    !path.includes("\\")
  );
}
