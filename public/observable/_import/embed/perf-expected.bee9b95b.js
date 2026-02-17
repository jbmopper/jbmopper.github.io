import {FileAttachment} from "../../_observablehq/stdlib.43270668.js";
import {
  calculateForwardFlops,
  calculateMemoryAccounting,
  calculateModelParams,
  calculateTrainingStepFlops,
  validateTrainingSpec
} from "../components/perf-estimates.d771a94d.js";
import {clearNode, emptyState, renderSimpleTable, sectionHeading} from "../components/dom-utils.aaca454b.js";

const MODEL_CONFIG_CATALOG = FileAttachment({"name":"../../data/raw/llm-fundamentals/model-config-catalog.json","mimeType":"application/json","path":"../../_file/data/raw/llm-fundamentals/model-config-catalog.3b260981.json","lastModified":1771314318102,"size":18447}, import.meta.url);
const FORWARD_ARCH_SVG = FileAttachment({"name":"../../data/raw/llm-fundamentals/cs336_forward.svg","mimeType":"image/svg+xml","path":"../../_file/data/raw/llm-fundamentals/cs336_forward.e4ce8080.svg","lastModified":1771360719984,"size":28688}, import.meta.url);
const D_HEAD_CHOICES = [32, 64, 96, 128];
const DTYPE_BYTES = {
  float32: 4,
  float16: 2,
  bfloat16: 2,
  float8: 1
};
const SVG_FONT_STYLE = `
<style>
svg {
  background: #0f1117;
}
text {
  font-family: "Inter", system-ui, -apple-system, sans-serif !important;
  fill: #e6edf3 !important;
}
[fill="white"] {
  fill: #0f1117 !important;
}
[fill="#1E1E1E"] {
  fill: #e6edf3 !important;
}
[fill="black"] {
  fill: #e6edf3 !important;
}
[fill="black"][fill-opacity="0.8"] {
  fill: #1b1f24 !important;
}
[stroke="#A5A5A5"],
[stroke="#757575"] {
  stroke: #8b949e !important;
}
</style>
`;
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
const PLATFORM_TRAINING_ESTIMATES = [
  {
    value: "mps",
    label: "MPS (M4 Mac)",
    effective_tflops: 3.2,
    assumption: "~3.2 effective TFLOPs for end-to-end training"
  },
  {
    value: "cuda_amp",
    label: "RTX 4090 (AMP)",
    effective_tflops: 110,
    assumption: "~110 effective TFLOPs for end-to-end training"
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

function formatBytes(value) {
  const bytes = safeNumber(value, 0);
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} KB`;
  return `${Math.round(bytes)} B`;
}

function formatFlops(value) {
  const flops = safeNumber(value, 0);
  if (flops >= 1e12) return `${(flops / 1e12).toFixed(2)} TFLOPs`;
  if (flops >= 1e9) return `${(flops / 1e9).toFixed(2)} GFLOPs`;
  if (flops >= 1e6) return `${(flops / 1e6).toFixed(2)} MFLOPs`;
  return `${Math.round(flops)} FLOPs`;
}

function formatDuration(seconds) {
  const s = safeNumber(seconds, 0);
  if (s < 60) return `${s.toFixed(1)} s`;
  if (s < 3600) return `${(s / 60).toFixed(1)} min`;
  if (s < 86400) return `${(s / 3600).toFixed(2)} hr`;
  return `${(s / 86400).toFixed(2)} days`;
}

function platformLabelForSpec(spec) {
  if (spec?.use_amp || spec?.ft_dtype === "bfloat16" || spec?.grad_dtype === "bfloat16") {
    return "RTX 4090 (AMP)";
  }
  return "MPS (M4 Mac)";
}

function computeSvgVars(spec) {
  const B = safeNumber(spec.B, 32);
  const seqLen = safeNumber(spec.S, 512);
  const V = safeNumber(spec.V, 10000);
  const dModel = safeNumber(spec.d_model, 512);
  const nHeads = safeNumber(spec.n_heads, 8);
  const nBlocks = safeNumber(spec.n_blocks, 12);
  const dFf = safeNumber(spec.d_ff, 1344);
  const dHead = safeNumber(spec.d_head, 64);
  const wtDtype = String(spec.wt_dtype || "float32");
  const ftDtype = String(spec.ft_dtype || "float32");
  const wtBytes = DTYPE_BYTES[wtDtype] || 4;
  const ftBytes = DTYPE_BYTES[ftDtype] || 4;
  const tripleDModel = 3 * dModel;

  const embSize = V * dModel * wtBytes;
  const ftSize = B * seqLen * dModel * ftBytes;
  const rmsSize = dModel * wtBytes;
  const wqkvSize = dModel * tripleDModel * wtBytes;
  const qkvSize = B * seqLen * tripleDModel * ftBytes;
  const headSize = B * nHeads * seqLen * dHead * ftBytes;
  const featuresSize = B * seqLen * dModel * ftBytes;
  const spSize = B * nHeads * seqLen * seqLen * ftBytes;
  const swigluSize = 3 * dModel * dFf * wtBytes;
  const lmHeadSize = V * dModel * wtBytes;
  const outputSize = B * seqLen * V * ftBytes;
  const oSize = dModel * dModel * wtBytes;

  const rmsNormComp = 2 * B * seqLen * dModel;
  const qkvComp = 2 * B * seqLen * dModel * tripleDModel;
  const ropeComp = 2 * B * nHeads * seqLen * dHead;
  const qkComp = 2 * B * nHeads * seqLen * seqLen * dHead;
  const softmaxComp = 3 * B * nHeads * seqLen * seqLen;
  const sdpaComp = qkComp + softmaxComp + 2 * B * nHeads * seqLen * seqLen * dHead;
  const swigluComp = 2 * B * seqLen * dModel * dFf * 3;
  const lmComp = 2 * B * seqLen * dModel * V;
  const oProjComp = 2 * B * seqLen * dModel * dModel;

  return {
    B,
    seq_len: seqLen,
    V,
    d_model: dModel,
    h: nHeads,
    n_blocks: nBlocks,
    d_ff: dFf,
    d_head: dHead,
    "3d_model": tripleDModel,
    wt_dtype: wtDtype,
    ft_dtype: ftDtype,
    emb_size: formatBytes(embSize),
    ft_size: formatBytes(ftSize),
    RMS_size: formatBytes(rmsSize),
    wqkv_size: formatBytes(wqkvSize),
    qkv_size: formatBytes(qkvSize),
    head_size: formatBytes(headSize),
    features_size: formatBytes(featuresSize),
    swiglu_size: formatBytes(swigluSize),
    lm_head_size: formatBytes(lmHeadSize),
    o_size: formatBytes(oSize),
    sp_size: formatBytes(spSize),
    output_size: formatBytes(outputSize),
    rms_norm_comp: formatFlops(rmsNormComp),
    QKV_comp: formatFlops(qkvComp),
    RoPE_comp: formatFlops(ropeComp),
    QK_compute: formatFlops(qkComp),
    softmax_compute: formatFlops(softmaxComp),
    SDPA_compute: formatFlops(sdpaComp),
    o_proj_comp: formatFlops(oProjComp),
    swiglu_comp: formatFlops(swigluComp),
    lm_comp: formatFlops(lmComp)
  };
}

function populateSvgTemplate(template, values) {
  let output = String(template || "");
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{{${key}}}`, String(value));
  }
  return output;
}

