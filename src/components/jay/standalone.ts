import {mount} from "svelte";
import Jay from "./Jay.svelte";

const MOUNT_ID = "jay-root";

function init() {
  if (document.getElementById(MOUNT_ID)) return;
  const container = document.createElement("div");
  container.id = MOUNT_ID;
  document.body.appendChild(container);
  mount(Jay, {target: container});
}

function scheduleInit() {
  const run = () => {
    if (document.visibilityState === "hidden") return;
    init();
  };

  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    (window as Window & {requestIdleCallback: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number})
      .requestIdleCallback(() => run(), {timeout: 3000});
    return;
  }

  window.setTimeout(run, 300);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleInit);
} else {
  scheduleInit();
}
