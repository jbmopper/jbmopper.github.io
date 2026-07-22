<script lang="ts">
  import {tick} from "svelte";
  import {loadTurnstileScript, renderTurnstile} from "../../lib/turnstile.js";
  import {
    isLiveMode,
    submitIntake,
    verifyTurnstile,
    type IntakeSubmission,
    type IntakeSubmitResponse,
    type OfferInterest,
  } from "./intake-api.js";

  type IntakeStep = "form" | "turnstile" | "submitting" | "success" | "error";

  const SITE_KEY: string | undefined =
    typeof import.meta !== "undefined"
      ? (import.meta as Record<string, any>).env?.PUBLIC_TURNSTILE_SITE_KEY
      : undefined;

  // Must stay one-for-one with the offer cards below. The intake lambda still
  // accepts the retired workflow-diagnostic and implementation-support slugs so
  // any request already in flight keeps validating.
  const offerOptions: Array<{value: OfferInterest; label: string}> = [
    {value: "pilot-sprint", label: "AI Pilot Sprint"},
    {value: "readiness-review", label: "Evaluation & Readiness Review"},
    {value: "not-sure", label: "Not sure yet"},
  ];

  let step: IntakeStep = $state("form");
  let turnstileEl: HTMLDivElement | undefined = $state();
  let alertEl: HTMLDivElement | undefined = $state();
  let pendingSubmission: IntakeSubmission | null = $state(null);
  let submissionResult: IntakeSubmitResponse | null = $state(null);
  let errorMessage = $state("");
  let validationErrors: string[] = $state([]);

  let name = $state("");
  let email = $state("");
  let company = $state("");
  let offerInterest: OfferInterest = $state("pilot-sprint");
  let problemSummary = $state("");
  let consentToContact = $state(false);
  let websiteUrl = $state("");

  $effect(() => {
    if (step === "turnstile" && turnstileEl) {
      completeTurnstileFlow();
    }
  });

  function clean(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  function buildSubmission(): IntakeSubmission {
    return {
      name: name.trim(),
      email: email.trim(),
      company: clean(company),
      offerInterest,
      problemSummary: problemSummary.trim(),
      consentToContact,
      websiteUrl: clean(websiteUrl),
    };
  }

  function validateSubmission(submission: IntakeSubmission): string[] {
    const errors: string[] = [];

    if (submission.name.length < 2) {
      errors.push("Name is required.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submission.email)) {
      errors.push("A valid email is required.");
    }
    if (submission.problemSummary.length < 30) {
      const short = submission.problemSummary.length;
      errors.push(
        `Describe the workflow in at least 30 characters (currently ${short}).`,
      );
    }
    if (!submission.consentToContact) {
      errors.push("Please confirm Julius may contact you about this request.");
    }

    return errors;
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const submission = buildSubmission();
    const errors = validateSubmission(submission);
    validationErrors = errors;
    errorMessage = "";

    if (errors.length > 0) {
      // The submit button is deliberately never disabled, so the alert is the
      // only feedback the visitor gets. Make sure it is where they are looking.
      await tick();
      alertEl?.scrollIntoView({behavior: "smooth", block: "center"});
      alertEl?.focus();
      return;
    }

    pendingSubmission = submission;

    if (!isLiveMode() || !SITE_KEY) {
      await submitWithSession("mock-intake-session-token");
      return;
    }

    step = "turnstile";
  }

  async function completeTurnstileFlow() {
    try {
      await loadTurnstileScript();
      const cfToken = await renderTurnstile(turnstileEl!, SITE_KEY);
      const session = await verifyTurnstile(cfToken);
      await submitWithSession(session.sessionToken);
    } catch (err: any) {
      showError(err.message ?? "Verification failed.");
    }
  }

  async function submitWithSession(sessionToken: string) {
    if (!pendingSubmission) return;

    step = "submitting";
    try {
      submissionResult = await submitIntake(pendingSubmission, sessionToken);
      step = "success";
    } catch (err: any) {
      showError(err.message ?? "Failed to submit intake request.");
    }
  }

  function showError(message: string) {
    errorMessage = message;
    step = "error";
  }

  function retrySubmission() {
    if (!pendingSubmission) {
      step = "form";
      return;
    }

    if (!isLiveMode() || !SITE_KEY) {
      submitWithSession("mock-intake-session-token");
      return;
    }

    step = "turnstile";
  }

  function resetForm() {
    step = "form";
    pendingSubmission = null;
    submissionResult = null;
    errorMessage = "";
    validationErrors = [];
    name = "";
    email = "";
    company = "";
    offerInterest = "pilot-sprint";
    problemSummary = "";
    consentToContact = false;
    websiteUrl = "";
  }
</script>

<div class="consulting-page">
  <section class="consulting-hero" aria-labelledby="consulting-title">
    <h1 id="consulting-title">AI implementation for teams that need more than a demo.</h1>
    <p class="hero-copy">
      I help product, operations, and technology teams identify practical LLM/RAG use cases,
      build evaluated pilots, and prepare AI workflows for secure, measurable deployment.
    </p>
    <div class="hero-actions">
      <a class="btn-primary" href="#intake-form">Start Intake</a>
      <a class="btn-secondary" href="#services">View Services</a>
    </div>
  </section>

  <section class="intro-grid" aria-label="Consulting focus">
    <div>
      <h2>Move from AI curiosity to decision-quality pilots.</h2>
      <p>
        The focus is early implementation: workflow discovery, technical requirements,
        RAG/LLM pilot design, evaluation, governance, and pilot-to-production planning.
      </p>
    </div>
    <ul class="focus-list">
      <li>Internal knowledge assistants and document workflows</li>
      <li>Requirements, Jira, research, and support automation</li>
      <li>RAG over internal sources with quality and cost checks</li>
      <li>Evaluation plans, rollout notes, and production-readiness reviews</li>
    </ul>
  </section>

  <section id="services" class="services" aria-labelledby="services-title">
    <h2 id="services-title">Focused offers</h2>
    <div class="offer-list">
      <article class="offer-row offer-row--primary">
        <div class="offer-marker" aria-hidden="true">1</div>
        <div>
          <span class="offer-meta">Primary offer</span>
          <h3>AI Pilot Sprint</h3>
          <p class="offer-price">
            <strong>$3,500</strong>
            <span>flat &middot; two weeks &middot; fixed scope</span>
          </p>
          <p>
            Turn one well-defined workflow into a working, evaluated prototype in two weeks. We
            will agree on the right source material, success criteria, and review points during
            scoping, so the result supports a clear next-step decision.
          </p>
          <ul class="offer-includes">
            <li>One workflow discovery session</li>
            <li>Working prototype for the selected workflow</li>
            <li>Evaluation set with scored results</li>
            <li>Documented information flow and human-review checkpoints</li>
            <li>Lightweight audit trail</li>
            <li>Production-readiness recommendations</li>
          </ul>
          <p class="offer-note">
            Founding-client rate for the first three engagements, in exchange for a reference.
          </p>
        </div>
      </article>
      <article class="offer-row">
        <div class="offer-marker" aria-hidden="true">2</div>
        <div>
          <h3>Evaluation &amp; Readiness Review</h3>
          <p>
            For teams with an existing AI demo that needs more rigorous validation. I review the
            system for groundedness, failure modes, security, cost, latency, and rollout
            readiness, then identify the most important improvements.
          </p>
        </div>
      </article>
    </div>
  </section>

  <section class="proof" aria-labelledby="proof-title">
    <h2 id="proof-title">Relevant project evidence</h2>
    <div class="proof-links">
      <a href="/observable/projects/resume-generator/">Serverless LLM document workflow</a>
      <a href="/observable/projects/site-chatbot/">Vertex AI RAG chatbot integration</a>
      <a href="/observable/projects/llm-fundamentals/">Transformer and LLM fundamentals</a>
    </div>
  </section>

  <section id="intake-form" class="intake-shell" aria-labelledby="intake-title">
    {#if step === "form"}
      <form class="intake-form" onsubmit={handleSubmit} novalidate>
        <div class="form-header">
          <h2 id="intake-title">Tell me about the workflow.</h2>
          <p>
            Five questions. Enough to decide whether a pilot sprint or a readiness review is the
            right next step &mdash; the rest we can cover on a call.
          </p>
        </div>

        {#if validationErrors.length > 0}
          <div class="form-alert" role="alert" tabindex="-1" bind:this={alertEl}>
            <strong>Check these fields:</strong>
            <ul>
              {#each validationErrors as item}
                <li>{item}</li>
              {/each}
            </ul>
          </div>
        {/if}

        <div class="field-grid">
          <label>
            <span>Name</span>
            <input type="text" autocomplete="name" bind:value={name} required />
          </label>
          <label>
            <span>Email</span>
            <input type="email" autocomplete="email" bind:value={email} required />
          </label>
          <label>
            <span>Company</span>
            <input type="text" autocomplete="organization" bind:value={company} />
          </label>
          <label>
            <span>Offer interest</span>
            <select bind:value={offerInterest}>
              {#each offerOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>
          <label class="wide">
            <span>Problem summary</span>
            <textarea
              bind:value={problemSummary}
              rows="6"
              minlength="30"
              required
              placeholder="What workflow is slow, messy, risky, or hard to scale today? Rough is fine."
            ></textarea>
          </label>
        </div>

        <label class="honeypot" aria-hidden="true" tabindex="-1">
          <span>Website URL</span>
          <input type="text" autocomplete="off" bind:value={websiteUrl} tabindex="-1" />
        </label>

        <label class="consent-row">
          <input type="checkbox" bind:checked={consentToContact} />
          <span>Julius may contact me about this request.</span>
        </label>

        <div class="form-actions">
          <button class="btn-primary" type="submit">Submit Intake</button>
        </div>
      </form>
    {:else if step === "turnstile"}
      <div class="status-panel">
        <h2>Verification</h2>
        <p>Complete the quick verification before sending the intake request.</p>
        <div class="turnstile-container" bind:this={turnstileEl}></div>
      </div>
    {:else if step === "submitting"}
      <div class="status-panel center">
        <div class="spinner" aria-hidden="true"></div>
        <h2>Submitting Intake</h2>
        <p>Sending the request securely.</p>
      </div>
    {:else if step === "success"}
      <div class="status-panel center">
        <div class="success-icon" aria-hidden="true">&#10003;</div>
        <h2>Intake received</h2>
        <p>
          Thanks. I will review the workflow details and follow up by email.
          {#if submissionResult?.submissionId}
            Reference: <span class="submission-id">{submissionResult.submissionId}</span>
          {/if}
        </p>
        <button class="btn-secondary" type="button" onclick={resetForm}>Send another</button>
      </div>
    {:else if step === "error"}
      <div class="status-panel center">
        <div class="error-icon" aria-hidden="true">!</div>
        <h2>Submission failed</h2>
        <p class="error-message">{errorMessage}</p>
        <div class="form-actions">
          <button class="btn-primary" type="button" onclick={retrySubmission}>Try Again</button>
          <button class="btn-secondary" type="button" onclick={() => { step = "form"; }}>Edit Form</button>
        </div>
      </div>
    {/if}
  </section>
</div>

<style>
  .consulting-page {
    display: grid;
    gap: var(--space-5);
  }

  .consulting-hero,
  .intro-grid,
  .services,
  .proof,
  .intake-shell {
    border: 1px solid var(--stroke);
    border-radius: var(--radius-sm);
    background: var(--surface-glass);
    box-shadow: var(--shadow-card);
  }

  .consulting-hero {
    display: grid;
    gap: var(--space-4);
    min-height: clamp(21rem, 42vw, 30rem);
    align-content: end;
    padding: clamp(1.25rem, 4vw, 2.6rem);
    background:
      linear-gradient(135deg, rgba(6, 10, 17, 0.86), rgba(18, 24, 34, 0.78) 58%, rgba(39, 34, 26, 0.72)),
      linear-gradient(45deg, color-mix(in srgb, var(--accent) 24%, transparent), transparent 42%),
      url("/src/content/hero_bg.png") center / cover no-repeat;
    color: #f6f9fc;
  }

  h1,
  h2,
  h3,
  p {
    margin-top: 0;
  }

  h1 {
    max-width: 13ch;
    margin-bottom: 0;
    overflow-wrap: break-word;
    font-size: 4.8rem;
    line-height: 0.98;
    letter-spacing: 0;
  }

  h2 {
    margin-bottom: var(--space-3);
    line-height: var(--heading-leading);
  }

  h3 {
    margin-bottom: var(--space-2);
    line-height: var(--heading-leading);
  }

  .hero-copy {
    max-width: 62ch;
    margin-bottom: 0;
    color: rgba(246, 249, 252, 0.88);
    font-size: clamp(1rem, 2vw, 1.2rem);
    line-height: 1.65;
  }

  .hero-actions,
  .form-actions,
  .proof-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .intro-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(18rem, 0.95fr);
    gap: var(--space-5);
    padding: clamp(1.15rem, 3vw, 1.8rem);
  }

  .intro-grid p,
  .services p,
  .intake-form p,
  .status-panel p {
    color: var(--text-1);
    line-height: var(--prose-leading);
  }

  .focus-list {
    display: grid;
    gap: var(--space-3);
    align-content: center;
    margin: 0;
    padding-left: var(--list-indent);
    color: var(--text-1);
    line-height: 1.6;
  }

  .focus-list li::marker {
    color: var(--accent);
  }

  .services,
  .proof,
  .intake-shell {
    padding: clamp(1.15rem, 3vw, 1.8rem);
  }

  .offer-list {
    display: grid;
    gap: var(--space-3);
  }

  .offer-row {
    display: grid;
    grid-template-columns: 2.2rem minmax(0, 1fr);
    gap: var(--space-3);
    align-items: start;
    padding: 0 0 var(--space-3);
    border-bottom: 1px solid var(--stroke);
  }

  .offer-row:last-child {
    padding-bottom: 0;
    border-bottom: 0;
  }

  .offer-row--primary h3 {
    color: var(--accent);
  }

  .offer-marker {
    display: grid;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border: 1px solid var(--stroke);
    border-radius: 50%;
    color: var(--text-1);
    font-size: 0.86rem;
    font-weight: 700;
  }

  .offer-meta {
    display: block;
    margin-bottom: 0.25rem;
    color: var(--text-2);
    font-size: 0.82rem;
    font-weight: 700;
  }

  .offer-price {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem 0.6rem;
    align-items: baseline;
    margin-bottom: var(--space-2);
  }

  .offer-price strong {
    color: var(--accent);
    font-size: 1.5rem;
    line-height: 1.1;
  }

  .offer-price span {
    color: var(--text-2);
    font-size: 0.88rem;
  }

  .offer-includes {
    display: grid;
    gap: 0.35rem;
    margin: 0 0 var(--space-2);
    padding-left: var(--list-indent);
    color: var(--text-1);
    font-size: 0.94rem;
    line-height: 1.5;
  }

  .offer-includes li::marker {
    color: var(--accent);
  }

  .offer-note {
    margin-bottom: 0;
    color: var(--text-2);
    font-size: 0.88rem;
  }

  .proof-links a {
    display: inline-flex;
    min-height: 2.4rem;
    align-items: center;
    padding: 0.55rem 0.8rem;
    border: 1px solid var(--stroke);
    border-radius: var(--radius-sm);
    color: var(--accent);
    text-decoration: none;
  }

  .proof-links a:hover {
    border-color: var(--accent);
    color: var(--text-0);
  }

  .intake-form {
    display: grid;
    gap: var(--space-4);
  }

  .form-header {
    max-width: var(--prose-max-wide);
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }

  label {
    display: grid;
    gap: 0.4rem;
    color: var(--text-0);
    font-size: 0.92rem;
    font-weight: 700;
  }

  label.wide {
    grid-column: 1 / -1;
  }

  input,
  textarea,
  select {
    width: 100%;
    border: 1px solid var(--stroke);
    border-radius: var(--radius-sm);
    background: var(--bg-1);
    color: var(--text-0);
    font: inherit;
    font-weight: 400;
  }

  input,
  select {
    min-height: 2.65rem;
    padding: 0 0.75rem;
  }

  textarea {
    min-height: 5.6rem;
    padding: 0.75rem;
    line-height: 1.55;
    resize: vertical;
  }

  input:focus,
  textarea:focus,
  select:focus {
    border-color: var(--accent);
    outline: none;
  }

  textarea::placeholder,
  input::placeholder {
    color: var(--text-2);
    opacity: 0.9;
  }

  .honeypot {
    position: absolute;
    left: -10000px;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }

  .consent-row {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    font-weight: 500;
    color: var(--text-1);
  }

  .consent-row input {
    width: 1rem;
    min-height: 1rem;
    margin-top: 0.25rem;
  }

  .form-alert {
    padding: 0.8rem 1rem;
    border: 1px solid color-mix(in srgb, #e05252 75%, var(--stroke));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, #e05252 10%, transparent);
    color: var(--text-0);
  }

  .form-alert ul {
    margin: 0.45rem 0 0;
    padding-left: var(--list-indent);
    color: var(--text-1);
  }

  .status-panel {
    display: grid;
    gap: var(--space-3);
    justify-items: start;
    min-height: 18rem;
    align-content: center;
  }

  .status-panel.center {
    justify-items: center;
    text-align: center;
  }

  .turnstile-container {
    min-height: 70px;
  }

  .btn-primary,
  .btn-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.5rem;
    padding: 0.6rem 1rem;
    border-radius: var(--radius-sm);
    font: inherit;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
  }

  .btn-primary {
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--bg-0);
  }

  .btn-primary:hover:not(:disabled) {
    border-color: var(--text-0);
    background: var(--text-0);
  }

  .btn-primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn-secondary {
    border: 1px solid var(--stroke);
    background: color-mix(in srgb, var(--surface) 72%, transparent);
    color: var(--text-0);
  }

  .btn-secondary:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .spinner {
    width: 42px;
    height: 42px;
    border: 3px solid var(--stroke);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .success-icon,
  .error-icon {
    display: grid;
    width: 3rem;
    height: 3rem;
    place-items: center;
    border-radius: 50%;
    font-size: 1.6rem;
    font-weight: 700;
  }

  .success-icon {
    border: 2px solid var(--accent);
    color: var(--accent);
  }

  .error-icon {
    border: 2px solid #e05252;
    color: #e05252;
  }

  .error-message {
    color: #e05252;
  }

  .submission-id {
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 860px) {
    .intro-grid,
    .field-grid {
      grid-template-columns: 1fr;
    }

    h1 {
      max-width: 100%;
      font-size: 3.2rem;
    }
  }

  @media (max-width: 520px) {
    .consulting-hero {
      min-height: 27rem;
    }

    h1 {
      font-size: 2.35rem;
    }

    .offer-row {
      grid-template-columns: 1.85rem minmax(0, 1fr);
    }

    .offer-marker {
      width: 1.85rem;
      height: 1.85rem;
    }
  }
</style>
