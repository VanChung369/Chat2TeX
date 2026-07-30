export interface LatexAssetRequest {
  id: string;
  kind: "image";
  sourceUrl: string;
  outputPath: string;
  alt: string;
}

export interface LatexGenerationResult {
  source: string;
  assets: LatexAssetRequest[];
}
