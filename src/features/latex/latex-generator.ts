import type {
  BlockNode,
  ChatDocumentAst,
  ChatMessageAst,
  InlineNode,
  ListBlock,
  TableBlock,
} from "@/src/features/document/ast";

import {
  escapeLatexText,
  escapeLatexUrl,
  renderInlineCode,
} from "./latex-escape";

import type { LatexAssetRequest, LatexGenerationResult } from "./types";

export class LatexGenerator {
  private assets: LatexAssetRequest[] = [];

  generate(document: ChatDocumentAst): LatexGenerationResult {
    this.assets = [];

    const body = document.messages
      .sort((first, second) => first.order - second.order)
      .map((message) => this.renderMessage(message))
      .join("\n\n");

    const source = [
      this.renderPreamble(),
      "",
      "\\begin{document}",
      "",
      this.renderDocumentHeader(document),
      "",
      body,
      "",
      "\\end{document}",
      "",
    ].join("\n");

    return {
      source,
      assets: [...this.assets],
    };
  }

  private renderPreamble(): string {
    return [
      "\\documentclass[11pt,a4paper]{article}",
      "",
      "\\usepackage{fontspec}",
      "\\usepackage{amsmath}",
      "\\usepackage{amssymb}",
      "\\usepackage{graphicx}",
      "\\usepackage{longtable}",
      "\\usepackage{booktabs}",
      "\\usepackage{listings}",
      "\\usepackage{xcolor}",
      "\\usepackage{hyperref}",
      "\\usepackage{enumitem}",
      "\\usepackage[normalem]{ulem}",
      "\\usepackage[most]{tcolorbox}",
      "\\usepackage{geometry}",
      "",
      "\\geometry{",
      "  top=22mm,",
      "  bottom=22mm,",
      "  left=20mm,",
      "  right=20mm",
      "}",
      "",
      "\\hypersetup{",
      "  colorlinks=true,",
      "  linkcolor=blue,",
      "  urlcolor=blue",
      "}",
      "",
      "\\setmainfont{Latin Modern Roman}",
      "\\setmonofont{Latin Modern Mono}",
      "",
      "\\definecolor{userbackground}{HTML}{EEF4FF}",
      "\\definecolor{userborder}{HTML}{5570F1}",
      "\\definecolor{assistantbackground}{HTML}{F5F7FA}",
      "\\definecolor{assistantborder}{HTML}{7A8496}",
      "",
      "\\newtcolorbox{chatmessage}[1]{",
      "  breakable,",
      "  title=#1,",
      "  fonttitle=\\bfseries,",
      "  colback=assistantbackground,",
      "  colframe=assistantborder,",
      "  boxrule=0.7pt,",
      "  arc=2mm,",
      "  left=3mm,",
      "  right=3mm,",
      "  top=2mm,",
      "  bottom=2mm",
      "}",
      "",
      "\\lstset{",
      "  basicstyle=\\ttfamily\\small,",
      "  breaklines=true,",
      "  columns=fullflexible,",
      "  keepspaces=true,",
      "  showstringspaces=false,",
      "  frame=single,",
      "  rulecolor=\\color{black!20},",
      "  backgroundcolor=\\color{black!3}",
      "}",
    ].join("\n");
  }

  private renderDocumentHeader(document: ChatDocumentAst): string {
    const title = escapeLatexText(document.title || "Untitled conversation");

    const sourceUrl = escapeLatexUrl(document.url);

    return [
      `\\title{${title}}`,
      "\\author{ChatTeX Exporter}",
      "\\date{}",
      "\\maketitle",
      "",
      "\\begin{center}",
      "\\small",
      `Source: \\href{${sourceUrl}}{ChatGPT conversation}`,
      "\\end{center}",
      "",
      "\\vspace{4mm}",
    ].join("\n");
  }

  private renderMessage(message: ChatMessageAst): string {
    const roleTitle = message.role === "user" ? "User" : "Assistant";

    const content = message.blocks
      .map((block) => this.renderBlock(block))
      .filter(Boolean)
      .join("\n\n");

    return [
      `\\begin{chatmessage}{${roleTitle}}`,
      content || "\\emph{Empty message}",
      "\\end{chatmessage}",
    ].join("\n");
  }

  private renderBlock(block: BlockNode): string {
    switch (block.type) {
      case "paragraph":
        return this.renderInlineNodes(block.children);

      case "heading":
        return this.renderHeading(block.level, block.children);

      case "code":
        return this.renderCodeBlock(block.language, block.code);

      case "list":
        return this.renderList(block);

      case "quote":
        return [
          "\\begin{quote}",
          block.blocks.map((child) => this.renderBlock(child)).join("\n\n"),
          "\\end{quote}",
        ].join("\n");

      case "table":
        return this.renderTable(block);

      case "math":
        return ["\\[", block.latex.trim(), "\\]"].join("\n");

      case "image":
        return this.renderBlockImage(block.src, block.alt);

      case "horizontal-rule":
        return ["\\par", "\\noindent\\rule{\\linewidth}{0.4pt}", "\\par"].join(
          "\n",
        );
    }
  }

  private renderHeading(level: number, children: InlineNode[]): string {
    const content = this.renderInlineNodes(children);

    const commands: Readonly<Record<number, string>> = {
      1: "section",
      2: "subsection",
      3: "subsubsection",
      4: "paragraph",
      5: "subparagraph",
    };

    const command = commands[level];

    if (!command) {
      return `\\textbf{${content}}`;
    }

    return `\\${command}*{${content}}`;
  }

