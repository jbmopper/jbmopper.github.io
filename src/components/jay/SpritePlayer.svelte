<script lang="ts">
  import type {AnimationState, SpriteSheet} from "./types.js";

  interface Props {
    spriteSheet?: SpriteSheet;
    animation?: AnimationState;
    width?: number;
    height?: number;
  }

  let {spriteSheet, animation = "idle", width = 48, height = 48}: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let frameIndex = $state(0);
  let spriteImage: HTMLImageElement | undefined = $state();
  let imageLoaded = $state(false);

  const animDef = $derived(spriteSheet?.animations[animation]);
  const frameCount = $derived(animDef ? animDef.endFrame - animDef.startFrame + 1 : 1);
  const fps = $derived(spriteSheet ? 8 : 1);
  const usePlaceholder = $derived(!spriteSheet || !imageLoaded);

  $effect(() => {
    if (!spriteSheet) {
      spriteImage = undefined;
      imageLoaded = false;
      return;
    }
    const img = new Image();
    img.src = spriteSheet.src;
    img.onload = () => {
      spriteImage = img;
      imageLoaded = true;
    };
  });

  $effect(() => {
    if (usePlaceholder) return;
    frameIndex = 0;
    const interval = setInterval(() => {
      frameIndex = (frameIndex + 1) % frameCount;
    }, 1000 / fps);
    return () => clearInterval(interval);
  });

  $effect(() => {
    if (!canvas || usePlaceholder || !spriteImage || !animDef || !spriteSheet) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const globalFrame = animDef.startFrame + frameIndex;
    const cols = Math.floor(spriteImage.width / spriteSheet.frameWidth);
    const sx = (globalFrame % cols) * spriteSheet.frameWidth;
    const sy = Math.floor(globalFrame / cols) * spriteSheet.frameHeight;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(spriteImage, sx, sy, spriteSheet.frameWidth, spriteSheet.frameHeight, 0, 0, width, height);
  });

  const pulseClass = $derived(
    animation === "thinking" ? "pulse-fast" : animation === "talking" ? "pulse-medium" : ""
  );
</script>

{#if usePlaceholder}
  <div class="placeholder {pulseClass}" style:width="{width}px" style:height="{height}px" role="img" aria-label="AI helper">
    <img src="/sprites/jay-idle.svg" alt="" {width} {height} />
  </div>
{:else}
  <!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
  <canvas bind:this={canvas} {width} {height} aria-label="AI helper"></canvas>
{/if}

<style>
  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .placeholder img {
    display: block;
  }

  .pulse-fast {
    animation: pulse 0.6s ease-in-out infinite alternate;
  }

  .pulse-medium {
    animation: pulse 1s ease-in-out infinite alternate;
  }

  @keyframes pulse {
    from { opacity: 1; }
    to { opacity: 0.6; }
  }
</style>
