export interface LatexAssetRequest {
  id: string;
  kind: "image";
  sourceUrl: string;
  outputPath: string;
  alt: string;
}

export interface LatexGenerationResult {
  source: string;
  assets: LatexAssetRequest[];
}

export type LatexTemplateId =
  | "academic"
  | "editorial-book"
  | "modern-minimal"
  | "executive-report"
  | "ieee-twocolumn"
  | "notion-style"
  | "cheatsheet"
  | "dark-mode"
  | "classic-serif"
  | "typewriter-memo";

export type LatexPaperColor =
  | "default"
  | "white"
  | "cream"
  | "sepia"
  | "grey"
  | "dark";

export type LatexFontFamily = "default" | "serif" | "sans" | "mono";

export type LatexPaperSize = "a4" | "letter" | "a5";

export interface LatexExportOptions {
  templateId?: LatexTemplateId;
  paperColor?: LatexPaperColor;
  fontFamily?: LatexFontFamily;
  paperSize?: LatexPaperSize;
  authorName?: string;
  exportPdfOnly?: boolean;
  includeUserMessages?: boolean;
  excludedMessageIds?: string[];
}

export interface LatexTemplateDescriptor {
  id: LatexTemplateId;
  name: string;
  description: string;
}

export const LATEX_TEMPLATES: LatexTemplateDescriptor[] = [
  {
    id: "academic",
    name: "Academic Article",
    description: "Standard single-column research paper with classic serif typography.",
  },
  {
    id: "editorial-book",
    name: "Editorial Book",
    description: "Beautifully typeset book layout with cover page and table of contents.",
  },
  {
    id: "modern-minimal",
    name: "Modern Minimalist",
    description: "Clean sans-serif design with subtle left accent bars.",
  },
  {
    id: "executive-report",
    name: "Executive Business Report",
    description: "Navy blue corporate theme with formal title header.",
  },
  {
    id: "ieee-twocolumn",
    name: "IEEE Two-Column",
    description: "Dense 2-column IEEE scientific article layout.",
  },
  {
    id: "notion-style",
    name: "Notion Digital Notes",
    description: "Pastel callouts, tech note badges, and clean code blocks.",
  },
  {
    id: "cheatsheet",
    name: "Compact Cheatsheet",
    description: "High-density two-column layout for quick reference.",
  },
  {
    id: "dark-mode",
    name: "Sleek Dark Mode",
    description: "Dark paper background with cyan accents and glowing code boxes.",
  },
  {
    id: "classic-serif",
    name: "Classic Monograph",
    description: "Traditional monograph styling with formal serif headers.",
  },
  {
    id: "typewriter-memo",
    name: "Technical Memo",
    description: "Retro monospaced accents and memo header box.",
  },
];
