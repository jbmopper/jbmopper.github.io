<script lang="ts">
  import type {ChatMessage as ChatMsg, AnimationState} from "./types.js";
  import {getConversationId, loadUIState, saveUIState} from "./session.js";
  import {sendMessage} from "./api-client.js";
  import {getTurnstileToken} from "./turnstile.js";
  import SpritePlayer from "./SpritePlayer.svelte";
  import ChatMessage from "./ChatMessage.svelte";
  import ChatInput from "./ChatInput.svelte";

  let messages: ChatMsg[] = $state([]);
  let isOpen = $state(false);
  let draftText = $state("");
  let isSending = $state(false);
  let animationState: AnimationState = $state("idle");
  let panelEl: HTMLElement | undefined = $state();
  let messagesEl: HTMLElement | undefined = $state();
  let inputRef: ChatInput | undefined = $state();
  let fabEl: HTMLButtonElement | undefined = $state();
  let conversationId = $state("");

  $effect(() => {
    conversationId = getConversationId();
    const saved = loadUIState();
    isOpen = saved.isOpen;
    draftText = saved.draftText;
  });

  $effect(() => {
    saveUIState({isOpen, draftText});
  });

  $effect(() => {
    if (isOpen && inputRef) {
      inputRef.focus();
    }
  });

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  function generateMsgId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function handleSubmit(text: string) {
    if (isSending) return;

    const userMsg: ChatMsg = {id: generateMsgId(), role: "user", text, timestamp: Date.now()};
    messages = [...messages, userMsg];
    draftText = "";
    isSending = true;
    animationState = "thinking";
    scrollToBottom();

    try {
      const token = await getTurnstileToken();
      const response = await sendMessage({
        conversationId,
        message: text,
        turnstileToken: token ?? undefined,
      });
      const botMsg: ChatMsg = {id: generateMsgId(), role: "bot", text: response.reply, timestamp: Date.now()};
      messages = [...messages, botMsg];
      animationState = "talking";
      setTimeout(() => { animationState = "idle"; }, 2000);
    } catch {
      const errMsg: ChatMsg = {
        id: generateMsgId(),
        role: "bot",
        text: "Sorry, something went wrong. Please try again.",
        timestamp: Date.now(),
      };
      messages = [...messages, errMsg];
      animationState = "idle";
    } finally {
      isSending = false;
      scrollToBottom();
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

<div class="mushbot-root">
  {#if isOpen}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="panel"
      bind:this={panelEl}
      role="dialog"
      aria-label="Mushbot chat"
      tabindex="-1"
      onkeydown={(e) => { handlePanelKeydown(e); trapFocus(e); }}
    >
      <header class="panel-header">
        <SpritePlayer animation={animationState} width={32} height={32} />
        <span class="panel-title">Mushy Mushbot</span>
        <button class="close-btn" onclick={toggle} aria-label="Close chat">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6 6 18"/><path d="M6 6 18 18"/>
          </svg>
        </button>
      </header>

      <div class="messages" bind:this={messagesEl} role="log" aria-live="polite" aria-relevant="additions">
        {#if messages.length === 0}
          <p class="empty-hint">Ask me about Julius's projects!</p>
        {/if}
        {#each messages as msg (msg.id)}
          <ChatMessage message={msg} />
        {/each}
      </div>

      <ChatInput
        bind:this={inputRef}
        disabled={isSending}
        bind:value={draftText}
        onsubmit={handleSubmit}
        oninput={(t) => { draftText = t; }}
      />
    </div>
  {/if}

  <button class="fab" bind:this={fabEl} onclick={toggle} aria-label={isOpen ? "Close Mushbot" : "Open Mushbot"}>
    <SpritePlayer animation={animationState} width={40} height={40} />
  </button>
</div>

<style>
  .mushbot-root {
    position: fixed;
    bottom: 1.25rem;
    right: 1.25rem;
    z-index: 9999;
    font-family: var(--font-sans, "Manrope", "Segoe UI", sans-serif);
  }

  .fab {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: 2px solid var(--accent, #65d9c6);
    background: var(--surface, #1a2330);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .fab:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
  }

  .panel {
    position: absolute;
    bottom: 68px;
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
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid var(--stroke, #2d3e50);
    background: var(--surface, #1a2330);
  }

  .panel-title {
    flex: 1;
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--text-0, #edf2f7);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-1, #b7c2d0);
    cursor: pointer;
    padding: 0.2rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
  }

  .close-btn:hover {
    color: var(--text-0, #edf2f7);
    background: var(--surface-2, #202c3b);
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
    min-height: 200px;
    max-height: 340px;
  }

  .empty-hint {
    color: var(--text-1, #b7c2d0);
    font-size: 0.85rem;
    text-align: center;
    margin-top: 2rem;
    opacity: 0.7;
  }

  @media (max-width: 420px) {
    .panel {
      width: calc(100vw - 2rem);
      right: -0.5rem;
    }
  }
</style>
