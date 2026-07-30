export const CHATGPT_MESSAGE_SELECTOR = [
  '[data-message-author-role="user"]',
  '[data-message-author-role="assistant"]',
].join(",");

export const CHATGPT_TURN_SELECTOR = '[data-testid^="conversation-turn-"]';
