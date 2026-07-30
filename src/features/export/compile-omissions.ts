import type {
  PreparedExport,
  ProcessedExportAssets,
} from "./types";

export function applyCompileOmissions(
  prepared: PreparedExport,
  processed: ProcessedExportAssets,
  omittedPaths: readonly string[],
): ProcessedExportAssets {
  const omitted = new Set(omittedPaths);

  const retainedFiles = processed.files.filter(
    (file) => !omitted.has(file.outputPath),
  );

  const addedFailures = processed.files
    .filter((file) => omitted.has(file.outputPath))
    .map((file) => {
      const asset = prepared.assets.find(
        (candidate) => candidate.outputPath === file.outputPath,
      );

      return {
        id: file.id,
        sourceUrl: asset?.sourceUrl ?? "",
        code: "compiler-rejected" as const,
        message:
          "XeLaTeX could not embed this image; it was omitted from the PDF.",
      };
    });

  return {
    files: retainedFiles,
    failures: [...processed.failures, ...addedFailures],
  };
}
