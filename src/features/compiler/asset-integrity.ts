export interface IntegrityExpectation {
  filename: string;
  byteLength: number;
  sha256: string;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export async function assertAssetIntegrity(
  bytes: Uint8Array,
  expected: IntegrityExpectation,
): Promise<void> {
  if (bytes.byteLength !== expected.byteLength) {
    throw new Error(
      `${expected.filename} size mismatch: expected ${expected.byteLength}, received ${bytes.byteLength}.`,
    );
  }

  const actualHash = await sha256Hex(bytes);
  if (actualHash !== expected.sha256) {
    throw new Error(
      `${expected.filename} integrity mismatch: expected ${expected.sha256}, received ${actualHash}.`,
    );
  }
}

export async function readLimitedResponseBytes(
  response: Response,
  maximumBytes: number,
  onProgress: (loaded: number, total: number) => void = () => {},
): Promise<Uint8Array> {
  if (!response.body) {
    throw new Error("Compiler asset response returned an empty body.");
  }

  const contentLengthHeader = response.headers.get("content-length");
  const contentLength =
    contentLengthHeader === null ? null : Number(contentLengthHeader);
  const total =
    contentLength !== null && Number.isFinite(contentLength)
      ? contentLength
      : maximumBytes;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }

      loaded += value.byteLength;
      if (loaded > maximumBytes) {
        await reader.cancel();
        throw new Error(`Compiler asset exceeds ${maximumBytes} bytes.`);
      }
      chunks.push(value);
      onProgress(loaded, total);
    }
  } catch (error) {
    if (loaded <= maximumBytes) {
      await reader.cancel().catch(() => undefined);
    }
    throw error;
  }

  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
