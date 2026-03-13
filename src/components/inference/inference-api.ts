const API_BASE: string | undefined =
  typeof import.meta !== "undefined"
    ? (import.meta as Record<string, any>).env?.PUBLIC_RESUME_API
    : undefined;

export interface SessionTokenResponse {
  sessionToken: string;
  expiresAt: number;
  allowedActions: string[];
}

export interface SubmitInferenceParams {
  model_selection?: string;
  prompt?: string;
  stream?: boolean;
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

function resolveApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  if (!API_BASE) {
    throw new Error("No inference API base configured.");
  }

  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
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
  const modelLabel = params.model_selection ? ` on ${params.model_selection}` : "";
  const promptLabel = params.prompt?.trim() ? ` Prompt received:${"\n"}${params.prompt.trim()}${"\n\n"}` : "";
  const text = `${MOCK_STREAM_TEXT}${modelLabel}.${"\n\n"}${promptLabel}`;
  const chunks = text.split(/(\s+)/).filter(Boolean);

  for (const chunk of chunks) {
    await delay(45 + Math.random() * 55);
    onEvent({ type: "delta", text: chunk });
  }

  onEvent({ type: "done" });
}

async function mockWarmInferenceModel(): Promise<void> {
  await delay(300);
}

async function liveVerifyTurnstile(turnstileToken: string): Promise<SessionTokenResponse> {
  const res = await fetch(resolveApiUrl("/v1/session/turnstile-verify"), {
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
  const res = await fetch(resolveApiUrl("/v1/infer/run"), {
    method: "POST",
    headers: {
      ...authHeaders(sessionToken),
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      ...params,
      stream: params.stream ?? true,
    }),
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
  const res = await fetch(resolveApiUrl(warmupPath), {
    method: "POST",
    headers: authHeaders(sessionToken),
    body: JSON.stringify({ model_selection: modelSelection }),
  });

  if (!res.ok) {
    throw new Error(parseErrorMessage(await res.text(), res.status));
  }
}


// public api

export async function verifyTurnstile(turnstileToken: string): Promise<SessionTokenResponse> {
  if (!API_BASE) return mockVerifyTurnstile(turnstileToken);
  return liveVerifyTurnstile(turnstileToken);
}

export async function submitInference(
  params: SubmitInferenceParams,
  sessionToken: string,
  onEvent: InferenceEventHandler,
): Promise<void> {
  if (!API_BASE) return mockSubmitInference(params, onEvent);
  return liveSubmitInference(params, sessionToken, onEvent);
}

export async function warmInferenceModel(
  modelSelection: string,
  sessionToken: string,
  warmupPath?: string,
): Promise<void> {
  if (!warmupPath || !modelSelection) {
    return;
  }

  if (!API_BASE) {
    return mockWarmInferenceModel();
  }

  return liveWarmInferenceModel(modelSelection, sessionToken, warmupPath);
}
