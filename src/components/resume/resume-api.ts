function readPublicEnv(name: string): string | undefined {
  if (typeof import.meta === "undefined") {
    return undefined;
  }

  const value = (import.meta as Record<string, any>).env?.[name];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const API_BASE = readPublicEnv("PUBLIC_AWS_SERVERLESS_API");

export interface SessionTokenResponse {
  sessionToken: string;
  expiresAt: number;
  allowedActions: string[];
}

export interface SubmitResumeParams {
  job_description?: string;
  job_description_base64?: string;
  job_description_filename?: string;
  job_title?: string;
}

export interface SubmitResumeResponse {
  job_id: string;
  status: string;
  status_path?: string;
  error?: string;
}

export type JobStatus = "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED";

export interface JobStatusResponse {
  job_id: string;
  status: JobStatus;
  pdf_url?: string;
  pdf_url_expires_in_seconds?: number;
  error?: string | null;
}

// ---------------------------------------------------------------------------
// Mock implementation for local dev without API env var
// ---------------------------------------------------------------------------

let mockStep = 0;

async function mockVerifyTurnstile(_token: string): Promise<SessionTokenResponse> {
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));
  return {
    sessionToken: "mock-session-token",
    expiresAt: Math.floor(Date.now() / 1000) + 600,
    allowedActions: ["resume"],
  };
}

async function mockSubmitResume(_params: SubmitResumeParams): Promise<SubmitResumeResponse> {
  await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
  mockStep = 0;
  return { job_id: "mock-job-001", status: "QUEUED" };
}

async function mockPollJobStatus(_jobId: string): Promise<JobStatusResponse> {
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));
  mockStep++;
  if (mockStep < 3) {
    return { job_id: _jobId, status: "PROCESSING" };
  }
  return {
    job_id: _jobId,
    status: "COMPLETE",
    pdf_url: "https://example.com/mock-resume.pdf",
    pdf_url_expires_in_seconds: 3600,
  };
}

// ---------------------------------------------------------------------------
// Live implementation
// ---------------------------------------------------------------------------

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

async function liveSubmitResume(
  params: SubmitResumeParams,
  sessionToken: string,
): Promise<SubmitResumeResponse> {
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

async function livePollJobStatus(
  jobId: string,
  sessionToken: string,
): Promise<JobStatusResponse> {
  const res = await fetch(`${API_BASE}/v1/resume/job/${encodeURIComponent(jobId)}`, {
    headers: authHeaders(sessionToken),
  });

  const body = await res.json();

  if (!res.ok) {
    throw new Error(body.error ?? `Status check failed: ${res.status}`);
  }
  return body;
}

// ---------------------------------------------------------------------------
// Public API — automatically picks live vs mock
// ---------------------------------------------------------------------------

export async function verifyTurnstile(turnstileToken: string): Promise<SessionTokenResponse> {
  if (!API_BASE) return mockVerifyTurnstile(turnstileToken);
  return liveVerifyTurnstile(turnstileToken);
}

export async function submitResume(
  params: SubmitResumeParams,
  sessionToken: string,
): Promise<SubmitResumeResponse> {
  if (!API_BASE) return mockSubmitResume(params);
  return liveSubmitResume(params, sessionToken);
}

export async function pollJobStatus(
  jobId: string,
  sessionToken: string,
): Promise<JobStatusResponse> {
  if (!API_BASE) return mockPollJobStatus(jobId);
  return livePollJobStatus(jobId, sessionToken);
}

export async function submitResumeFile(
  file: File,
  sessionToken: string,
  jobTitle?: string,
): Promise<SubmitResumeResponse> {
  const buffer = await file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
  );

  return submitResume(
    {
      job_description_base64: base64,
      job_description_filename: file.name,
      job_title: jobTitle || undefined,
    },
    sessionToken,
  );
}
