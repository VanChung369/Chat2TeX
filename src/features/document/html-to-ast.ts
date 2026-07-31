import type { ChatConversation, ChatMessage } from "@/src/features/chat/types";

import type {
  BlockNode,
  ChatDocumentAst,
  ChatMessageAst,
  HeadingBlock,
  ImagePresentation,
  InlineNode,
  ListBlock,
  TableRowNode,
} from "./ast";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

// Guards against stack overflow on pathologically nested HTML.
const MAX_BLOCK_DEPTH = 100;

const IGNORED_TAGS = new Set([
  "BUTTON",
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "SVG",
  "INPUT",
  "TEXTAREA",
  "SELECT",
]);

const CONTAINER_TAGS = new Set([
  "DIV",
  "SECTION",
  "ARTICLE",
  "MAIN",
  "FIGURE",
  "FIGCAPTION",
  "HEADER",
  "FOOTER",
]);

export class HtmlToAstParser {
  constructor(private readonly documentRef: Document = document) {}

  parseConversation(conversation: ChatConversation): ChatDocumentAst {
    return {
      title: conversation.title,
      url: conversation.url,
      messages: conversation.messages.map((message) =>
        this.parseMessage(message),
      ),
    };
  }

  parseMessage(message: ChatMessage): ChatMessageAst {
    return {
      id: message.id,
      role: message.role,
      order: message.order,
      blocks: this.parseHtml(message.html),
    };
  }

  parseHtml(html: string): BlockNode[] {
    const template = this.documentRef.createElement("template");

    template.innerHTML = html;

    return this.parseBlockNodes(Array.from(template.content.childNodes));
  }

  private parseBlockNodes(nodes: Node[], depth = 0): BlockNode[] {
    if (depth > MAX_BLOCK_DEPTH) {
      const children = compactInlineNodes(
        nodes.flatMap((node) => this.parseInlineNode(node)),
      );

      return children.length === 0 ? [] : [{ type: "paragraph", children }];
    }

    const blocks: BlockNode[] = [];
    let inlineBuffer: InlineNode[] = [];

    const flushInlineBuffer = (): void => {
      const children = compactInlineNodes(inlineBuffer);

      inlineBuffer = [];

      if (children.length === 0) {
        return;
      }

      blocks.push({
        type: "paragraph",
        children,
      });
    };

    for (const node of nodes) {
      if (node.nodeType === TEXT_NODE) {
        inlineBuffer.push(...this.parseInlineNode(node));

        continue;
      }

      if (node.nodeType !== ELEMENT_NODE) {
        continue;
      }

      const element = node as HTMLElement;

      if (IGNORED_TAGS.has(element.tagName)) {
        continue;
      }

      const parsedBlocks = this.parseBlockElement(element, depth);

      if (parsedBlocks === null) {
        inlineBuffer.push(...this.parseInlineNode(element));

        continue;
      }

      flushInlineBuffer();
      blocks.push(...parsedBlocks);
    }

    flushInlineBuffer();

    return blocks;
  }

  private parseBlockElement(
    element: HTMLElement,
    depth: number,
  ): BlockNode[] | null {
    const displayMath = this.extractDisplayMath(element);

    if (displayMath) {
      return [
        {
          type: "math",
          latex: displayMath,
        },
      ];
    }

    if (/^H[1-6]$/.test(element.tagName)) {
      const level = Number.parseInt(
        element.tagName.slice(1),
        10,
      ) as HeadingBlock["level"];

      const children = this.parseInlineNodes(Array.from(element.childNodes));

      if (children.length === 0) {
        return [];
      }

      return [
        {
          type: "heading",
          level,
          children,
        },
      ];
    }

    switch (element.tagName) {
      case "P":
        return this.parseParagraph(element);

      case "PRE":
        return [this.parseCodeBlock(element)];

      case "UL":
      case "OL":
        return [this.parseList(element, depth)];

      case "BLOCKQUOTE":
        return [
          {
            type: "quote",
            blocks: this.parseBlockNodes(
              Array.from(element.childNodes),
              depth + 1,
            ),
          },
        ];

      case "TABLE":
        return [
          {
            type: "table",
            rows: this.parseTable(element),
          },
        ];

      case "HR":
        return [
          {
            type: "horizontal-rule",
          },
        ];

      case "IMG":
        return [
          {
            type: "image",
            src: element.getAttribute("src") ?? "",
            alt: element.getAttribute("alt") ?? "",
            title: element.getAttribute("title"),
            presentation: readImagePresentation(element),
          },
        ];
    }

    if (CONTAINER_TAGS.has(element.tagName)) {
      return this.parseBlockNodes(Array.from(element.childNodes), depth + 1);
    }

    return null;
  }

