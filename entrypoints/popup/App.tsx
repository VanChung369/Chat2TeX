import { browser } from "wxt/browser";

import { useEffect, useState } from "react";

import { useExportFlow } from "./use-export-flow";

import {
  CHATTEX_EXTRACT_CONVERSATION,
  type ChatTexExtractConversationRequest,
  type ChatTexExtractConversationResponse,
} from "@/src/shared/messages";

type DetectionStatus = "loading" | "ready" | "unsupported" | "error";

interface ConversationInfo {
  title: string;
  url: string;
  messageCount: number;
}

export default function App() {
  const [status, setStatus] = useState<DetectionStatus>("loading");

  const [conversation, setConversation] = useState<ConversationInfo | null>(
    null,
  );

  const [selectedTemplate, setSelectedTemplate] = useState<import("@/src/features/latex/types").LatexTemplateId>("academic");
  const [selectedColor, setSelectedColor] = useState<import("@/src/features/latex/types").LatexPaperColor>("default");
  const [selectedFont, setSelectedFont] = useState<import("@/src/features/latex/types").LatexFontFamily>("default");
  const [exportPdfOnly, setExportPdfOnly] = useState(false);
  const [includeUserMessages, setIncludeUserMessages] = useState(true);
  const exportFlow = useExportFlow();

  const compilerRejectedAssets =
    exportFlow.processedAssets?.failures.filter(
      (failure) => failure.code === "compiler-rejected",
    ) ?? [];

  useEffect(() => {
    void detectConversation();
  }, []);

  async function detectConversation(): Promise<void> {
    setStatus("loading");

    try {
      const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (activeTab?.id === undefined) {
        setStatus("error");
        return;
      }

      const request: ChatTexExtractConversationRequest = {
        type: CHATTEX_EXTRACT_CONVERSATION,
      };

      let response: ChatTexExtractConversationResponse | null = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          response = (await browser.tabs.sendMessage(
            activeTab.id,
            request,
          )) as ChatTexExtractConversationResponse;
          break;
        } catch (err) {
          if (attempt < 9) {
            await new Promise((r) => setTimeout(r, 250));
            continue;
          }
          throw err;
        }
      }

      if (!response) {
        throw new Error("No response from ChatGPT content script.");
      }

      setConversation({
        title: response.title,
        url: response.url,
        messageCount: response.messages.length,
      });

      setStatus("ready");
    } catch (error) {
      console.warn("[ChatTeX] ChatGPT page was not detected", error);

      setConversation(null);
      setStatus("unsupported");
    }
  }

  return (
    <main className="popup">
      <header className="popup__header">
        <div className="brand">
          <div className="brand__icon" aria-hidden="true">
            T<span>e</span>X
          </div>

          <div>
            <h1>ChatTeX Exporter</h1>
            <p>PDF &amp; LaTeX</p>
          </div>
        </div>
      </header>

      <section className="popup__content">
        {status === "loading" && (
          <StatusCard
            variant="loading"
            title="Detecting conversation"
            description="Checking the current browser tab..."
          />
        )}

        {status === "ready" && conversation && (
          <>
            <StatusCard
              variant="success"
              title="ChatGPT conversation detected"
              description={conversation.title}
            />

            <div className="conversation">
              <span className="conversation__label">Current conversation</span>

              <strong className="conversation__title">
                {conversation.title}
              </strong>

              <span className="conversation__meta">
                {conversation.messageCount} messages detected
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "10px 0" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "#718096" }}>
                  1. LaTeX Template (10 Options):
                </label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value as import("@/src/features/latex/types").LatexTemplateId)}
                  style={{
                    padding: "6px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e0",
                    fontSize: "12px",
                    backgroundColor: "#fff",
                    cursor: "pointer",
                  }}
                >
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

              <div style={{ display: "flex", gap: "8px" }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "#718096" }}>
                    2. Màu Nền Giấy:
                  </label>
                  <select
                    value={selectedColor}
                    onChange={(e) => setSelectedColor(e.target.value as import("@/src/features/latex/types").LatexPaperColor)}
                    style={{
                      padding: "6px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e0",
                      fontSize: "11px",
                      backgroundColor: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <option value="default">✨ Theo Mẫu</option>
                    <option value="white">⚪ Trắng Tinh</option>
                    <option value="cream">📜 Kem Ngà</option>
                    <option value="sepia">📔 Vàng Sepia</option>
                    <option value="grey">🩶 Xám Nhạt</option>
                    <option value="dark">🌙 Nền Tối</option>
                  </select>
                </div>

                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                  <label style={{ fontSize: "11px", fontWeight: 600, color: "#718096" }}>
                    3. Font Chữ:
                  </label>
                  <select
                    value={selectedFont}
                    onChange={(e) => setSelectedFont(e.target.value as import("@/src/features/latex/types").LatexFontFamily)}
                    style={{
                      padding: "6px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e0",
                      fontSize: "11px",
                      backgroundColor: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <option value="default">✨ Theo Mẫu</option>
                    <option value="serif">📖 Serif</option>
                    <option value="sans">✨ Sans-Serif</option>
                    <option value="mono">📠 Monospace</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px", margin: "2px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <input
                    type="checkbox"
                    id="app-user-check"
                    checked={includeUserMessages}
                    onChange={(e) => setIncludeUserMessages(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <label htmlFor="app-user-check" style={{ fontSize: "11px", fontWeight: 600, color: "#2d3748", cursor: "pointer" }}>
                    Kèm câu hỏi của User
                  </label>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <input
                    type="checkbox"
                    id="app-pdfonly-check"
                    checked={exportPdfOnly}
                    onChange={(e) => setExportPdfOnly(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <label htmlFor="app-pdfonly-check" style={{ fontSize: "11px", fontWeight: 600, color: "#2d3748", cursor: "pointer" }}>
                    Chỉ tải file PDF (Bỏ qua file .tex & .zip)
                  </label>
                </div>
              </div>
            </div>

            <button
              className="button button--primary"
              type="button"
              disabled={
                exportFlow.phase === "preparing" ||
                exportFlow.phase === "processing-assets"
              }
              onClick={() => {
                void exportFlow.prepare({
                  templateId: selectedTemplate,
                  paperColor: selectedColor,
                  fontFamily: selectedFont,
                  exportPdfOnly,
                  includeUserMessages,
                });
              }}
            >
              {exportFlow.phase === "preparing"
                ? "Scanning conversation..."
                : exportPdfOnly
                  ? "Prepare PDF Export"
                  : "Prepare PDF + TEX"}
            </button>

            {exportFlow.phase === "permission-required" && (
              <section className="permission-card">
                <strong>Image access required</strong>

                <p>ChatTeX needs permission to download images from:</p>

                <ul>
                  {exportFlow.missingOrigins.map((origin) => (
                    <li key={origin}>{origin}</li>
                  ))}
                </ul>

                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => {
                    void exportFlow.grantPermissions();
                  }}
                >
                  Allow image access
                </button>
              </section>
            )}

            {exportFlow.phase === "processing-assets" &&
              exportFlow.progress && (
                <section className="progress-card">
                  <strong>Processing images</strong>

                  <p>
                    {exportFlow.progress.current}
                    {" / "}
                    {exportFlow.progress.total}
                  </p>

                  <progress
                    max={exportFlow.progress.total}
                    value={exportFlow.progress.current}
                  />

                  <span>{exportFlow.progress.label}</span>
                </section>
              )}

            {exportFlow.phase === "ready" &&
              exportFlow.prepared &&
              exportFlow.processedAssets && (
                <section className="export-ready">
                  <strong>Export is ready to compile</strong>

                  <p>
                    {exportFlow.prepared.messageCount} messages collected
                  </p>

                  <p>{exportFlow.prepared.assets.length} images detected</p>

                  <p>
                    {exportFlow.processedAssets.files.length} images processed
                  </p>

                  {exportFlow.processedAssets.failures.length > 0 && (
                    <p className="warning-text">
                      {exportFlow.processedAssets.failures.length} images could
                      not be loaded.
                    </p>
                  )}

                  <button
                    className="button button--primary"
                    type="button"
                    onClick={() => {
                      void exportFlow.compile();
                    }}
                  >
                    Compile PDF
                  </button>
                </section>
              )}

            {exportFlow.phase === "compiling" && (
              <section className="progress-card">
                <strong>Compiling XeLaTeX</strong>

                <p>Loading TeX Live packages and generating the PDF...</p>

                <progress />
              </section>
            )}
            {exportFlow.phase === "compiled" && exportFlow.pdfBase64 && (
              <section className="export-ready">
                <strong>PDF compiled successfully</strong>

                <p>
                  PDF size:{" "}
                  {formatFileSize(
                    Math.floor(exportFlow.pdfBase64.length * 0.75),
                  )}
                </p>

                {compilerRejectedAssets.length > 0 && (
                  <>
                    <p className="warning-text">
                      {compilerRejectedAssets.length} images were omitted from
                      the PDF.
                    </p>

                    <details className="diagnostic-details">
                      <summary>Images omitted from PDF</summary>

                      <ul>
                        {compilerRejectedAssets.map((failure) => (
                          <li key={failure.id}>
                            <strong>{failure.id}</strong>: {failure.message}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </>
                )}

                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => {
                    void exportFlow.downloadAll();
                  }}
                >
                  Download PDF + TEX + ZIP
                </button>
              </section>
            )}
            {exportFlow.phase === "packaging" && (
              <section className="progress-card">
                <strong>Packaging export</strong>

                <p>Creating PDF, LaTeX and source ZIP...</p>

                <progress />
              </section>
            )}
            {exportFlow.phase === "downloaded" && (
              <section className="export-ready">
                <strong>Export downloaded</strong>

                <ul className="download-list">
                  {exportFlow.downloadedFiles.map((filename) => (
                    <li key={filename}>{filename}</li>
                  ))}
                </ul>
              </section>
            )}
            {exportFlow.phase === "error" && exportFlow.error && (
              <section className="compile-error">
                <p className="collection-error">{exportFlow.error}</p>

                {!exportFlow.pdfBase64 && exportFlow.compileLog.trim() && (
                  <details className="diagnostic-details">
                    <summary>XeLaTeX error details</summary>

                    <pre className="compile-log">
                      {exportFlow.compileLog}
                    </pre>
                  </details>
                )}
              </section>
            )}
          </>
        )}

        {status === "unsupported" && (
          <>
            <StatusCard
              variant="warning"
              title="No ChatGPT conversation detected"
              description="Open a conversation on chatgpt.com and try again."
            />

            <button
              className="button button--secondary"
              type="button"
              onClick={() => void detectConversation()}
            >
              Check again
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <StatusCard
              variant="error"
              title="Chưa kết nối được với trang ChatGPT"
              description="Vui lòng bấm F5 (Tải lại trang ChatGPT) để cập nhật kết nối mới nhất."
            />

            <button
              className="button button--secondary"
              type="button"
              onClick={() => void detectConversation()}
            >
              🔄 Thử lại
            </button>
          </>
        )}
      </section>

      <footer className="popup__footer">
        <span>Offline-first export</span>
        <span>v0.1.0</span>
      </footer>
    </main>
  );
}

interface StatusCardProps {
  variant: "loading" | "success" | "warning" | "error";

  title: string;
  description: string;
}

function StatusCard({ variant, title, description }: StatusCardProps) {
  return (
    <div className={`status status--${variant}`}>
      <span className="status__indicator" aria-hidden="true" />

      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
