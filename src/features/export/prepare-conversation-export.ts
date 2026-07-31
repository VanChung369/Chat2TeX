import type { ChatConversation } from "@/src/features/chat/types";
import { HtmlToAstParser } from "@/src/features/document/html-to-ast";
import { LatexGenerator } from "@/src/features/latex/latex-generator";
import type { LatexExportOptions, LatexTemplateId } from "@/src/features/latex/types";
import type { PreparedExport } from "./types";

export function prepareConversationExport(
  conversation: ChatConversation,
  optionsOrTemplateId: LatexExportOptions | LatexTemplateId = "academic",
  parser = new HtmlToAstParser(),
  generator = new LatexGenerator(),
): PreparedExport {
  const ast = parser.parseConversation(conversation);

  const latex = generator.generate(ast, optionsOrTemplateId);

  return {
    title: conversation.title,
    url: conversation.url,
    messageCount: conversation.messages.length,
    latexSource: latex.source,
    assets: latex.assets,
  };
}
