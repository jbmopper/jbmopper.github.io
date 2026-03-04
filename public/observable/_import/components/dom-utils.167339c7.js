function cleanupNode(node) {
  if (!node) return;
  try {
    const cleanup = node.__cleanup || node.__dispose;
    if (typeof cleanup === "function") cleanup();
  } catch {
    // best-effort cleanup; never block DOM teardown
  }

  if (node.childNodes && node.childNodes.length > 0) {
    for (const child of node.childNodes) cleanupNode(child);
  }
}

export function clearNode(node) {
  while (node.firstChild) {
    cleanupNode(node.firstChild);
    node.removeChild(node.firstChild);
  }
}

function normalizeOptions(options) {
  return (options || []).map((option) => {
    if (option && typeof option === "object" && !Array.isArray(option)) {
      const value = option.value == null ? "" : String(option.value);
      const label = option.label == null ? value : String(option.label);
      return {value, label};
    }
    const value = option == null ? "" : String(option);
    return {value, label: value};
  });
}

function ensureControlStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("ns-obv-control-styles")) return;
  const style = document.createElement("style");
  style.id = "ns-obv-control-styles";
  style.textContent = `
  .ns-obv-control-grid { display: grid; gap: 0.6rem; }
  .ns-obv-control-header { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  .ns-obv-control-title { font-weight: 600; letter-spacing: 0.01em; }
  .ns-obv-control-count { font-variant-numeric: tabular-nums; color: var(--theme-foreground-muted); }
  .ns-obv-control-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .ns-obv-control-button {
    appearance: none;
    border: 1px solid var(--theme-foreground-faint, rgba(255, 255, 255, 0.18));
    background: color-mix(in srgb, var(--theme-background-alt, #101827) 90%, transparent);
    color: var(--theme-foreground);
    border-radius: 9px;
    padding: 0.3rem 0.65rem;
    font-size: 0.82rem;
    line-height: 1.2;
    cursor: pointer;
    transition: border-color 120ms ease, background-color 120ms ease;
  }
  .ns-obv-control-button:hover {
    border-color: var(--theme-foreground-focus);
    background: color-mix(in srgb, var(--theme-foreground-focus) 12%, var(--theme-background-alt, #101827));
  }
  .ns-obv-control-search {
    width: min(28rem, 100%);
    background: color-mix(in srgb, var(--theme-background-alt, #101827) 92%, transparent);
    border: 1px solid var(--theme-foreground-faint, rgba(255, 255, 255, 0.18));
    border-radius: 9px;
    color: var(--theme-foreground);
    padding: 0.42rem 0.58rem;
    font-size: 0.9rem;
  }
  .ns-obv-control-search:focus {
    outline: none;
    border-color: var(--theme-foreground-focus);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-foreground-focus) 32%, transparent);
  }
  .ns-obv-control-select {
    width: min(30rem, 100%);
    max-width: 100%;
    min-width: 16rem;
    border-radius: 9px;
    border: 1px solid var(--theme-foreground-faint, rgba(255, 255, 255, 0.18));
    background: color-mix(in srgb, var(--theme-background-alt, #101827) 92%, transparent);
    color: var(--theme-foreground);
    padding: 0.3rem;
    font-size: 0.9rem;
  }
  .ns-obv-control-select:focus {
    outline: none;
    border-color: var(--theme-foreground-focus);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-foreground-focus) 28%, transparent);
  }
  .ns-obv-inline-control {
    display: grid;
    grid-template-columns: minmax(8rem, auto) minmax(7rem, 1fr) auto;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    max-width: 100%;
    color: var(--theme-foreground);
  }
  .ns-obv-inline-control > span {
    color: var(--theme-foreground-muted);
    font-size: 0.9rem;
    letter-spacing: 0.01em;
  }
  .ns-obv-inline-control-select,
  .ns-obv-inline-control-range {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    border-radius: 9px;
    border: 1px solid var(--theme-foreground-faint, rgba(255, 255, 255, 0.18));
    background: color-mix(in srgb, var(--theme-background-alt, #101827) 92%, transparent);
    color: var(--theme-foreground);
    font-size: 0.9rem;
  }
  .ns-obv-inline-control-select {
    padding: 0.38rem 0.55rem;
  }
  .ns-obv-inline-control-select:focus,
  .ns-obv-inline-control-range:focus {
    outline: none;
    border-color: var(--theme-foreground-focus);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-foreground-focus) 26%, transparent);
  }
  .ns-obv-inline-control-range {
    appearance: none;
    height: 1.7rem;
    padding: 0;
    background: transparent;
    border: none;
    accent-color: var(--theme-foreground-focus);
  }
  .ns-obv-inline-control-range::-webkit-slider-runnable-track {
    height: 0.36rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-foreground-faint) 36%, transparent);
  }
  .ns-obv-inline-control-range::-moz-range-track {
    height: 0.36rem;
    border-radius: 999px;
    border: none;
    background: color-mix(in srgb, var(--theme-foreground-faint) 36%, transparent);
  }
  .ns-obv-inline-control-range::-webkit-slider-thumb {
    appearance: none;
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 999px;
    background: var(--theme-foreground-focus);
    border: 2px solid color-mix(in srgb, var(--theme-background) 88%, transparent);
    margin-top: calc((0.36rem - 0.95rem) / 2);
  }
  .ns-obv-inline-control-range::-moz-range-thumb {
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 999px;
    border: 2px solid color-mix(in srgb, var(--theme-background) 88%, transparent);
    background: var(--theme-foreground-focus);
  }
  .ns-obv-inline-control-output {
    min-width: 5ch;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--theme-foreground);
    font-size: 0.9rem;
  }
  @media (max-width: 920px) {
    .ns-obv-inline-control {
      grid-template-columns: 1fr;
      align-items: stretch;
      gap: 0.4rem;
    }
    .ns-obv-inline-control-output {
      text-align: left;
      min-width: 0;
    }
  }
  .ns-obv-range-window { display: grid; gap: 0.5rem; max-width: min(38rem, 100%); }
  .ns-obv-dual-slider {
    position: relative;
    width: min(34rem, 100%);
    max-width: 100%;
    height: 2.2rem;
    touch-action: none;
  }
  .ns-obv-dual-slider-track {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 0.35rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-foreground-faint, rgba(148, 163, 184, 0.4)) 45%, transparent);
  }
  .ns-obv-dual-slider-fill {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    height: 0.35rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-foreground-focus, #4e79a7) 82%, white 6%);
  }
  .ns-obv-dual-slider-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 2.2rem;
    margin: 0;
    background: transparent;
    pointer-events: none;
    z-index: 2;
    -webkit-appearance: none;
    appearance: none;
  }
  .ns-obv-dual-slider-handle {
    position: absolute;
    top: 50%;
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 999px;
    background: var(--theme-foreground-focus, #4e79a7);
    border: 2px solid color-mix(in srgb, var(--theme-background, #111827) 88%, transparent);
    transform: translate(-50%, -50%);
    pointer-events: auto;
    cursor: pointer;
    z-index: 6;
  }
  .ns-obv-dual-slider-input::-webkit-slider-runnable-track { height: 0.35rem; background: transparent; }
  .ns-obv-dual-slider-input::-moz-range-track { height: 0.35rem; background: transparent; border: none; }
  .ns-obv-dual-slider-input::-webkit-slider-thumb {
    pointer-events: auto;
    -webkit-appearance: none;
    appearance: none;
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 999px;
    background: transparent;
    border: none;
    margin-top: calc((0.35rem - 0.95rem) / 2);
    cursor: pointer;
  }
  .ns-obv-dual-slider-input::-moz-range-thumb {
    pointer-events: auto;
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 999px;
    background: transparent;
    border: none;
    cursor: pointer;
  }
  .ns-obv-range-window-values {
    display: flex;
    justify-content: space-between;
    width: min(34rem, 100%);
    font-variant-numeric: tabular-nums;
    color: var(--theme-foreground-muted);
    font-size: 0.9rem;
  }`;
  document.head.appendChild(style);
}

