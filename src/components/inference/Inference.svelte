<script lang="ts">
  import { loadTurnstileScript, renderTurnstile } from "../../lib/turnstile.js";
  import { submitInference, verifyTurnstile, warmInferenceModel } from "./inference-api.js";
  import type { InferenceSseEvent } from "./inference-api.js";

  interface InferenceModelOption {
    value: string;
    label: string;
    description?: string;
  }

  interface Props {
    eyebrow?: string;
    title?: string;
    description?: string;
    verificationTitle?: string;
    verificationMessage?: string;
    promptLabel?: string;
    promptPlaceholder?: string;
    submitLabel?: string;
    resetLabel?: string;
    warmupPath?: string;
    models?: InferenceModelOption[];
    initialModel?: string;
    lockedModel?: string;
    promptRows?: number;
  }

  type FlowStep = "gating" | "ready" | "streaming" | "complete" | "error";
  type WarmupState = "idle" | "warming" | "ready" | "error";

  let {
    eyebrow = "Live inference",
    title = "Inference Playground",
    description = "Complete verification, choose a model, and stream a response token by token.",
    verificationTitle = "Verification",
    verificationMessage = "Complete the Turnstile check to unlock the inference endpoint.",
    promptLabel = "Prompt",
    promptPlaceholder = "Ask the model to summarize, explain, or generate something useful.",
    submitLabel = "Run inference",
    resetLabel = "Fresh round",
    warmupPath = "/warmup",
    models = [],
    initialModel = "",
    lockedModel = "",
    promptRows = 8,
  }: Props = $props();

  const SITE_KEY: string | undefined =
    typeof import.meta !== "undefined"
      ? (import.meta as Record<string, any>).env?.PUBLIC_TURNSTILE_SITE_KEY
      : undefined;
  const END_OF_TEXT_MARKER = "<|endoftext|>";

  let step: FlowStep = $state("gating");
  let warmupState: WarmupState = $state("idle");
  let turnstileEl: HTMLDivElement | undefined = $state();
  let selectedModel = $state(lockedModel || initialModel || models[0]?.value || "");
  let sessionToken = $state("");
  let sessionExpiresAt = $state(0);
  let promptText = $state("");
  let outputText = $state("");
  let completionMessage = $state("");
  let warmupMessage = $state("");
  let errorMessage = $state("");
  let errorReturnStep: FlowStep = $state("gating");
  let verificationStarted = $state(false);
  let isVerifying = $state(false);

  let warmupRequestId = 0;
  let lastWarmupKey = "";

  let effectiveModel = $derived(lockedModel || selectedModel);
  let activeModel = $derived(
    models.find((model) => model.value === effectiveModel) ??
      (effectiveModel
        ? {
            value: effectiveModel,
            label: effectiveModel,
          }
        : null)
  );
  let canChangeModel = $derived(!lockedModel && models.length > 1);
  let canSubmit = $derived(
    step !== "gating" &&
      step !== "streaming" &&
      promptText.trim().length > 0 &&
      (models.length === 0 || Boolean(effectiveModel))
  );

  $effect(() => {
    if (!SITE_KEY && !sessionToken) {
      sessionToken = "mock-inference-session";
      sessionExpiresAt = Math.floor(Date.now() / 1000) + 600;
      step = "ready";
    }
  });

  $effect(() => {
    if (!SITE_KEY || step !== "gating" || !turnstileEl || verificationStarted) {
      return;
    }

    verificationStarted = true;
    void initializeTurnstile();
  });

  $effect(() => {
    const modelSelection = effectiveModel;

    if (!warmupPath || !sessionToken || !modelSelection) {
      if (!warmupPath || !modelSelection) {
        warmupState = "idle";
        warmupMessage = "";
      }
      return;
    }

    void maybeWarmModel(modelSelection);
  });

  async function initializeTurnstile() {
    if (!turnstileEl) {
      return;
    }

    isVerifying = true;

    try {
      await loadTurnstileScript();
      const turnstileToken = await renderTurnstile(turnstileEl, SITE_KEY);
      const session = await verifyTurnstile(turnstileToken);
      sessionToken = session.sessionToken;
      sessionExpiresAt = session.expiresAt;
      step = "ready";
      errorMessage = "";
    } catch (err: unknown) {
      showError(asMessage(err, "Verification failed."), "gating");
      verificationStarted = false;
      if (turnstileEl) {
        turnstileEl.innerHTML = "";
      }
    } finally {
      isVerifying = false;
    }
  }

  async function maybeWarmModel(modelSelection: string) {
    const warmupKey = `${warmupPath}:${sessionToken}:${modelSelection}`;
    if (warmupKey === lastWarmupKey) {
      return;
    }

    lastWarmupKey = warmupKey;
    const requestId = ++warmupRequestId;
    const modelLabel = activeModel?.label ?? modelSelection;

    warmupState = "warming";
    warmupMessage = `Warming ${modelLabel}...`;

    try {
      await warmInferenceModel(modelSelection, sessionToken, warmupPath);
      if (requestId !== warmupRequestId) {
        return;
      }

      warmupState = "ready";
      warmupMessage = `${modelLabel} is warm and ready.`;
    } catch (err: unknown) {
      if (requestId !== warmupRequestId) {
        return;
      }

      warmupState = "error";
      warmupMessage = asMessage(err, "Model warmup failed.");
    }
  }

  function handleModelChange(event: Event) {
    const nextModel = (event.currentTarget as HTMLSelectElement).value;
    const nextModelLabel = models.find((model) => model.value === nextModel)?.label ?? nextModel;

    selectedModel = nextModel;
    warmupState = warmupPath ? "warming" : "idle";
    warmupMessage = warmupPath ? `Queueing warmup for ${nextModelLabel}...` : "";
  }

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }

    if (!hasActiveSession()) {
      showError("Verification expired. Run the Turnstile check again.", "gating");
      return;
    }

    outputText = "";
    completionMessage = "";
    errorMessage = "";
    step = "streaming";

    try {
      await submitInference(
        {
          model: effectiveModel || undefined,
          prompt: promptText.trim(),
        },
        sessionToken,
        handleInferenceEvent,
      );

      if (step === "streaming") {
        completionMessage = outputText.trim()
          ? "Stream complete."
          : "The model completed without returning text.";
        step = "complete";
      }
    } catch (err: unknown) {
      showError(asMessage(err, "Inference request failed."), "ready");
    }
  }

  function handleInferenceEvent(event: InferenceSseEvent) {
    if (event.type === "delta") {
      const { text, done } = consumeDelta(event.text);
      if (text) {
        outputText += text;
      }

      if (done) {
        completionMessage = "Stream complete.";
        step = "complete";
      }

      return;
    }

    if (event.type === "done") {
      completionMessage = outputText.trim()
        ? "Stream complete."
        : "The model completed without returning text.";
      step = "complete";
      return;
    }

    showError(event.error, "ready");
  }

  function consumeDelta(text: string): { text: string; done: boolean } {
    const markerIndex = text.indexOf(END_OF_TEXT_MARKER);
    if (markerIndex === -1) {
      return { text, done: false };
    }

    return {
      text: text.slice(0, markerIndex),
      done: true,
    };
  }

  function resetRound() {
    promptText = "";
    outputText = "";
    completionMessage = "";
    errorMessage = "";
    step = "ready";
  }

  function retryAfterError() {
    errorMessage = "";
    completionMessage = "";

    if (errorReturnStep === "gating") {
      resetVerification();
      return;
    }

    step = errorReturnStep;
  }

  function resetVerification() {
    sessionToken = "";
    sessionExpiresAt = 0;
    verificationStarted = false;
    step = "gating";
    if (turnstileEl) {
      turnstileEl.innerHTML = "";
    }
  }

  function showError(message: string, returnTo: FlowStep) {
    errorMessage = message;
    errorReturnStep = returnTo;
    step = "error";
  }

  function hasActiveSession(): boolean {
    return sessionExpiresAt === 0 || Math.floor(Date.now() / 1000) < sessionExpiresAt;
  }

  function asMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message.trim()) {
      return err.message;
    }

    return fallback;
  }