  private parseParagraph(element: HTMLElement): BlockNode[] {
    const displayMath = this.findSingleDisplayMathChild(element);

    if (displayMath) {
      return [
        {
          type: "math",
          latex: displayMath,
        },
      ];
    }

    const children = this.parseInlineNodes(Array.from(element.childNodes));

    if (children.length === 0) {
      return [];
    }

    return [
      {
        type: "paragraph",
        children,
      },
    ];
  }

  private parseCodeBlock(preElement: HTMLElement): BlockNode {
    const codeElement = preElement.querySelector("code");

    const sourceElement = codeElement ?? preElement;

    const code = (sourceElement.textContent ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/^\n/, "")
      .replace(/\n$/, "");

    return {
      type: "code",
      language: readCodeLanguage(codeElement, preElement),
      code,
    };
  }

  private parseList(element: HTMLElement, depth: number): ListBlock {
    const ordered = element.tagName === "OL";

    const startValue = ordered
      ? Number.parseInt(element.getAttribute("start") ?? "1", 10)
      : null;

    const listItems = Array.from(element.children).filter(
      (child): child is HTMLElement =>
        child.nodeType === ELEMENT_NODE && child.tagName === "LI",
    );

    return {
      type: "list",
      ordered,
      start: ordered && !Number.isNaN(startValue) ? startValue : null,

      items: listItems.map((item) => ({
        blocks: this.parseBlockNodes(Array.from(item.childNodes), depth + 1),
      })),
    };
  }

  private parseTable(element: HTMLElement): TableRowNode[] {
    const table = element as HTMLTableElement;

    return Array.from(table.rows).map((row) => ({
      cells: Array.from(row.cells).map((cell) => ({
        header: cell.tagName === "TH",

        children: this.parseInlineNodes(Array.from(cell.childNodes)),
      })),
    }));
  }

  private parseInlineNodes(nodes: Node[]): InlineNode[] {
    return compactInlineNodes(
      nodes.flatMap((node) => this.parseInlineNode(node)),
    );
  }

  private parseInlineNode(node: Node): InlineNode[] {
    if (node.nodeType === TEXT_NODE) {
      return this.parseTextNodeWithDelimiters(node.textContent ?? "");
    }

    if (node.nodeType !== ELEMENT_NODE) {
      return [];
    }

    const element = node as HTMLElement;

    if (IGNORED_TAGS.has(element.tagName)) {
      return [];
    }

    const inlineMath = this.extractInlineMath(element);

    if (inlineMath) {
      return [
        {
          type: "inline-math",
          latex: inlineMath,
        },
      ];
    }

    switch (element.tagName) {
      case "STRONG":
      case "B":
        return [
          {
            type: "strong",
            children: this.parseInlineNodes(Array.from(element.childNodes)),
          },
        ];

      case "EM":
      case "I":
        return [
          {
            type: "emphasis",
            children: this.parseInlineNodes(Array.from(element.childNodes)),
          },
        ];

      case "DEL":
      case "S":
        return [
          {
            type: "strike",
            children: this.parseInlineNodes(Array.from(element.childNodes)),
          },
        ];

      case "CODE":
        return [
          {
            type: "inline-code",
            value: element.textContent ?? "",
          },
        ];

      case "A":
        return [
          {
            type: "link",
            href: element.getAttribute("href") ?? "",
            title: element.getAttribute("title"),

            children: this.parseInlineNodes(Array.from(element.childNodes)),
          },
        ];

      case "IMG":
        return [
          {
            type: "inline-image",
            src: element.getAttribute("src") ?? "",
            alt: element.getAttribute("alt") ?? "",
            title: element.getAttribute("title"),
          },
        ];

      case "BR":
        return [
          {
            type: "line-break",
          },
        ];
    }

    return element.childNodes.length > 0
      ? this.parseInlineNodes(Array.from(element.childNodes))
      : [];
  }

  private extractDisplayMath(element: HTMLElement): string | null {
    const isDisplayMath = element.matches(
      ".katex-display," + '[data-math-style="display"]',
    );

    if (!isDisplayMath) {
      return null;
    }

    return extractLatexSource(element);
  }

