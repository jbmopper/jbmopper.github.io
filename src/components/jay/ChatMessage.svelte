<script lang="ts">
  import type {ChatMessage} from "./types.js";

  interface Props {
    message: ChatMessage;
  }

  let {message}: Props = $props();
  const isBot = $derived(message.role === "model");
</script>

<div class="msg" class:bot={isBot} class:user={!isBot}>
  <div class="bubble">{message.text}</div>
</div>

<style>
  .msg {
    display: flex;
    margin-bottom: 0.5rem;
  }

  .msg.user {
    justify-content: flex-end;
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
    word-break: break-word;
  }

  .user .bubble {
    background: var(--accent, #65d9c6);
    color: var(--bg-0, #0c1118);
    border-bottom-right-radius: 4px;
  }

  .bot .bubble {
    background: var(--surface-2, #202c3b);
    color: var(--text-0, #edf2f7);
    border-bottom-left-radius: 4px;
  }
</style>