export function multiSelectControl(labelText, options, initialValues = [], config = {}) {
  ensureControlStyles();
  const normalized = normalizeOptions(options);
  const selected = new Set((initialValues || []).map((value) => String(value)));
  if (selected.size === 0) {
    for (const option of normalized) selected.add(option.value);
  }

  const wrapper = document.createElement("div");
  wrapper.className = "ns-obv-control-grid";

  const header = document.createElement("div");
  header.className = "ns-obv-control-header";
  const title = document.createElement("span");
  title.className = "ns-obv-control-title";
  title.textContent = String(labelText || "Selection");
  const count = document.createElement("output");
  count.className = "ns-obv-control-count";
  header.append(title, count);

  const search = document.createElement("input");
  search.type = "search";
  search.className = "ns-obv-control-search";
  search.placeholder =
    config.searchPlaceholder || `Filter ${String(labelText || "items").toLowerCase()}...`;

  const actions = document.createElement("div");
  actions.className = "ns-obv-control-actions";
  const selectAll = document.createElement("button");
  selectAll.type = "button";
  selectAll.className = "ns-obv-control-button";
  selectAll.textContent = "Select all";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "ns-obv-control-button";
  clear.textContent = "Clear";
  actions.append(selectAll, clear);

  const select = document.createElement("select");
  select.multiple = true;
  select.className = "ns-obv-control-select";
  select.size = Math.max(
    4,
    Math.min(
      Number.isFinite(Number(config.size)) ? Number(config.size) : 10,
      Math.max(4, normalized.length)
    )
  );

  const listeners = new Set();

  function notify() {
    for (const listener of listeners) listener();
  }

  function syncCount() {
    count.textContent = `${selected.size} selected`;
  }

  function rebuild() {
    const query = search.value.trim().toLowerCase();
    clearNode(select);
    for (const optionSpec of normalized) {
      if (query && !optionSpec.label.toLowerCase().includes(query)) continue;
      const option = document.createElement("option");
      option.value = optionSpec.value;
      option.textContent = optionSpec.label;
      option.selected = selected.has(optionSpec.value);
      select.appendChild(option);
    }
    syncCount();
  }

  function applyVisibleSelection() {
    const visible = new Set(Array.from(select.options, (option) => option.value));
    for (const value of visible) selected.delete(value);
    for (const option of Array.from(select.selectedOptions)) selected.add(option.value);
    syncCount();
  }

  select.addEventListener("change", () => {
    applyVisibleSelection();
    notify();
  });
  search.addEventListener("input", rebuild);
  selectAll.addEventListener("click", () => {
    for (const option of normalized) selected.add(option.value);
    rebuild();
    notify();
  });
  clear.addEventListener("click", () => {
    selected.clear();
    rebuild();
    notify();
  });

  wrapper.append(header, search, actions, select);
  rebuild();

  return {
    node: wrapper,
    getSelected() {
      return normalized
        .map((option) => option.value)
        .filter((value) => selected.has(value));
    },
    setSelected(values = []) {
      selected.clear();
      for (const value of values) selected.add(String(value));
      rebuild();
      notify();
    },
    onChange(handler) {
      if (typeof handler === "function") listeners.add(handler);
    }
  };
}

