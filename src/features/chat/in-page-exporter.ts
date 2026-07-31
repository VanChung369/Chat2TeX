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

// ── Styles injected once into <head> ─────────────────────────────────────────
const INPAGE_STYLE = `
#chat2tex-inpage-root * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }

#chat2tex-inpage-trigger {
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  color: #fff;
  border: none;
  border-radius: 28px;
  padding: 11px 20px;
  font-size: 13.5px;
  font-weight: 700;
  box-shadow: 0 4px 18px rgba(79,70,229,0.45);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
  letter-spacing: -0.01em;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  white-space: nowrap;
}
#chat2tex-inpage-trigger:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 7px 24px rgba(79,70,229,0.55);
}
#chat2tex-inpage-trigger:active { transform: scale(0.98); }

#chat2tex-inpage-panel {
  position: absolute;
  bottom: 60px;
  right: 0;
  width: 380px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
  overflow: hidden;
  animation: c2t-slide-in 0.2s cubic-bezier(.4,0,.2,1);
}
@keyframes c2t-slide-in {
  from { opacity:0; transform: translateY(10px); }
  to   { opacity:1; transform: translateY(0); }
}

.c2t-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
}
.c2t-header-title {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.01em;
}
.c2t-header-close {
  width: 26px; height: 26px;
  display: grid; place-items: center;
  border-radius: 50%;
  background: rgba(255,255,255,0.12);
  color: #94a3b8;
  font-size: 16px;
  cursor: pointer;
  border: none;
  transition: background 0.15s, color 0.15s;
  font-family: inherit;
}
.c2t-header-close:hover { background: rgba(255,255,255,0.22); color: #fff; }

.c2t-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }

.c2t-field-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 5px;
}
.c2t-select {
  width: 100%;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1.5px solid #e2e8f0;
  font-size: 12px;
  font-family: inherit;
  font-weight: 500;
  color: #1e293b;
  background: #f8fafc;
  cursor: pointer;
  transition: border-color 0.15s;
}
.c2t-select:focus { outline: none; border-color: #818cf8; }
.c2t-select:disabled { opacity: 0.5; cursor: not-allowed; }

.c2t-row { display: flex; gap: 10px; }
.c2t-row > div { flex: 1; }

/* Toggle */
.c2t-toggle-group { display: flex; flex-direction: column; gap: 8px; }
.c2t-toggle {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; cursor: pointer;
}
.c2t-toggle-label { font-size: 12px; font-weight: 500; color: #374151; flex: 1; user-select: none; }
.c2t-toggle input { display: none; }
.c2t-toggle-track {
  position: relative; width: 36px; height: 20px;
  border-radius: 999px; background: #cbd5e1; flex-shrink: 0;
  transition: background 0.2s;
}
.c2t-toggle-track::after {
  content: ''; position: absolute; top: 3px; left: 3px;
  width: 14px; height: 14px; border-radius: 50%; background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: transform 0.2s;
}
.c2t-toggle input:checked + .c2t-toggle-track { background: #4f46e5; }
.c2t-toggle input:checked + .c2t-toggle-track::after { transform: translateX(16px); }

/* Message list */
.c2t-msglist {
  border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;
  background: #f8fafc;
}
.c2t-msglist-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  cursor: pointer;
}
.c2t-msglist-title { font-size: 11px; font-weight: 700; color: #4f46e5; }
.c2t-msglist-count { font-size: 10.5px; color: #64748b; font-weight: 500; }
.c2t-msglist-scroll {
  max-height: 150px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 0;
}
.c2t-msg-item {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 7px 12px; cursor: pointer;
  border-bottom: 1px solid #f1f5f9; transition: background 0.1s;
}
.c2t-msg-item:last-child { border-bottom: none; }
.c2t-msg-item:hover { background: #eff6ff; }
.c2t-msg-item input[type=checkbox] { margin-top: 2px; flex-shrink: 0; cursor: pointer; accent-color: #4f46e5; }
.c2t-msg-chip {
  display: inline-block; padding: 1px 6px; border-radius: 4px;
  font-size: 9.5px; font-weight: 700; flex-shrink: 0;
  margin-right: 2px; vertical-align: middle;
}
.c2t-msg-chip--user { background: #dcfce7; color: #15803d; }
.c2t-msg-chip--ai { background: #dbeafe; color: #1d4ed8; }
.c2t-msg-text { font-size: 11.5px; color: #374151; line-height: 1.35; }
.c2t-msg-loading { padding: 12px; text-align: center; color: #94a3b8; font-size: 11.5px; }

/* Status bar */
.c2t-status {
  display: none; padding: 10px 12px;
  border-radius: 8px; border: 1.5px solid #e2e8f0;
  font-size: 12.5px; font-weight: 600;
  background: #f8fafc; color: #1e293b;
  transition: border-color 0.2s, background 0.2s;
  align-items: center; gap: 8px;
}
.c2t-status.visible { display: flex; }
.c2t-status.processing { border-color: #818cf8; background: #eef2ff; color: #3730a3; }
.c2t-status.success { border-color: #86efac; background: #f0fdf4; color: #15803d; }
.c2t-status.error { border-color: #fca5a5; background: #fff1f2; color: #b91c1c; }

.c2t-step-dots {
  display: flex; align-items: center; gap: 4px;
}
.c2t-step-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #e2e8f0; transition: background 0.2s;
  flex-shrink: 0;
}
.c2t-step-dot.active { background: #4f46e5; }
.c2t-step-dot.done { background: #22c55e; }

/* Start button */
.c2t-btn {
  width: 100%; padding: 11px 16px; border: none; border-radius: 10px;
  font-size: 13px; font-weight: 700; font-family: inherit;
  cursor: pointer; transition: transform 0.12s ease, box-shadow 0.12s ease;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.c2t-btn-primary {
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  color: #fff;
  box-shadow: 0 2px 10px rgba(79,70,229,0.35);
}
.c2t-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 5px 16px rgba(79,70,229,0.45); }
.c2t-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }

/* Spinner */
.c2t-spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: c2t-spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes c2t-spin { to { transform: rotate(360deg); } }

/* Toast */
.c2t-toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(16px);
  background: #1e293b; color: #fff;
  padding: 10px 20px; border-radius: 999px;
  font-size: 13px; font-weight: 600;
  box-shadow: 0 8px 24px rgba(0,0,0,0.22);
  opacity: 0; transition: opacity 0.25s ease, transform 0.25s ease;
  z-index: 9999999; white-space: nowrap; pointer-events: none;
}
.c2t-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
`;

