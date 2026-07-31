import { MarkdownMessageRenderer } from "./markdown-message-renderer";

import type { ChatConversation, ChatMessage, ChatRole } from "./types";

export type ConversationApiFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface ConversationApiReaderOptions {
  cookie?: string;
  markdownRenderer?: MarkdownMessageRenderer;
}

interface ApiConversationNode {
  id: string;
  parent: string | null;
  message: Record<string, unknown> | null;
}

export class ChatGptConversationApiReader {
  private readonly markdownRenderer: MarkdownMessageRenderer;

  constructor(
    private readonly fetcher: ConversationApiFetcher,
    private readonly currentUrl: string,
    private readonly options: ConversationApiReaderOptions = {},
  ) {
    this.markdownRenderer =
      options.markdownRenderer ?? new MarkdownMessageRenderer();
  }

  async read(): Promise<ChatConversation> {
    const pageUrl = new URL(this.currentUrl);
    const conversationId = readConversationId(pageUrl);

    const accessToken = await this.readAccessToken(pageUrl);
    const accountId = await this.readWorkspaceAccountId(
      pageUrl,
      accessToken,
    );
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "X-Authorization": `Bearer ${accessToken}`,
    };

    if (accountId) {
      headers["Chatgpt-Account-Id"] = accountId;
    }

    const response = await this.fetcher(
      new URL(
        `/backend-api/conversation/${encodeURIComponent(conversationId)}`,
        pageUrl,
      ),
      {
        credentials: "include",
        headers,
      },
    );

    if (!response.ok) {
      throw new Error(
        `Conversation request failed with status ${response.status}.`,
      );
    }

    const payload = await readJson(
      response,
      "Conversation response was not valid JSON.",
    );

    return this.parseConversation(payload);
  }

  private async readAccessToken(pageUrl: URL): Promise<string> {
    const response = await this.fetcher(
      new URL("/api/auth/session", pageUrl),
      {
        credentials: "include",
      },
    );

    if (!response.ok) {
      throw new Error(`Session request failed with status ${response.status}.`);
    }

    const payload = await readJson(
      response,
      "Session response was not valid JSON.",
    );

    if (!isRecord(payload) || !isNonEmptyString(payload.accessToken)) {
      throw new Error("ChatGPT session is unavailable.");
    }

    return payload.accessToken;
  }

  private async readWorkspaceAccountId(
    pageUrl: URL,
    accessToken: string,
  ): Promise<string | null> {
    const workspaceId = readCookieValue(
      this.options.cookie ?? "",
      "_account",
    );

    if (!workspaceId) {
      return null;
    }

    const response = await this.fetcher(
      new URL(
        "/backend-api/accounts/check/v4-2023-04-27",
        pageUrl,
      ),
      {
        credentials: "include",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Authorization": `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Workspace account request failed with status ${response.status}.`,
      );
    }

    const payload = await readJson(
      response,
      "Workspace account response was not valid JSON.",
    );

    if (!isRecord(payload) || !isRecord(payload.accounts)) {
      return null;
    }

    const workspace = payload.accounts[workspaceId];

    if (
      !isRecord(workspace) ||
      !isRecord(workspace.account) ||
      !isNonEmptyString(workspace.account.account_id)
    ) {
      return null;
    }

    return workspace.account.account_id;
  }

  private parseConversation(payload: unknown): ChatConversation {
    if (
      !isRecord(payload) ||
      !isNonEmptyString(payload.current_node) ||
      !isRecord(payload.mapping)
    ) {
      throw new Error("Conversation response has a malformed mapping.");
    }

    const branch = readActiveBranch(payload.mapping, payload.current_node);
    const messages: ChatMessage[] = [];

    for (const node of branch) {
      const message = parseVisibleMessage(
        node,
        messages.length,
        this.markdownRenderer,
      );

      if (message) {
        messages.push(message);
      }
    }

    if (messages.length === 0) {
      throw new Error(
        "Conversation active branch contains no exportable messages.",
      );
    }

    return {
      title:
        typeof payload.title === "string" && payload.title.trim()
          ? payload.title.trim()
          : "Untitled conversation",
      url: this.currentUrl,
      messages,
    };
  }
}

function readConversationId(pageUrl: URL): string {
  const segments = pageUrl.pathname.split("/").filter(Boolean);
  const conversationIndex = segments.indexOf("c");
  const conversationId = segments[conversationIndex + 1];

  if (conversationIndex < 0 || !conversationId) {
    throw new Error("Unable to determine the ChatGPT conversation ID.");
  }

  return decodeURIComponent(conversationId);
}

async function readJson(
  response: Response,
  errorMessage: string,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(errorMessage);
  }
}

function readActiveBranch(
  mapping: Record<string, unknown>,
  currentNodeId: string,
): ApiConversationNode[] {
  const branch: ApiConversationNode[] = [];
  const visited = new Set<string>();
  let nodeId: string | null = currentNodeId;

  while (nodeId !== null) {
    if (visited.has(nodeId)) {
      throw new Error("Conversation mapping contains a parent cycle.");
    }

    visited.add(nodeId);

    const node = parseNode(mapping[nodeId], nodeId);

    branch.push(node);
    nodeId = node.parent;
  }

  return branch.reverse();
}

function parseNode(value: unknown, expectedId: string): ApiConversationNode {
  if (!isRecord(value)) {
    throw new Error(
      `Conversation mapping is missing active-branch node ${expectedId}.`,
    );
  }

  const id = isNonEmptyString(value.id) ? value.id : expectedId;
  const parent =
    value.parent === null || typeof value.parent === "string"
      ? value.parent
      : undefined;

  if (parent === undefined) {
    throw new Error(`Conversation node ${id} has an invalid parent.`);
  }

  if (value.message !== null && !isRecord(value.message)) {
    throw new Error(`Conversation node ${id} has an invalid message.`);
  }

  return {
    id,
    parent,
    message: value.message,
  };
}

function parseVisibleMessage(
  node: ApiConversationNode,
  order: number,
  markdownRenderer: MarkdownMessageRenderer,
): ChatMessage | null {
  const message = node.message;

  if (!message) {
    return null;
  }

  const author = message.author;
  const content = message.content;

  if (!isRecord(author) || !isRecord(content)) {
    return null;
  }

  const role = readVisibleRole(author.role);

  if (!role) {
    return null;
  }

  if (
    message.recipient !== undefined &&
    message.recipient !== null &&
    message.recipient !== "all"
  ) {
    return null;
  }

  const parts = Array.isArray(content.parts)
    ? content.parts
        .map(readContentPartText)
        .filter((part): part is string => part !== null)
    : [];
  const text = parts.join("\n\n").trim();

  if (!text) {
    return null;
  }

  return {
    id: isNonEmptyString(message.id) ? message.id : node.id,
    role,
    order,
    text,
    html: markdownRenderer.render(text),
  };
}

function readVisibleRole(value: unknown): Extract<ChatRole, "user" | "assistant"> | null {
  return value === "user" || value === "assistant" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readContentPartText(part: unknown): string | null {
  if (isNonEmptyString(part)) {
    return part;
  }

  if (isRecord(part) && isNonEmptyString(part.text)) {
    return part.text;
  }

  return null;
}

function readCookieValue(cookie: string, name: string): string | null {
  const prefix = `${name}=`;
  const match = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!match) {
    return null;
  }

  const value = match.slice(prefix.length);

  if (!value) {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
