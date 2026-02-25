import type {ChatRequest, ChatResponse} from "./types.js";

const API_BASE: string | undefined =
  typeof import.meta !== "undefined" && (import.meta as Record<string, any>).env?.PUBLIC_MUSHBOT_API;

const MOCK_REPLIES = [
  "Hi there! I'm Mushy Mushbot, the resident fungal assistant. Ask me about Julius's projects!",
  "Julius built a full transformer from scratch in PyTorch — training, inference, profiling, the works.",
  "Want to know about the performance analysis pipeline? It includes Nsys GPU traces and custom ablation studies.",
  "The deep learning fundamentals project covers everything from attention mechanisms to learning rate sweeps.",
  "I'm still getting my spores together, but I can tell you Julius is great at making AI systems that actually work.",
  "Fun fact: mushrooms communicate through underground mycelial networks. I communicate through API Gateway. Same energy.",
];

function pickMockReply(): string {
  return MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)];
}

async function mockSendMessage(req: ChatRequest): Promise<ChatResponse> {
  await new Promise((resolve) => setTimeout(resolve, 600 + Math.random() * 800));
  return {reply: pickMockReply(), conversationId: req.conversationId};
}

async function liveSendMessage(req: ChatRequest): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`Chat request failed: ${res.status}`);
  }
  return res.json();
}

export async function sendMessage(req: ChatRequest): Promise<ChatResponse> {
  if (!API_BASE) return mockSendMessage(req);
  return liveSendMessage(req);
}