export function rangeWindowControl(labelText, min, max, step, startValue, endValue, config = {}) {
  ensureControlStyles();
  const lo = Number.isFinite(Number(min)) ? Number(min) : 0;
  const hi = Number.isFinite(Number(max)) ? Number(max) : lo + 1;
  const safeStep = Number.isFinite(Number(step)) && Number(step) > 0 ? Number(step) : 1;
  const format = typeof config.format === "function" ? config.format : (value) => String(Math.round(value));

  const wrapper = document.createElement("div");
  wrapper.className = "ns-obv-range-window";

  const header = document.createElement("div");
  header.className = "ns-obv-control-header";
  const title = document.createElement("span");
  title.className = "ns-obv-control-title";
  title.textContent = String(labelText || "Window");
  const output = document.createElement("output");
  output.className = "ns-obv-control-count";
  header.append(title, output);

  const slider = document.createElement("div");
  slider.className = "ns-obv-dual-slider";
  const baseTrack = document.createElement("div");
  baseTrack.className = "ns-obv-dual-slider-track";
  const activeTrack = document.createElement("div");
  activeTrack.className = "ns-obv-dual-slider-fill";
  const startHandle = document.createElement("div");
  startHandle.className = "ns-obv-dual-slider-handle";
  const endHandle = document.createElement("div");
  endHandle.className = "ns-obv-dual-slider-handle";
  const startInput = document.createElement("input");
  startInput.className = "ns-obv-dual-slider-input";
  startInput.type = "range";
  startInput.min = String(lo);
  startInput.max = String(hi);
  startInput.step = String(safeStep);
  startInput.value = String(startValue ?? lo);
  const endInput = document.createElement("input");
  endInput.className = "ns-obv-dual-slider-input";
  endInput.type = "range";
  endInput.min = String(lo);
  endInput.max = String(hi);
  endInput.step = String(safeStep);
  endInput.value = String(endValue ?? hi);
  startInput.style.zIndex = "3";
  endInput.style.zIndex = "4";
  slider.append(baseTrack, activeTrack, startHandle, endHandle, startInput, endInput);

  const footer = document.createElement("div");
  footer.className = "ns-obv-range-window-values";
  const startText = document.createElement("span");
  const endText = document.createElement("span");
  footer.append(startText, endText);

  const listeners = new Set();
  const stepPrecision = (() => {
    const stepText = String(safeStep);
    if (stepText.includes("e-")) return Number(stepText.split("e-")[1]) || 0;
    const dot = stepText.indexOf(".");
    return dot >= 0 ? stepText.length - dot - 1 : 0;
  })();
  let draggingHandle = null;

  function notify() {
    for (const listener of listeners) listener();
  }

  function clampValue(value) {
    return Math.max(lo, Math.min(hi, Number(value)));
  }

  function snapValue(value) {
    const clamped = clampValue(value);
    const steps = Math.round((clamped - lo) / safeStep);
    const snapped = lo + steps * safeStep;
    return clampValue(Number(snapped.toFixed(stepPrecision)));
  }

  function valueFromClientX(clientX) {
    const rect = slider.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || rect.width <= 0) return lo;
    const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return snapValue(lo + t * (hi - lo));
  }

  function nearestHandle(clientX) {
    const pointerValue = valueFromClientX(clientX);
    const start = Number(startInput.value);
    const end = Number(endInput.value);
    return Math.abs(pointerValue - start) <= Math.abs(pointerValue - end) ? "start" : "end";
  }

  function beginDrag(handle, event) {
    draggingHandle = handle;
    sync(handle);
    if (event && Number.isFinite(event.pointerId) && typeof slider.setPointerCapture === "function") {
      slider.setPointerCapture(event.pointerId);
    }
    updateFromPointer(handle, event?.clientX);
  }

  function updateFromPointer(handle, clientX) {
    if (typeof clientX !== "number") return;
    const value = valueFromClientX(clientX);
    if (handle === "start") {
      startInput.value = String(value);
      sync("start");
    } else {
      endInput.value = String(value);
      sync("end");
    }
    notify();
  }

  function stopDrag(event) {
    if (!draggingHandle) return;
    if (
      event &&
      Number.isFinite(event.pointerId) &&
      typeof slider.hasPointerCapture === "function" &&
      slider.hasPointerCapture(event.pointerId) &&
      typeof slider.releasePointerCapture === "function"
    ) {
      slider.releasePointerCapture(event.pointerId);
    }
    draggingHandle = null;
  }

  function sync(activeHandle = null) {
    if (activeHandle === "start") {
      startInput.style.zIndex = "5";
      endInput.style.zIndex = "4";
    } else if (activeHandle === "end") {
      startInput.style.zIndex = "4";
      endInput.style.zIndex = "5";
    }

    let start = snapValue(startInput.value);
    let end = snapValue(endInput.value);
    if (start > end) {
      if (activeHandle === "start") end = start;
      else start = end;
    }
    startInput.value = String(start);
    endInput.value = String(end);

    const span = Math.max(1e-9, hi - lo);
    const startPct = ((start - lo) / span) * 100;
    const endPct = ((end - lo) / span) * 100;
    activeTrack.style.left = `${startPct}%`;
    activeTrack.style.width = `${Math.max(0, endPct - startPct)}%`;
    startHandle.style.left = `${startPct}%`;
    endHandle.style.left = `${endPct}%`;

    startText.textContent = `Start ${format(start)}`;
    endText.textContent = `End ${format(end)}`;
    output.textContent = `${format(start)} - ${format(end)}`;
  }

  startInput.addEventListener("input", () => {
    sync("start");
    notify();
  });
  endInput.addEventListener("input", () => {
    sync("end");
    notify();
  });
  slider.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const handle =
      event.target === startHandle
        ? "start"
        : event.target === endHandle
        ? "end"
        : nearestHandle(event.clientX);
    beginDrag(handle, event);
    event.preventDefault();
  });
  slider.addEventListener("pointermove", (event) => {
    if (!draggingHandle) return;
    updateFromPointer(draggingHandle, event.clientX);
    event.preventDefault();
  });
  slider.addEventListener("pointerup", stopDrag);
  slider.addEventListener("pointercancel", stopDrag);
  slider.addEventListener("lostpointercapture", stopDrag);

  sync();
  wrapper.append(header, slider, footer);

  return {
    node: wrapper,
    getWindow() {
      sync();
      return {start: Number(startInput.value), end: Number(endInput.value)};
    },
    setWindow(start, end) {
      startInput.value = String(start);
      endInput.value = String(end);
      sync();
      notify();
    },
    onChange(handler) {
      if (typeof handler === "function") listeners.add(handler);
    }
  };
}

