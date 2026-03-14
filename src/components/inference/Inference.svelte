<script lang="ts">
  import { loadTurnstileScript, renderTurnstile } from "../../lib/turnstile.js";
  import { submitInference, verifyTurnstile, warmInferenceModel } from "./inference-api.js";
  import type { InferenceSseEvent, SessionTokenResponse } from "./inference-api.js";

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

  type FlowStep = "gating" | "model_select" | "warming" | "prompt" | "streaming" | "complete" | "error";
  type ErrorContext = "verification" | "locked_warmup";

  const END_OF_TEXT_MARKER = "<|endoftext|>";
  const DEFAULT_PROMPT_PLACEHOLDER = "Once upon a time";
  const GENERIC_ERROR_MESSAGE = "Something went wrong, please try again later.";
  const MOCK_SESSION_DELAY_MS = 250;
  const CANONICAL_MODEL_OPTIONS: InferenceModelOption[] = [
    {value: "baseline", label: "Assignment Default"},
    {value: "ablation_no_norm", label: "No-Norm Ablation"},
    {value: "ablation_nope", label: "No RoPE Ablation"},
    {value: "ablation_post_norm", label: "Post-Norm Ablation"},
    {value: "ablation_silu", label: "SiLU Activation Ablation"},
    {value: "model_A_wide", label: "\"Model A\" Wide Benchmarking Model"},
    {value: "model_B_deep", label: "\"Model B\" Deep Benchmarking Model"},
    {value: "model_I", label: "Larger Wide-ish Model"},
    {value: "model_J", label: "Larger Deep-ish Model"},
  ];

  let {
    eyebrow = "Live inference",
    title = "Inference Playground",
    description = "Complete verification, prepare a model, and stream a response token by token.",
    verificationTitle = "Verification",
    verificationMessage = "Complete the Turnstile check to unlock the inference endpoint.",
    promptLabel = "Prompt",
    promptPlaceholder = DEFAULT_PROMPT_PLACEHOLDER,
    submitLabel = "Continue",
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

  let step: FlowStep = $state("gating");
  let turnstileEl: HTMLDivElement | undefined = $state();
  let selectedModel = $state("");
  let sessionToken = $state("");
  let sessionExpiresAt = $state(0);
  let promptText = $state("");
  let outputText = $state("");
  let completionMessage = $state("");
  let warmupMessage = $state("");
  let inlineErrorMessage = $state("");
  let errorMessage = $state("");
  let errorContext: ErrorContext = $state("verification");
  let verificationStarted = $state(false);
  let isVerifying = $state(false);

  let warmupRequestId = 0;

  let availableModels = $derived(models.length > 0 ? models : CANONICAL_MODEL_OPTIONS);
  let effectiveModel = $derived(lockedModel || selectedModel);
  let activeModel = $derived(resolveModelOption(effectiveModel));
  let isLockedFlow = $derived(Boolean(lockedModel));
  let canSubmit = $derived(
    (step === "prompt" || step === "complete") && Boolean(effectiveModel) && step !== "streaming"
  );
  let promptPlaceholderText = $derived(DEFAULT_PROMPT_PLACEHOLDER);

  $effect(() => {
    if (isLockedFlow) {
      return;
    }

    const preferredModel = initialModel || availableModels[0]?.value || "";
    if (!preferredModel) {
      selectedModel = "";
      return;
    }

    if (!selectedModel || !availableModels.some((model) => model.value === selectedModel)) {
      selectedModel = preferredModel;
    }
  });

  $effect(() => {
    if (step !== "gating" || verificationStarted) {
      return;
    }

    verificationStarted = true;

    if (!SITE_KEY) {
      void initializeMockSession();
      return;
    }

    if (!turnstileEl) {
      verificationStarted = false;
      return;
    }

    void initializeTurnstile();
  });

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function initializeMockSession() {
    isVerifying = true;

    try {
      await delay(MOCK_SESSION_DELAY_MS);
      const session = {
        sessionToken: "mock-inference-session",
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        allowedActions: ["infer"],
      } satisfies SessionTokenResponse;
      await handleVerificationSuccess(session);
    } catch (err: unknown) {
      showError(asMessage(err, "Verification failed."), "verification");
      verificationStarted = false;
    } finally {
      isVerifying = false;
    }
  }

  async function initializeTurnstile() {
    if (!turnstileEl) {
      verificationStarted = false;
      return;
    }

    isVerifying = true;

    try {
      await loadTurnstileScript();
      const turnstileToken = await renderTurnstile(turnstileEl, SITE_KEY);
      const session = await verifyTurnstile(turnstileToken);
      await handleVerificationSuccess(session);
    } catch (err: unknown) {
      showError(asMessage(err, "Verification failed."), "verification");
      verificationStarted = false;
      if (turnstileEl) {
        turnstileEl.innerHTML = "";
      }
    } finally {
      isVerifying = false;
    }
  }

  async function handleVerificationSuccess(session: SessionTokenResponse) {
    sessionToken = session.sessionToken;
    sessionExpiresAt = session.expiresAt;
    errorMessage = "";
    inlineErrorMessage = "";
    completionMessage = "";

    if (lockedModel) {
      await prepareModel(lockedModel, true);
      return;
    }

    step = "model_select";
  }

  async function prepareModel(modelSelection: string, treatFailureAsLockedError: boolean) {
    if (!modelSelection) {
      step = "model_select";
      return;
    }

    inlineErrorMessage = "";
    errorMessage = "";
    completionMessage = "";
    outputText = "";

    if (!warmupPath) {
      warmupMessage = "";
      step = "prompt";
      return;
    }

    const requestId = ++warmupRequestId;
    const modelLabel = resolveModelOption(modelSelection)?.label ?? modelSelection;
    warmupMessage = `Preparing ${modelLabel}...`;
    step = "warming";

    try {
      await warmInferenceModel(modelSelection, sessionToken, warmupPath);
      if (requestId !== warmupRequestId) {
        return;
      }

      warmupMessage = "";
      step = "prompt";
    } catch {
      if (requestId !== warmupRequestId) {
        return;
      }

      warmupMessage = "";
      if (treatFailureAsLockedError) {
        showError(GENERIC_ERROR_MESSAGE, "locked_warmup");
        return;
      }

      inlineErrorMessage = GENERIC_ERROR_MESSAGE;
      step = "model_select";
    }
  }

  function handleModelChange(event: Event) {
    selectedModel = (event.currentTarget as HTMLSelectElement).value;
    inlineErrorMessage = "";
  }

  async function handleSelectModel() {
    if (!selectedModel) {
      return;
    }

    if (!hasActiveSession()) {
      showError("Verification expired. Run the Turnstile check again.", "verification");
      return;
    }

    promptText = "";
    outputText = "";
    completionMessage = "";
    await prepareModel(selectedModel, false);
  }

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }

    if (!hasActiveSession()) {
      showError("Verification expired. Run the Turnstile check again.", "verification");
      return;
    }

    const prompt = promptText.trim().length > 0 ? promptText.trim() : END_OF_TEXT_MARKER;
    outputText = "";
    completionMessage = "";
    inlineErrorMessage = "";
    errorMessage = "";
    step = "streaming";

    try {
      await submitInference(
        {
          model: effectiveModel || undefined,
          prompt,
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
    } catch {
      outputText = "";
      completionMessage = "";
      inlineErrorMessage = GENERIC_ERROR_MESSAGE;
      step = "prompt";
    }
  }

  function handleInferenceEvent(event: InferenceSseEvent) {
    if (event.type === "delta") {
      const {text, done} = consumeDelta(event.text);
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

    outputText = "";
    completionMessage = "";
    inlineErrorMessage = GENERIC_ERROR_MESSAGE;
    step = "prompt";
  }

  function consumeDelta(text: string): { text: string; done: boolean } {
    const markerIndex = text.indexOf(END_OF_TEXT_MARKER);
    if (markerIndex === -1) {
      return {text, done: false};
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
    inlineErrorMessage = "";
    step = "prompt";
  }

  function changeModel() {
    promptText = "";
    outputText = "";
    completionMessage = "";
    inlineErrorMessage = "";
    step = "model_select";
  }

  function retryAfterError() {
    errorMessage = "";

    if (errorContext === "verification") {
      resetVerification();
      return;
    }

    if (lockedModel) {
      void prepareModel(lockedModel, true);
    }
  }

  function resetVerification() {
    sessionToken = "";
    sessionExpiresAt = 0;
    verificationStarted = false;
    isVerifying = false;
    inlineErrorMessage = "";
    errorMessage = "";
    completionMessage = "";
    step = "gating";
    if (turnstileEl) {
      turnstileEl.innerHTML = "";
    }
  }

  function showError(message: string, nextContext: ErrorContext) {
    errorMessage = message;
    errorContext = nextContext;
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

  function resolveModelOption(modelId: string): InferenceModelOption | null {
    if (!modelId) {
      return null;
    }

    return (
      availableModels.find((model) => model.value === modelId) ??
      CANONICAL_MODEL_OPTIONS.find((model) => model.value === modelId) ??
      {
        value: modelId,
        label: modelId,
      }
    );
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
            {errorContext === "verification" ? "Retry verification" : "Try again"}
          </button>
        </div>
      </div>
    {:else if step === "model_select"}
      <div class="section-block">
        <div class="section-copy">
          <h3>Select a model</h3>
          <p>Choose a model and prepare it for inference.</p>
        </div>

        {#if inlineErrorMessage}
          <div class="alert alert-error">
            <h3>Something went wrong</h3>
            <p>{inlineErrorMessage}</p>
          </div>
        {/if}

        <label class="field">
          <span>Model</span>
          <select class="select-input" value={selectedModel} onchange={handleModelChange}>
            {#each availableModels as model}
              <option value={model.value}>{model.label}</option>
            {/each}
          </select>
        </label>

        {#if activeModel?.description}
          <p class="helper-text">{activeModel.description}</p>
        {/if}

        <div class="actions">
          <button class="btn-primary" onclick={handleSelectModel} disabled={!selectedModel}>Select</button>
        </div>
      </div>
    {:else if step === "warming"}
      <div class="section-block">
        <div class="loading-shell" aria-live="polite">
          <div class="spinner" aria-hidden="true"></div>
          <h3>Preparing model</h3>
          <p>{warmupMessage || `Preparing ${activeModel?.label ?? "model"}...`}</p>
        </div>
      </div>
    {:else}
      <div class="section-block">
        {#if inlineErrorMessage}
          <div class="alert alert-error">
            <h3>Something went wrong</h3>
            <p>{inlineErrorMessage}</p>
          </div>
        {/if}

        {#if activeModel}
          <div class="field">
            <span>Model</span>
            <div class="locked-model">{activeModel.label}</div>
          </div>
        {/if}

        {#if activeModel?.description}
          <p class="helper-text">{activeModel.description}</p>
        {/if}

        <div class="field">
          <span>{promptLabel}</span>
          <textarea
            class="prompt-input"
            bind:value={promptText}
            rows={promptRows}
            placeholder={promptPlaceholderText || promptPlaceholder}
            aria-label={promptLabel}
            disabled={step === "streaming"}
          ></textarea>
        </div>

        <div class="actions">
          <button class="btn-primary" onclick={handleSubmit} disabled={!canSubmit}>
            {step === "streaming" ? "Continuing..." : submitLabel}
          </button>
          <button class="btn-secondary" onclick={resetRound} disabled={step === "streaming"}>
            {resetLabel}
          </button>
          {#if !isLockedFlow}
            <button class="btn-secondary" onclick={changeModel} disabled={step === "streaming"}>
              Change model
            </button>
          {/if}
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

  .loading-shell {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    padding: 1.5rem 1rem;
    text-align: center;
    border: 1px solid var(--stroke);
    border-radius: 14px;
    background:
      radial-gradient(320px 180px at 100% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 72%),
      color-mix(in srgb, var(--bg-1) 78%, transparent);
  }

  .loading-shell p {
    margin: 0;
    color: var(--text-1);
  }

  .spinner {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    border: 3px solid color-mix(in srgb, var(--stroke) 88%, transparent);
    border-top-color: var(--accent);
    animation: spin 0.9s linear infinite;
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

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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