function injectStyle(): void {
  if (document.getElementById("chat2tex-inpage-styles")) return;
  const style = document.createElement("style");
  style.id = "chat2tex-inpage-styles";
  style.textContent = INPAGE_STYLE;
  document.head.appendChild(style);
}

function showToast(message: string): void {
  const existing = document.getElementById("c2t-toast-el");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "c2t-toast-el";
  toast.className = "c2t-toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger show
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { toast.classList.add("show"); });
  });

  // Auto-hide after 3s
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

export class InPageExporterUI {
  private container: HTMLElement | null = null;
  private statusPanel: HTMLElement | null = null;
  private isProcessing = false;
  private selectedTemplate: LatexTemplateId = "academic";
  private selectedColor: LatexPaperColor = "default";
  private selectedFont: LatexFontFamily = "default";
  private selectedPaperSize: import("@/src/features/latex/types").LatexPaperSize = "a4";
  private authorName = "";
  private exportPdfOnly = false;
  private includeUserMessages = true;
  private excludedMessageIds = new Set<string>();
  private loadedMessages: ChatMessageSummary[] = [];
  private isFetchingMessages = false;
  private isMsgListOpen = true;

  constructor(
    private readonly runner?: InPageExportRunner,
    private readonly getMessages?: MessageFetcher,
  ) {}

