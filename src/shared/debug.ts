const isDebugEnabled = import.meta.env.MODE !== "production";

export function debugLog(...args: unknown[]): void {
  if (isDebugEnabled) {
    console.info(...args);
  }
}

export function debugWarn(...args: unknown[]): void {
  if (isDebugEnabled) {
    console.warn(...args);
  }
}