export function sectionHeading(text) {
  const heading = document.createElement("h3");
  heading.style.margin = "0 0 0.5rem 0";
  heading.textContent = text;
  return heading;
}

export function emptyState(message) {
  const p = document.createElement("p");
  p.style.margin = "0.5rem 0";
  p.style.padding = "0.75rem";
  p.style.border = "1px dashed var(--theme-foreground-faint)";
  p.style.borderRadius = "8px";
  p.textContent = message;
  return p;
}

export function renderSimpleTable(rows, columns) {
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "0.9rem";

  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  for (const column of columns) {
    const th = document.createElement("th");
    th.textContent = column.label;
    th.style.textAlign = column.align || "left";
    th.style.borderBottom = "1px solid var(--theme-foreground-faint)";
    th.style.padding = "0.4rem";
    if (column.width) {
      th.style.width = column.width;
      th.style.minWidth = column.width;
    }
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const trBody = document.createElement("tr");
    for (const column of columns) {
      const td = document.createElement("td");
      td.style.padding = "0.35rem";
      td.style.borderBottom = "1px solid var(--theme-foreground-faintest)";
      td.style.textAlign = column.align || "left";
      if (column.width) {
        td.style.width = column.width;
        td.style.minWidth = column.width;
      }
      if (column.bold) {
        td.style.fontWeight = "600";
      }
      const value = column.format ? column.format(row[column.key], row) : row[column.key];
      td.textContent = value == null ? "" : String(value);
      trBody.appendChild(td);
    }
    tbody.appendChild(trBody);
  }
  table.appendChild(tbody);

  return table;
}

