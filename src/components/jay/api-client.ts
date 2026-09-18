import type {ChatMessage, ChatRequest, ChatResponse, CurrentPage} from "./types.js";

const API_BASE: string | undefined =
  typeof import.meta !== "undefined" && (import.meta as Record<string, any>).env?.PUBLIC_AWS_SERVERLESS_API;

const MAX_HISTORY_MESSAGES = 40;

const MOCK_REPLIES = [
  "This AI helper is grounded on Julius's project notes and can summarize the work on this site.",
  "Julius built a full transformer from scratch in PyTorch — training, inference, profiling, the works.",
  "Want to know about the performance analysis pipeline? It includes Nsys GPU traces and custom ablation studies.",
  "The deep learning fundamentals project covers everything from attention mechanisms to learning rate sweeps.",
  "Julius's work focuses on applied AI, integration, and systems that hold up under real usage.",
  "The live version is backed by Vertex AI RAG, so it can pull up specific details from the site's content.",
];

function pickMockReply(): string {
  return MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)];
}

function buildRequest(
  conversationId: string,
  currentPage: CurrentPage,
  history: ChatMessage[],
): ChatRequest {
  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
  return {
    conversationId,
    currentPage,
    messages: trimmed.map(({role, text, parts}) =>
      role === "model" && parts ? {role, text, parts} : {role, text},
    ),
  };
}

async function mockSendMessage(conversationId: string): Promise<ChatResponse> {
  await new Promise((resolve) => setTimeout(resolve, 600 + Math.random() * 800));
  const reply = pickMockReply();
  return {reply, conversationId, modelParts: [{text: reply}]};
}

const REQUEST_TIMEOUT_MS = 30_000;
const WARMUP_TIMEOUT_MS = 8_000;
const WARMUP_COOLDOWN_MS = 5 * 60_000;

let warmupPromise: Promise<boolean> | null = null;
let warmupSessionToken = "";
let lastWarmupAt = 0;

export function warmUpChat(sessionToken: string): Promise<boolean> {
  if (!API_BASE || !sessionToken) return Promise.resolve(false);

  const now = Date.now();
  if (warmupPromise && warmupSessionToken === sessionToken) return warmupPromise;
  if (warmupSessionToken === sessionToken && now - lastWarmupAt < WARMUP_COOLDOWN_MS) {
    return Promise.resolve(true);
  }

  warmupSessionToken = sessionToken;
  lastWarmupAt = now;
  warmupPromise = fetch(`${API_BASE}/v1/chat/warmup`, {
    method: "POST",
    headers: {Authorization: `Bearer ${sessionToken}`},
    signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS),
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      warmupPromise = null;
    });

  return warmupPromise;
}

async function liveSendMessage(
  req: ChatRequest,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined = signal
    ? AbortSignal.any([signal, timeout])
    : timeout;

  const res = await fetch(`${API_BASE}/v1/chat/respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(req),
    signal: combined,
  });
  if (!res.ok) {
    throw new Error(`Chat request failed: ${res.status}`);
  }
  return res.json();
}

export function isLiveMode(): boolean {
  return !!API_BASE;
}

export async function sendMessage(
  conversationId: string,
  currentPage: CurrentPage,
  history: ChatMessage[],
  sessionToken: string,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  if (!API_BASE) return mockSendMessage(conversationId);
  const req = buildRequest(conversationId, currentPage, history);
  return liveSendMessage(req, sessionToken, signal);
}