  mount(): void {
    const existing = document.getElementById("chat2tex-inpage-root");
    if (existing) {
      existing.remove();
    }

    injectStyle();

    const root = document.createElement("div");
    root.id = "chat2tex-inpage-root";
    root.style.cssText = "position:fixed; bottom:20px; right:20px; z-index:999999;";

    const button = document.createElement("button");
    button.id = "chat2tex-inpage-trigger";
    button.innerHTML = `<span style="font-size:16px;">📄</span> Chat2TeX Export`;

    button.onclick = () => { this.togglePanel(); };

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

    panel.innerHTML = `
      <div class="c2t-header">
        <span class="c2t-header-title">⚡ Chat2TeX Exporter</span>
        <button class="c2t-header-close" id="chat2tex-close" aria-label="Close">&times;</button>
      </div>
      <div class="c2t-body">
        <div>
          <span class="c2t-field-label">1. Layout Template</span>
          <select id="chat2tex-template-select" class="c2t-select">
            <option value="academic">🎓 Academic Article</option>
            <option value="editorial-book">📚 Editorial Book</option>
            <option value="modern-minimal">✨ Modern Minimalist</option>
            <option value="executive-report">💼 Executive Report</option>
            <option value="ieee-twocolumn">📑 IEEE Two-Column</option>
            <option value="notion-style">📝 Notion Notes</option>
            <option value="cheatsheet">⚡ Compact Cheatsheet</option>
            <option value="dark-mode">🌙 Sleek Dark Mode</option>
            <option value="classic-serif">📖 Classic Monograph</option>
            <option value="typewriter-memo">📠 Technical Memo</option>
          </select>
        </div>

        <div class="c2t-row">
          <div>
            <span class="c2t-field-label">2. Background Color</span>
            <select id="chat2tex-color-select" class="c2t-select">
              <option value="default">✨ Use Template</option>
              <option value="white">⚪ Pure White</option>
              <option value="cream">📜 Ivory</option>
              <option value="sepia">📔 Sepia</option>
              <option value="grey">🩶 Light Gray</option>
              <option value="dark">🌙 Dark</option>
            </select>
          </div>
          <div>
            <span class="c2t-field-label">3. Font</span>
            <select id="chat2tex-font-select" class="c2t-select">
              <option value="default">✨ Use Template</option>
              <option value="serif">📖 Serif</option>
              <option value="sans">✨ Sans-Serif</option>
              <option value="mono">📠 Monospace</option>
            </select>
          </div>
        </div>

        <div class="c2t-row">
          <div>
            <span class="c2t-field-label">4. Paper Size</span>
            <select id="chat2tex-size-select" class="c2t-select">
              <option value="a4">📄 A4 Paper</option>
              <option value="letter">📑 Letter Paper</option>
              <option value="a5">📖 A5 Paper (Kindle)</option>
            </select>
          </div>
          <div>
            <span class="c2t-field-label">5. Author / Watermark</span>
            <input type="text" id="chat2tex-author-input" class="c2t-select" placeholder="Optional..." style="cursor:text;" />
          </div>
        </div>

        <div class="c2t-toggle-group">
          <label class="c2t-toggle" for="chat2tex-user-check">
            <span class="c2t-toggle-label">Include User Questions</span>
            <input type="checkbox" id="chat2tex-user-check" />
            <span class="c2t-toggle-track"></span>
          </label>
          <label class="c2t-toggle" for="chat2tex-pdfonly-check">
            <span class="c2t-toggle-label">Download PDF Only</span>
            <input type="checkbox" id="chat2tex-pdfonly-check" />
            <span class="c2t-toggle-track"></span>
          </label>
        </div>

        <div id="chat2tex-msg-list-container">
          <div class="c2t-msglist">
            <div class="c2t-msglist-header" id="chat2tex-msglist-header">
              <span class="c2t-msglist-title">📋 Select Messages</span>
              <span class="c2t-msglist-count" id="chat2tex-msglist-count">Loading...</span>
            </div>
            <div class="c2t-msglist-scroll" id="chat2tex-msglist-body">
              <div class="c2t-msg-loading">⏳ Scanning messages...</div>
            </div>
          </div>
        </div>

        <div class="c2t-status" id="chat2tex-status-msg">
          <div class="c2t-step-dots" id="chat2tex-step-dots">
            <span class="c2t-step-dot" id="c2t-dot-0"></span>
            <span class="c2t-step-dot" id="c2t-dot-1"></span>
            <span class="c2t-step-dot" id="c2t-dot-2"></span>
          </div>
          <span id="chat2tex-status-text"></span>
        </div>

        <button id="chat2tex-start-btn" class="c2t-btn c2t-btn-primary">
          🚀 Start PDF Export
        </button>
      </div>
    `;

    this.container?.appendChild(panel);
    this.statusPanel = panel;

    this.bindControls(panel);
    void this.fetchFullMessages();
  }

