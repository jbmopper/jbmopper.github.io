import type {ChatMessage, UIState} from "./types.js";

const CONVERSATION_ID_KEY = "jay-conversation-id";
const UI_STATE_KEY = "jay-ui-state";
const SESSION_TOKEN_KEY = "jay-session-token";
const SESSION_EXPIRES_AT_KEY = "jay-session-expires-at";
const MESSAGES_KEY = "jay-messages";

const isBrowser = typeof window !== "undefined";

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function getConversationId(): string {
  if (!isBrowser) return "";
  let id = localStorage.getItem(CONVERSATION_ID_KEY);
  if (!id) {
    id = generateId();
    localStorage.setItem(CONVERSATION_ID_KEY, id);
  }
  return id;
}

export function resetConversationId(): string {
  const id = generateId();
  if (isBrowser) localStorage.setItem(CONVERSATION_ID_KEY, id);
  return id;
}

const DEFAULT_UI_STATE: UIState = {isOpen: false, draftText: ""};

export function loadUIState(): UIState {
  if (!isBrowser) return {...DEFAULT_UI_STATE};
  try {
    const raw = sessionStorage.getItem(UI_STATE_KEY);
    if (!raw) return {...DEFAULT_UI_STATE};
    return {...DEFAULT_UI_STATE, ...JSON.parse(raw)};
  } catch {
    return {...DEFAULT_UI_STATE};
  }
}

export function saveUIState(state: UIState): void {
  if (!isBrowser) return;
  try {
    sessionStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
}

export function getSessionToken(): string {
  if (!isBrowser) return "";
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function getSessionExpiresAt(): number {
  if (!isBrowser) return 0;
  try {
    const raw = sessionStorage.getItem(SESSION_EXPIRES_AT_KEY);
    if (!raw) return 0;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function saveSessionToken(token: string, expiresAt = 0): void {
  if (!isBrowser) return;
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    if (Number.isFinite(expiresAt) && expiresAt > 0) {
      sessionStorage.setItem(SESSION_EXPIRES_AT_KEY, String(expiresAt));
    } else {
      sessionStorage.removeItem(SESSION_EXPIRES_AT_KEY);
    }
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
}

export function clearSessionToken(): void {
  if (!isBrowser) return;
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_EXPIRES_AT_KEY);
  } catch {
    // ignore
  }
}

export function loadMessages(): ChatMessage[] {
  if (!isBrowser) return [];
  try {
    const raw = sessionStorage.getItem(MESSAGES_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveMessages(messages: ChatMessage[]): void {
  if (!isBrowser) return;
  try {
    sessionStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
  } catch {
    // sessionStorage may be unavailable or full
  }
}
