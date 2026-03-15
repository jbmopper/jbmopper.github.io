const SESSION_API_BASE: string | undefined =
  typeof import.meta !== "undefined"
    ? (import.meta as Record<string, any>).env?.PUBLIC_RESUME_API
    : undefined;

const INFERENCE_API_BASE: string | undefined =
  typeof import.meta !== "undefined"
    ? (import.meta as Record<string, any>).env?.PUBLIC_INFERENCE_API ??
      (import.meta as Record<string, any>).env?.PUBLIC_RESUME_API
    : undefined;

export interface SessionTokenResponse {
  sessionToken: string;
  expiresAt: number;
  allowedActions: string[];
}

export interface SubmitInferenceParams {
  model?: string;
  prompt?: string;
}

export type InferenceSseEvent =
  | { type: "delta"; text: string }   // token/chunk
  | { type: "done" }
  | { type: "error"; error: string };

export type InferenceEventHandler = (event: InferenceSseEvent) => void;

export interface InferenceResponse {
  response?: string;
  error?: string | null;
}

const END_OF_TEXT_MARKER = "<|endoftext|>";
const MOCK_WARMUP_FAILURE_MODEL = "__fail_warmup__";
const MOCK_INFERENCE_FAILURE_PROMPT = "__fail_inference__";
const MOCK_STREAM_TEXT =
  "Mock inference stream online. Wire the real inference Lambda and this panel will render token deltas from the live SSE response.";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function authHeaders(sessionToken: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionToken}`,
  };
}

function resolveSessionApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  if (!SESSION_API_BASE) {
    throw new Error("No session API base configured.");
  }

  return `${SESSION_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

function resolveInferenceApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  if (!INFERENCE_API_BASE) {
    throw new Error("No inference API base configured.");
  }

  return `${INFERENCE_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

function parseErrorMessage(raw: string, status: number): string {
  if (!raw.trim()) {
    return `Request failed: ${status}`;
  }

  try {
    const parsed = JSON.parse(raw) as { error?: string; message?: string };
    return parsed.error ?? parsed.message ?? `Request failed: ${status}`;
  } catch {
    return raw;
  }
}

function parseSseEvent(chunk: string): InferenceSseEvent | null {
  let eventType = "message";
  const dataLines: string[] = [];

  for (const line of chunk.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      eventType = line.slice("event:".length).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  const rawData = dataLines.join("\n");

  if (eventType === "done") {
    return { type: "done" };
  }

  if (eventType === "error") {
    if (!rawData) {
      return { type: "error", error: "Inference stream reported an error." };
    }

    try {
      const parsed = JSON.parse(rawData) as { error?: string; message?: string };
      return { type: "error", error: parsed.error ?? parsed.message ?? rawData };
    } catch {
      return { type: "error", error: rawData };
    }
  }

  if (!rawData) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawData) as { text?: string; delta?: string; token?: string };
    const text = parsed.text ?? parsed.delta ?? parsed.token;
    if (typeof text === "string" && text.length > 0) {
      return { type: "delta", text };
    }
  } catch {
    return { type: "delta", text: rawData };
  }

  return { type: "delta", text: rawData };
}

async function mockVerifyTurnstile(_turnstileToken: string): Promise<SessionTokenResponse> {
  await delay(250);
  return {
    sessionToken: "mock-infer-session-token",
    expiresAt: Math.floor(Date.now() / 1000) + 600,
    allowedActions: ["infer"],
  };
}

async function mockSubmitInference(
  params: SubmitInferenceParams,
  onEvent: InferenceEventHandler,
): Promise<void> {
  if (params.prompt?.trim() === MOCK_INFERENCE_FAILURE_PROMPT) {
    await delay(80);
    throw new Error("Mock inference failure");
  }

  const modelLabel = params.model ? ` on ${params.model}` : "";
  const promptLabel = params.prompt?.trim() ? ` Prompt received:${"\n"}${params.prompt.trim()}${"\n\n"}` : "";
  const text = `${MOCK_STREAM_TEXT}${modelLabel}.${"\n\n"}${promptLabel}${END_OF_TEXT_MARKER}`;
  const chunks = text.split(/(\s+)/).filter(Boolean);

  for (const chunk of chunks) {
    await delay(45 + Math.random() * 55);
    onEvent({ type: "delta", text: chunk });
  }

  onEvent({ type: "done" });
}

async function mockWarmInferenceModel(modelSelection: string): Promise<void> {
  await delay(650);
  if (modelSelection === MOCK_WARMUP_FAILURE_MODEL) {
    throw new Error("Mock warmup failure");
  }
}

async function liveVerifyTurnstile(turnstileToken: string): Promise<SessionTokenResponse> {
  const res = await fetch(resolveSessionApiUrl("/v1/session/turnstile-verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      turnstileToken,
      action: "infer",
      clientNonce: crypto.randomUUID(),
    }),
  });

  const body = await res.json();

  if (!res.ok) {
    throw new Error(body.message ?? body.error ?? `Turnstile verification failed: ${res.status}`);
  }
  return body;
}

async function liveSubmitInference(
  params: SubmitInferenceParams,
  sessionToken: string,
  onEvent: InferenceEventHandler,
): Promise<void> {
  const res = await fetch(resolveInferenceApiUrl("/v1/infer/generate"), {
    method: "POST",
    headers: {
      ...authHeaders(sessionToken),
      Accept: "text/event-stream",
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    throw new Error(parseErrorMessage(await res.text(), res.status));
  }

  const stream = res.body;
  if (!stream) {
    throw new Error("Streaming response did not include a body.");
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });

      const frames = pending.split(/\r?\n\r?\n/);
      pending = frames.pop() ?? "";

      for (const frame of frames) {
        const event = parseSseEvent(frame);
        if (!event) {
          continue;
        }

        onEvent(event);

        if (event.type === "done" || event.type === "error") {
          return;
        }
      }

      if (done) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  const trailingEvent = parseSseEvent(pending);
  if (trailingEvent) {
    onEvent(trailingEvent);
  }
}

async function liveWarmInferenceModel(
  modelSelection: string,
  sessionToken: string,
  warmupPath: string,
): Promise<void> {
  const res = await fetch(resolveInferenceApiUrl(warmupPath), {
    method: "POST",
    headers: authHeaders(sessionToken),
    body: JSON.stringify({ model: modelSelection }),
  });

  if (!res.ok) {
    throw new Error(parseErrorMessage(await res.text(), res.status));
  }
}


// public api

export async function verifyTurnstile(turnstileToken: string): Promise<SessionTokenResponse> {
  if (!SESSION_API_BASE) return mockVerifyTurnstile(turnstileToken);
  return liveVerifyTurnstile(turnstileToken);
}

export async function submitInference(
  params: SubmitInferenceParams,
  sessionToken: string,
  onEvent: InferenceEventHandler,
): Promise<void> {
  if (!INFERENCE_API_BASE) return mockSubmitInference(params, onEvent);
  return liveSubmitInference(params, sessionToken, onEvent);
}

export async function warmInferenceModel(
  modelSelection: string,
  sessionToken: string,
  warmupPath?: string,
): Promise<void> {
  const resolvedWarmupPath = warmupPath ?? "/v1/infer/warmup";

  if (!modelSelection) {
    return;
  }

  if (!INFERENCE_API_BASE) {
    return mockWarmInferenceModel(modelSelection);
  }

  return liveWarmInferenceModel(modelSelection, sessionToken, resolvedWarmupPath);
}
