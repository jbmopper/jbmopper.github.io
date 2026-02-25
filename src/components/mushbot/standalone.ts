import {mount} from "svelte";
import Mushbot from "./Mushbot.svelte";

const MOUNT_ID = "mushbot-root";

function init() {
  if (document.getElementById(MOUNT_ID)) return;
  const container = document.createElement("div");
  container.id = MOUNT_ID;
  document.body.appendChild(container);
  mount(Mushbot, {target: container});
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