  private findSingleDisplayMathChild(element: HTMLElement): string | null {
    if (element.children.length !== 1) {
      return null;
    }

    const child = element.firstElementChild as HTMLElement | null;

    if (!child?.matches(".katex-display," + '[data-math-style="display"]')) {
      return null;
    }

    return extractLatexSource(child);
  }

  private extractInlineMath(element: HTMLElement): string | null {
    const isInlineMath = element.matches(
      ".katex," + '[data-math-style="inline"]',
    );

    const isDisplayMath = element.matches(".katex-display");

    if (!isInlineMath || isDisplayMath) {
      return null;
    }

    return extractLatexSource(element);
  }

  private parseTextNodeWithDelimiters(text: string): InlineNode[] {
    const mathPattern = /(\\\[[\s\S]*?\\\]|\\\(.*?\\\))/g;
    const parts = text.split(mathPattern);
    const nodes: InlineNode[] = [];

    for (const part of parts) {
      if (!part) continue;

      if (part.startsWith("\\[") && part.endsWith("\\]")) {
        const latex = part.slice(2, -2).trim();
        if (latex) {
          nodes.push({ type: "inline-math", latex });
          continue;
        }
      }

      if (part.startsWith("\\(") && part.endsWith("\\)")) {
        const latex = part.slice(2, -2).trim();
        if (latex) {
          nodes.push({ type: "inline-math", latex });
          continue;
        }
      }

      const normalized = normalizeInlineText(part);
      if (normalized) {
        nodes.push({ type: "text", value: normalized });
      }
    }

    return nodes;
  }
}

function readImagePresentation(element: HTMLElement): ImagePresentation {
  return element.getAttribute("data-chattex-image-presentation") === "icon"
    ? "icon"
    : "content";
}

function extractLatexSource(element: HTMLElement): string | null {
  const annotation = element.querySelector(
    'annotation[encoding="application/x-tex"]',
  );

  const annotationValue = annotation?.textContent?.trim();

  if (annotationValue) {
    return annotationValue;
  }

  const attributeValue =
    element.getAttribute("data-latex") ?? element.getAttribute("data-tex");

  return attributeValue?.trim() || null;
}

function readCodeLanguage(
  codeElement: HTMLElement | null,
  preElement: HTMLElement,
): string | null {
  for (const element of [codeElement, preElement]) {
    const value =
      element?.getAttribute("data-language") ??
      element?.getAttribute("data-lang");

    if (value?.trim()) {
      return value.trim().toLowerCase();
    }
  }

  const classNames = [
    ...(codeElement?.classList ?? []),
    ...preElement.classList,
  ];

  for (const className of classNames) {
    const match = className.match(/^(?:language|lang)-(.+)$/i);

    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  }

  let currentElement: Element | null = preElement;

  for (let depth = 0; depth < 3 && currentElement; depth += 1) {
    const headerLanguage = readRecognizedLanguageLabel(
      currentElement.previousElementSibling,
    );

    if (headerLanguage) {
      return headerLanguage;
    }

    currentElement = currentElement.parentElement;
  }

  return null;
}

const CODE_LANGUAGE_ALIASES = new Set([
  "bash",
  "c",
  "c++",
  "cpp",
  "css",
  "html",
  "java",
  "javascript",
  "js",
  "json",
  "jsx",
  "py",
  "python",
  "sh",
  "shell",
  "sql",
  "ts",
  "tsx",
  "typescript",
  "xml",
]);

function readRecognizedLanguageLabel(container: Element | null): string | null {
  if (!container) {
    return null;
  }

  const candidates = [container, ...container.querySelectorAll("*")];

  for (const candidate of candidates) {
    const label = candidate.textContent?.trim().toLowerCase() ?? "";

    if (CODE_LANGUAGE_ALIASES.has(label)) {
      return label;
    }
  }

  return null;
}

function normalizeInlineText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ");
}

function compactInlineNodes(nodes: InlineNode[]): InlineNode[] {
  const compacted: InlineNode[] = [];

  for (const node of nodes) {
    if (node.type === "text" && node.value.length === 0) {
      continue;
    }

    const previous = compacted[compacted.length - 1];

    if (node.type === "text" && previous?.type === "text") {
      previous.value += node.value;
      continue;
    }

    compacted.push(node);
  }

  const first = compacted[0];

  if (first?.type === "text") {
    first.value = first.value.trimStart();
  }

  const last = compacted[compacted.length - 1];

  if (last?.type === "text") {
    last.value = last.value.trimEnd();
  }

  return compacted.filter(
    (node) => node.type !== "text" || node.value.length > 0,
  );
}
