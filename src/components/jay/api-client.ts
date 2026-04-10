import type {ChatRequest, ChatResponse} from "./types.js";

const API_BASE: string | undefined =
  typeof import.meta !== "undefined" && (import.meta as Record<string, any>).env?.PUBLIC_AWS_SERVERLESS_API;

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

async function mockSendMessage(req: ChatRequest): Promise<ChatResponse> {
  await new Promise((resolve) => setTimeout(resolve, 600 + Math.random() * 800));
  return {reply: pickMockReply(), conversationId: req.conversationId};
}

async function liveSendMessage(req: ChatRequest, sessionToken: string): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/v1/chat/respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`Chat request failed: ${res.status}`);
  }
  return res.json();
}

export function isLiveMode(): boolean {
  return !!API_BASE;
}

export async function sendMessage(req: ChatRequest, sessionToken: string): Promise<ChatResponse> {
  if (!API_BASE) return mockSendMessage(req);
  return liveSendMessage(req, sessionToken);
}
