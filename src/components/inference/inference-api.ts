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

export interface InferenceResponse {
  response?: string;
  error?: string | null;
}

// skipping mock for now

function authHeaders(sessionToken: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionToken}`,
  };
}

async function liveVerifyTurnstile(turnstileToken: string): Promise<SessionTokenResponse> {
  const res = await fetch(`${API_BASE}/v1/session/turnstile-verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      turnstileToken,
      action: "resume",
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
): Promise<InferenceSseEvent> {
  const res = await fetch(`${API_BASE}/v1/resume/generate`, {
    method: "POST",
    headers: authHeaders(sessionToken),
    body: JSON.stringify(params),
  });

  const body = await res.json();

  if (!res.ok) {
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return body;
}


// public api

export async function verifyTurnstile(turnstileToken: string): Promise<SessionTokenResponse> {
  // if (!API_BASE) return mockVerifyTurnstile(turnstileToken);
  return liveVerifyTurnstile(turnstileToken);
}