<script lang="ts">
  import {onMount} from "svelte";

  type ThemeName = "paper" | "terminal" | "blueprint" | "riso";
  type ThemeMode = "light" | "dark";

  type ThemeDef = {
    id: ThemeName;
    label: string;
    /** Swatch fill — uses the palette's accent for that theme/light. */
    swatch: string;
    /** Swatch border — uses the palette's fg for that theme/light. */
    border: string;
  };

  // Swatch colors are intentionally hard-coded here and not pulled from the
  // active theme's CSS variables — each swatch needs to advertise its OWN
  // palette regardless of which theme is currently active.
  const themes: ThemeDef[] = [
    {id: "paper",     label: "Paper",     swatch: "#C8302C", border: "#111111"},
    {id: "terminal",  label: "Terminal",  swatch: "#C9F25E", border: "#0A0A0A"},
    {id: "blueprint", label: "Blueprint", swatch: "#4FD1F0", border: "#0E1A2B"},
    {id: "riso",      label: "Riso",      swatch: "#FF3366", border: "#2B2466"}
  ];

  const STORAGE_THEME = "jm:theme";
  const STORAGE_MODE  = "jm:mode";

  let activeTheme = $state<ThemeName>("paper");
  let activeMode  = $state<ThemeMode>("light");
  let mounted     = $state(false);

  function applyToDocument(theme: ThemeName, mode: ThemeMode) {
    const html = document.documentElement;
    html.dataset.theme = theme;
    html.dataset.mode  = mode;
  }

  function persist(theme: ThemeName, mode: ThemeMode) {
    try {
      localStorage.setItem(STORAGE_THEME, theme);
      localStorage.setItem(STORAGE_MODE, mode);
    } catch {
      /* localStorage may be disabled (private browsing, embed); fall through */
    }
  }

  function selectTheme(theme: ThemeName) {
    activeTheme = theme;
    applyToDocument(theme, activeMode);
    persist(theme, activeMode);
  }

  function toggleMode() {
    activeMode = activeMode === "light" ? "dark" : "light";
    applyToDocument(activeTheme, activeMode);
    persist(activeTheme, activeMode);
  }

  onMount(() => {
    // The inline <head> script in BaseLayout has already set data-theme/data-mode
    // on <html> from localStorage / prefers-color-scheme. Read those values
    // back so the controls reflect the actual rendered state.
    const html = document.documentElement;
    const t = (html.dataset.theme as ThemeName) || "paper";
    const m = (html.dataset.mode  as ThemeMode) || "light";
    activeTheme = t;
    activeMode  = m;
    mounted = true;
  });
</script>

<div class="theme-switcher" role="group" aria-label="Theme controls">
  <div class="palette" role="radiogroup" aria-label="Color palette">
    {#each themes as t}
      <button
        type="button"
        class="swatch"
        class:is-active={mounted && activeTheme === t.id}
        role="radio"
        aria-checked={mounted && activeTheme === t.id}
        aria-label={`${t.label} palette`}
        title={t.label}
        style:--swatch-fill={t.swatch}
        style:--swatch-border={t.border}
        onclick={() => selectTheme(t.id)}
      ></button>
    {/each}
  </div>

  <button
    type="button"
    class="mode-toggle"
    onclick={toggleMode}
    aria-label={`Switch to ${activeMode === "light" ? "dark" : "light"} mode`}
    title={`Switch to ${activeMode === "light" ? "dark" : "light"} mode`}
  >
    {mounted ? (activeMode === "light" ? "LIGHT" : "DARK") : "·····"}
  </button>
</div>

<style>
  .theme-switcher {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
  }

  .palette {
    display: inline-flex;
    gap: var(--space-2);
  }

  .swatch {
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1.5px solid var(--swatch-border, var(--rule));
    border-radius: var(--radius);
    background: var(--swatch-fill, var(--accent));
    cursor: pointer;
    transition: var(--transition-press);
  }

  .swatch:hover {
    transform: translateY(-1px);
  }

  .swatch:active {
    transform: translateY(var(--press-shift));
    box-shadow: var(--press-shadow);
  }

  .swatch.is-active {
    outline: 2px solid var(--swatch-fill, var(--accent));
    outline-offset: 2px;
  }

  .swatch:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  .mode-toggle {
    min-width: 4.5rem;
    padding: var(--inset-control);
    border: var(--rule-w) solid var(--rule);
    border-radius: var(--radius-md);
    background: var(--bg-alt, var(--bg));
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: var(--fs-label);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    cursor: pointer;
    transition: var(--transition-press);
  }

  .mode-toggle:hover {
    background: var(--hover-bg);
    border-color: var(--accent);
  }

  .mode-toggle:active {
    transform: translateY(var(--press-shift));
    box-shadow: var(--press-shadow);
    background: var(--hover-bg-strong);
  }

  .mode-toggle:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .swatch,
    .mode-toggle {
      transition: none;
    }

    .swatch:hover,
    .swatch:active,
    .mode-toggle:active {
      transform: none;
    }
  }
</style>
