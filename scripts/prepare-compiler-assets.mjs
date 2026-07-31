import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { t as listTar, x as extractTar } from "tar";

export const UPSTREAM_ARCHIVE = Object.freeze({
  url: "https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v1.2.3/busytex-assets.tar.gz",
  byteLength: 503_733_339,
  sha256: "96dbacb42037472827f2f481d3bc0f44cc2f4a532abcc019dc2f407805a307f4",
});

export const EXPECTED_CORE_FILES = Object.freeze([
  "busytex_worker.js",
  "busytex_pipeline.js",
  "busytex.js",
  "busytex.wasm",
  "texlive-basic.js",
  "texlive-basic.data",
]);

const CORE_ASSET_DETAILS = Object.freeze({
  "busytex_worker.js": {
    id: "busytex-worker",
    mimeType: "text/javascript",
  },
  "busytex_pipeline.js": {
    id: "busytex-pipeline",
    mimeType: "text/javascript",
  },
  "busytex.js": {
    id: "busytex-js",
    mimeType: "text/javascript",
  },
  "busytex.wasm": {
    id: "busytex-wasm",
    mimeType: "application/wasm",
  },
  "texlive-basic.js": {
    id: "texlive-basic-js",
    mimeType: "text/javascript",
  },
  "texlive-basic.data": {
    id: "texlive-basic-data",
    mimeType: "application/octet-stream",
  },
});

export function selectCoreArchiveEntries(entries) {
  const selected = entries.filter((entry) =>
    EXPECTED_CORE_FILES.includes(entry.split("/").at(-1)),
  );
  const names = selected.map((entry) => entry.split("/").at(-1));

  for (const filename of EXPECTED_CORE_FILES) {
    if (names.filter((name) => name === filename).length !== 1) {
      throw new Error(`Expected exactly one ${filename} in BusyTeX archive.`);
    }
  }

  return selected.sort(
    (left, right) =>
      EXPECTED_CORE_FILES.indexOf(left.split("/").at(-1)) -
      EXPECTED_CORE_FILES.indexOf(right.split("/").at(-1)),
  );
}

export function createGeneratedManifest(assets) {
  return assets.map(({ bytes, ...asset }) => ({
    ...asset,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }));
}

export async function verifyArchiveFile(archivePath, expectedArchive) {
  const archiveStat = await stat(archivePath);
  if (archiveStat.size !== expectedArchive.byteLength) {
    throw new Error(
      `BusyTeX archive size mismatch: expected ${expectedArchive.byteLength}, received ${archiveStat.size}.`,
    );
  }

  const hash = createHash("sha256");
  for await (const chunk of createReadStream(archivePath)) {
    hash.update(chunk);
  }
  const actualHash = hash.digest("hex");
  if (actualHash !== expectedArchive.sha256) {
    throw new Error(
      `BusyTeX archive SHA-256 mismatch: expected ${expectedArchive.sha256}, received ${actualHash}.`,
    );
  }
}

export async function prepareCompilerAssetsFromArchive({
  archivePath,
  expectedArchive,
  outputDirectory,
  generatedManifestPath,
  maximumTotalBytes,
}) {
  await verifyArchiveFile(archivePath, expectedArchive);

  const entries = [];
  await listTar({
    file: archivePath,
    onentry(entry) {
      entries.push(entry.path);
    },
  });

  const selectedEntries = selectCoreArchiveEntries(entries);
  for (const entry of selectedEntries) {
    assertSafeArchivePath(entry);
  }

  const outputParent = dirname(outputDirectory);
  await mkdir(outputParent, { recursive: true });
  await mkdir(dirname(generatedManifestPath), { recursive: true });

  const stagingRoot = await mkdtemp(
    join(outputParent, `.${basename(outputDirectory)}.staging-`),
  );
  const extractionDirectory = join(stagingRoot, "extracted");
  const preparedDirectory = join(stagingRoot, "prepared");
  const outputBackup = `${outputDirectory}.backup-${randomUUID()}`;
  const manifestTemporaryPath = join(
    dirname(generatedManifestPath),
    `.${basename(generatedManifestPath)}.${randomUUID()}.tmp`,
  );
  let outputWasBackedUp = false;
  let outputWasReplaced = false;

  try {
    await mkdir(extractionDirectory);
    await mkdir(preparedDirectory);
    const selectedSet = new Set(selectedEntries);
    await extractTar({
      file: archivePath,
      cwd: extractionDirectory,
      filter(entryPath) {
        return selectedSet.has(entryPath);
      },
      preservePaths: false,
      strict: true,
    });

    const assets = [];
    let totalBytes = 0;
    for (const entry of selectedEntries) {
      const filename = entry.split("/").at(-1);
      const sourcePath = join(extractionDirectory, ...entry.split("/"));
      const destinationPath = join(preparedDirectory, filename);
      await copyFile(sourcePath, destinationPath);
      const bytes = await readFile(destinationPath);
      totalBytes += bytes.byteLength;
      assets.push({
        ...CORE_ASSET_DETAILS[filename],
        filename,
        bytes,
      });
    }

    if (totalBytes > maximumTotalBytes) {
      throw new Error(
        `Prepared compiler assets exceed ${maximumTotalBytes} bytes.`,
      );
    }

    const manifest = createGeneratedManifest(assets);
    await writeFile(
      manifestTemporaryPath,
      renderGeneratedManifest(manifest),
      "utf8",
    );

    if (await pathExists(outputDirectory)) {
      await rename(outputDirectory, outputBackup);
      outputWasBackedUp = true;
    }
    await rename(preparedDirectory, outputDirectory);
    outputWasReplaced = true;
    await rename(manifestTemporaryPath, generatedManifestPath);

    if (outputWasBackedUp) {
      await rm(outputBackup, { recursive: true, force: true });
      outputWasBackedUp = false;
    }

    return {
      assets: manifest,
      totalBytes,
    };
  } catch (error) {
    if (outputWasReplaced) {
      await rm(outputDirectory, { recursive: true, force: true });
    }
    if (outputWasBackedUp) {
      await rename(outputBackup, outputDirectory);
      outputWasBackedUp = false;
    }
    throw error;
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(manifestTemporaryPath, { force: true });
    if (outputWasBackedUp) {
      await rm(outputBackup, { recursive: true, force: true });
    }
  }
}

