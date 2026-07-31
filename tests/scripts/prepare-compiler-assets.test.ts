import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { c as createTar } from "tar";
import { afterEach, describe, expect, it } from "vitest";

import * as assetScript from "../../scripts/prepare-compiler-assets.mjs";

const {
  EXPECTED_CORE_FILES,
  createGeneratedManifest,
  selectCoreArchiveEntries,
} = assetScript;

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("prepare-compiler-assets", () => {
  it("selects the published runtime and excludes larger TeX Live collections", () => {
    const selected = selectCoreArchiveEntries([
      "busytex/busytex_worker.js",
      "busytex/busytex_pipeline.js",
      "busytex/busytex.js",
      "busytex/busytex.wasm",
      "busytex/xetex.wasm",
      "busytex/pdftex.wasm",
      "busytex/luahbtex.wasm",
      "busytex/texlive-basic.js",
      "busytex/texlive-basic.data",
      "busytex/texlive-recommended.data",
      "busytex/texlive-extra.data",
    ]);

    expect(selected.map((entry) => entry.split("/").at(-1))).toEqual([
      "busytex_worker.js",
      "busytex_pipeline.js",
      "busytex.js",
      "busytex.wasm",
      "texlive-basic.js",
      "texlive-basic.data",
    ]);
    expect(EXPECTED_CORE_FILES).toHaveLength(6);
  });

  it("rejects an archive that contains a duplicate required basename", () => {
    expect(() =>
      selectCoreArchiveEntries([
        "one/busytex_worker.js",
        "two/busytex_worker.js",
        "busytex/busytex_pipeline.js",
        "busytex/xetex.js",
        "busytex/xetex.wasm",
        "busytex/texlive-basic.js",
        "busytex/texlive-basic.data",
      ]),
    ).toThrow("Expected exactly one busytex_worker.js");
  });

  it("derives lowercase SHA-256 and exact byte lengths from asset bytes", () => {
    const manifest = createGeneratedManifest([
      {
        id: "busytex-wasm",
        filename: "busytex.wasm",
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "application/wasm",
      },
    ]);

    expect(manifest).toEqual([
      {
        id: "busytex-wasm",
        filename: "busytex.wasm",
        byteLength: 3,
        sha256:
          "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
        mimeType: "application/wasm",
      },
    ]);
  });

  it("rejects an archive whose bytes do not match the pinned identity", async () => {
    const directory = await createTemporaryDirectory();
    const archivePath = join(directory, "fixture.tar.gz");
    await writeFile(archivePath, new Uint8Array([1, 2, 3]));

    await expect(
      assetScript.verifyArchiveFile(archivePath, {
        byteLength: 3,
        sha256: "0".repeat(64),
      }),
    ).rejects.toThrow("SHA-256 mismatch");

    await expect(
      assetScript.verifyArchiveFile(archivePath, {
        byteLength: 4,
        sha256:
          "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
      }),
    ).rejects.toThrow("size mismatch");
  });

  it("atomically prepares exactly the six runtime assets and generated manifest", async () => {
    const fixture = await createArchiveFixture();
    const outputDirectory = join(fixture.directory, "output");
    const generatedManifestPath = join(fixture.directory, "generated.ts");
    await mkdir(outputDirectory);
    await writeFile(join(outputDirectory, "stale.data"), "stale");

    await assetScript.prepareCompilerAssetsFromArchive({
      archivePath: fixture.archivePath,
      expectedArchive: fixture.identity,
      outputDirectory,
      generatedManifestPath,
      maximumTotalBytes: 1024,
    });

    expect((await readdir(outputDirectory)).sort()).toEqual(
      [...EXPECTED_CORE_FILES].sort(),
    );
    expect(
      await readFile(join(outputDirectory, "busytex_worker.js"), "utf8"),
    ).toBe("worker");

    const generated = await readFile(generatedManifestPath, "utf8");
    expect(generated).toContain(
      '"sha256": "87eba76e7f3164534045ba922e7770fb58bbd14ad732bbf5ba6f11cc56989e6e"',
    );
    expect(generated).toContain('"byteLength": 6');
    expect(generated).toContain('"id": "busytex-worker"');
  });

  it("preserves the previous prepared directory when validation fails", async () => {
    const fixture = await createArchiveFixture();
    const outputDirectory = join(fixture.directory, "output");
    const generatedManifestPath = join(fixture.directory, "generated.ts");
    await mkdir(outputDirectory);
    await writeFile(join(outputDirectory, "working.marker"), "keep");
    await writeFile(generatedManifestPath, "previous manifest");

    await expect(
      assetScript.prepareCompilerAssetsFromArchive({
        archivePath: fixture.archivePath,
        expectedArchive: {
          ...fixture.identity,
          sha256: "f".repeat(64),
        },
        outputDirectory,
        generatedManifestPath,
        maximumTotalBytes: 1024,
      }),
    ).rejects.toThrow("SHA-256 mismatch");

    expect(
      await readFile(join(outputDirectory, "working.marker"), "utf8"),
    ).toBe("keep");
    expect(await readFile(generatedManifestPath, "utf8")).toBe(
      "previous manifest",
    );
  });

  it("streams a pinned archive to disk and removes partial bytes on mismatch", async () => {
    const directory = await createTemporaryDirectory();
    const destinationPath = join(directory, "download.tar.gz");
    const expectedArchive = {
      byteLength: 3,
      sha256:
        "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
    };
    const progress: Array<[number, number]> = [];

    await assetScript.downloadArchive({
      url: "https://assets.example.test/compiler.tar.gz",
      destinationPath,
      expectedArchive,
      fetcher: async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-length": "3" },
        }),
      onProgress: (loaded, total) => progress.push([loaded, total]),
    });
    expect(await readFile(destinationPath)).toEqual(Buffer.from([1, 2, 3]));
    expect(progress.at(-1)).toEqual([3, 3]);

    await expect(
      assetScript.downloadArchive({
        url: "https://assets.example.test/compiler.tar.gz",
        destinationPath,
        expectedArchive,
        fetcher: async () =>
          new Response(new Uint8Array([1, 2, 3, 4]), {
            headers: { "content-length": "4" },
          }),
      }),
    ).rejects.toThrow("size mismatch");
    await expect(readFile(destinationPath)).rejects.toThrow();
  });

  it("runs the complete preparation flow in a temporary project root", async () => {
    const fixture = await createArchiveFixture();
    const projectRoot = join(fixture.directory, "project");
    const archiveBytes = await readFile(fixture.archivePath);
    await mkdir(projectRoot);

    const result = await assetScript.runAssetPreparation({
      projectRoot,
      archive: {
        url: "https://assets.example.test/compiler.tar.gz",
        ...fixture.identity,
      },
      fetcher: async () =>
        new Response(archiveBytes, {
          headers: {
            "content-length": String(archiveBytes.byteLength),
          },
        }),
      maximumTotalBytes: 1024,
    });

    expect(result.assets).toHaveLength(6);
    expect(
      await readdir(join(projectRoot, ".compiler-assets", "1.2.3")),
    ).toHaveLength(6);
    expect(
      await readFile(
        join(
          projectRoot,
          "src",
          "features",
          "compiler",
          "compiler-core-assets.generated.ts",
        ),
        "utf8",
      ),
    ).toContain("GENERATED_CORE_ASSETS");
  });

  it("reports download progress only when the integer percentage changes", () => {
    const messages: string[] = [];
    const report = assetScript.createPercentProgressReporter((message) => {
      messages.push(message);
    });

    report(1, 100);
    report(1, 100);
    report(2, 100);
    report(10, 100);
    report(10, 100);
    report(100, 100);

    expect(messages).toEqual([
      "\rDownloading BusyTeX assets: 1%",
      "\rDownloading BusyTeX assets: 2%",
      "\rDownloading BusyTeX assets: 10%",
      "\rDownloading BusyTeX assets: 100%",
    ]);
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "chat2tex-assets-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function createArchiveFixture(): Promise<{
  archivePath: string;
  directory: string;
  identity: { byteLength: number; sha256: string };
}> {
  const directory = await createTemporaryDirectory();
  const sourceDirectory = join(directory, "source");
  const busytexDirectory = join(sourceDirectory, "busytex");
  const archivePath = join(directory, "fixture.tar.gz");
  await mkdir(busytexDirectory, { recursive: true });

  const files: Record<string, string> = {
    "busytex_worker.js": "worker",
    "busytex_pipeline.js": "pipeline",
    "busytex.js": "busytex-js",
    "busytex.wasm": "busytex-wasm",
    "texlive-basic.js": "basic-js",
    "texlive-basic.data": "basic-data",
    "pdftex.wasm": "excluded",
    "texlive-extra.data": "excluded",
  };

  await Promise.all(
    Object.entries(files).map(([filename, contents]) =>
      writeFile(join(busytexDirectory, filename), contents),
    ),
  );
  await createTar(
    {
      cwd: sourceDirectory,
      file: archivePath,
      gzip: true,
      portable: true,
    },
    ["busytex"],
  );

  const archiveBytes = await readFile(archivePath);
  return {
    archivePath,
    directory,
    identity: {
      byteLength: archiveBytes.byteLength,
      sha256: createHash("sha256").update(archiveBytes).digest("hex"),
    },
  };
}
