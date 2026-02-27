declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: (code?: string) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact";
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const SITE_KEY: string | undefined =
  typeof import.meta !== "undefined"
    ? (import.meta as Record<string, any>).env?.PUBLIC_TURNSTILE_SITE_KEY
    : undefined;

let scriptLoaded = false;

export function loadTurnstileScript(): Promise<void> {
  if (scriptLoaded || typeof document === "undefined") return Promise.resolve();
  if (document.querySelector(`script[src^="https://challenges.cloudflare.com/turnstile"]`)) {
    scriptLoaded = true;
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load Turnstile script"));
    document.head.appendChild(script);
  });
}

export function renderTurnstile(
  container: HTMLElement,
  siteKey?: string,
): Promise<string> {
  const key = siteKey ?? SITE_KEY;
  if (!key) return Promise.reject(new Error("No Turnstile site key configured"));

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Turnstile challenge timed out")), 60_000);

    window.turnstile!.render(container, {
      sitekey: key,
      theme: "dark",
      callback(token: string) {
        clearTimeout(timeout);
        resolve(token);
      },
      "error-callback"(code?: string) {
        clearTimeout(timeout);
        reject(new Error(`Turnstile error: ${code ?? "unknown"}`));
      },
      "expired-callback"() {
        clearTimeout(timeout);
        reject(new Error("Turnstile token expired"));
      },
    });
  });
}

export async function getTurnstileToken(container?: HTMLElement): Promise<string | null> {
  if (!SITE_KEY) return null;
  if (!container) return null;

  await loadTurnstileScript();
  return renderTurnstile(container, SITE_KEY);
}
