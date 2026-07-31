const FAVICON_HOSTS = new Set([
  "favicon.im",
  "icons.duckduckgo.com",
  "t2.gstatic.com",
]);

export type ChatImagePresentation = "content" | "icon";

export const CHATTEX_IMAGE_PRESENTATION_ATTRIBUTE =
  "data-chattex-image-presentation";

export function classifyChatImage(
  imageElement: HTMLImageElement,
): ChatImagePresentation {
  const source = readImageSource(imageElement);

  if (classifyImageSource(source) === "icon") {
    return "icon";
  }

  const citationContainer = imageElement.closest(
    [
      '[data-testid*="citation" i]',
      '[data-testid*="link-preview" i]',
    ].join(","),
  );

  return !imageElement.alt.trim() && citationContainer
    ? "icon"
    : "content";
}

export function classifyImageSource(
  source: string,
): ChatImagePresentation {
  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    return FAVICON_HOSTS.has(host) ||
      path === "/favicon.ico" ||
      path.includes("/s2/favicons") ||
      path.includes("/faviconv2")
      ? "icon"
      : "content";
  } catch {
    return "content";
  }
}

function readImageSource(imageElement: HTMLImageElement): string {
  return (
    imageElement.currentSrc ||
    imageElement.src ||
    imageElement.getAttribute("src") ||
    ""
  ).trim();
}