  private renderCodeBlock(language: string | null, code: string): string {
    const listingLanguage = mapListingLanguage(language);

    const option = listingLanguage ? `[language=${listingLanguage}]` : "";

    const safeCode = code.replace(/\\end\{lstlisting\}/g, "\\end {lstlisting}");

    return [`\\begin{lstlisting}${option}`, safeCode, "\\end{lstlisting}"].join(
      "\n",
    );
  }

  private renderList(block: ListBlock): string {
    const environment = block.ordered ? "enumerate" : "itemize";

    const startOption =
      block.ordered && block.start !== null && block.start !== 1
        ? `[start=${block.start}]`
        : "";

    const items = block.items
      .map((item) => {
        const itemContent = item.blocks
          .map((child) => this.renderBlock(child))
          .join("\n\n");

        return ["\\item", itemContent].join(" ");
      })
      .join("\n");

    return [
      `\\begin{${environment}}${startOption}`,
      items,
      `\\end{${environment}}`,
    ].join("\n");
  }

  private renderTable(block: TableBlock): string {
    if (block.rows.length === 0) {
      return "";
    }

    const columnCount = Math.max(
      ...block.rows.map((row) => row.cells.length),
      1,
    );

    const columnDefinition = "l".repeat(columnCount);

    const rows = block.rows.map((row, rowIndex) => {
      const cells = Array.from({ length: columnCount }, (_, columnIndex) => {
        const cell = row.cells[columnIndex];

        if (!cell) {
          return "";
        }

        const content = this.renderInlineNodes(cell.children);

        return cell.header ? `\\textbf{${content}}` : content;
      });

      const renderedRow = `${cells.join(" & ")} \\\\`;

      const isHeaderRow =
        rowIndex === 0 &&
        row.cells.length > 0 &&
        row.cells.every((cell) => cell.header);

      return isHeaderRow ? `${renderedRow}\n\\midrule` : renderedRow;
    });

    return [
      `\\begin{longtable}{${columnDefinition}}`,
      "\\toprule",
      ...rows,
      "\\bottomrule",
      "\\end{longtable}",
    ].join("\n");
  }

  private renderInlineNodes(nodes: InlineNode[]): string {
    return nodes.map((node) => this.renderInlineNode(node)).join("");
  }

  private renderInlineNode(node: InlineNode): string {
    switch (node.type) {
      case "text":
        return escapeLatexText(node.value);

      case "strong":
        return ["\\textbf{", this.renderInlineNodes(node.children), "}"].join(
          "",
        );

      case "emphasis":
        return ["\\emph{", this.renderInlineNodes(node.children), "}"].join("");

      case "strike":
        return ["\\sout{", this.renderInlineNodes(node.children), "}"].join("");

      case "inline-code":
        return renderInlineCode(node.value);

      case "link":
        return [
          "\\href{",
          escapeLatexUrl(node.href),
          "}{",
          this.renderInlineNodes(node.children) || escapeLatexText(node.href),
          "}",
        ].join("");

      case "inline-math":
        return `$${node.latex.trim()}$`;

      case "inline-image":
        return this.renderInlineImage(node.src, node.alt);

      case "line-break":
        return "\\\\\n";
    }
  }

  private renderBlockImage(sourceUrl: string, alt: string): string {
    const asset = this.registerImage(sourceUrl, alt);

    const caption = alt.trim()
      ? ["\\par", "\\small\\emph{", escapeLatexText(alt.trim()), "}"].join("")
      : "";

    return [
      "\\begin{center}",
      "\\includegraphics[",
      "  width=\\linewidth,",
      "  height=0.75\\textheight,",
      "  keepaspectratio",
      `]{${asset.outputPath}}`,
      caption,
      "\\end{center}",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private renderInlineImage(sourceUrl: string, alt: string): string {
    const asset = this.registerImage(sourceUrl, alt);

    return [
      "\\raisebox{-0.2em}{",
      "\\includegraphics[",
      "  height=1.2em,",
      "  keepaspectratio",
      `]{${asset.outputPath}}`,
      "}",
    ].join("");
  }

  private registerImage(sourceUrl: string, alt: string): LatexAssetRequest {
    const existingAsset = this.assets.find(
      (asset) => asset.sourceUrl === sourceUrl,
    );

    if (existingAsset) {
      return existingAsset;
    }

    const id = ["image-", String(this.assets.length + 1).padStart(3, "0")].join(
      "",
    );

    const asset: LatexAssetRequest = {
      id,
      kind: "image",
      sourceUrl,
      outputPath: `assets/${id}.png`,
      alt,
    };

    this.assets.push(asset);

    return asset;
  }
}

function mapListingLanguage(language: string | null): string | null {
  if (!language) {
    return null;
  }

  const normalized = language.toLowerCase().trim();

  const languageMap: Readonly<Record<string, string>> = {
    js: "JavaScript",
    javascript: "JavaScript",
    jsx: "JavaScript",

    ts: "JavaScript",
    typescript: "JavaScript",
    tsx: "JavaScript",

    py: "Python",
    python: "Python",

    sh: "bash",
    shell: "bash",
    bash: "bash",

    sql: "SQL",
    java: "Java",
    c: "C",
    cpp: "C++",
    "c++": "C++",
    html: "HTML",
    xml: "XML",
  };

  return languageMap[normalized] ?? null;
}
