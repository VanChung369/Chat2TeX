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
