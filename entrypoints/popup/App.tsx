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

      const response = (await browser.tabs.sendMessage(
        activeTab.id,
        request,
      )) as ChatTexExtractConversationResponse;

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

            <button
              className="button button--primary"
              type="button"
              disabled={
                exportFlow.phase === "preparing" ||
                exportFlow.phase === "processing-assets"
              }
              onClick={() => {
                void exportFlow.prepare();
              }}
            >
              {exportFlow.phase === "preparing"
                ? "Scanning conversation..."
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
              title="Unable to inspect this tab"
              description="Reload the page and try again."
            />

            <button
              className="button button--secondary"
              type="button"
              onClick={() => void detectConversation()}
            >
              Retry
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