</script>

<section class="inference-shell">
  <div class="panel">
    <header class="panel-header">
      <p class="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p class="description">{description}</p>
    </header>

    {#if step === "gating"}
      <div class="section-block">
        <div class="section-copy">
          <h3>{verificationTitle}</h3>
          <p>{verificationMessage}</p>
        </div>

        {#if SITE_KEY}
          <div class="turnstile-shell">
            <div bind:this={turnstileEl}></div>
          </div>
          {#if isVerifying}
            <p class="helper-text">Verifying your Turnstile token and opening the session...</p>
          {/if}
        {:else}
          <p class="helper-text">
            Turnstile is not configured in this environment. The component is running in local mock mode.
          </p>
        {/if}
      </div>
    {:else if step === "error"}
      <div class="section-block">
        <div class="alert alert-error">
          <h3>Something went wrong</h3>
          <p>{errorMessage}</p>
        </div>

        <div class="actions">
          <button class="btn-primary" onclick={retryAfterError}>
            {errorReturnStep === "gating" ? "Retry verification" : "Back to prompt"}
          </button>
        </div>
      </div>
    {:else}
      <div class="section-block">
        <div class="status-row">
          <span class="status-pill success">Verified</span>
          {#if activeModel}
            <span class="status-pill">{activeModel.label}</span>
          {/if}
          {#if warmupPath && effectiveModel}
            <span
              class="status-pill"
              class:warming={warmupState === "warming"}
              class:error={warmupState === "error"}
              class:success={warmupState === "ready"}
            >
              {#if warmupState === "warming"}
                Warming
              {:else if warmupState === "ready"}
                Warm
              {:else if warmupState === "error"}
                Warmup failed
              {:else}
                Warmup idle
              {/if}
            </span>
          {/if}
        </div>

        {#if canChangeModel}
          <label class="field">
            <span>Model</span>
            <select class="select-input" value={selectedModel} onchange={handleModelChange} disabled={step === "streaming"}>
              {#each models as model}
                <option value={model.value}>{model.label}</option>
              {/each}
            </select>
          </label>
        {:else if activeModel}
          <div class="field">
            <span>Model</span>
            <div class="locked-model">{activeModel.label}</div>
          </div>
        {/if}

        {#if activeModel?.description}
          <p class="helper-text">{activeModel.description}</p>
        {/if}

        {#if warmupMessage}
          <p class="helper-text" class:error-copy={warmupState === "error"}>{warmupMessage}</p>
        {/if}

        <label class="field">
          <span>{promptLabel}</span>
          <textarea
            class="prompt-input"
            bind:value={promptText}
            rows={promptRows}
            placeholder={promptPlaceholder}
            disabled={step === "streaming"}
          ></textarea>
        </label>

        <div class="actions">
          <button class="btn-primary" onclick={handleSubmit} disabled={!canSubmit}>
            {step === "streaming" ? "Streaming..." : submitLabel}
          </button>
          <button class="btn-secondary" onclick={resetRound} disabled={step === "streaming"}>
            {resetLabel}
          </button>
        </div>

        <section class="output-panel">
          <div class="output-header">
            <h3>Response</h3>
            {#if step === "streaming"}
              <span class="stream-indicator">Live</span>
            {:else if step === "complete"}
              <span class="stream-indicator complete">Done</span>
            {/if}
          </div>

          {#if outputText}
            <pre class="output-text">{outputText}</pre>
          {:else if step === "streaming"}
            <p class="output-placeholder">Waiting for the first tokens...</p>
          {:else}
            <p class="output-placeholder">The streamed response will appear here.</p>
          {/if}

          {#if completionMessage}
            <p class="helper-text completion-copy">{completionMessage}</p>
          {/if}
        </section>
      </div>
    {/if}
  </div>
</section>

<style>
  .inference-shell {
    display: grid;
  }

  .panel {
    border: 1px solid var(--stroke);
    border-radius: 16px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--surface) 88%, transparent),
      color-mix(in srgb, var(--surface-2) 92%, transparent)
    );
    overflow: hidden;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
  }

  .panel-header {
    padding: 1.5rem;
    border-bottom: 1px solid var(--stroke);
    background:
      radial-gradient(600px 240px at 100% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 72%),
      color-mix(in srgb, var(--surface) 84%, transparent);
  }

  .eyebrow {
    margin: 0 0 0.35rem;
    color: var(--accent);
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2,
  h3 {
    margin: 0;
  }

  .description {
    margin: 0.75rem 0 0;
    max-width: 64ch;
    color: var(--text-1);
  }

  .section-block {
    display: grid;
    gap: 1rem;
    padding: 1.5rem;
  }

  .section-copy {
    display: grid;
    gap: 0.5rem;
  }

  .section-copy p,
  .helper-text {
    margin: 0;
    color: var(--text-1);
  }

  .turnstile-shell {
    padding: 1rem;
    border: 1px dashed color-mix(in srgb, var(--stroke) 74%, transparent);
    border-radius: 14px;
    background: color-mix(in srgb, var(--bg-1) 72%, transparent);
  }

  .status-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    padding: 0.35rem 0.75rem;
    border-radius: 999px;
    border: 1px solid var(--stroke);
    background: color-mix(in srgb, var(--surface) 86%, transparent);
    color: var(--text-0);
    font-size: 0.9rem;
  }

  .status-pill.success {
    border-color: color-mix(in srgb, var(--accent) 50%, var(--stroke));
  }

  .status-pill.warming {
    border-color: color-mix(in srgb, #f3c969 58%, var(--stroke));
  }

  .status-pill.error {
    border-color: color-mix(in srgb, #ff7d7d 58%, var(--stroke));
  }

  .field {
    display: grid;
    gap: 0.45rem;
  }

  .field span {
    font-weight: 600;
    color: var(--text-0);
  }

  .select-input,
  .prompt-input,
  .locked-model {
    width: 100%;
    border: 1px solid var(--stroke);
    border-radius: 12px;
    background: color-mix(in srgb, var(--bg-1) 78%, transparent);
    color: var(--text-0);
    font: inherit;
  }

  .select-input,
  .locked-model {
    padding: 0.8rem 0.9rem;
  }

  .prompt-input {
    min-height: 10rem;
    padding: 0.95rem 1rem;
    resize: vertical;
    line-height: 1.6;
  }

  .locked-model {
    color: var(--text-1);
  }

  .select-input:focus,
  .prompt-input:focus {
    outline: 2px solid color-mix(in srgb, var(--accent) 70%, transparent);
    outline-offset: 2px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .btn-primary,
  .btn-secondary {
    border-radius: 999px;
    padding: 0.8rem 1.15rem;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    transition:
      transform 0.16s ease,
      border-color 0.16s ease,
      background 0.16s ease;
  }

  .btn-primary {
    border: 1px solid color-mix(in srgb, var(--accent) 48%, var(--stroke));
    background: color-mix(in srgb, var(--accent) 28%, var(--surface));
    color: var(--text-0);
  }

  .btn-secondary {
    border: 1px solid var(--stroke);
    background: transparent;
    color: var(--text-1);
  }

  .btn-primary:hover:not(:disabled),
  .btn-secondary:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .btn-primary:disabled,
  .btn-secondary:disabled {
    cursor: not-allowed;
    opacity: 0.55;
    transform: none;
  }

  .output-panel {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--stroke);
    border-radius: 14px;
    background:
      radial-gradient(320px 180px at 100% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 72%),
      color-mix(in srgb, var(--bg-1) 78%, transparent);
  }

  .output-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;
  }

  .stream-indicator {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--accent);
    font-size: 0.86rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .stream-indicator::before {
    content: "";
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 55%, transparent);
    animation: pulse 1.2s ease-out infinite;
  }

  .stream-indicator.complete {
    color: var(--text-1);
  }

  .stream-indicator.complete::before {
    animation: none;
  }

  .output-text {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--font-serif);
    font-size: 1rem;
    line-height: 1.7;
    color: var(--text-0);
  }

  .output-placeholder {
    margin: 0;
    color: var(--text-1);
  }

  .completion-copy {
    color: var(--accent);
  }

  .alert {
    display: grid;
    gap: 0.5rem;
    padding: 1rem;
    border-radius: 14px;
    border: 1px solid var(--stroke);
  }

  .alert p {
    margin: 0;
  }

  .alert-error {
    border-color: color-mix(in srgb, #ff7d7d 58%, var(--stroke));
    background: color-mix(in srgb, #451e1e 40%, transparent);
  }

  .error-copy {
    color: #ffb1b1;
  }

  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, currentColor 50%, transparent);
    }

    100% {
      box-shadow: 0 0 0 10px color-mix(in srgb, currentColor 0%, transparent);
    }
  }

  @media (max-width: 720px) {
    .panel-header,
    .section-block {
      padding: 1.1rem;
    }

    .actions {
      flex-direction: column;
    }

    .btn-primary,
    .btn-secondary {
      width: 100%;
      justify-content: center;
    }
  }
</style>
