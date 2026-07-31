export const MAX_EXTENSION_ZIP_BYTES: number;

export interface ExtensionPackageInspection {
  byteLength: number;
  entries: string[];
  manifest: Record<string, unknown>;
  forbiddenEntries: string[];
  forbiddenUrls: string[];
}

export function inspectExtensionZip(
  path: string,
): Promise<ExtensionPackageInspection>;

export function inspectExtensionBytes(
  bytes: Uint8Array,
): Promise<ExtensionPackageInspection>;
