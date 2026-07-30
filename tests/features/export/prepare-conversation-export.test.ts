import { describe, expect, it } from "vitest";

import { prepareConversationExport } from "@/src/features/export/prepare-conversation-export";

describe("prepareConversationExport", () => {
  it("reports the number of unique collected messages", () => {
    const prepared = prepareConversationExport({
      title: "Đầy đủ hội thoại",
      url: "https://chatgpt.com/c/complete",
      messages: [
        {
          id: "user-1",
          role: "user",
          order: 0,
          text: "Câu hỏi",
          html: "<p>Câu hỏi</p>",
        },
        {
          id: "assistant-1",
          role: "assistant",
          order: 1,
          text: "Câu trả lời",
          html: "<p>Câu trả lời</p>",
        },
      ],
    });

    expect(prepared.messageCount).toBe(2);
    expect(prepared.latexSource).toContain("Câu trả lời");
  });
});
