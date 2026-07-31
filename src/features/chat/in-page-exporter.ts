import type {
  LatexExportOptions,
  LatexFontFamily,
  LatexPaperColor,
  LatexTemplateId,
} from "@/src/features/latex/types";

export interface ChatMessageSummary {
  id: string;
  role: "user" | "assistant";
  snippet: string;
}

export type MessageFetcher = () => Promise<ChatMessageSummary[]> | ChatMessageSummary[];

export type InPageExportRunner = (
  updateStatus: (statusText: string) => void,
  options: LatexExportOptions,
) => Promise<void>;

export class InPageExporterUI {
  private container: HTMLElement | null = null;
  private statusPanel: HTMLElement | null = null;
  private isProcessing = false;
  private selectedTemplate: LatexTemplateId = "academic";
  private selectedColor: LatexPaperColor = "default";
  private selectedFont: LatexFontFamily = "default";
  private exportPdfOnly = false;
  private includeUserMessages = true;
  private excludedMessageIds = new Set<string>();
  private loadedMessages: ChatMessageSummary[] = [];
  private isFetchingMessages = false;

  constructor(
    private readonly runner?: InPageExportRunner,
    private readonly getMessages?: MessageFetcher,
  ) {}

  mount(): void {
    if (document.getElementById("chat2tex-inpage-root")) {
      return;
    }

    const root = document.createElement("div");
    root.id = "chat2tex-inpage-root";
    root.style.position = "fixed";
    root.style.bottom = "20px";
    root.style.right = "20px";
    root.style.zIndex = "999999";
    root.style.fontFamily = "system-ui, -apple-system, sans-serif";

    const button = document.createElement("button");
    button.id = "chat2tex-inpage-trigger";
    button.innerText = "📄 Chat2TeX Export";
    button.style.backgroundColor = "#2b6cb0";
    button.style.color = "#ffffff";
    button.style.border = "none";
    button.style.borderRadius = "24px";
    button.style.padding = "12px 20px";
    button.style.fontSize = "14px";
    button.style.fontWeight = "600";
    button.style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.25)";
    button.style.cursor = "pointer";
    button.style.transition = "transform 0.15s ease, background-color 0.15s ease";

    button.onmouseenter = () => {
      button.style.transform = "scale(1.05)";
      button.style.backgroundColor = "#1e4e8c";
    };
    button.onmouseleave = () => {
      button.style.transform = "scale(1)";
      button.style.backgroundColor = "#2b6cb0";
    };

    button.onclick = () => {
      this.togglePanel();
    };

