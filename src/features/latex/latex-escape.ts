const TEXT_CHARACTER_MAP: Readonly<Record<string, string>> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "#": "\\#",
  $: "\\$",
  "%": "\\%",
  "&": "\\&",
  _: "\\_",
  "^": "\\textasciicircum{}",
  "~": "\\textasciitilde{}",
};

export function escapeLatexText(value: string): string {
  return Array.from(value)
    .map((character) => TEXT_CHARACTER_MAP[character] ?? character)
    .join("");
}

export function escapeLatexUrl(value: string): string {
  return value
    .replace(/\\/g, "%5C")
    .replace(/{/g, "%7B")
    .replace(/}/g, "%7D")
    .replace(/%/g, "\\%")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/&/g, "\\&");
}

export function renderInlineCode(value: string): string {
  const normalized = value.replace(/\r?\n/g, " ").trim();

  const delimiters = ["|", "!", "+", "/", "@", ";", ":", "=", "?"];

  const delimiter = delimiters.find(
    (candidate) => !normalized.includes(candidate),
  );

  if (delimiter) {
    return ["\\lstinline", delimiter, normalized, delimiter].join("");
  }

  return ["\\texttt{", escapeLatexText(normalized), "}"].join("");
}

const EMOJI_AND_SYMBOL_PATTERN =
  /[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/gu;

export function sanitizeCodeBlockUnicode(value: string): string {
  return value
    .normalize("NFC")
    .replace(EMOJI_AND_SYMBOL_PATTERN, (match) => {
      const codePoint = match.codePointAt(0);

      // Latin Modern Mono lacks emoji glyphs; show the codepoint instead of a
      // missing-glyph box that also triggers XeLaTeX "Missing character" noise.
      return codePoint === undefined
        ? ""
        : `[U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}]`;
    });
}
