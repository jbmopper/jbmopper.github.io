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

export type OfferInterest =
  | "workflow-diagnostic"
  | "pilot-sprint"
  | "readiness-review"
  | "implementation-support"
  | "not-sure";

export interface IntakeSubmission {
  name: string;
  email: string;
  company?: string;
  role?: string;
  website?: string;
  offerInterest: OfferInterest;
  workflowArea?: string;
  problemSummary: string;
  dataSources?: string;
  timeline?: string;
  budgetRange?: string;
  constraints?: string;
  consentToContact: boolean;
  websiteUrl?: string;
}

export interface IntakeSubmitResponse {
  submissionId: string;
  status: "accepted";
}

export interface SessionTokenResponse {
  sessionToken: string;
  expiresAt: number;
  allowedActions: string[];
}

export function isLiveMode(): boolean {
  return Boolean(API_BASE);
}

async function mockVerifyTurnstile(_token: string): Promise<SessionTokenResponse> {
  await new Promise((resolve) => setTimeout(resolve, 250 + Math.random() * 200));
  return {
    sessionToken: "mock-intake-session-token",
    expiresAt: Math.floor(Date.now() / 1000) + 600,
    allowedActions: ["intake"],
  };
}

async function mockSubmitIntake(_submission: IntakeSubmission): Promise<IntakeSubmitResponse> {
  await new Promise((resolve) => setTimeout(resolve, 450 + Math.random() * 350));
  if (_submission.email.toLowerCase().includes("fail")) {
    throw new Error("Mock intake submission failed.");
  }
  return {
    submissionId: `mock-${Date.now().toString(36)}`,
    status: "accepted",
  };
}

function authHeaders(sessionToken: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionToken}`,
  };
}

async function liveVerifyTurnstile(turnstileToken: string): Promise<SessionTokenResponse> {
  const res = await fetch(`${API_BASE}/v1/session/turnstile-verify`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      turnstileToken,
      action: "intake",
      clientNonce: crypto.randomUUID(),
    }),
  });

  const body = await res.json();

  if (!res.ok) {
    throw new Error(body.message ?? body.error ?? `Turnstile verification failed: ${res.status}`);
  }
  return body;
}

async function liveSubmitIntake(
  submission: IntakeSubmission,
  sessionToken: string,
): Promise<IntakeSubmitResponse> {
  const res = await fetch(`${API_BASE}/v1/intake/submit`, {
    method: "POST",
    headers: authHeaders(sessionToken),
    body: JSON.stringify(submission),
  });

  const body = await res.json();

  if (!res.ok) {
    throw new Error(body.message ?? body.error ?? `Intake submission failed: ${res.status}`);
  }
  return body;
}

export async function verifyTurnstile(turnstileToken: string): Promise<SessionTokenResponse> {
  if (!API_BASE) return mockVerifyTurnstile(turnstileToken);
  return liveVerifyTurnstile(turnstileToken);
}

export async function submitIntake(
  submission: IntakeSubmission,
  sessionToken: string,
): Promise<IntakeSubmitResponse> {
  if (!API_BASE) return mockSubmitIntake(submission);
  return liveSubmitIntake(submission, sessionToken);
}