  private bindControls(panel: HTMLElement): void {
    // Template
    const selectEl = panel.querySelector<HTMLSelectElement>("#chat2tex-template-select");
    if (selectEl) {
      selectEl.value = this.selectedTemplate;
      selectEl.onchange = () => { this.selectedTemplate = selectEl.value as LatexTemplateId; };
    }
    // Color
    const colorEl = panel.querySelector<HTMLSelectElement>("#chat2tex-color-select");
    if (colorEl) {
      colorEl.value = this.selectedColor;
      colorEl.onchange = () => { this.selectedColor = colorEl.value as LatexPaperColor; };
    }
    // Font
    const fontEl = panel.querySelector<HTMLSelectElement>("#chat2tex-font-select");
    if (fontEl) {
      fontEl.value = this.selectedFont;
      fontEl.onchange = () => { this.selectedFont = fontEl.value as LatexFontFamily; };
    }
    // Size
    const sizeEl = panel.querySelector<HTMLSelectElement>("#chat2tex-size-select");
    if (sizeEl) {
      sizeEl.value = this.selectedPaperSize;
      sizeEl.onchange = () => { this.selectedPaperSize = sizeEl.value as import("@/src/features/latex/types").LatexPaperSize; };
    }
    // Author
    const authorEl = panel.querySelector<HTMLInputElement>("#chat2tex-author-input");
    if (authorEl) {
      authorEl.value = this.authorName;
      authorEl.oninput = () => { this.authorName = authorEl.value; };
    }
    // User messages toggle
    const userCheckEl = panel.querySelector<HTMLInputElement>("#chat2tex-user-check");
    if (userCheckEl) {
      userCheckEl.checked = this.includeUserMessages;
      userCheckEl.onchange = () => { this.includeUserMessages = userCheckEl.checked; };
    }
    // PDF only toggle
    const pdfOnlyEl = panel.querySelector<HTMLInputElement>("#chat2tex-pdfonly-check");
    if (pdfOnlyEl) {
      pdfOnlyEl.checked = this.exportPdfOnly;
      pdfOnlyEl.onchange = () => {
        this.exportPdfOnly = pdfOnlyEl.checked;
        const btn = panel.querySelector<HTMLButtonElement>("#chat2tex-start-btn");
        if (btn) {
          btn.textContent = this.exportPdfOnly
            ? "🚀 Start PDF Export"
            : "🚀 Start PDF & TEX Export";
        }
      };
    }
    // Start
    const startBtn = panel.querySelector<HTMLButtonElement>("#chat2tex-start-btn");
    if (startBtn) {
      startBtn.onclick = () => { void this.triggerExport(); };
    }
    // Close
    const closeBtn = panel.querySelector<HTMLElement>("#chat2tex-close");
    if (closeBtn) {
      closeBtn.onclick = () => { panel.remove(); this.statusPanel = null; };
    }
  }

  private async fetchFullMessages(): Promise<void> {
    if (!this.getMessages || this.isFetchingMessages) return;
    this.isFetchingMessages = true;

    try {
      const res = this.getMessages();
      const msgs = res instanceof Promise ? await res : res;
      if (msgs && msgs.length > 0) {
        this.loadedMessages = msgs;
        this.renderMessageList();
      }
    } catch {
      const bodyEl = this.statusPanel?.querySelector<HTMLElement>("#chat2tex-msglist-body");
      if (bodyEl) {
        bodyEl.innerHTML = `<div class="c2t-msg-loading" style="color:#ef4444;">⚠️ Unable to load messages.</div>`;
      }
    } finally {
      this.isFetchingMessages = false;
    }
  }