export async function downloadArchive({
  url,
  destinationPath,
  expectedArchive,
  fetcher = fetch,
  onProgress = () => {},
}) {
  await mkdir(dirname(destinationPath), { recursive: true });
  await rm(destinationPath, { force: true });

  let fileHandle;
  try {
    const response = await fetcher(url, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(
        `BusyTeX archive download failed with HTTP ${response.status}.`,
      );
    }
    if (!response.body) {
      throw new Error("BusyTeX archive download returned an empty body.");
    }

    const contentLength = response.headers.get("content-length");
    if (
      contentLength !== null &&
      Number(contentLength) !== expectedArchive.byteLength
    ) {
      throw new Error(
        `BusyTeX archive size mismatch: expected ${expectedArchive.byteLength}, received ${contentLength}.`,
      );
    }

    fileHandle = await open(destinationPath, "wx");
    const hash = createHash("sha256");
    let loaded = 0;
    for await (const chunk of response.body) {
      const bytes =
        chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      loaded += bytes.byteLength;
      if (loaded > expectedArchive.byteLength) {
        throw new Error(
          `BusyTeX archive size mismatch: expected ${expectedArchive.byteLength}, received more than that limit.`,
        );
      }
      hash.update(bytes);
      await fileHandle.write(bytes);
      onProgress(loaded, expectedArchive.byteLength);
    }
    await fileHandle.close();
    fileHandle = undefined;

    if (loaded !== expectedArchive.byteLength) {
      throw new Error(
        `BusyTeX archive size mismatch: expected ${expectedArchive.byteLength}, received ${loaded}.`,
      );
    }
    const actualHash = hash.digest("hex");
    if (actualHash !== expectedArchive.sha256) {
      throw new Error(
        `BusyTeX archive SHA-256 mismatch: expected ${expectedArchive.sha256}, received ${actualHash}.`,
      );
    }
  } catch (error) {
    await fileHandle?.close();
    await rm(destinationPath, { force: true });
    throw error;
  }
}

export async function runAssetPreparation({
  projectRoot = fileURLToPath(new URL("..", import.meta.url)),
  archive = UPSTREAM_ARCHIVE,
  fetcher = fetch,
  maximumTotalBytes = 140 * 1024 * 1024,
  onProgress,
} = {}) {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "chat2tex-compiler-assets-"),
  );
  const archivePath = join(temporaryDirectory, "busytex-assets.tar.gz");

  try {
    await downloadArchive({
      url: archive.url,
      destinationPath: archivePath,
      expectedArchive: archive,
      fetcher,
      onProgress,
    });
    return await prepareCompilerAssetsFromArchive({
      archivePath,
      expectedArchive: archive,
      outputDirectory: join(projectRoot, ".compiler-assets", "1.2.3"),
      generatedManifestPath: join(
        projectRoot,
        "src",
        "features",
        "compiler",
        "compiler-core-assets.generated.ts",
      ),
      maximumTotalBytes,
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function assertSafeArchivePath(entry) {
  if (
    isAbsolute(entry) ||
    entry.split("/").some((segment) => segment === "..") ||
    entry.split("\\").some((segment) => segment === "..") ||
    entry.includes(`..${sep}`)
  ) {
    throw new Error(`Unsafe BusyTeX archive path: ${entry}`);
  }
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function renderGeneratedManifest(manifest) {
  return `// Generated by scripts/prepare-compiler-assets.mjs. Do not edit.

export type CoreAssetId =
  | "busytex-worker"
  | "busytex-pipeline"
  | "busytex-js"
  | "busytex-wasm"
  | "texlive-basic-js"
  | "texlive-basic-data";

export interface GeneratedCoreAsset {
  id: CoreAssetId;
  filename: string;
  byteLength: number;
  sha256: string;
  mimeType: string;
}

export const GENERATED_CORE_ASSETS: readonly GeneratedCoreAsset[] =
  ${JSON.stringify(manifest, null, 2)} as const;
`;
}

export function createPercentProgressReporter(write) {
  let previousPercent = -1;

  return (loaded, total) => {
    const percent =
      total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : 0;
    if (percent === previousPercent) {
      return;
    }

    previousPercent = percent;
    write(`\rDownloading BusyTeX assets: ${percent}%`);
  };
}

const invokedPath = process.argv[1];
if (
  invokedPath &&
  import.meta.url === pathToFileURL(invokedPath).href
) {
  const reportProgress = createPercentProgressReporter((message) => {
    process.stderr.write(message);
  });

  runAssetPreparation({
    onProgress: reportProgress,
  })
    .then(({ assets, totalBytes }) => {
      process.stderr.write("\n");
      console.log(
        `Prepared ${assets.length} compiler assets (${totalBytes} bytes).`,
      );
    })
    .catch((error) => {
      process.stderr.write("\n");
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
