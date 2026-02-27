const API_BASE: string | undefined =
  typeof import.meta !== "undefined"
    ? (import.meta as Record<string, any>).env?.PUBLIC_RESUME_API
    : undefined;

export interface SubmitResumeParams {
  job_description?: string;
  job_description_base64?: string;
  job_description_filename?: string;
  job_title?: string;
  turnstile_token?: string;
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

async function liveSubmitResume(params: SubmitResumeParams): Promise<SubmitResumeResponse> {
  const res = await fetch(`${API_BASE}/generate-resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const body = await res.json();

  if (!res.ok) {
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return body;
}

async function livePollJobStatus(jobId: string): Promise<JobStatusResponse> {
  const res = await fetch(`${API_BASE}/job/${encodeURIComponent(jobId)}`);
  const body = await res.json();

  if (!res.ok) {
    throw new Error(body.error ?? `Status check failed: ${res.status}`);
  }
  return body;
}

// ---------------------------------------------------------------------------
// Public API — automatically picks live vs mock
// ---------------------------------------------------------------------------

export async function submitResume(params: SubmitResumeParams): Promise<SubmitResumeResponse> {
  if (!API_BASE) return mockSubmitResume(params);
  return liveSubmitResume(params);
}

export async function pollJobStatus(jobId: string): Promise<JobStatusResponse> {
  if (!API_BASE) return mockPollJobStatus(jobId);
  return livePollJobStatus(jobId);
}

export async function submitResumeFile(
  file: File,
  jobTitle?: string,
  turnstileToken?: string,
): Promise<SubmitResumeResponse> {
  const buffer = await file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
  );

  return submitResume({
    job_description_base64: base64,
    job_description_filename: file.name,
    job_title: jobTitle || undefined,
    turnstile_token: turnstileToken || undefined,
  });
}
