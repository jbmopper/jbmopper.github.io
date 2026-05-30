<script lang="ts">
  interface Props {
    disabled?: boolean;
    value?: string;
    onsubmit: (text: string) => void;
    oninput?: (text: string) => void;
  }

  let {disabled = false, value = $bindable(""), onsubmit, oninput}: Props = $props();

  let inputEl: HTMLInputElement | undefined = $state();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && value.trim()) {
      e.preventDefault();
      onsubmit(value.trim());
    }
  }

  function handleClick() {
    if (value.trim()) onsubmit(value.trim());
  }

  export function focus() {
    inputEl?.focus();
  }
</script>

<div class="input-row" role="form" aria-label="Send a message to the AI helper">
  <input
    bind:this={inputEl}
    type="text"
    placeholder="Ask the site AI..."
    {disabled}
    bind:value
    oninput={() => oninput?.(value)}
    onkeydown={handleKeydown}
    aria-label="Chat message"
  />
  <button onclick={handleClick} {disabled} aria-label="Send message">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 2 11 13"/>
      <path d="M22 2 15 22 11 13 2 9z"/>
    </svg>
  </button>
</div>

<style>
  .input-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2.4rem;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.55rem;
    border-top: 1px solid var(--stroke, #2d3e50);
    background: var(--bg-1, #141b24);
    box-sizing: border-box;
  }

  input {
    width: 100%;
    min-width: 0;
    height: 2.35rem;
    background: var(--bg-0, #0c1118);
    color: var(--text-0, #edf2f7);
    border: 1px solid var(--stroke, #2d3e50);
    border-radius: 8px;
    padding: 0.45rem 0.65rem;
    font-size: 0.85rem;
    font-family: var(--font-sans, sans-serif);
    outline: none;
    box-sizing: border-box;
  }

  input:focus {
    border-color: var(--accent, #60a5fa);
  }

  input::placeholder {
    color: var(--text-1, #b7c2d0);
    opacity: 0.6;
  }

  button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.4rem;
    height: 2.4rem;
    border: none;
    border-radius: 8px;
    background: var(--accent, #60a5fa);
    color: var(--bg-0, #0c1118);
    cursor: pointer;
    box-sizing: border-box;
  }

  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  button:not(:disabled):hover {
    filter: brightness(1.1);
  }
</style>
