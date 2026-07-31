export type InPageExportRunner = (
  updateStatus: (statusText: string) => void,
) => Promise<void>;

export class InPageExporterUI {
  private container: HTMLElement | null = null;
  private statusPanel: HTMLElement | null = null;
  private isProcessing = false;

  constructor(private readonly runner?: InPageExportRunner) {}

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
    button.style.backgroundColor = "#a86b3f";
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
      button.style.backgroundColor = "#8e5730";
    };
    button.onmouseleave = () => {
      button.style.transform = "scale(1)";
      button.style.backgroundColor = "#a86b3f";
    };

    button.onclick = () => {
      this.openAndExport();
    };

    root.appendChild(button);
    document.body.appendChild(root);
    this.container = root;
  }

  private openAndExport(): void {
    if (!this.statusPanel) {
      this.createStatusPanel();
    }
    void this.triggerExport();
  }

  private createStatusPanel(): void {
    const panel = document.createElement("div");
    panel.id = "chat2tex-inpage-panel";
    panel.style.position = "absolute";
    panel.style.bottom = "56px";
    panel.style.right = "0";
    panel.style.width = "320px";
    panel.style.backgroundColor = "#fffdf8";
    panel.style.color = "#332e2a";
    panel.style.border = "1px solid #ded5ca";
    panel.style.borderRadius = "12px";
    panel.style.padding = "16px";
    panel.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.18)";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    panel.style.gap = "10px";

    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #ded5ca; padding-bottom: 8px;">
        <strong style="font-size:14px; color:#a86b3f;">Chat2TeX Exporter</strong>
        <span id="chat2tex-close" style="cursor:pointer; font-weight:bold; color:#81766b; font-size:16px;">&times;</span>
      </div>
      <p style="margin:0; font-size:12px; color:#81766b;">Exporting ChatGPT conversation to PDF & LaTeX...</p>
      <div id="chat2tex-status-msg" style="font-size:13px; font-weight:600; color:#332e2a; min-height:24px; padding: 6px 8px; background:#f5f0eb; border-radius:6px;">Starting export...</div>
    `;

    this.container?.appendChild(panel);
    this.statusPanel = panel;

    const closeBtn = panel.querySelector("#chat2tex-close") as HTMLElement | null;
    if (closeBtn) {
      closeBtn.onclick = () => {
        panel.remove();
        this.statusPanel = null;
      };
    }
  }

  private async triggerExport(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    const msgEl = this.statusPanel?.querySelector("#chat2tex-status-msg");

    const updateStatus = (text: string) => {
      if (msgEl) msgEl.textContent = text;
    };

    try {
      if (this.runner) {
        await this.runner(updateStatus);
      } else {
        updateStatus("✅ Export complete! Check downloads folder.");
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Export failed.";
      updateStatus(`❌ ${errMsg}`);
    } finally {
      this.isProcessing = false;
    }
  }
}
