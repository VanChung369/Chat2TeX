const PIPELINE_IMPORT =
  /importScripts\s*\(\s*(['"])busytex_pipeline\.js\1\s*\)\s*;?/g;

export interface SandboxWorkerSourceInput {
  pipelineSource: string;
  workerSource: string;
  basicDataUrl: string;
}

export function createSandboxWorkerSource({
  pipelineSource,
  workerSource,
  basicDataUrl,
}: SandboxWorkerSourceInput): string {
  const imports = [...workerSource.matchAll(PIPELINE_IMPORT)];
  if (imports.length !== 1) {
    throw new Error(
      "BusyTeX worker must contain exactly one busytex_pipeline.js import.",
    );
  }
  const workerWithoutImport = workerSource.replace(PIPELINE_IMPORT, "");

  return `
"use strict";
const CHAT2TEX_XETEX_DRIVER = "xetex_bibtex8_dvipdfmx";
const CHAT2TEX_PACKAGE_ORIGIN = "https://chat2tex.invalid";
const CHAT2TEX_ALLOWED_FORMATS = new Set([
  3, 4, 6, 7, 10, 11, 26, 32, 33, 35, 39, 43, 44, 46,
]);
const NativeXMLHttpRequest = self.XMLHttpRequest;
const NativePostMessage = self.postMessage.bind(self);
const packageLookups = [];
const packageLookupKeys = new Set();
let chat2texCompileActive = false;

function recordPackageLookup(format, name) {
  const key = format + "/" + name;
  if (!packageLookupKeys.has(key)) {
    packageLookupKeys.add(key);
    packageLookups.push({ format, name });
  }
}

self.XMLHttpRequest = class Chat2TeXXMLHttpRequest extends NativeXMLHttpRequest {
  open(method, url, async = true, user, password) {
    const parsed = new URL(String(url));
    if (parsed.origin !== CHAT2TEX_PACKAGE_ORIGIN) {
      return super.open(method, url, async, user, password);
    }

    const match = /^\\/([0-9]+)\\/([A-Za-z0-9._-]{1,255})$/.exec(
      parsed.pathname,
    );
    const format = match ? Number(match[1]) : NaN;
    this.__chat2texLookup =
      method === "GET" &&
      async === false &&
      match !== null &&
      CHAT2TEX_ALLOWED_FORMATS.has(format)
        ? { format, name: decodeURIComponent(match[2]) }
        : null;
    this.__chat2texSynthetic = true;
  }

  send(body) {
    if (!this.__chat2texSynthetic) {
      return super.send(body);
    }
    if (this.__chat2texLookup) {
      recordPackageLookup(
        this.__chat2texLookup.format,
        this.__chat2texLookup.name,
      );
    }
    Object.defineProperties(this, {
      readyState: { configurable: true, value: 4 },
      status: {
        configurable: true,
        value: this.__chat2texLookup ? 404 : 400,
      },
      response: { configurable: true, value: null },
      responseText: { configurable: true, value: "" },
    });
  }
};

self.postMessage = (message, transfer) => {
  if (
    chat2texCompileActive &&
    message &&
    typeof message === "object" &&
    (message.pdf !== undefined || message.exception !== undefined)
  ) {
    chat2texCompileActive = false;
    const terminalMessage = {
      ...message,
      packageLookups: packageLookups.slice(),
    };
    return transfer === undefined
      ? NativePostMessage(terminalMessage)
      : NativePostMessage(terminalMessage, transfer);
  }
  return transfer === undefined
    ? NativePostMessage(message)
    : NativePostMessage(message, transfer);
};

${pipelineSource}

const Chat2TeXNativeLocateFile = BusytexPipeline.locateFile.bind(
  BusytexPipeline,
);
BusytexPipeline.locateFile = (remotePackageName) =>
  remotePackageName === "texlive-basic.data"
    ? ${JSON.stringify(basicDataUrl)}
    : Chat2TeXNativeLocateFile(remotePackageName);

${workerWithoutImport}

const Chat2TeXBusyTeXOnMessage = self.onmessage;
self.onmessage = (event) => {
  if (event && event.data && event.data.files) {
    packageLookups.length = 0;
    packageLookupKeys.clear();
    chat2texCompileActive = true;
    event.data.driver = CHAT2TEX_XETEX_DRIVER;
    event.data.remote_endpoint = CHAT2TEX_PACKAGE_ORIGIN;
    event.data.shell_escape = false;
    delete event.data.load_shell_handler_script;
  }
  return Chat2TeXBusyTeXOnMessage.call(self, event);
};
`;
}