    root.appendChild(button);
    document.body.appendChild(root);
    this.container = root;
  }

  private togglePanel(): void {
    if (this.statusPanel) {
      this.statusPanel.remove();
      this.statusPanel = null;
    } else {
      this.createStatusPanel();
    }
  }

  private createStatusPanel(): void {
    const panel = document.createElement("div");
    panel.id = "chat2tex-inpage-panel";
    panel.style.position = "absolute";
    panel.style.bottom = "56px";
    panel.style.right = "0";
    panel.style.width = "350px";
    panel.style.backgroundColor = "#ffffff";
    panel.style.color = "#1a202c";
    panel.style.border = "1px solid #e2e8f0";
    panel.style.borderRadius = "12px";
    panel.style.padding = "16px";
    panel.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.18)";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    panel.style.gap = "10px";

    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
        <strong style="font-size:14px; color:#2b6cb0;">Chat2TeX Exporter</strong>
        <span id="chat2tex-close" style="cursor:pointer; font-weight:bold; color:#718096; font-size:16px;">&times;</span>
      </div>
      
      <div style="display:flex; flex-direction:column; gap:4px;">
        <label style="font-size:11px; font-weight:600; color:#718096;">1. Template Bố Cục:</label>
        <select id="chat2tex-template-select" style="font-size:12px; padding:6px; border-radius:6px; border:1px solid #cbd5e0; background:#f7fafc; cursor:pointer;">
          <option value="academic">🎓 Academic Article (Báo cáo khoa học)</option>
          <option value="editorial-book">📚 Editorial Book (Sách bìa trang trọng)</option>
          <option value="modern-minimal">✨ Modern Minimalist (Tối giản hiện đại)</option>
          <option value="executive-report">💼 Executive Report (Doanh nghiệp Navy)</option>
          <option value="ieee-twocolumn">📑 IEEE Two-Column (2 Cột IEEE)</option>
          <option value="notion-style">📝 Notion Notes (Ghi chú Notion)</option>
          <option value="cheatsheet">⚡ Compact Cheatsheet (Tra cứu nhanh)</option>
          <option value="dark-mode">🌙 Sleek Dark Mode (Nền tối chữ sáng)</option>
          <option value="classic-serif">📖 Classic Monograph (Sách cổ điển)</option>
          <option value="typewriter-memo">📠 Technical Memo (Ghi nhớ kỹ thuật)</option>
        </select>
      </div>

      <div style="display:flex; gap:8px;">
        <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
          <label style="font-size:11px; font-weight:600; color:#718096;">2. Màu Nền Giấy:</label>
          <select id="chat2tex-color-select" style="font-size:11px; padding:6px; border-radius:6px; border:1px solid #cbd5e0; background:#f7fafc; cursor:pointer;">
            <option value="default">✨ Theo Mẫu</option>
            <option value="white">⚪ Trắng Tinh</option>
            <option value="cream">📜 Kem Ngà</option>
            <option value="sepia">📔 Vàng Sepia</option>
            <option value="grey">🩶 Xám Nhạt</option>
            <option value="dark">🌙 Nền Tối</option>
          </select>
        </div>

        <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
          <label style="font-size:11px; font-weight:600; color:#718096;">3. Font Chữ:</label>
          <select id="chat2tex-font-select" style="font-size:11px; padding:6px; border-radius:6px; border:1px solid #cbd5e0; background:#f7fafc; cursor:pointer;">
            <option value="default">✨ Theo Mẫu</option>
            <option value="serif">📖 Serif</option>
            <option value="sans">✨ Sans-Serif</option>
            <option value="mono">📠 Monospace</option>
          </select>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:4px; margin:2px 0;">
        <div style="display:flex; align-items:center; gap:6px;">
          <input type="checkbox" id="chat2tex-user-check" style="cursor:pointer;" />
          <label for="chat2tex-user-check" style="font-size:11px; font-weight:600; color:#2d3748; cursor:pointer;">
            Kèm câu hỏi của User
          </label>
        </div>

        <div style="display:flex; align-items:center; gap:6px;">
          <input type="checkbox" id="chat2tex-pdfonly-check" style="cursor:pointer;" />
          <label for="chat2tex-pdfonly-check" style="font-size:11px; font-weight:600; color:#2d3748; cursor:pointer;">
            Chỉ tải file PDF (Bỏ qua .tex & .zip)
          </label>
        </div>
      </div>

      <div id="chat2tex-msg-list-container" style="font-size:11px; color:#718096;">
        Đang quét danh sách tin nhắn...
      </div>

      <div id="chat2tex-status-msg" style="display:none; font-size:13px; font-weight:600; color:#1a202c; padding: 8px; background:#f7fafc; border-radius:6px; border: 1px solid #e2e8f0;"></div>

      <button id="chat2tex-start-btn" style="background:#2b6cb0; color:#ffffff; border:none; border-radius:6px; padding:10px; font-size:13px; font-weight:600; cursor:pointer; transition:background-color 0.15s ease;">
        🚀 Bắt đầu xuất PDF & TEX
      </button>
    `;

    this.container?.appendChild(panel);
    this.statusPanel = panel;

    const selectEl = panel.querySelector("#chat2tex-template-select") as HTMLSelectElement | null;
    if (selectEl) {
      selectEl.value = this.selectedTemplate;
      selectEl.onchange = () => {
        this.selectedTemplate = selectEl.value as LatexTemplateId;
      };
    }

    const colorEl = panel.querySelector("#chat2tex-color-select") as HTMLSelectElement | null;
    if (colorEl) {
      colorEl.value = this.selectedColor;
      colorEl.onchange = () => {
        this.selectedColor = colorEl.value as LatexPaperColor;
      };
    }

    const fontEl = panel.querySelector("#chat2tex-font-select") as HTMLSelectElement | null;
    if (fontEl) {
      fontEl.value = this.selectedFont;
      fontEl.onchange = () => {
        this.selectedFont = fontEl.value as LatexFontFamily;
      };
    }

    const userCheckEl = panel.querySelector("#chat2tex-user-check") as HTMLInputElement | null;
    if (userCheckEl) {
      userCheckEl.checked = this.includeUserMessages;
      userCheckEl.onchange = () => {
        this.includeUserMessages = userCheckEl.checked;
      };
    }

    const pdfOnlyEl = panel.querySelector("#chat2tex-pdfonly-check") as HTMLInputElement | null;
    if (pdfOnlyEl) {
      pdfOnlyEl.checked = this.exportPdfOnly;
      pdfOnlyEl.onchange = () => {
        this.exportPdfOnly = pdfOnlyEl.checked;
      };
    }

    const startBtn = panel.querySelector("#chat2tex-start-btn") as HTMLButtonElement | null;
    if (startBtn) {
      startBtn.onclick = () => {
        void this.triggerExport();
      };
    }

    const closeBtn = panel.querySelector("#chat2tex-close") as HTMLElement | null;
    if (closeBtn) {
      closeBtn.onclick = () => {
        panel.remove();
        this.statusPanel = null;
      };
    }

    void this.fetchFullMessages();
  }

  private async fetchFullMessages(): Promise<void> {
    if (!this.getMessages || this.isFetchingMessages) return;
    this.isFetchingMessages = true;

    try {
      const res = this.getMessages();
      const msgs = res instanceof Promise ? await res : res;
      if (msgs && msgs.length > 0) {
        this.loadedMessages = msgs;
        this.renderMessageListContainer();
      }
    } catch {
      // ignore
    } finally {
      this.isFetchingMessages = false;
    }
  }

  private renderMessageListContainer(): void {
    const container = this.statusPanel?.querySelector("#chat2tex-msg-list-container") as HTMLElement | null;
    if (!container) return;

    const messages = this.loadedMessages;
    container.innerHTML = `
      <details style="border:1px solid #cbd5e0; border-radius:6px; padding:6px; background:#f8fafc;" open>
        <summary style="font-size:11px; font-weight:600; color:#2b6cb0; cursor:pointer;">
          📋 Chọn lọc từng tin nhắn (${messages.length} tin)
        </summary>
        <div style="max-height:130px; overflow-y:auto; margin-top:6px; display:flex; flex-direction:column; gap:6px;">
          ${messages
            .map(
              (m, idx) => `
            <label style="display:flex; align-items:flex-start; gap:6px; font-size:11px; color:#2d3748; cursor:pointer;">
              <input type="checkbox" class="chat2tex-msg-item" data-id="${m.id}" ${
                this.excludedMessageIds.has(m.id) ? "" : "checked"
              } style="margin-top:2px; cursor:pointer;" />
              <span style="line-height:1.3;">
                <strong style="color:${
                  m.role === "user" ? "#15803d" : "#2b6cb0"
                };">#${idx + 1} [${m.role === "user" ? "User" : "AI"}]:</strong> ${escapeHtmlSnippet(
                m.snippet,
              )}
              </span>
            </label>
          `,
            )
            .join("")}
        </div>
      </details>
    `;

    const msgCheckboxes = container.querySelectorAll<HTMLInputElement>(".chat2tex-msg-item");
    msgCheckboxes.forEach((cb) => {
      cb.onchange = () => {
        const id = cb.dataset.id;
        if (!id) return;
        if (cb.checked) {
          this.excludedMessageIds.delete(id);
        } else {
          this.excludedMessageIds.add(id);
        }
      };
    });
  }

  private async triggerExport(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    const msgEl = this.statusPanel?.querySelector("#chat2tex-status-msg") as HTMLElement | null;
    const startBtn = this.statusPanel?.querySelector("#chat2tex-start-btn") as HTMLButtonElement | null;
    const selectEl = this.statusPanel?.querySelector("#chat2tex-template-select") as HTMLSelectElement | null;
    const colorEl = this.statusPanel?.querySelector("#chat2tex-color-select") as HTMLSelectElement | null;
    const fontEl = this.statusPanel?.querySelector("#chat2tex-font-select") as HTMLSelectElement | null;

    if (msgEl) {
      msgEl.style.display = "block";
    }
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.style.opacity = "0.6";
      startBtn.style.cursor = "not-allowed";
    }
    if (selectEl) selectEl.disabled = true;
    if (colorEl) colorEl.disabled = true;
    if (fontEl) fontEl.disabled = true;

    const updateStatus = (text: string) => {
      if (msgEl) msgEl.textContent = text;
    };

    try {
      if (this.runner) {
        await this.runner(updateStatus, {
          templateId: this.selectedTemplate,
          paperColor: this.selectedColor,
          fontFamily: this.selectedFont,
          exportPdfOnly: this.exportPdfOnly,
          includeUserMessages: this.includeUserMessages,
          excludedMessageIds: Array.from(this.excludedMessageIds),
        });
      } else {
        updateStatus("✅ Export complete! Check downloads folder.");
      }
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : "Export failed.";
      const isConnectionErr =
        rawMsg.includes("Could not establish connection") ||
        rawMsg.includes("Receiving end does not exist") ||
        rawMsg.includes("Extension context invalidated");

      const displayMsg = isConnectionErr
        ? "⚠️ Extension vừa được cập nhật. Vui lòng bấm F5 (Tải lại trang ChatGPT) rồi thử lại."
        : `❌ ${rawMsg}`;

      updateStatus(displayMsg);
    } finally {
      this.isProcessing = false;
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.style.opacity = "1";
        startBtn.style.cursor = "pointer";
      }
      if (selectEl) selectEl.disabled = false;
      if (colorEl) colorEl.disabled = false;
      if (fontEl) fontEl.disabled = false;
    }
  }
}

function escapeHtmlSnippet(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
