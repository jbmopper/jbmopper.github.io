<script lang="ts">
  import { loadTurnstileScript, renderTurnstile } from "../../lib/turnstile.js";
  import { verifyTurnstile, submitResume, submitResumeFile, pollJobStatus } from "./resume-api.js";
  import type { JobStatusResponse } from "./resume-api.js";

  type FlowStep = "intro" | "turnstile" | "input" | "processing" | "complete" | "error";

  const SITE_KEY: string | undefined =
    typeof import.meta !== "undefined"
      ? (import.meta as Record<string, any>).env?.PUBLIC_TURNSTILE_SITE_KEY
      : undefined;

  const ACCEPTED_EXTENSIONS = [".txt", ".md", ".rtf", ".html", ".docx", ".odt", ".pdf"];
  const POLL_INTERVAL_MS = 3000;
  const MAX_POLLS = 120;

  let step: FlowStep = $state("intro");
  let sessionToken: string = $state("");
  let turnstileEl: HTMLDivElement | undefined = $state();

  let inputMode: "text" | "file" = $state("text");
  let jobDescriptionText = $state("");
  let jobTitleText = $state("");
  let selectedFile: File | null = $state(null);

  let jobId: string | null = $state(null);
  let jobStatus: string = $state("");
  let pdfUrl: string | null = $state(null);
  let elapsedSeconds = $state(0);
  let pollTimer: ReturnType<typeof setInterval> | null = $state(null);
  let elapsedTimer: ReturnType<typeof setInterval> | null = $state(null);

  let errorMessage = $state("");
  let errorReturnStep: FlowStep = $state("intro");

  let canSubmit = $derived(
    inputMode === "text"
      ? jobDescriptionText.trim().length > 20
      : selectedFile !== null,
  );

  function goToTurnstile() {
    if (!SITE_KEY) {
      sessionToken = "mock-session-token";
      step = "input";
      return;
    }
    step = "turnstile";
  }

  $effect(() => {
    if (step === "turnstile" && turnstileEl) {
      initTurnstile();
    }
  });

  async function initTurnstile() {
    try {
      await loadTurnstileScript();
      const cfToken = await renderTurnstile(turnstileEl!, SITE_KEY);
      const session = await verifyTurnstile(cfToken);
      sessionToken = session.sessionToken;
      step = "input";
    } catch (err: any) {
      showError(err.message ?? "Verification failed", "intro");
    }
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file) {
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        showError(
          `Unsupported file type "${ext}". Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}`,
          "input",
        );
        input.value = "";
        return;
      }
    }
    selectedFile = file;
  }

  async function handleGenerate() {
    step = "processing";
    elapsedSeconds = 0;
    elapsedTimer = setInterval(() => { elapsedSeconds++; }, 1000);

    try {
      let result;
      if (inputMode === "file" && selectedFile) {
        result = await submitResumeFile(
          selectedFile,
          sessionToken,
          jobTitleText.trim() || undefined,
        );
      } else {
        result = await submitResume(
          {
            job_description: jobDescriptionText.trim(),
            job_title: jobTitleText.trim() || undefined,
          },
          sessionToken,
        );
      }

      jobId = result.job_id;
      jobStatus = result.status;
      startPolling();
    } catch (err: any) {
      clearTimers();
      showError(err.message ?? "Failed to submit resume request", "input");
    }
  }

  function startPolling() {
    let pollCount = 0;

    pollTimer = setInterval(async () => {
      if (!jobId) return;
      pollCount++;

      if (pollCount > MAX_POLLS) {
        clearTimers();
        showError("Resume generation timed out. Please try again.", "input");
        return;
      }

      try {
        const status: JobStatusResponse = await pollJobStatus(jobId, sessionToken);
        jobStatus = status.status;

        if (status.status === "COMPLETE" && status.pdf_url) {
          clearTimers();
          pdfUrl = status.pdf_url;
          step = "complete";
        } else if (status.status === "FAILED") {
          clearTimers();
          showError(status.error ?? "Resume generation failed", "input");
        }
      } catch (err: any) {
        clearTimers();
        showError(err.message ?? "Failed to check job status", "input");
      }
    }, POLL_INTERVAL_MS);
  }

  function clearTimers() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
  }

  function showError(message: string, returnTo: FlowStep) {
    errorMessage = message;
    errorReturnStep = returnTo;
    step = "error";
  }

  function handleRetry() {
    step = errorReturnStep;
  }

  function resetFlow() {
    clearTimers();
    step = "intro";
    sessionToken = "";
    jobDescriptionText = "";
    jobTitleText = "";
    selectedFile = null;
    jobId = null;
    jobStatus = "";
    pdfUrl = null;
    elapsedSeconds = 0;
    errorMessage = "";
    inputMode = "text";
  }

  function formatElapsed(s: number): string {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }
