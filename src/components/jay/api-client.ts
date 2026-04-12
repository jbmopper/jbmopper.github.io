import type {ChatMessage, ChatRequest, ChatResponse, CurrentPage} from "./types.js";

const API_BASE: string | undefined =
  typeof import.meta !== "undefined" && (import.meta as Record<string, any>).env?.PUBLIC_AWS_SERVERLESS_API;

const MAX_HISTORY_MESSAGES = 40;

const MOCK_REPLIES = [
  "Hey! I'm Jay, Julius's AI assistant. Ask me about his projects!",
  "Julius built a full transformer from scratch in PyTorch — training, inference, profiling, the works.",
  "Want to know about the performance analysis pipeline? It includes Nsys GPU traces and custom ablation studies.",
  "The deep learning fundamentals project covers everything from attention mechanisms to learning rate sweeps.",
  "I can tell you all about Julius's work — he's great at making AI systems that actually scale.",
  "I'm backed by Vertex AI RAG, so I can pull up specific details from the site's content. Try me!",
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
    messages: trimmed.map(({role, text}) => ({role, text})),
  };
}

async function mockSendMessage(conversationId: string): Promise<ChatResponse> {
  await new Promise((resolve) => setTimeout(resolve, 600 + Math.random() * 800));
  return {reply: pickMockReply(), conversationId};
}

const REQUEST_TIMEOUT_MS = 30_000;

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