function injectSvgStyles(svgMarkup) {
  const svg = String(svgMarkup || "");
  if (!svg) return svg;
  if (svg.includes("<style>")) return svg;
  return svg.replace(">", `>${SVG_FONT_STYLE}`);
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

function setSelectOptions(select, options, value) {
  select.replaceChildren();
  for (const optionSpec of options) {
    const option = el("option", optionSpec.label);
    option.value = optionSpec.value;
    if (optionSpec.value === value) option.selected = true;
    select.appendChild(option);
  }
  if (options.length > 0 && !options.some((option) => option.value === value)) {
    select.value = options[0].value;
  }
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
    category: String(spec.category || "custom"),
    source: String(spec.source || "manual"),
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

function catalogSpec(entry, index) {
  return normalizedSpec(
    {
      name: entry?.name || entry?.id || `catalog_${index + 1}`,
      category: entry?.category || "catalog",
      source: entry?.source_key || entry?.source_file || "catalog",
      B: entry?.batch_size,
      S: entry?.seq_len,
      V: entry?.vocab_size,
      d_model: entry?.d_model,
      n_heads: entry?.num_heads,
      n_blocks: entry?.num_layers,
      d_ff: entry?.d_ff,
      d_head: entry?.d_head
    },
    index
  );
}

function specKey(spec) {
  const s = normalizedSpec(spec, 0);
  return [
    s.name,
    s.B,
    s.S,
    s.V,
    s.d_model,
    s.d_head,
    s.n_heads,
    s.n_blocks,
    s.d_ff,
    s.wt_dtype,
    s.ft_dtype,
    s.grad_dtype,
    s.use_amp
  ].join("|");
}

function mergeUniqueSpecs(targetSpecs, incomingSpecs) {
  const existing = new Set(targetSpecs.map((spec) => specKey(spec)));
  for (const next of incomingSpecs) {
    const key = specKey(next);
    if (existing.has(key)) continue;
    targetSpecs.push(next);
    existing.add(key);
  }
}

async function loadCatalogSpecs() {
  try {
    const catalog = await MODEL_CONFIG_CATALOG.json();
    const rows = Array.isArray(catalog?.named_configs) ? catalog.named_configs : [];
    return rows.map((entry, index) => catalogSpec(entry, index));
  } catch (error) {
    console.warn("Failed to load model config catalog:", error);
    return [];
  }
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
      category: s.category,
      platform: platformLabelForSpec(s),
      wt_dtype: s.wt_dtype,
      ft_dtype: s.ft_dtype,
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
      ckpt_model: memory.total_weights,
      ckpt_model_opt: formatBytes(memory.total_weights_raw + memory.optimizer_state_raw),
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

  const title = el("h2", "Model Spec Builder and Resource Estimator");
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
  const estimatorSummaryHost = card();
  const architectureHost = card();

  root.append(title, subtitle, status, summaryHost, validationHost, controlsHost, architectureHost);

  const catalogSpecs = await loadCatalogSpecs();
  const forwardSvgTemplate = await (async () => {
    try {
      return await FORWARD_ARCH_SVG.text();
    } catch (error) {
      console.warn("Failed to load architecture SVG template:", error);
      return "";
    }
  })();
  const initialSpecs = Array.isArray(options.initialSpecs) ? options.initialSpecs : [];
  const specs = initialSpecs.map((spec, index) => normalizedSpec(spec, index));
  if (specs.length === 0 && catalogSpecs.length > 0) {
    specs.push(...catalogSpecs);
  }
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
  const iterationsSlider = sliderControl("Training Iterations", 100, 50000, 100, 5000);
  const loadSpecSelect = selectControl("Load Model Spec", [{value: "__custom__", label: "Custom draft"}], "__custom__");

  const derivedInfo = el("p");
  derivedInfo.style.margin = "0";

  const platformInfo = el("p");
  platformInfo.style.margin = "0";

  const actions = el("div");
  actions.style.display = "flex";
  actions.style.gap = "0.6rem";
  actions.style.flexWrap = "wrap";

  const addButton = button("Add Current Spec");
  const loadCatalogButton = button("Merge Catalog Specs");
  const replaceCatalogButton = button("Replace With Catalog");
  const clearButton = button("Clear Specs");
  actions.append(addButton, loadCatalogButton, replaceCatalogButton, clearButton);

  const catalogInfo = el(
    "p",
    catalogSpecs.length > 0
      ? `Catalog loaded: ${catalogSpecs.length} named model config(s).`
      : "Catalog unavailable; using manual specs only."
  );
  catalogInfo.style.margin = "0";

  const loadInfo = el("p", "Estimator is using custom draft values.");
  loadInfo.style.margin = "0";

  const svgViewport = el("div");
  svgViewport.style.width = "100%";
  svgViewport.style.maxHeight = "900px";
  svgViewport.style.overflowY = "auto";
  svgViewport.style.overflowX = "hidden";
  svgViewport.style.border = "1px solid var(--theme-foreground-faint)";
  svgViewport.style.borderRadius = "8px";
  svgViewport.style.background = "#0f1117";

  const svgScaled = el("div");
  svgScaled.style.padding = "0";
  svgViewport.appendChild(svgScaled);

  architectureHost.append(sectionHeading("Architecture Diagram"), svgViewport);

  controlsHost.append(
    sectionHeading("Estimator"),
    loadSpecSelect.node,
    loadInfo,
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
    iterationsSlider.node,
    derivedInfo,
    platformInfo,
    catalogInfo,
    actions,
    estimatorSummaryHost
  );

  let draftMeta = {category: "custom", source: "manual"};

  function estimatorLoadCandidates() {
    const merged = [];
    mergeUniqueSpecs(merged, catalogSpecs);
    mergeUniqueSpecs(merged, specs);
    return merged;
  }

  function selectedLoadSpec() {
    const value = loadSpecSelect.select.value;
    if (value === "__custom__") return null;
    return estimatorLoadCandidates().find((spec) => specKey(spec) === value) || null;
  }

  function refreshLoadSpecOptions() {
    const selected = loadSpecSelect.select.value || "__custom__";
    const modelOptions = estimatorLoadCandidates().map((spec) => ({
      value: specKey(spec),
      label: `${spec.name} (${spec.category})`
    }));
    setSelectOptions(
      loadSpecSelect.select,
      [{value: "__custom__", label: "Custom draft"}, ...modelOptions],
      selected
    );
  }

  function setPlatformFromSpec(spec) {
    if (spec.use_amp || spec.ft_dtype === "bfloat16") {
      platformSelect.select.value = "cuda_amp";
      return;
    }
    platformSelect.select.value = "mps";
  }

  function loadSpecIntoEstimator(spec) {
    if (!spec) {
      loadInfo.textContent = "Estimator is using custom draft values.";
      draftMeta = {category: "custom", source: "manual"};
      refreshDerived();
      renderEstimatorSummary();
      return;
    }

    nameInput.input.value = spec.name || "";
    bSlider.input.value = String(spec.B);
    sSlider.input.value = String(spec.S);
    vSlider.input.value = String(spec.V);
    dHeadSelect.select.value = String(spec.d_head || 64);
    dModelSlider.input.value = String(spec.d_model);
    layersSlider.input.value = String(spec.n_blocks);
    dffModeSelect.select.value = "manual";
    dffManualSlider.input.value = String(spec.d_ff);
    setPlatformFromSpec(spec);
    draftMeta = {
      category: String(spec.category || "catalog"),
      source: String(spec.source || "catalog")
    };
    loadInfo.textContent = `Loaded model: ${spec.name} (${draftMeta.category})`;
    refreshDerived();
    renderEstimatorSummary();
  }

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
      category: draftMeta.category,
      source: draftMeta.source,
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
    iterationsSlider.setLabel(iterationsSlider.input.value);

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

  function renderEstimatorSummary() {
    clearNode(estimatorSummaryHost);
    estimatorSummaryHost.appendChild(sectionHeading("Estimator Resource Summary"));
    const draft = currentDraft();
    const memory = calculateMemoryAccounting(draft);
    const params = calculateModelParams(draft.V, draft.d_model, draft.n_heads, draft.n_blocks, draft.d_ff);
    const forward = calculateForwardFlops(
      draft.B,
      draft.S,
      draft.V,
      draft.d_model,
      draft.n_heads,
      draft.n_blocks,
      draft.d_ff
    );
    const train = calculateTrainingStepFlops(forward.total);
    const validation = validateTrainingSpec(draft, ramBudgetGb);

    estimatorSummaryHost.appendChild(
      renderSimpleTable(
        [
          {
            name: draft.name,
            category: draft.category,
            platform: platformLabelForSpec(draft),
            wt_dtype: draft.wt_dtype,
            ft_dtype: draft.ft_dtype,
            params_m: `${params.total_M.toFixed(2)}M`,
            peak_mem: memory.peak_training,
            steady_mem: memory.steady_state,
            s2_mem: memory.s_squared_memory,
            ckpt_model: memory.total_weights,
            ckpt_model_opt: formatBytes(memory.total_weights_raw + memory.optimizer_state_raw),
            fwd_tflops: forward.total_TFLOPs.toFixed(2),
            train_tflops: train.total_TFLOPs.toFixed(2),
            head32: validation.head_dim_multiple_of_32 ? "yes" : "no",
            dff64: validation.d_ff_multiple_of_64 ? "yes" : "no",
            fits_budget: validation.fits_budget ? "yes" : "no"
          }
        ],
        [
          {key: "name", label: "Model"},
          {key: "category", label: "Category"},
          {key: "platform", label: "Platform"},
          {key: "wt_dtype", label: "wt"},
          {key: "ft_dtype", label: "ft"},
          {key: "params_m", label: "Params"},
          {key: "ckpt_model", label: "Ckpt (Model)"},
          {key: "ckpt_model_opt", label: "Ckpt (+Optim)"},
          {key: "peak_mem", label: "Peak Mem"},
          {key: "steady_mem", label: "Steady Mem"},
          {key: "s2_mem", label: "S^2 Mem"},
          {key: "fwd_tflops", label: "Forward TFLOPs", align: "right"},
          {key: "train_tflops", label: "Train TFLOPs", align: "right"},
          {key: "head32", label: "d_head % 32"},
          {key: "dff64", label: "d_ff % 64"},
          {key: "fits_budget", label: `Fits ${ramBudgetGb} GB`}
        ]
      )
    );

    const iterations = safeNumber(iterationsSlider.input.value, 5000);
    const timeRows = PLATFORM_TRAINING_ESTIMATES.map((platform) => {
      const perStepSeconds = train.total / (platform.effective_tflops * 1e12);
      const totalSeconds = perStepSeconds * iterations;
      return {
        platform: platform.label,
        effective_tflops: platform.effective_tflops.toFixed(1),
        per_step: formatDuration(perStepSeconds),
        total: formatDuration(totalSeconds),
        assumption: platform.assumption
      };
    });

    estimatorSummaryHost.appendChild(sectionHeading("Training Time Estimate"));
    estimatorSummaryHost.appendChild(
      renderSimpleTable(timeRows, [
        {key: "platform", label: "Platform"},
        {key: "effective_tflops", label: "Effective TFLOPs", align: "right"},
        {key: "per_step", label: "Per Iteration"},
        {key: "total", label: `Total (${iterations} iters)`},
        {key: "assumption", label: "Assumption"}
      ])
    );

    const issuesBlock = el("div");
    issuesBlock.style.display = "grid";
    issuesBlock.style.gap = "0.3rem";
    const issuesTitle = el("strong", "Issues");
    issuesBlock.appendChild(issuesTitle);
    if (validation.issues.length === 0) {
      issuesBlock.appendChild(el("p", "none"));
    } else {
      const list = el("ul");
      list.style.margin = "0";
      for (const issue of validation.issues) {
        list.appendChild(el("li", issue));
      }
      issuesBlock.appendChild(list);
    }
    estimatorSummaryHost.appendChild(issuesBlock);
    renderArchitectureDiagram();
  }

  function renderArchitectureDiagram() {
    clearNode(svgScaled);

    if (!forwardSvgTemplate) {
      svgScaled.appendChild(emptyState("Architecture SVG template unavailable."));
      return;
    }

    const values = computeSvgVars(currentDraft());
    const populatedSvg = populateSvgTemplate(injectSvgStyles(forwardSvgTemplate), values);
    const svgNode = el("div");
    svgNode.innerHTML = populatedSvg;
    const svgElement = svgNode.querySelector("svg");
    if (svgElement) {
      svgElement.style.display = "block";
      svgElement.style.width = "100%";
      svgElement.style.height = "auto";
    }
    svgScaled.appendChild(svgNode);
  }

  function renderTables() {
    clearNode(summaryHost);
    clearNode(validationHost);
    summaryHost.appendChild(sectionHeading("Model Comparison"));
    validationHost.appendChild(sectionHeading("Validation Output"));

    if (specs.length === 0) {
      status.textContent = "No specs yet. Add a model configuration.";
      summaryHost.appendChild(emptyState("No model specs provided."));
      validationHost.appendChild(emptyState("Validation is generated after adding at least one spec."));
      refreshLoadSpecOptions();
      return;
    }

    const rows = compareRows(specs, ramBudgetGb);
    status.textContent = `${rows.length} spec(s), RAM budget ${ramBudgetGb} GB.`;

    summaryHost.appendChild(
      renderSimpleTable(rows, [
        {key: "name", label: "Model"},
        {key: "category", label: "Category"},
        {key: "platform", label: "Platform"},
        {key: "wt_dtype", label: "wt"},
        {key: "ft_dtype", label: "ft"},
        {key: "B", label: "B", align: "right"},
        {key: "S", label: "S", align: "right"},
        {key: "d_model", label: "d_model", align: "right"},
        {key: "n_heads", label: "n_heads", align: "right"},
        {key: "n_blocks", label: "Layers", align: "right"},
        {key: "d_ff", label: "d_ff", align: "right"},
        {key: "params_m", label: "Params"},
        {key: "ckpt_model", label: "Ckpt (Model)"},
        {key: "ckpt_model_opt", label: "Ckpt (+Optim)"},
        {key: "peak_mem", label: "Peak Mem"},
        {key: "train_tflops", label: "Train TFLOPs", align: "right"},
        {key: "fits_budget", label: "Fits Budget"}
      ])
    );

    validationHost.appendChild(
      renderSimpleTable(rows, [
        {key: "name", label: "Model"},
        {key: "platform", label: "Platform"},
        {key: "head32", label: "d_head % 32"},
        {key: "dff64", label: "d_ff % 64"},
        {key: "fits_budget", label: `Fits ${ramBudgetGb} GB`}
      ])
    );
    refreshLoadSpecOptions();
  }

  addButton.addEventListener("click", () => {
    specs.push(currentDraft());
    renderTables();
  });

  loadCatalogButton.addEventListener("click", () => {
    mergeUniqueSpecs(specs, catalogSpecs);
    renderTables();
  });

  replaceCatalogButton.addEventListener("click", () => {
    specs.length = 0;
    specs.push(...catalogSpecs);
    renderTables();
  });

  clearButton.addEventListener("click", () => {
    specs.length = 0;
    renderTables();
  });

  loadSpecSelect.select.addEventListener("change", () => {
    loadSpecIntoEstimator(selectedLoadSpec());
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
  iterationsSlider.input.addEventListener("input", refreshDerived);

  const controlsToCustom = [
    nameInput.input,
    bSlider.input,
    sSlider.input,
    vSlider.input,
    dModelSlider.input,
    dHeadSelect.select,
    layersSlider.input,
    dffModeSelect.select,
    dffManualSlider.input,
    platformSelect.select
  ];
  for (const control of controlsToCustom) {
    control.addEventListener("input", () => {
      if (loadSpecSelect.select.value === "__custom__") return;
      loadSpecSelect.select.value = "__custom__";
      loadInfo.textContent = "Estimator is using custom draft values.";
      draftMeta = {category: "custom", source: "manual"};
      renderEstimatorSummary();
    });
    control.addEventListener("change", () => {
      if (loadSpecSelect.select.value === "__custom__") return;
      loadSpecSelect.select.value = "__custom__";
      loadInfo.textContent = "Estimator is using custom draft values.";
      draftMeta = {category: "custom", source: "manual"};
      renderEstimatorSummary();
    });
  }

  const refreshEstimator = () => renderEstimatorSummary();
  dHeadSelect.select.addEventListener("change", refreshEstimator);
  dModelSlider.input.addEventListener("input", refreshEstimator);
  bSlider.input.addEventListener("input", refreshEstimator);
  sSlider.input.addEventListener("input", refreshEstimator);
  vSlider.input.addEventListener("input", refreshEstimator);
  layersSlider.input.addEventListener("input", refreshEstimator);
  dffModeSelect.select.addEventListener("change", refreshEstimator);
  dffManualSlider.input.addEventListener("input", refreshEstimator);
  platformSelect.select.addEventListener("change", refreshEstimator);
  iterationsSlider.input.addEventListener("input", refreshEstimator);
  nameInput.input.addEventListener("input", refreshEstimator);

  refreshDerived();
  renderTables();
  renderEstimatorSummary();

  return root;
}
