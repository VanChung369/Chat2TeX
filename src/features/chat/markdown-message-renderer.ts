import { Marked } from "marked";

import type { TokenizerAndRendererExtension, Tokens } from "marked";

interface MathToken extends Tokens.Generic {
  latex: string;
}

const displayMathExtension: TokenizerAndRendererExtension = {
  name: "chattexDisplayMath",
  level: "block",

  start(source) {
    const index = source.indexOf("$$");

    return index >= 0 ? index : undefined;
  },

  tokenizer(source) {
    const match = source.match(
      /^\$\$[ \t]*(?:\n)?([\s\S]+?)(?:\n)?[ \t]*\$\$(?:\n|$)/,
    );

    if (!match) {
      return undefined;
    }

    return {
      type: "chattexDisplayMath",
      raw: match[0],
      latex: match[1].trim(),
    };
  },

  renderer(token) {
    const mathToken = token as MathToken;

    return [
      '<div data-math-style="display" data-latex="',
      escapeHtmlAttribute(mathToken.latex),
      '"></div>',
    ].join("");
  },
};

const inlineMathExtension: TokenizerAndRendererExtension = {
  name: "chattexInlineMath",
  level: "inline",

  start(source) {
    const index = source.indexOf("$");

    return index >= 0 ? index : undefined;
  },

  tokenizer(source) {
    const match = source.match(
      /^\$(?!\$)(?!\s)([^$\n]+?)(?<!\s)\$(?!\$)/,
    );

    if (!match) {
      return undefined;
    }

    return {
      type: "chattexInlineMath",
      raw: match[0],
      latex: match[1].trim(),
    };
  },

  renderer(token) {
    const mathToken = token as MathToken;

    return [
      '<span data-math-style="inline" data-latex="',
      escapeHtmlAttribute(mathToken.latex),
      '"></span>',
    ].join("");
  },
};

export class MarkdownMessageRenderer {
  private readonly marked = new Marked({
    async: false,
    breaks: true,
    extensions: [displayMathExtension, inlineMathExtension],
    gfm: true,

    renderer: {
      code({ text, lang }) {
        const language = normalizeFenceLanguage(lang);
        const languageAttribute = language
          ? ` data-language="${escapeHtmlAttribute(language)}"`
          : "";
        const languageClass = language
          ? ` class="language-${escapeHtmlAttribute(language)}"`
          : "";

        return [
          `<pre${languageAttribute}>`,
          `<code${languageClass}>${escapeHtml(text)}</code>`,
          "</pre>",
        ].join("");
      },

      html({ text }) {
        return escapeHtml(text);
      },
    },
  });

  render(markdown: string): string {
    return this.marked.parse(markdown.normalize("NFC"), {
      async: false,
    });
  }
}

function normalizeFenceLanguage(value: string | undefined): string {
  return value?.trim().match(/^[a-z0-9+#._-]+/iu)?.[0]?.toLowerCase() ?? "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}
