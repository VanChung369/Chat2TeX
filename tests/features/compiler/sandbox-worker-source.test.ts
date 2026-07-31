import { describe, expect, it } from "vitest";

import { createSandboxWorkerSource } from "@/src/features/compiler/sandbox-worker-source";

describe("sandbox worker source", () => {
  it("records only the synthetic package endpoint and preserves native XHR", () => {
    const source = createSandboxWorkerSource({
      pipelineSource: "class BusytexPipeline { static locateFile() {} }",
      workerSource:
        "importScripts('busytex_pipeline.js'); onmessage = () => postMessage({ pdf: new Uint8Array() });",
      basicDataUrl: "blob:basic-data",
    });

    expect(source).toContain("https://chat2tex.invalid");
    expect(source).toContain("packageLookups");
    expect(source).toContain("NativeXMLHttpRequest");
    expect(source).toContain("xetex_bibtex8_dvipdfmx");
    expect(source).not.toContain("connect-src");
    expect(source).not.toContain("importScripts('busytex_pipeline.js')");
  });

  it("embeds the exact data Blob URL without executable interpolation", () => {
    const source = createSandboxWorkerSource({
      pipelineSource: "class BusytexPipeline { static locateFile() {} }",
      workerSource: 'importScripts("busytex_pipeline.js");',
      basicDataUrl: 'blob:basic"; postMessage("injected") //',
    });

    expect(source).toContain(
      JSON.stringify('blob:basic"; postMessage("injected") //'),
    );
  });

  it("rejects a worker source without exactly one pipeline import", () => {
    expect(() =>
      createSandboxWorkerSource({
        pipelineSource: "class BusytexPipeline {}",
        workerSource: "onmessage = () => {};",
        basicDataUrl: "blob:basic",
      }),
    ).toThrow("exactly one busytex_pipeline.js import");
  });
});
