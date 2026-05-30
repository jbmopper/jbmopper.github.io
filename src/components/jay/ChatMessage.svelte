<script lang="ts">
  import type {ChatMessage} from "./types.js";
  import {Marked, Renderer} from "marked";

  interface Props {
    message: ChatMessage;
  }

  let {message}: Props = $props();
  const isModel = $derived(message.role === "model");

  function escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function isSafeUrl(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
      return true;
    }

    try {
      const url = new URL(trimmed);
      return ["http:", "https:", "mailto:"].includes(url.protocol);
    } catch {
      return false;
    }
  }

  const renderer = new Renderer();
  renderer.html = ({text}: {text: string}) => escapeHtml(text);
  renderer.link = function (this: any, {href, title, tokens}: any) {
    const label = this.parser.parseInline(tokens);
    if (!isSafeUrl(href)) return label;

    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noreferrer">${label}</a>`;
  };
  renderer.image = function (this: any, {href, title, text, tokens}: any) {
    const altText = tokens ? this.parser.parseInline(tokens, this.parser.textRenderer) : text;
    if (!isSafeUrl(href)) return escapeHtml(altText);

    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    return `<img src="${escapeHtml(href)}" alt="${escapeHtml(altText)}"${titleAttr}>`;
  };

  const md = new Marked({gfm: true, breaks: true, renderer});

  const html = $derived(
    isModel ? (md.parse(message.text) as string) : "",
  );
</script>

<div class="msg" class:bot={isModel} class:user={!isModel} aria-label={isModel ? "AI helper said" : "You said"}>
  <div class="speaker">{isModel ? "AI helper" : "You"}</div>
  {#if isModel}
    <div class="bubble markdown">{@html html}</div>
  {:else}
    <div class="bubble">{message.text}</div>
  {/if}
</div>

<style>
  .msg {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }

  .msg.user {
    align-items: flex-end;
  }

  .msg.bot {
    align-items: flex-start;
  }

  .speaker {
    padding: 0 0.18rem;
    color: var(--text-2, #8091a0);
    font-size: 0.65rem;
    font-weight: 800;
    letter-spacing: 0;
    line-height: 1;
    text-transform: uppercase;
  }

  .user .speaker {
    color: color-mix(in srgb, var(--accent, #60a5fa) 78%, var(--text-0, #edf2f7));
  }

  .bubble {
    max-width: min(82%, 28rem);
    padding: 0.5rem 0.75rem;
    border-radius: 12px;
    font-size: 0.85rem;
    line-height: 1.45;
    word-break: break-word;
  }

  .user .bubble {
    background: var(--accent, #60a5fa);
    color: var(--bg-0, #0c1118);
    border-bottom-right-radius: 4px;
  }

  .bot .bubble {
    background: var(--surface-2, #202c3b);
    color: var(--text-0, #edf2f7);
    border-bottom-left-radius: 4px;
  }

  .markdown :global(p) {
    margin: 0 0 0.4em;
  }

  .markdown :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown :global(ul),
  .markdown :global(ol) {
    margin: 0.2em 0 0.4em;
    padding-left: 1.3em;
  }

  .markdown :global(li) {
    margin-bottom: 0.15em;
  }

  .markdown :global(code) {
    font-size: 0.8em;
    background: rgba(255, 255, 255, 0.08);
    padding: 0.1em 0.3em;
    border-radius: 3px;
  }

  .markdown :global(pre) {
    background: rgba(0, 0, 0, 0.3);
    padding: 0.5em 0.6em;
    border-radius: 6px;
    overflow-x: auto;
    margin: 0.3em 0;
  }

  .markdown :global(pre code) {
    background: none;
    padding: 0;
  }

  .markdown :global(strong) {
    font-weight: 600;
  }

  .markdown :global(a) {
    color: var(--accent, #60a5fa);
    text-decoration: underline;
  }
</style>
