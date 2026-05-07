<script lang="ts">
  import type {ChatMessage as ChatMsg, CurrentPage} from "./types.js";
  import {getConversationId, resetConversationId, loadUIState, saveUIState, getSessionToken, getSessionExpiresAt, saveSessionToken, clearSessionToken, loadMessages, saveMessages} from "./session.js";
  import {sendMessage, isLiveMode} from "./api-client.js";
  import {loadTurnstileScript, renderTurnstile} from "../../lib/turnstile.js";
  import ChatMessage from "./ChatMessage.svelte";
  import ChatInput from "./ChatInput.svelte";

  interface SessionTokenResponse {
    sessionToken: string;
    expiresAt?: number;
  }

  interface PendingChatRequest {
    conversationId: string;
    currentPage: CurrentPage;
    messages: ChatMsg[];
    sessionRefreshCount: number;
  }

  function getCurrentPage(): CurrentPage {
    if (typeof document === "undefined") return {title: "", path: ""};
    const raw = document.title;
    const sep = raw.indexOf(" | ");
    return {
      title: sep > 0 ? raw.slice(0, sep) : raw,
      path: window.location.pathname,
    };
  }
  const jayPortraitSrc = "/images/jay_cropped.png";

  const SITE_KEY: string | undefined =
    typeof import.meta !== "undefined"
      ? (import.meta as Record<string, any>).env?.PUBLIC_TURNSTILE_SITE_KEY
      : undefined;

  const needsVerification = isLiveMode() && !!SITE_KEY;

  let messages: ChatMsg[] = $state([]);
  let isOpen = $state(false);
  let draftText = $state("");
  let isSending = $state(false);
  let panelEl: HTMLElement | undefined = $state();
  let messagesEl: HTMLElement | undefined = $state();
  let inputRef: ChatInput | undefined = $state();
  let fabEl: HTMLButtonElement | undefined = $state();
  let conversationId = $state("");

  let abortController: AbortController | null = $state(null);
  let sessionToken = $state("");
  let sessionExpiresAt = $state(0);
  let verified = $state(!needsVerification);
  let verifying = $state(false);
  let verifyError = $state("");
  let verifyPrompt = $state("Quick verification to start chatting.");
  let shouldRenderTurnstile = $state(needsVerification);
  let pendingRequest: PendingChatRequest | null = $state(null);
  let turnstileEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    conversationId = getConversationId();
    const saved = loadUIState();
    isOpen = saved.isOpen;
    draftText = saved.draftText;
    messages = loadMessages();

    const stored = getSessionToken();
    if (stored && needsVerification) {
      const storedExpiresAt = getSessionExpiresAt() || parseJwtExpiry(stored);
      if (storedExpiresAt && storedExpiresAt <= nowInSeconds()) {
        clearSessionToken();
      } else {
        sessionToken = stored;
        sessionExpiresAt = storedExpiresAt;
        verified = true;
        if (storedExpiresAt) {
          saveSessionToken(stored, storedExpiresAt);
        }
      }
    }
  });

  $effect(() => {
    saveUIState({isOpen, draftText});
  });

  $effect(() => {
    saveMessages(messages);
  });

  $effect(() => {
    if (isOpen && verified && inputRef) {
      inputRef.focus();
    }
  });

  $effect(() => {
    if (isOpen && !verified && turnstileEl && shouldRenderTurnstile && !verifying) {
      shouldRenderTurnstile = false;
      void initTurnstile();
    }
  });

  function nowInSeconds(): number {
    return Math.floor(Date.now() / 1000);
  }

  function parseJwtExpiry(token: string): number {
    try {
      const [, payload] = token.split(".");
      if (!payload || typeof atob === "undefined") return 0;
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
      const claims = JSON.parse(atob(padded));
      return typeof claims.exp === "number" ? claims.exp : 0;
    } catch {
      return 0;
    }
  }

  function hasActiveSession(): boolean {
    if (!needsVerification) return true;
    if (!sessionToken) return false;
    return sessionExpiresAt === 0 || nowInSeconds() < sessionExpiresAt;
  }

  function isAuthError(err: unknown): boolean {
    return err instanceof Error && (err.message.includes("401") || err.message.includes("403"));
  }

  function clearVerifiedSession() {
    clearSessionToken();
    sessionToken = "";
    sessionExpiresAt = 0;
    verified = false;
  }

  function queueVerification(prompt: string, request?: PendingChatRequest) {
    if (request) {
      pendingRequest = request;
    }
    verifyPrompt = prompt;
    verifyError = "";
    clearVerifiedSession();
    shouldRenderTurnstile = true;
    if (turnstileEl) {
      turnstileEl.innerHTML = "";
    }
  }

  async function refreshToken(container: HTMLElement): Promise<SessionTokenResponse> {
    await loadTurnstileScript();
    const cfToken = await renderTurnstile(container, SITE_KEY);
    const res = await fetch(
      `${(import.meta as Record<string, any>).env?.PUBLIC_AWS_SERVERLESS_API}/v1/session/turnstile-verify`,
      {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          turnstileToken: cfToken,
          action: "chat",
          clientNonce: crypto.randomUUID(),
        }),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? body.error ?? `Verification failed: ${res.status}`);
    }
    const session = await res.json() as SessionTokenResponse;
    saveSessionToken(session.sessionToken, session.expiresAt ?? 0);
    return session;
  }

  async function initTurnstile() {
    verifying = true;
    verifyError = "";
    try {
      const session = await refreshToken(turnstileEl!);
      sessionToken = session.sessionToken;
      sessionExpiresAt = session.expiresAt ?? parseJwtExpiry(session.sessionToken);
      verified = true;
      verifyPrompt = "Quick verification to start chatting.";

      const queued = pendingRequest;
      if (queued) {
        pendingRequest = null;
        await deliverPendingRequest(queued);
      }
    } catch (err: any) {
      verifyError = err.message ?? "Verification failed. Please try again.";
    } finally {
      verifying = false;
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  function generateMsgId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function deliverPendingRequest(request: PendingChatRequest) {
    isSending = true;
    abortController = new AbortController();
    scrollToBottom();

    try {
      const response = await sendMessage(
        request.conversationId,
        request.currentPage,
        request.messages,
        sessionToken,
        abortController.signal,
      );
      const botMsg: ChatMsg = {
        id: generateMsgId(),
        role: "model",
        text: response.reply,
        timestamp: Date.now(),
        parts: response.modelParts,
      };
      messages = [...messages, botMsg];
    } catch (err) {
      if ((err as Error).name === "AbortError") return;

      if (isAuthError(err) && needsVerification && request.sessionRefreshCount < 1) {
        queueVerification(
          "Session expired. Complete verification to continue where you left off.",
          {...request, sessionRefreshCount: request.sessionRefreshCount + 1},
        );
        return;
      }

      if (isAuthError(err) && needsVerification) {
        clearVerifiedSession();
      }

      const errMsg: ChatMsg = {
        id: generateMsgId(),
        role: "model",
        text: isAuthError(err)
          ? "Session expired — please verify again to continue."
          : "Sorry, something went wrong. Please try again.",
        timestamp: Date.now(),
      };
      messages = [...messages, errMsg];
    } finally {
      abortController = null;
      isSending = false;
      scrollToBottom();
    }
  }

  async function handleSubmit(text: string) {
    if (isSending) return;

    const userMsg: ChatMsg = {id: generateMsgId(), role: "user", text, timestamp: Date.now()};
    const nextMessages = [...messages, userMsg];
    messages = nextMessages;
    draftText = "";
    scrollToBottom();

    const request: PendingChatRequest = {
      conversationId,
      currentPage: getCurrentPage(),
      messages: nextMessages,
      sessionRefreshCount: 0,
    };

    if (needsVerification && !hasActiveSession()) {
      queueVerification(
        "Session expired. Complete verification to continue where you left off.",
        request,
      );
      return;
    }

    await deliverPendingRequest(request);
  }

  function newChat() {
    if (isSending) return;
    abortController?.abort();
    pendingRequest = null;
    conversationId = resetConversationId();
    messages = [];
    verifyError = "";
    verifyPrompt = "Quick verification to start chatting.";
    if (!verified && needsVerification) {
      shouldRenderTurnstile = true;
    }
  }

  function toggle() {
    const wasOpen = isOpen;
    isOpen = !isOpen;
    if (wasOpen) fabEl?.focus();
  }

  function handlePanelKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      isOpen = false;
      fabEl?.focus();
    }
  }

  function trapFocus(e: KeyboardEvent) {
    if (e.key !== "Tab" || !panelEl) return;
    const focusable = panelEl.querySelectorAll<HTMLElement>(
      'button, input, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

<div class="jay-root">
  {#if isOpen}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="panel"
      bind:this={panelEl}
      role="dialog"
      aria-label="Jay chat"
      tabindex="-1"
      onkeydown={(e) => { handlePanelKeydown(e); trapFocus(e); }}
    >
      <header class="panel-header">
        <button class="header-btn" onclick={newChat} disabled={isSending} aria-label="New chat" title="New chat">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-3.2-6.86"/><polyline points="21 3 21 9 15 9"/>
          </svg>
        </button>
        <button class="header-btn" onclick={toggle} aria-label="Close chat">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6 6 18"/><path d="M6 6 18 18"/>
          </svg>
        </button>
      </header>

      {#if !verified}
        <div class="verify-section">
          <p class="verify-prompt">{verifyPrompt}</p>
          <div class="turnstile-container" bind:this={turnstileEl}></div>
          {#if verifying}
            <p class="verify-help">Refreshing your chat session...</p>
          {/if}
          {#if verifyError}
            <p class="verify-error">{verifyError}</p>
            <button class="retry-btn" onclick={() => { shouldRenderTurnstile = true; }}>Retry</button>
          {/if}
        </div>
      {:else}
        <div class="messages" bind:this={messagesEl} role="log" aria-live="polite" aria-relevant="additions">
          {#if messages.length === 0}
            <p class="empty-hint">Ask me about Julius's projects!</p>
          {/if}
          {#each messages as msg (msg.id)}
            <ChatMessage message={msg} />
          {/each}
          {#if isSending}
            <div class="msg bot">
              <div class="bubble typing">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
              </div>
            </div>
          {/if}
        </div>

        <ChatInput
          bind:this={inputRef}
          disabled={isSending}
          bind:value={draftText}
          onsubmit={handleSubmit}
          oninput={(t) => { draftText = t; }}
        />
      {/if}
    </div>
  {/if}

  <button class="fab" bind:this={fabEl} onclick={toggle} aria-label={isOpen ? "Close Jay" : "Open Jay"}>
    <img src={jayPortraitSrc} alt="Jay" class="fab-portrait" width="56" height="56" />
  </button>
</div>

<style>
  .jay-root {
    position: fixed;
    bottom: 3.5rem;
    right: 1.25rem;
    z-index: 9999;
    font-family: var(--font-sans, "Manrope", "Segoe UI", sans-serif);
  }

  .fab {
    width: 64px;
    height: 64px;
    border-radius: 10px;
    border: 1px solid var(--accent, #65d9c6);
    background: var(--surface, #1a2330);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    padding: 0;
    overflow: hidden;
  }

  .fab:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
  }

  .fab-portrait {
    border-radius: 8px;
    object-fit: cover;
    pointer-events: none;
  }

  .panel {
    position: absolute;
    bottom: 76px;
    right: 0;
    width: 340px;
    max-height: 480px;
    border-radius: 14px;
    border: 1px solid var(--stroke, #2d3e50);
    background: var(--bg-1, #141b24);
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.35rem;
    padding: 0.45rem 0.6rem;
    border-bottom: 1px solid var(--stroke, #2d3e50);
    background: var(--surface, #1a2330);
  }

  .header-btn {
    background: none;
    border: none;
    color: var(--text-1, #b7c2d0);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
  }

  .header-btn:hover:not(:disabled) {
    color: var(--text-0, #edf2f7);
    background: var(--surface-2, #202c3b);
  }

  .header-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
    min-height: 200px;
    max-height: 340px;
  }

  .msg {
    display: flex;
    margin-bottom: 0.5rem;
  }

  .msg.bot {
    justify-content: flex-start;
  }

  .bubble {
    max-width: 80%;
    padding: 0.5rem 0.75rem;
    border-radius: 12px;
    font-size: 0.85rem;
    line-height: 1.45;
  }

  .bubble.typing {
    background: var(--surface-2, #202c3b);
    display: flex;
    gap: 0.3em;
    padding: 0.65rem 0.85rem;
    border-bottom-left-radius: 4px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-1, #b7c2d0);
    animation: bounce 1.2s infinite;
  }

  .dot:nth-child(2) {
    animation-delay: 0.15s;
  }

  .dot:nth-child(3) {
    animation-delay: 0.3s;
  }

  @keyframes bounce {
    0%, 60%, 100% {
      transform: translateY(0);
      opacity: 0.4;
    }
    30% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }

  .empty-hint {
    color: var(--text-1, #b7c2d0);
    font-size: 0.85rem;
    text-align: center;
    margin-top: 2rem;
    opacity: 0.7;
  }

  .verify-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1.5rem 1rem;
    gap: 0.75rem;
  }

  .verify-prompt {
    color: var(--text-1, #b7c2d0);
    font-size: 0.85rem;
    margin: 0;
  }

  .verify-help {
    color: var(--text-1, #b7c2d0);
    font-size: 0.8rem;
    margin: 0;
    text-align: center;
  }

  .turnstile-container {
    display: flex;
    justify-content: center;
    min-height: 70px;
  }

  .verify-error {
    color: #f87171;
    font-size: 0.8rem;
    margin: 0;
    text-align: center;
  }

  .retry-btn {
    background: var(--surface-2, #202c3b);
    color: var(--text-0, #edf2f7);
    border: 1px solid var(--stroke, #2d3e50);
    border-radius: 6px;
    padding: 0.35rem 0.75rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .retry-btn:hover {
    background: var(--surface, #1a2330);
    border-color: var(--accent, #65d9c6);
  }

  @media (max-width: 420px) {
    .jay-root {
      right: 0.85rem;
      bottom: calc(env(safe-area-inset-bottom) + 0.85rem);
    }

    .fab {
      width: 54px;
      height: 54px;
    }

    .fab-portrait {
      width: 48px;
      height: 48px;
    }

    .panel {
      width: calc(100vw - 2rem);
      right: -0.5rem;
    }
  }
</style>