  private renderMessageList(): void {
    const bodyEl = this.statusPanel?.querySelector<HTMLElement>("#chat2tex-msglist-body");
    const countEl = this.statusPanel?.querySelector<HTMLElement>("#chat2tex-msglist-count");
    if (!bodyEl) return;

    const msgs = this.loadedMessages;
    if (countEl) countEl.textContent = `${msgs.length} messages`;

    bodyEl.innerHTML = msgs
      .map(
        (m) => `
      <label class="c2t-msg-item">
        <input type="checkbox" class="chat2tex-msg-cb" data-id="${m.id}" ${
          this.excludedMessageIds.has(m.id) ? "" : "checked"
        } />
        <span class="c2t-msg-text">
          <span class="c2t-msg-chip c2t-msg-chip--${m.role === "user" ? "user" : "ai"}">
            ${m.role === "user" ? "User" : "AI"}
          </span>
          ${escapeHtmlSnippet(m.snippet)}
        </span>
      </label>
    `,
      )
      .join("");

    bodyEl.querySelectorAll<HTMLInputElement>(".chat2tex-msg-cb").forEach((cb) => {
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

  private setStatus(text: string, variant: "processing" | "success" | "error" | ""): void {
    const statusEl = this.statusPanel?.querySelector<HTMLElement>("#chat2tex-status-msg");
    const textEl = this.statusPanel?.querySelector<HTMLElement>("#chat2tex-status-text");
    if (!statusEl || !textEl) return;

    statusEl.className = `c2t-status visible${variant ? ` ${variant}` : ""}`;
    textEl.textContent = text;

    // Update step dots
    const stepMatch = text.match(/^(\d)\/3/);
    if (stepMatch) {
      const stepNum = parseInt(stepMatch[1]);
      for (let i = 0; i < 3; i++) {
        const dot = this.statusPanel?.querySelector<HTMLElement>(`#c2t-dot-${i}`);
        if (!dot) continue;
        dot.className = "c2t-step-dot" + (i < stepNum - 1 ? " done" : i === stepNum - 1 ? " active" : "");
      }
    }
  }

  private setProcessingState(processing: boolean): void {
    const startBtn = this.statusPanel?.querySelector<HTMLButtonElement>("#chat2tex-start-btn");
    const selects = this.statusPanel?.querySelectorAll<HTMLSelectElement>("select");

    if (startBtn) {
      startBtn.disabled = processing;
      if (processing) {
        startBtn.innerHTML = `<span class="c2t-spinner"></span> Exporting...`;
      } else {
        startBtn.innerHTML = this.exportPdfOnly
          ? "🚀 Start PDF Export"
          : "🚀 Start PDF & TEX Export";
      }
    }

    selects?.forEach((s) => { s.disabled = processing; });
  }

  private async triggerExport(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    this.setProcessingState(true);
    this.setStatus("1/3 Scanning conversation...", "processing");

    const updateStatus = (text: string) => {
      this.setStatus(text, "processing");
    };

    try {
      if (this.runner) {
        await this.runner(updateStatus, {
          templateId: this.selectedTemplate,
          paperColor: this.selectedColor,
          fontFamily: this.selectedFont,
          paperSize: this.selectedPaperSize,
          authorName: this.authorName,
          exportPdfOnly: this.exportPdfOnly,
          includeUserMessages: this.includeUserMessages,
          excludedMessageIds: Array.from(this.excludedMessageIds),
        });
      }

      const successMsg = this.exportPdfOnly
        ? "✅ Complete! The PDF has been downloaded."
        : "✅ Complete! PDF, TEX, and ZIP files have been downloaded.";

      this.setStatus(successMsg, "success");
      showToast(
        this.exportPdfOnly
          ? "✅ PDF downloaded!"
          : "✅ PDF, TEX, and ZIP files downloaded!",
      );

      // All step dots done
      for (let i = 0; i < 3; i++) {
        const dot = this.statusPanel?.querySelector<HTMLElement>(`#c2t-dot-${i}`);
        if (dot) dot.className = "c2t-step-dot done";
      }
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : "Export failed.";
      const isConnectionErr =
        rawMsg.includes("Could not establish connection") ||
        rawMsg.includes("Receiving end does not exist") ||
        rawMsg.includes("Extension context invalidated");

      const displayMsg = isConnectionErr
        ? "⚠️ The extension was updated — press F5 and try again."
        : `❌ ${rawMsg}`;

      this.setStatus(displayMsg, "error");
    } finally {
      this.isProcessing = false;
      this.setProcessingState(false);
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
