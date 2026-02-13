import {
  calculateForwardFlops,
  calculateMemoryAccounting,
  calculateModelParams,
  calculateTrainingStepFlops,
  validateTrainingSpec
} from "../components/perf-estimates.d771a94d.js";
import {clearNode, emptyState, renderSimpleTable, sectionHeading} from "../components/dom-utils.aaca454b.js";

const D_HEAD_CHOICES = [32, 64, 96, 128];
const PLATFORM_OPTIONS = [
  {
    value: "mps",
    label: "MPS (M4 Mac)",
    wt_dtype: "float32",
    ft_dtype: "float32",
    grad_dtype: "float32",
    use_amp: false,
    notes: [
      "Weights: float32",
      "Activations: float32",
      "Gradients: float32",
      "Optimizer: float32 state"
    ]
  },
  {
    value: "cuda_amp",
    label: "RTX 4090 (AMP)",
    wt_dtype: "float32",
    ft_dtype: "bfloat16",
    grad_dtype: "bfloat16",
    use_amp: true,
    notes: [
      "Weights: float32 (master)",
      "Activations: bfloat16",
      "Gradients: bfloat16",
      "Optimizer: AMP state"
    ]
  }
];

function el(tag, text) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  return node;
}

function card() {
  const node = el("div");
  node.className = "card";
  node.style.display = "grid";
  node.style.gap = "0.6rem";
  return node;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toNearestMultiple(value, base, min = base) {
  const rounded = Math.max(min, Math.round(value / base) * base);
  return rounded;
}

function computeDff(mode, dModel, manual) {
  if (mode === "8/3 * d_model") {
    return Math.floor((dModel * 8) / 3 / 64) * 64;
  }
  if (mode === "4 * d_model") {
    return Math.floor((dModel * 4) / 64) * 64;
  }
  return toNearestMultiple(manual, 64, 64);
}

function selectControl(labelText, options, value) {
  const wrapper = el("label");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "0.5rem";

  const select = el("select");
  for (const optionSpec of options) {
    const option = el("option", optionSpec.label);
    option.value = optionSpec.value;
    if (optionSpec.value === value) option.selected = true;
    select.appendChild(option);
  }

  wrapper.append(document.createTextNode(labelText), select);
  return {node: wrapper, select};
}

function sliderControl(labelText, min, max, step, value) {
  const wrapper = el("label");
  wrapper.style.display = "grid";
  wrapper.style.gap = "0.3rem";

  const label = el("span", `${labelText}: ${value}`);
  const input = el("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);

  wrapper.append(label, input);
  return {
    node: wrapper,
    input,
    setLabel(next) {
      label.textContent = `${labelText}: ${next}`;
    }
  };
}

function textInputControl(labelText, value = "") {
  const wrapper = el("label");
  wrapper.style.display = "grid";
  wrapper.style.gap = "0.3rem";

  const label = el("span", labelText);
  const input = el("input");
  input.type = "text";
  input.value = value;

  wrapper.append(label, input);
  return {node: wrapper, input};
}

function button(text) {
  const node = el("button", text);
  node.type = "button";
  node.style.width = "fit-content";
  return node;
}

function platformByValue(value) {
  return PLATFORM_OPTIONS.find((option) => option.value === value) || PLATFORM_OPTIONS[0];
}

function normalizedSpec(spec, index) {
  return {
    name: String(spec.name || `model_${index + 1}`),
    B: safeNumber(spec.B, 32),
    S: safeNumber(spec.S, 512),
    V: safeNumber(spec.V, 10_000),
    d_model: safeNumber(spec.d_model, 512),
    n_heads: safeNumber(spec.n_heads, 8),
    n_blocks: safeNumber(spec.n_blocks, 12),
    d_ff: safeNumber(spec.d_ff, 1344),
    d_head: safeNumber(spec.d_head, 64),
    wt_dtype: spec.wt_dtype || "float32",
    ft_dtype: spec.ft_dtype || "float32",
    grad_dtype: spec.grad_dtype || "float32",
    use_amp: Boolean(spec.use_amp)
  };
}

function compareRows(specs, ramBudgetGb) {
  return specs.map((spec, index) => {
    const s = normalizedSpec(spec, index);
    const memory = calculateMemoryAccounting(s);
    const params = calculateModelParams(s.V, s.d_model, s.n_heads, s.n_blocks, s.d_ff);
    const forward = calculateForwardFlops(s.B, s.S, s.V, s.d_model, s.n_heads, s.n_blocks, s.d_ff);
    const train = calculateTrainingStepFlops(forward.total);
    const validation = validateTrainingSpec(s, ramBudgetGb);

    return {
      name: s.name,
      B: s.B,
      S: s.S,
      V: s.V,
      d_model: s.d_model,
      d_head: s.d_head,
      n_heads: s.n_heads,
      n_blocks: s.n_blocks,
      d_ff: s.d_ff,
      params_m: `${params.total_M.toFixed(2)}M`,
      peak_mem: memory.peak_training,
      steady_mem: memory.steady_state,
      s2_mem: memory.s_squared_memory,
      fwd_tflops: forward.total_TFLOPs.toFixed(2),
      train_tflops: train.total_TFLOPs.toFixed(2),
      fits_budget: validation.fits_budget ? "yes" : "no",
      head32: validation.head_dim_multiple_of_32 ? "yes" : "no",
      dff64: validation.d_ff_multiple_of_64 ? "yes" : "no",
      issues: validation.issues.length > 0 ? validation.issues.join("; ") : "none"
    };
  });
}

export async function renderPerfExpected(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-perf-expected";
  root.style.display = "grid";
  root.style.gap = "1rem";

  const title = el("h2", "Architecture and Expected Performance");
  title.style.margin = "0";
  const subtitle = el(
    "p",
    "Model-spec builder with formula parity, expected memory/FLOPs, and validation checks."
  );
  subtitle.style.margin = "0";

  const status = el("p");
  status.style.margin = "0";

  const controlsHost = card();
  const summaryHost = card();
  const validationHost = card();

  root.append(title, subtitle, status, controlsHost, summaryHost, validationHost);

  const initialSpecs = Array.isArray(options.initialSpecs) ? options.initialSpecs : [];
  const specs = initialSpecs.map((spec, index) => normalizedSpec(spec, index));
  const ramBudgetGb = safeNumber(options.ramBudgetGb, 24);

  const nameInput = textInputControl("Spec Name", "");
  const bSlider = sliderControl("B", 1, 128, 1, 32);
  const sSlider = sliderControl("S", 128, 4096, 128, 512);
  const vSlider = sliderControl("V", 1000, 100000, 1000, 10000);
  const dModelSlider = sliderControl("d_model", 32, 4096, 32, 512);
  const dHeadSelect = selectControl(
    "d_head",
    D_HEAD_CHOICES.map((value) => ({value: String(value), label: String(value)})),
    "64"
  );
  const layersSlider = sliderControl("n_blocks", 1, 48, 1, 12);
  const dffModeSelect = selectControl(
    "d_ff mode",
    [
      {value: "manual", label: "manual"},
      {value: "8/3 * d_model", label: "8/3 * d_model"},
      {value: "4 * d_model", label: "4 * d_model"}
    ],
    "8/3 * d_model"
  );
  const dffManualSlider = sliderControl("d_ff (manual)", 64, 6400, 64, 2048);
  const platformSelect = selectControl(
    "platform",
    PLATFORM_OPTIONS.map((option) => ({value: option.value, label: option.label})),
    "mps"
  );

  const derivedInfo = el("p");
  derivedInfo.style.margin = "0";

  const platformInfo = el("p");
  platformInfo.style.margin = "0";

  const actions = el("div");
  actions.style.display = "flex";
  actions.style.gap = "0.6rem";
  actions.style.flexWrap = "wrap";

  const addButton = button("Add Current Spec");
  const clearButton = button("Clear Specs");
  actions.append(addButton, clearButton);

  controlsHost.append(
    sectionHeading("Spec Builder"),
    nameInput.node,
    bSlider.node,
    sSlider.node,
    vSlider.node,
    dModelSlider.node,
    dHeadSelect.node,
    layersSlider.node,
    dffModeSelect.node,
    dffManualSlider.node,
    platformSelect.node,
    derivedInfo,
    platformInfo,
    actions
  );

  function currentDraft() {
    const dHead = safeNumber(dHeadSelect.select.value, 64);
    const dModel = toNearestMultiple(safeNumber(dModelSlider.input.value, 512), dHead, dHead);
    const nHeads = dModel / dHead;
    const dff = computeDff(
      dffModeSelect.select.value,
      dModel,
      safeNumber(dffManualSlider.input.value, 2048)
    );
    const platform = platformByValue(platformSelect.select.value);

    return {
      name: nameInput.input.value.trim() || `model_${specs.length + 1}`,
      B: safeNumber(bSlider.input.value, 32),
      S: safeNumber(sSlider.input.value, 512),
      V: safeNumber(vSlider.input.value, 10000),
      d_model: dModel,
      d_head: dHead,
      n_heads: nHeads,
      n_blocks: safeNumber(layersSlider.input.value, 12),
      d_ff: dff,
      wt_dtype: platform.wt_dtype,
      ft_dtype: platform.ft_dtype,
      grad_dtype: platform.grad_dtype,
      use_amp: platform.use_amp
    };
  }

  function refreshDerived() {
    const dHead = safeNumber(dHeadSelect.select.value, 64);
    const snappedModel = toNearestMultiple(safeNumber(dModelSlider.input.value, 512), dHead, dHead);
    if (snappedModel !== safeNumber(dModelSlider.input.value, 512)) {
      dModelSlider.input.value = String(snappedModel);
    }
    dModelSlider.setLabel(snappedModel);
    bSlider.setLabel(bSlider.input.value);
    sSlider.setLabel(sSlider.input.value);
    vSlider.setLabel(vSlider.input.value);
    layersSlider.setLabel(layersSlider.input.value);
    dffManualSlider.setLabel(dffManualSlider.input.value);

    const dff = computeDff(
      dffModeSelect.select.value,
      snappedModel,
      safeNumber(dffManualSlider.input.value, 2048)
    );
    const nHeads = snappedModel / dHead;
    derivedInfo.textContent = `Derived: n_heads = ${nHeads}, d_ff = ${dff}`;

    const platform = platformByValue(platformSelect.select.value);
    platformInfo.textContent = `${platform.label}: ${platform.notes.join(" | ")}`;

    if (dffModeSelect.select.value === "manual") {
      dffManualSlider.node.style.display = "grid";
    } else {
      dffManualSlider.node.style.display = "none";
    }
  }

  function renderTables() {
    clearNode(summaryHost);
    clearNode(validationHost);
    summaryHost.appendChild(sectionHeading("Expected Performance Table"));
    validationHost.appendChild(sectionHeading("Validation Output"));

    if (specs.length === 0) {
      status.textContent = "No specs yet. Add a model configuration.";
      summaryHost.appendChild(emptyState("No model specs provided."));
      validationHost.appendChild(emptyState("Validation is generated after adding at least one spec."));
      return;
    }

    const rows = compareRows(specs, ramBudgetGb);
    status.textContent = `${rows.length} spec(s), RAM budget ${ramBudgetGb} GB.`;

    summaryHost.appendChild(
      renderSimpleTable(rows, [
        {key: "name", label: "Model"},
        {key: "B", label: "B", align: "right"},
        {key: "S", label: "S", align: "right"},
        {key: "d_model", label: "d_model", align: "right"},
        {key: "n_heads", label: "n_heads", align: "right"},
        {key: "n_blocks", label: "Layers", align: "right"},
        {key: "d_ff", label: "d_ff", align: "right"},
        {key: "params_m", label: "Params"},
        {key: "peak_mem", label: "Peak Mem"},
        {key: "train_tflops", label: "Train TFLOPs", align: "right"},
        {key: "fits_budget", label: "Fits Budget"}
      ])
    );

    validationHost.appendChild(
      renderSimpleTable(rows, [
        {key: "name", label: "Model"},
        {key: "head32", label: "d_head % 32"},
        {key: "dff64", label: "d_ff % 64"},
        {key: "fits_budget", label: `Fits ${ramBudgetGb} GB`},
        {key: "issues", label: "Issues"}
      ])
    );
  }

  addButton.addEventListener("click", () => {
    specs.push(currentDraft());
    renderTables();
  });

  clearButton.addEventListener("click", () => {
    specs.length = 0;
    renderTables();
  });

  dHeadSelect.select.addEventListener("change", refreshDerived);
  dModelSlider.input.addEventListener("input", refreshDerived);
  bSlider.input.addEventListener("input", refreshDerived);
  sSlider.input.addEventListener("input", refreshDerived);
  vSlider.input.addEventListener("input", refreshDerived);
  layersSlider.input.addEventListener("input", refreshDerived);
  dffModeSelect.select.addEventListener("change", refreshDerived);
  dffManualSlider.input.addEventListener("input", refreshDerived);
  platformSelect.select.addEventListener("change", refreshDerived);

  refreshDerived();
  renderTables();

  return root;
}
