const ERROR_PATTERN = /(^!\s+)|(\bfatal\b)|(\berror:?\b)/i;

const SOURCE_LINE_PATTERN = /^l\.\d+\s+/;

export function findFailingProjectPaths(
  log: string,
  projectPaths: readonly string[],
): string[] {
  const lines = log.split(/\r?\n/);

  const diagnosticIndexes = lines.flatMap((line, index) =>
    ERROR_PATTERN.test(line) ? [index] : [],
  );

  const diagnosticText = diagnosticIndexes
    .flatMap((index) => lines.slice(index, index + 4))
    .join("\n");

  return projectPaths.filter((path) => diagnosticText.includes(path));
}

export function extractCompileDiagnostic(log: string): string | null {
  const lines = log.split(/\r?\n/).map((line) => line.trim());

  const bangIndex = lines.findIndex((line) => line.startsWith("!"));

  if (bangIndex >= 0) {
    const message = lines[bangIndex].replace(/^!\s*/, "");

    const sourceLine = lines
      .slice(bangIndex + 1, bangIndex + 5)
      .find((line) => SOURCE_LINE_PATTERN.test(line));

    return sourceLine ? `${message} (${sourceLine})` : message;
  }

  const fatalLine = lines.find((line) => /\bfatal\b/i.test(line));

  if (fatalLine) {
    return fatalLine.replace(/^.*?\bfatal:\s*/i, "");
  }

  return lines.find((line) => /\berror:?\b/i.test(line)) ?? null;
}

export function formatCompileFailure(message: string, log: string): string {
  const diagnostic = extractCompileDiagnostic(log);

  if (!diagnostic || message.toLowerCase().includes(diagnostic.toLowerCase())) {
    return message;
  }

  return `${message} ${diagnostic}`;
}

export function readCompileLog(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "compileLog" in error &&
    typeof error.compileLog === "string"
  ) {
    return error.compileLog;
  }

  return "";
}

export function combineCompileLogs(
  firstLog: string,
  fallbackLog: string,
): string {
  return [
    "===== Initial compilation =====",
    firstLog || "(no log returned)",
    "===== Fallback compilation =====",
    fallbackLog || "(no log returned)",
  ].join("\n");
}

export class FallbackCompileError extends Error {
  constructor(
    message: string,
    readonly compileLog: string,
  ) {
    super(message);

    this.name = "FallbackCompileError";
  }
}
