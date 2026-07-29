import {
  CHATTEX_EXTRACT_CONVERSATION,
  type ChatTexExtractConversationRequest,
  type ChatTexExtractConversationResponse,
} from "@/src/shared/messages";
import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

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
              onClick={() => {
                console.info("[ChatTeX] Export requested", conversation.url);
              }}
            >
              Export PDF + TEX
            </button>
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
