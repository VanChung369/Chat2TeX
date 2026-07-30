import type {
  ConversationViewport,
  ViewportSnapshot,
} from "./conversation-collector";

import { CHATGPT_MESSAGE_SELECTOR } from "./selectors";

interface DomViewportOptions {
  idleDelayMs?: number;
  maximumWaitMs?: number;
  pageRatio?: number;
}

const DEFAULT_OPTIONS: Required<DomViewportOptions> = {
  idleDelayMs: 300,
  maximumWaitMs: 2_500,
  pageRatio: 0.8,
};

export class DomConversationViewport implements ConversationViewport {
  private readonly options: Required<DomViewportOptions>;

  constructor(
    private readonly root: HTMLElement,
    private readonly windowRef: Window & typeof globalThis,
    options: DomViewportOptions = {},
  ) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  static fromDocument(
    documentRef: Document = document,
  ): DomConversationViewport {
    const root = findScrollableRoot(documentRef);

    const windowRef = documentRef.defaultView;

    if (!windowRef) {
      throw new Error("Document does not have a window.");
    }

    return new DomConversationViewport(root, windowRef);
  }

  capture(): ViewportSnapshot {
    return {
      scrollTop: this.root.scrollTop,
      scrollHeight: this.root.scrollHeight,
      clientHeight: this.root.clientHeight,
    };
  }

  scrollToBottom(): void {
    this.root.scrollTop = Math.max(
      0,
      this.root.scrollHeight - this.root.clientHeight,
    );
  }

  scrollPageUp(): void {
    const pageSize = Math.max(
      320,
      this.root.clientHeight * this.options.pageRatio,
    );

    this.root.scrollTop = Math.max(0, this.root.scrollTop - pageSize);
  }

  scrollToTop(): void {
    this.root.scrollTop = 0;
  }

  restore(snapshot: ViewportSnapshot): void {
    /*
     * Giữ khoảng cách tương đối tính từ cuối trang.
     * Cách này ổn hơn khi message cũ được prepend.
     */
    const distanceFromBottom = Math.max(
      0,
      snapshot.scrollHeight - snapshot.clientHeight - snapshot.scrollTop,
    );

    this.root.scrollTop = Math.max(
      0,
      this.root.scrollHeight - this.root.clientHeight - distanceFromBottom,
    );
  }

  waitForSettle(): Promise<void> {
    return new Promise((resolve) => {
      let completed = false;
      let idleTimer = 0;
      let maximumTimer = 0;

      const finish = (): void => {
        if (completed) {
          return;
        }

        completed = true;

        this.windowRef.clearTimeout(idleTimer);
        this.windowRef.clearTimeout(maximumTimer);
        observer.disconnect();

        resolve();
      };

      const restartIdleTimer = (): void => {
        this.windowRef.clearTimeout(idleTimer);

        idleTimer = this.windowRef.setTimeout(finish, this.options.idleDelayMs);
      };

      const observer = new this.windowRef.MutationObserver(restartIdleTimer);

      observer.observe(this.root, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      restartIdleTimer();

      maximumTimer = this.windowRef.setTimeout(
        finish,
        this.options.maximumWaitMs,
      );
    });
  }
}

function findScrollableRoot(documentRef: Document): HTMLElement {
  const firstMessage = documentRef.querySelector<HTMLElement>(
    CHATGPT_MESSAGE_SELECTOR,
  );

  let current = firstMessage?.parentElement ?? null;

  while (current) {
    if (isScrollable(current, documentRef)) {
      return current;
    }

    current = current.parentElement;
  }

  return (
    (documentRef.scrollingElement as HTMLElement | null) ??
    documentRef.documentElement
  );
}

function isScrollable(element: HTMLElement, documentRef: Document): boolean {
  const style = documentRef.defaultView?.getComputedStyle(element);

  const allowsScrolling =
    style !== undefined && /auto|scroll|overlay/.test(style.overflowY);

  return allowsScrolling && element.scrollHeight > element.clientHeight + 1;
}
