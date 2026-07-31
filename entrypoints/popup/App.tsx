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

  const [selectedTemplate, setSelectedTemplate] =
    useState<import("@/src/features/latex/types").LatexTemplateId>("academic");
  const [selectedColor, setSelectedColor] =
    useState<import("@/src/features/latex/types").LatexPaperColor>("default");
  const [selectedFont, setSelectedFont] =
    useState<import("@/src/features/latex/types").LatexFontFamily>("default");
  const [selectedPaperSize, setSelectedPaperSize] =
    useState<import("@/src/features/latex/types").LatexPaperSize>("a4");
  const [authorName, setAuthorName] = useState("");
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

  // Phase step helpers
  const phase = exportFlow.phase;
  const phaseIndex =
    phase === "idle" ||
    phase === "preparing" ||
    phase === "permission-required" ||
    phase === "processing-assets"
      ? 0
      : phase === "ready" || phase === "compiling"
        ? 1
        : phase === "compiled" || phase === "packaging"
          ? 2
          : phase === "downloaded"
            ? 3
            : 0;

  const isPhaseDone = (idx: number) => phaseIndex > idx;
  const isPhaseActive = (idx: number) =>
    phaseIndex === idx && phase !== "idle" && phase !== "error";

  return (
    <main className="popup">
      <header className="popup__header">
        <div className="brand">
          <div className="brand__icon" aria-hidden="true">
            T
          </div>

          <div>
            <h1>Chat2TeX</h1>
            <p>PDF &amp; LaTeX Exporter</p>
          </div>
        </div>
      </header>

      <section className="popup__content">
        {status === "loading" && (
          <StatusCard
            variant="loading"
            title="Connecting..."
            description="Checking the open ChatGPT tab..."
          />
        )}

        {status === "ready" && conversation && (
          <>
            <StatusCard
              variant="success"
              title="Conversation found"
              description={conversation.title}
            />

            <div className="conversation fade-in">
              <span className="conversation__label">Current conversation</span>
              <strong className="conversation__title">
                {conversation.title}
              </strong>
              <span className="conversation__meta">
                {conversation.messageCount} messages
              </span>
            </div>

            {/* Options */}
            <div className="options-card fade-in">
              <div>
                <span className="options-card__label">1. Layout Template</span>
                <select
                  id="app-template-select"
                  className="options-select"
                  value={selectedTemplate}
                  onChange={(e) =>
                    setSelectedTemplate(
                      e.target
                        .value as import("@/src/features/latex/types").LatexTemplateId,
                    )
                  }
                >
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

              <div className="options-row">
                <div>
                  <span className="options-card__label">
                    2. Background Color
                  </span>
                  <select
                    id="app-color-select"
                    className="options-select"
                    value={selectedColor}
                    onChange={(e) =>
                      setSelectedColor(
                        e.target
                          .value as import("@/src/features/latex/types").LatexPaperColor,
                      )
                    }
                  >
                    <option value="default">✨ Use Template</option>
                    <option value="white">⚪ Pure White</option>
                    <option value="cream">📜 Ivory</option>
                    <option value="sepia">📔 Sepia</option>
                    <option value="grey">🩶 Light Gray</option>
                    <option value="dark">🌙 Dark</option>
                  </select>
                </div>

                <div>
                  <span className="options-card__label">3. Font</span>
                  <select
                    id="app-font-select"
                    className="options-select"
                    value={selectedFont}
                    onChange={(e) =>
                      setSelectedFont(
                        e.target
                          .value as import("@/src/features/latex/types").LatexFontFamily,
                      )
                    }
                  >
                    <option value="default">✨ Use Template</option>
                    <option value="serif">📖 Serif</option>
                    <option value="sans">✨ Sans-Serif</option>
                    <option value="mono">📠 Monospace</option>
                  </select>
                </div>
              </div>

              <div className="options-row">
                <div>
                  <span className="options-card__label">4. Paper Size</span>
                  <select
                    id="app-size-select"
                    className="options-select"
                    value={selectedPaperSize}
                    onChange={(e) =>
                      setSelectedPaperSize(
                        e.target
                          .value as import("@/src/features/latex/types").LatexPaperSize,
                      )
                    }
                  >
                    <option value="a4">📄 A4 Paper</option>
                    <option value="letter">📑 Letter Paper</option>
                    <option value="a5">📖 A5 Paper (Kindle)</option>
                  </select>
                </div>

                <div>
                  <span className="options-card__label">
                    5. Author / Watermark
                  </span>
                  <input
                    type="text"
                    id="app-author-input"
                    className="options-select"
                    placeholder="Optional..."
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    style={{ cursor: "text" }}
                  />
                </div>
              </div>

              <div className="toggle-group">
                <label className="toggle-item" htmlFor="app-user-check">
                  <span className="toggle-item__label">
                    Include User Questions
                  </span>
                  <input
                    type="checkbox"
                    id="app-user-check"
                    checked={includeUserMessages}
                    onChange={(e) => setIncludeUserMessages(e.target.checked)}
                  />
                  <span className="toggle-track" />
                </label>

                <label className="toggle-item" htmlFor="app-pdfonly-check">
                  <span className="toggle-item__label">Download PDF Only</span>
                  <input
                    type="checkbox"
                    id="app-pdfonly-check"
                    checked={exportPdfOnly}
                    onChange={(e) => setExportPdfOnly(e.target.checked)}
                  />
                  <span className="toggle-track" />
                </label>
              </div>
            </div>

            {/* Phase step indicator — appears once export starts */}
            {phase !== "idle" && phase !== "error" && (
              <div className="phase-steps fade-in">
                <PhaseStep
                  label="Scan"
                  number="1"
                  done={isPhaseDone(0)}
                  active={isPhaseActive(0)}
                />
                <div
                  className={`phase-connector${isPhaseDone(0) ? " phase-connector--done" : ""}`}
                />
                <PhaseStep
                  label="Compile"
                  number="2"
                  done={isPhaseDone(1)}
                  active={isPhaseActive(1)}
                />
                <div
                  className={`phase-connector${isPhaseDone(1) ? " phase-connector--done" : ""}`}
                />
                <PhaseStep
                  label="Download"
                  number="3"
                  done={isPhaseDone(2)}
                  active={isPhaseActive(2)}
                />
              </div>
            )}

            {/* CTA button when idle/ready to start */}
            {(phase === "idle" ||
              phase === "preparing" ||
              phase === "processing-assets") && (
              <button
                id="app-prepare-btn"
                className={`button button--primary fade-in${phase === "preparing" || phase === "processing-assets" ? " button--loading" : ""}`}
                type="button"
                disabled={
                  phase === "preparing" || phase === "processing-assets"
                }
                onClick={() => {
                  void exportFlow.prepare({
                    templateId: selectedTemplate,
                    paperColor: selectedColor,
                    fontFamily: selectedFont,
                    paperSize: selectedPaperSize,
                    authorName,
                    exportPdfOnly,
                    includeUserMessages,
                  });
                }}
              >
                {(phase === "preparing" || phase === "processing-assets") && (
                  <span className="btn-spinner" />
                )}
                {phase === "preparing"
                  ? "Scanning conversation..."
                  : phase === "processing-assets"
                    ? "Processing images..."
                    : exportPdfOnly
                      ? "🚀 Prepare PDF Export"
                      : "🚀 Prepare PDF + TEX Export"}
              </button>
            )}

            {exportFlow.phase === "permission-required" && (
              <section className="permission-card fade-in">
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
                  Grant Access
                </button>
              </section>
            )}

            {exportFlow.phase === "processing-assets" &&
              exportFlow.progress && (
                <section className="progress-card fade-in">
                  <strong>Processing images</strong>
                  <p>
                    {exportFlow.progress.current} / {exportFlow.progress.total}
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
                <section className="export-ready fade-in">
                  <strong>✅ Ready to compile</strong>
                  <div className="stat-row">
                    <span className="stat-pill">
                      💬 {exportFlow.prepared.messageCount} messages
                    </span>
                    <span className="stat-pill">
                      🖼 {exportFlow.prepared.assets.length} images
                    </span>
                    {exportFlow.processedAssets.failures.length > 0 && (
                      <span className="stat-pill warning-text">
                        ⚠️ {exportFlow.processedAssets.failures.length} errors
                      </span>
                    )}
                  </div>
                  <button
                    id="app-compile-btn"
                    className="button button--primary"
                    type="button"
                    onClick={() => {
                      void exportFlow.compile();
                    }}
                  >
                    🔨 Compile XeLaTeX PDF
                  </button>
                </section>
              )}

            {exportFlow.phase === "compiling" && (
              <section className="progress-card fade-in">
                <strong>Compiling with XeLaTeX...</strong>
                <p>Creating the PDF, please wait...</p>
                <div className="spinner-wrap">
                  <div className="spinner" />
                </div>
              </section>
            )}

            {exportFlow.phase === "compiled" && exportFlow.pdfBase64 && (
              <section className="export-ready fade-in">
                <strong>🎉 Compilation successful!</strong>
                <div className="stat-row">
                  <span className="stat-pill">
                    📄{" "}
                    {formatFileSize(
                      Math.floor(exportFlow.pdfBase64.length * 0.75),
                    )}
                  </span>
                </div>
                {compilerRejectedAssets.length > 0 && (
                  <>
                    <p className="warning-text">
                      ⚠️ {compilerRejectedAssets.length} images were omitted
                      from the PDF.
                    </p>
                    <details className="diagnostic-details">
                      <summary>Omitted images</summary>
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
                  id="app-download-btn"
                  className="button button--success"
                  type="button"
                  onClick={() => {
                    void exportFlow.downloadAll();
                  }}
                >
                  ⬇️{" "}
                  {exportPdfOnly
                    ? "Download PDF"
                    : "Download PDF + TEX + ZIP"}
                </button>
              </section>
            )}

            {exportFlow.phase === "packaging" && (
              <section className="progress-card fade-in">
                <strong>Packaging files...</strong>
                <p>Creating PDF, LaTeX, and ZIP files...</p>
                <div className="spinner-wrap">
                  <div className="spinner" />
                </div>
              </section>
            )}

            {exportFlow.phase === "downloaded" && (
              <section className="export-ready fade-in">
                <strong>🎊 Download complete!</strong>
                <div className="download-list">
                  {exportFlow.downloadedFiles.map((filename) => (
                    <div key={filename} className="download-list-item">
                      <span className="download-list-item__icon">
                        {filename.endsWith(".pdf")
                          ? "📄"
                          : filename.endsWith(".tex")
                            ? "📝"
                            : "🗜️"}
                      </span>
                      {filename}
                    </div>
                  ))}
                </div>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => {
                    void exportFlow.prepare({
                      templateId: selectedTemplate,
                      paperColor: selectedColor,
                      fontFamily: selectedFont,
                      paperSize: selectedPaperSize,
                      authorName,
                      exportPdfOnly,
                      includeUserMessages,
                    });
                  }}
                >
                  🔄 Export Again
                </button>
              </section>
            )}

            {exportFlow.phase === "error" && exportFlow.error && (
              <section className="compile-error fade-in">
                <p className="collection-error">❌ {exportFlow.error}</p>
                {!exportFlow.pdfBase64 && exportFlow.compileLog.trim() && (
                  <details className="diagnostic-details">
                    <summary>XeLaTeX Error Details</summary>
                    <pre className="compile-log">{exportFlow.compileLog}</pre>
                  </details>
                )}
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => {
                    void exportFlow.prepare({
                      templateId: selectedTemplate,
                      paperColor: selectedColor,
                      fontFamily: selectedFont,
                      paperSize: selectedPaperSize,
                      authorName,
                      exportPdfOnly,
                      includeUserMessages,
                    });
                  }}
                >
                  🔄 Try Again
                </button>
              </section>
            )}
          </>
        )}

        {status === "unsupported" && (
          <>
            <StatusCard
              variant="warning"
              title="No conversation found"
              description="Open a conversation on chatgpt.com and try again."
            />
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void detectConversation()}
            >
              🔄 Check Again
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <StatusCard
              variant="error"
              title="Unable to connect to ChatGPT"
              description="Press F5 to reload the ChatGPT page and refresh the connection."
            />
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void detectConversation()}
            >
              🔄 Try Again
            </button>
          </>
        )}
      </section>

      <footer className="popup__footer">
        <span>Offline-first · XeLaTeX</span>
        <span className="footer-badge">v0.1.0</span>
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

interface PhaseStepProps {
  label: string;
  number: string;
  done: boolean;
  active: boolean;
}

function PhaseStep({ label, number, done, active }: PhaseStepProps) {
  return (
    <div
      className={`phase-step${done ? " phase-step--done" : active ? " phase-step--active" : ""}`}
    >
      <div className="phase-step__dot">{done ? "✓" : number}</div>
      <span className="phase-step__label">{label}</span>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
