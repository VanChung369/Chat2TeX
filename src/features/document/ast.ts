import type { ChatRole } from "@/src/features/chat/types";

export interface ChatDocumentAst {
  title: string;
  url: string;
  messages: ChatMessageAst[];
}

export interface ChatMessageAst {
  id: string;
  role: ChatRole;
  order: number;
  blocks: BlockNode[];
}

export type BlockNode =
  | ParagraphBlock
  | HeadingBlock
  | CodeBlock
  | ListBlock
  | QuoteBlock
  | TableBlock
  | MathBlock
  | ImageBlock
  | HorizontalRuleBlock;

export interface ParagraphBlock {
  type: "paragraph";
  children: InlineNode[];
}

export interface HeadingBlock {
  type: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: InlineNode[];
}

export interface CodeBlock {
  type: "code";
  language: string | null;
  code: string;
}

export interface ListBlock {
  type: "list";
  ordered: boolean;
  start: number | null;
  items: ListItemNode[];
}

export interface ListItemNode {
  blocks: BlockNode[];
}

export interface QuoteBlock {
  type: "quote";
  blocks: BlockNode[];
}

export interface TableBlock {
  type: "table";
  rows: TableRowNode[];
}

export interface TableRowNode {
  cells: TableCellNode[];
}

export interface TableCellNode {
  header: boolean;
  children: InlineNode[];
}

export interface MathBlock {
  type: "math";
  latex: string;
}

export interface ImageBlock {
  type: "image";
  src: string;
  alt: string;
  title: string | null;
}

export interface HorizontalRuleBlock {
  type: "horizontal-rule";
}

export type InlineNode =
  | TextInline
  | StrongInline
  | EmphasisInline
  | StrikeInline
  | InlineCode
  | LinkInline
  | InlineMath
  | InlineImage
  | LineBreakInline;

export interface TextInline {
  type: "text";
  value: string;
}

export interface StrongInline {
  type: "strong";
  children: InlineNode[];
}

export interface EmphasisInline {
  type: "emphasis";
  children: InlineNode[];
}

export interface StrikeInline {
  type: "strike";
  children: InlineNode[];
}

export interface InlineCode {
  type: "inline-code";
  value: string;
}

export interface LinkInline {
  type: "link";
  href: string;
  title: string | null;
  children: InlineNode[];
}

export interface InlineMath {
  type: "inline-math";
  latex: string;
}

export interface InlineImage {
  type: "inline-image";
  src: string;
  alt: string;
  title: string | null;
}

export interface LineBreakInline {
  type: "line-break";
}
