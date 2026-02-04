<script lang="ts">
  import { onMount } from 'svelte';

  const SESSION_STORAGE_KEY = 'portfolio_chat_session_id';

  let open = false;
  let sessionId: string | null = null;

  function ensureSessionId(): string {
    if (typeof window === 'undefined') return '';
    try {
      let id = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(SESSION_STORAGE_KEY, id);
      }
      return id;
    } catch {
      return crypto.randomUUID();
    }
  }

  onMount(() => {
    sessionId = ensureSessionId();
  });

  function toggle() {
    open = !open;
  }
</script>

<div class="chatbot-wrap" data-open={open}>
  <button
    type="button"
    class="mushroom-trigger"
    onclick={toggle}
    aria-label={open ? 'Close chat' : 'Open chat'}
    aria-expanded={open}
  >
    <span class="mushroom-cap" aria-hidden="true"></span>
    <span class="mushroom-stem" aria-hidden="true"></span>
  </button>

  {#if open}
    <aside class="chat-panel">
      <div class="chat-panel-header">
        <span>Chat</span>
        <button type="button" class="close-btn" onclick={toggle} aria-label="Close">×</button>
      </div>
      <div class="chat-panel-body">
        <p class="placeholder">
          Backend not connected yet. Session: {sessionId?.slice(0, 8) ?? '…'}…
        </p>
        <p class="hint">Turnstile + Lambda + Gemini will plug in here.</p>
      </div>
    </aside>
  {/if}
</div>

<style>
  .chatbot-wrap {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    z-index: 1000;
    display: flex;
    align-items: flex-end;
    gap: 0;
  }

  .mushroom-trigger {
    --cap-w: 56px;
    --cap-h: 36px;
    --stem-w: 24px;
    --stem-h: 28px;
    position: relative;
    width: var(--cap-w);
    height: calc(var(--cap-h) + var(--stem-h));
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    display: block;
  }

  .mushroom-cap {
    position: absolute;
    left: 50%;
    bottom: var(--stem-h);
    transform: translateX(-50%);
    width: var(--cap-w);
    height: var(--cap-h);
    background: radial-gradient(ellipse 80% 60% at 50% 40%, #c4b5a0, #8b7355 40%, #5c4a3a);
    border-radius: 50% 50% 45% 45%;
    box-shadow:
      inset 2px 2px 4px rgba(255, 255, 255, 0.15),
      2px 4px 8px rgba(0, 0, 0, 0.3);
  }

  .mushroom-stem {
    position: absolute;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    width: var(--stem-w);
    height: var(--stem-h);
    background: linear-gradient(90deg, #d4c4a8, #b8a88c);
    border-radius: 0 0 6px 6px;
    box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.2);
  }

  .mushroom-trigger:hover .mushroom-cap {
    filter: brightness(1.08);
  }

  .chat-panel {
    width: 320px;
    max-width: calc(100vw - 2rem);
    height: 420px;
    max-height: 60vh;
    background: var(--color-surface, #1a1a18);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    margin-right: 0.5rem;
    overflow: hidden;
  }

  .chat-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    font-weight: 600;
    font-size: 0.95rem;
  }

  .close-btn {
    padding: 0.25rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--color-muted, #8b8685);
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    border-radius: 4px;
  }

  .close-btn:hover {
    color: var(--color-text, #e8e6e3);
    background: rgba(255, 255, 255, 0.06);
  }

  .chat-panel-body {
    flex: 1;
    padding: 1rem;
    overflow: auto;
  }

  .placeholder {
    color: var(--color-muted, #8b8685);
    font-size: 0.9rem;
    margin: 0 0 0.5rem 0;
  }

  .hint {
    font-size: 0.8rem;
    color: var(--color-accent-dim, #5a7350);
    margin: 0;
  }
</style>
