export interface ArchiveIdentity {
  byteLength: number;
  sha256: string;
}

export interface ArchiveSource extends ArchiveIdentity {
  url: string;
}

export interface ManifestAssetInput {
  id: string;
  filename: string;
  bytes: Uint8Array;
  mimeType: string;
}

export interface PreparedAsset {
  id: string;
  filename: string;
  byteLength: number;
  sha256: string;
  mimeType: string;
}

export interface PreparationResult {
  assets: PreparedAsset[];
  totalBytes: number;
}

export const UPSTREAM_ARCHIVE: Readonly<ArchiveSource>;
export const EXPECTED_CORE_FILES: readonly string[];

export function selectCoreArchiveEntries(entries: string[]): string[];

export function createGeneratedManifest(
  assets: ManifestAssetInput[],
): PreparedAsset[];

export function verifyArchiveFile(
  archivePath: string,
  expectedArchive: ArchiveIdentity,
): Promise<void>;

export function prepareCompilerAssetsFromArchive(options: {
  archivePath: string;
  expectedArchive: ArchiveIdentity;
  outputDirectory: string;
  generatedManifestPath: string;
  maximumTotalBytes: number;
}): Promise<PreparationResult>;

export function downloadArchive(options: {
  url: string;
  destinationPath: string;
  expectedArchive: ArchiveIdentity;
  fetcher?: typeof fetch;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<void>;

export function runAssetPreparation(options?: {
  projectRoot?: string;
  archive?: ArchiveSource;
  fetcher?: typeof fetch;
  maximumTotalBytes?: number;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<PreparationResult>;

export function createPercentProgressReporter(
  write: (message: string) => void,
): (loaded: number, total: number) => void;
