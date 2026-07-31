import type { ChatConversation, ChatMessage } from "./types";
import {
  CHATTEX_IMAGE_PRESENTATION_ATTRIBUTE,
  classifyImageSource,
} from "./image-eligibility";

export interface ApiConversationSource {
  read(): Promise<ChatConversation>;
}

export type MountedConversationSource = () => ChatConversation;
export type DomConversationFallback = () => Promise<ChatConversation>;

export class CompleteConversationReader {
  constructor(
    private readonly apiSource: ApiConversationSource,
    private readonly mountedSource: MountedConversationSource,
    private readonly domFallback: DomConversationFallback,
    private readonly documentRef: Document = document,
  ) {}

  async read(): Promise<ChatConversation> {
    try {
      const apiConversation = await this.apiSource.read();

      try {
        return enrichWithMountedImages(
          apiConversation,
          this.mountedSource(),
          this.documentRef,
        );
      } catch {
        return apiConversation;
      }
    } catch (apiError) {
      const mountedMessageCount = this.readMountedMessageCount();

      try {
        const domConversation = await this.domFallback();

        if (
          mountedMessageCount !== null &&
          domConversation.messages.length <= mountedMessageCount
        ) {
          throw new Error(
            "DOM collection did not load any additional messages " +
              `(still ${domConversation.messages.length}).`,
          );
        }

        return domConversation;
      } catch (domError) {
        throw new Error(
          [
            "Unable to collect a complete conversation.",
            `API: ${readErrorMessage(apiError, "Unknown API failure.")}`,
            `DOM fallback: ${readErrorMessage(
              domError,
              "Unknown DOM collection failure.",
            )}`,
          ].join("\n"),
        );
      }
    }
  }

  private readMountedMessageCount(): number | null {
    try {
      return this.mountedSource().messages.length;
    } catch {
      return null;
    }
  }
}

export function enrichWithMountedImages(
  apiConversation: ChatConversation,
  mountedConversation: ChatConversation,
  documentRef: Document,
): ChatConversation {
  const mountedById = new Map(
    mountedConversation.messages.map((message) => [message.id, message]),
  );

  return {
    ...apiConversation,
    messages: apiConversation.messages.map((message) => {
      const mountedMessage = mountedById.get(message.id);

      if (!mountedMessage) {
        return message;
      }

      return appendUniqueImages(message, mountedMessage, documentRef);
    }),
  };
}

function appendUniqueImages(
  apiMessage: ChatMessage,
  mountedMessage: ChatMessage,
  documentRef: Document,
): ChatMessage {
  const apiTemplate = createTemplate(documentRef, apiMessage.html);
  const mountedTemplate = createTemplate(documentRef, mountedMessage.html);
  const knownSources = new Set(
    Array.from(apiTemplate.content.querySelectorAll("img"))
      .map(readImageSource)
      .filter(Boolean),
  );

  for (const image of mountedTemplate.content.querySelectorAll("img")) {
    const source = readImageSource(image);

    if (!source || knownSources.has(source)) {
      continue;
    }

    knownSources.add(source);

    const imageClone = image.cloneNode(true) as HTMLImageElement;
    const presentation =
      image.getAttribute(CHATTEX_IMAGE_PRESENTATION_ATTRIBUTE) ??
      classifyImageSource(source);

    imageClone.setAttribute(
      CHATTEX_IMAGE_PRESENTATION_ATTRIBUTE,
      presentation,
    );
    apiTemplate.content.append(imageClone);
  }

  return {
    ...apiMessage,
    html: apiTemplate.innerHTML,
  };
}

function createTemplate(
  documentRef: Document,
  html: string,
): HTMLTemplateElement {
  const template = documentRef.createElement("template");

  template.innerHTML = html;

  return template;
}

function readImageSource(image: HTMLImageElement): string {
  return (image.currentSrc || image.getAttribute("src") || "").trim();
}

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
