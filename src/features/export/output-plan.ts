export type OutputKind = "pdf" | "tex" | "source";

export interface ExportWorkPlan {
  outputKinds: OutputKind[];
  needsCompiler: boolean;
  needsPdfArtifact: boolean;
  needsTexArtifact: boolean;
  needsSourceArchive: boolean;
}

const OUTPUT_ORDER: readonly OutputKind[] = ["pdf", "tex", "source"];

export function createExportWorkPlan(
  requested: readonly OutputKind[],
): ExportWorkPlan {
  const selected = new Set(requested);
  if (
    selected.size === 0 ||
    [...selected].some((kind) => !OUTPUT_ORDER.includes(kind))
  ) {
    throw new Error("At least one valid export output is required.");
  }
  const outputKinds = OUTPUT_ORDER.filter((kind) =>
    selected.has(kind),
  );
  return {
    outputKinds,
    needsCompiler: selected.has("pdf"),
    needsPdfArtifact: selected.has("pdf"),
    needsTexArtifact: selected.has("tex"),
    needsSourceArchive: selected.has("source"),
  };
}
