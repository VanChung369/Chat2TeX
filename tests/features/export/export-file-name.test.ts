import { describe, expect, it } from "vitest";

import { createExportFileStem } from "@/src/features/export/export-file-name";

describe("createExportFileStem", () => {
  const date = new Date(2026, 6, 30, 12, 0, 0);

  it("creates a safe slug from a Vietnamese title", () => {
    expect(createExportFileStem("Học LaTeX: PDF & ChatGPT", date)).toBe(
      "hoc-latex-pdf-chatgpt-2026-07-30",
    );
  });

  it("uses a fallback for an empty title", () => {
    expect(createExportFileStem("???", date)).toBe(
      "chatgpt-conversation-2026-07-30",
    );
  });

  it("removes unsafe path characters", () => {
    const result = createExportFileStem("../../My\\Conversation", date);

    expect(result).toBe("my-conversation-2026-07-30");

    expect(result).not.toContain("/");
    expect(result).not.toContain("\\");
  });
});