</script>

<div class="resume-gen">
  {#if step === "intro"}
    <div class="step-card">
      <h2>Resume Generator</h2>
      <p class="description">
        Submit a job description and receive an AI-generated resume tailored to the role.
        The resume is built from Julius Mopper's experience and skills, formatted as a
        professional PDF.
      </p>
      <ul class="feature-list">
        <li>Paste text or upload a job description file</li>
        <li>Supports .txt, .pdf, .docx, .rtf, .md, .html, .odt</li>
        <li>AI-tailored to the job description you provide</li>
        <li>Download as PDF</li>
      </ul>
      <button class="btn-primary" onclick={goToTurnstile}>Continue</button>
    </div>

  {:else if step === "turnstile"}
    <div class="step-card">
      <h2>Verification</h2>
      <p class="description">Please complete the quick verification below.</p>
      <div class="turnstile-container" bind:this={turnstileEl}></div>
    </div>

  {:else if step === "input"}
    <div class="step-card">
      <h2>Job Description</h2>

      <div class="input-tabs" role="tablist">
        <button
          role="tab"
          class="tab"
          class:active={inputMode === "text"}
          aria-selected={inputMode === "text"}
          onclick={() => { inputMode = "text"; }}
        >
          Paste Text
        </button>
        <button
          role="tab"
          class="tab"
          class:active={inputMode === "file"}
          aria-selected={inputMode === "file"}
          onclick={() => { inputMode = "file"; }}
        >
          Upload File
        </button>
      </div>

      {#if inputMode === "text"}
        <textarea
          class="jd-textarea"
          placeholder="Paste the job description here..."
          bind:value={jobDescriptionText}
          rows="10"
        ></textarea>
      {:else}
        <label class="file-upload">
          <input
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(",")}
            onchange={handleFileSelect}
          />
          {#if selectedFile}
            <span class="file-name">{selectedFile.name}</span>
          {:else}
            <span class="file-prompt">Choose a file or drag it here</span>
          {/if}
        </label>
      {/if}

      <input
        class="title-input"
        type="text"
        placeholder="Job title (optional)"
        bind:value={jobTitleText}
      />

      <div class="actions">
        <button class="btn-secondary" onclick={resetFlow}>Back</button>
        <button class="btn-primary" disabled={!canSubmit} onclick={handleGenerate}>
          Generate Resume
        </button>
      </div>
    </div>

  {:else if step === "processing"}
    <div class="step-card center">
      <div class="spinner" aria-hidden="true"></div>
      <h2>Generating Resume</h2>
      <p class="description">
        {#if jobStatus === "QUEUED"}
          Queued — waiting to start...
        {:else if jobStatus === "PROCESSING"}
          Processing — the AI is crafting your resume...
        {:else}
          Working...
        {/if}
      </p>
      <p class="elapsed">{formatElapsed(elapsedSeconds)}</p>
    </div>

  {:else if step === "complete"}
    <div class="step-card center">
      <div class="success-icon" aria-hidden="true">&#10003;</div>
      <h2>Resume Ready</h2>
      <p class="description">Your tailored resume has been generated.</p>
      <div class="actions">
        <a class="btn-primary" href={pdfUrl} target="_blank" rel="noreferrer">
          View PDF
        </a>
        <a class="btn-secondary" href={pdfUrl} download="resume.pdf">
          Download
        </a>
      </div>
      <button class="btn-link" onclick={resetFlow}>Generate another</button>
    </div>

  {:else if step === "error"}
    <div class="step-card center">
      <div class="error-icon" aria-hidden="true">!</div>
      <h2>Something went wrong</h2>
      <p class="error-message">{errorMessage}</p>
      <div class="actions">
        <button class="btn-primary" onclick={handleRetry}>Try Again</button>
        <button class="btn-secondary" onclick={resetFlow}>Start Over</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .resume-gen {
    max-width: 640px;
    margin: 0 auto;
  }

  .step-card {
    padding: 1.5rem;
    border: 1px solid var(--stroke, #2d3e50);
    border-radius: var(--radius-md, 12px);
    background: color-mix(in srgb, var(--surface, #1a2330) 80%, transparent);
  }

  .step-card.center {
    text-align: center;
  }

  .step-card h2 {
    margin: 0 0 0.75rem;
    color: var(--text-0, #edf2f7);
  }

  .description {
    color: var(--text-1, #b7c2d0);
    line-height: 1.6;
    margin: 0 0 1rem;
  }

  .feature-list {
    color: var(--text-1, #b7c2d0);
    line-height: 1.8;
    padding-left: var(--list-indent, 1.4rem);
    margin: 0 0 1.25rem;
  }

  .feature-list li::marker {
    color: var(--accent, #60a5fa);
  }

  /* Tabs */
  .input-tabs {
    display: flex;
    gap: 0;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--stroke, #2d3e50);
  }

  .tab {
    flex: 1;
    padding: 0.6rem 1rem;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--text-1, #b7c2d0);
    font-size: 0.9rem;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .tab:hover {
    color: var(--text-0, #edf2f7);
  }

  .tab.active {
    color: var(--accent, #60a5fa);
    border-bottom-color: var(--accent, #60a5fa);
  }

  /* Text input */
  .jd-textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--stroke, #2d3e50);
    border-radius: 8px;
    background: var(--bg-1, #141b24);
    color: var(--text-0, #edf2f7);
    font-family: var(--font-sans, "Manrope", sans-serif);
    font-size: 0.9rem;
    resize: vertical;
    line-height: 1.5;
    margin-bottom: 0.75rem;
  }

  .jd-textarea:focus {
    outline: none;
    border-color: var(--accent, #60a5fa);
  }

  .jd-textarea::placeholder {
    color: var(--text-1, #b7c2d0);
    opacity: 0.6;
  }

  /* File upload */
  .file-upload {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    border: 2px dashed var(--stroke, #2d3e50);
    border-radius: 8px;
    background: var(--bg-1, #141b24);
    cursor: pointer;
    margin-bottom: 0.75rem;
    transition: border-color 0.15s;
  }

  .file-upload:hover {
    border-color: var(--accent, #60a5fa);
  }

  .file-upload input[type="file"] {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }

  .file-prompt {
    color: var(--text-1, #b7c2d0);
    font-size: 0.9rem;
  }

  .file-name {
    color: var(--accent, #60a5fa);
    font-size: 0.9rem;
    font-weight: 600;
  }

  /* Title input */
  .title-input {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--stroke, #2d3e50);
    border-radius: 8px;
    background: var(--bg-1, #141b24);
    color: var(--text-0, #edf2f7);
    font-family: var(--font-sans, "Manrope", sans-serif);
    font-size: 0.9rem;
    margin-bottom: 1rem;
  }

  .title-input:focus {
    outline: none;
    border-color: var(--accent, #60a5fa);
  }

  .title-input::placeholder {
    color: var(--text-1, #b7c2d0);
    opacity: 0.6;
  }

  /* Actions row */
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  /* Buttons */
  .btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.6rem 1.4rem;
    border: 1px solid var(--accent, #60a5fa);
    border-radius: 999px;
    background: transparent;
    color: var(--accent, #60a5fa);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.15s, color 0.15s;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent, #60a5fa);
    color: var(--bg-0, #0c1118);
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.6rem 1.4rem;
    border: 1px solid var(--stroke, #2d3e50);
    border-radius: 999px;
    background: transparent;
    color: var(--text-1, #b7c2d0);
    font-size: 0.95rem;
    cursor: pointer;
    text-decoration: none;
    transition: border-color 0.15s, color 0.15s;
  }

  .btn-secondary:hover {
    border-color: var(--text-1, #b7c2d0);
    color: var(--text-0, #edf2f7);
  }

  .btn-link {
    margin-top: 1rem;
    border: none;
    background: transparent;
    color: var(--text-1, #b7c2d0);
    font-size: 0.85rem;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .btn-link:hover {
    color: var(--accent, #60a5fa);
  }

  /* Turnstile */
  .turnstile-container {
    display: flex;
    justify-content: center;
    min-height: 70px;
    margin-top: 0.5rem;
  }

  /* Spinner */
  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--stroke, #2d3e50);
    border-top-color: var(--accent, #60a5fa);
    border-radius: 50%;
    margin: 0 auto 1rem;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .elapsed {
    color: var(--text-1, #b7c2d0);
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem;
    margin: 0.5rem 0 0;
  }

  /* Success / Error icons */
  .success-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto 0.75rem;
    border-radius: 50%;
    border: 2px solid var(--accent, #60a5fa);
    color: var(--accent, #60a5fa);
    font-size: 1.6rem;
    line-height: 44px;
    text-align: center;
  }

  .error-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto 0.75rem;
    border-radius: 50%;
    border: 2px solid #e05252;
    color: #e05252;
    font-size: 1.6rem;
    font-weight: 700;
    line-height: 44px;
    text-align: center;
  }

  .error-message {
    color: #e05252;
    font-size: 0.9rem;
    line-height: 1.5;
    margin: 0 0 1rem;
  }
</style>
