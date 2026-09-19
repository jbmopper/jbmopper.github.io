import type {ChatMessage, ChatRequest, ChatResponse, CurrentPage} from "./types.js";

const API_BASE: string | undefined =
  typeof import.meta !== "undefined" && (import.meta as Record<string, any>).env?.PUBLIC_AWS_SERVERLESS_API;

const MAX_HISTORY_MESSAGES = 40;

const MOCK_REPLIES = [
  "This AI helper is grounded on Julius's project notes and can summarize the work on this site.",
  "Julius built a full transformer from scratch in PyTorch — training, inference, profiling, the works.",
  "Want to know about the performance analysis pipeline? It includes MPS vs. CUDA benchmarks and custom ablation studies.",
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
const WARMUP_STORAGE_KEY = "jay-chat-warmup-at";

let warmupPromise: Promise<boolean> | null = null;

function readLastWarmupAt(): number {
  try {
    return Number(sessionStorage.getItem(WARMUP_STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function recordWarmupAt(at: number): void {
  try {
    sessionStorage.setItem(WARMUP_STORAGE_KEY, String(at));
  } catch {
    // Storage unavailable: fall back to one warmup per page load.
  }
}

// Public, unauthenticated, and inference-free: it only starts the backend
// instance so the visitor's first real (Turnstile-gated) message is fast. The
// cooldown is recorded only after a successful warmup, so a failed one (offline,
// cold-start timeout) is retried on the next page load. Never throws.
export function warmUpChat(apiBase: string | undefined = API_BASE): Promise<boolean> {
  if (!apiBase) return Promise.resolve(false);
  if (warmupPromise) return warmupPromise;
  if (Date.now() - readLastWarmupAt() < WARMUP_COOLDOWN_MS) return Promise.resolve(true);

  warmupPromise = (async () => {
    try {
      const response = await fetch(`${apiBase}/v1/chat/warmup`, {
        method: "POST",
        // AbortSignal.timeout is missing before Safari 16 / Chrome 103.
        signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(WARMUP_TIMEOUT_MS) : undefined,
      });
      if (response.ok) recordWarmupAt(Date.now());
      return response.ok;
    } catch {
      return false;
    }
  })();

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