export function collapsible(summaryText) {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.style.cursor = "pointer";
  summary.style.fontWeight = "600";
  summary.textContent = summaryText;
  details.appendChild(summary);
  return details;
}

export function el(tag, text) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  return node;
}

export function card() {
  const node = el("div");
  node.className = "card";
  node.style.display = "grid";
  node.style.gap = "0.6rem";
  return node;
}

export function selectControl(labelText, options, value) {
  ensureControlStyles();
  const wrapper = el("label");
  wrapper.className = "ns-obv-inline-control";

  const select = el("select");
  select.className = "ns-obv-inline-control-select";
  const normalized = (options || []).map((o) =>
    typeof o === "object" ? o : {value: String(o), label: String(o)}
  );
  for (const optionSpec of normalized) {
    const option = el("option", optionSpec.label);
    option.value = optionSpec.value;
    if (String(optionSpec.value) === String(value)) option.selected = true;
    select.appendChild(option);
  }

  const label = el("span", labelText);
  wrapper.append(label, select, el("span"));
  return {node: wrapper, select};
}

export function rangeControl(labelText, min, max, step, value) {
  ensureControlStyles();
  const wrapper = el("label");
  wrapper.className = "ns-obv-inline-control";

  const input = el("input");
  input.className = "ns-obv-inline-control-range";
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);

  const output = el("output", String(value));
  output.className = "ns-obv-inline-control-output";
  const label = el("span", labelText);
  wrapper.append(label, input, output);

  return {node: wrapper, input, output};
}

export function debounce(fn, waitMs = 120) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), waitMs);
  };
}
