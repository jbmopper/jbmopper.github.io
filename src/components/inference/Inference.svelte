<script lang="ts">
  import { loadTurnstileScript, renderTurnstile } from "../../lib/turnstile.js";
  import { verifyTurnstile, SubmitInferenceParams } from "./inference-api.js";
  import { InferenceSseEvent } from "./inference-api.js";

  const SITE_KEY: string | undefined =
    typeof import.meta !== "undefined"
      ? (import.meta as Record<string, any>).env?.PUBLIC_TURNSTILE_SITE_KEY
      : undefined;

  
</script>