export interface RuntimeMessageSenderLike {
  id?: string;
  url?: string;
  tab?: {
    url?: string;
  };
}

const TRUSTED_CONTENT_HOSTS =
  /^(?:chatgpt\.com|chat\.openai\.com)$/i;

export function isTrustedPublicRuntimeSender(
  sender: RuntimeMessageSenderLike,
  runtimeId: string,
): boolean {
  if (sender.id !== runtimeId) {
    return false;
  }

  if (sender.url) {
    try {
      const senderUrl = new URL(sender.url);
      if (
        senderUrl.protocol === "chrome-extension:" &&
        senderUrl.hostname === runtimeId
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }

  if (!sender.tab?.url) {
    return false;
  }
  try {
    return TRUSTED_CONTENT_HOSTS.test(
      new URL(sender.tab.url).hostname,
    );
  } catch {
    return false;
  }
}

export function isBackgroundRuntimeSender(
  sender: RuntimeMessageSenderLike,
  runtimeId: string,
  backgroundUrl: string,
): boolean {
  return (
    sender.id === runtimeId &&
    !sender.tab &&
    sender.url === backgroundUrl
  );
}

export function isCompilerDocumentRuntimeSender(
  sender: RuntimeMessageSenderLike,
  runtimeId: string,
  compilerDocumentUrl: string,
): boolean {
  return (
    sender.id === runtimeId &&
    !sender.tab &&
    sender.url === compilerDocumentUrl
  );
}
