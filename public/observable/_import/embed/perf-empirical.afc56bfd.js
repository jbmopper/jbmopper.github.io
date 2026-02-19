import {FileAttachment} from "../../_observablehq/stdlib.43270668.js";
import * as Plot from "../../_npm/@observablehq/plot@0.6.17/7c43807f.js";
import * as d3 from "../../_npm/d3@7.9.0/e324157d.js";
import {formatMs, normalizeRunLabel} from "../components/data-utils.e2caa41c.js";
import {clearNode, emptyState, renderSimpleTable, sectionHeading} from "../components/dom-utils.363530d4.js";
import {calculateForwardFlops, calculateMemoryAccounting, calculateModelParams, calculateTrainingStepFlops} from "../components/perf-estimates.d771a94d.js";

const ATTACHMENTS = {
  mps_main: FileAttachment({"name":"../../data/raw/benchmarks/mps_comp_main.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/mps_comp_main.f7579557.parquet","lastModified":1771466904241,"size":21062}, import.meta.url),
  gpu_main: FileAttachment({"name":"../../data/raw/benchmarks/gpu_comp_main.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/gpu_comp_main.d82fa693.parquet","lastModified":1771466904217,"size":21863}, import.meta.url),
  mps_history: FileAttachment({"name":"../../data/raw/benchmarks/mps_comp_history.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/mps_comp_history.8ee202e9.parquet","lastModified":1771468209776,"size":1535334}, import.meta.url),
  gpu_history: FileAttachment({"name":"../../data/raw/benchmarks/gpu_comp_history.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/gpu_comp_history.e18efbee.parquet","lastModified":1771468210889,"size":1389327}, import.meta.url),
  train: FileAttachment({"name":"../../data/raw/benchmarks/train_benchmark_20260127_092323.json","mimeType":"application/json","path":"../../_file/data/raw/benchmarks/train_benchmark_20260127_092323.e80aa474.json","lastModified":1771465633684,"size":1945563}, import.meta.url),
  micro: FileAttachment({"name":"../../data/raw/benchmarks/micro_benchmarks_20260126_130256.json","mimeType":"application/json","path":"../../_file/data/raw/benchmarks/micro_benchmarks_20260126_130256.0003d6fe.json","lastModified":1771465633680,"size":2403}, import.meta.url),
  catalog: FileAttachment({"name":"../../data/raw/llm-fundamentals/model-config-catalog.json","mimeType":"application/json","path":"../../_file/data/raw/llm-fundamentals/model-config-catalog.3b260981.json","lastModified":1771314318102,"size":18447}, import.meta.url)
};

let empiricalDataPromise;

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

function safeNumber(value, fallback = NaN) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readPath(row, path) {
  if (Object.prototype.hasOwnProperty.call(row, path)) return row[path];
  const parts = String(path).split(".");
  let current = row;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function pickNumber(row, keys) {
  for (const key of keys) {
    const n = safeNumber(readPath(row, key));
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function pickString(row, keys, fallback = "") {
  for (const key of keys) {
    const value = readPath(row, key);
    if (value == null) continue;
    const text = String(value).trim();
    if (text.length > 0) return text;
  }
  return fallback;
}

function parseRunStamp(runName) {
  const match = String(runName || "").match(/_(\d{8}_\d{6})$/);
  return match ? match[1] : "";
}

function inferModelId(runLabel) {
  const name = String(runLabel || "").toLowerCase();
  if (name.includes("model_a_wide_attn")) return "model_a_wide_attn_diag";
  if (name.includes("model_b_standard_ffn")) return "model_b_standard_ffn_diag";
  if (name.includes("model_a_wide")) return "model_a_wide";
  if (name.includes("model_b_deep")) return "model_b_deep";
  if (name.includes("model_a")) return "model_a";
  if (name.includes("model_b")) return "model_b";
  return String(runLabel || "unknown_model");
}

function modelDisplay(modelId) {
  if (modelId === "model_a_wide") return "Model A (wide)";
  if (modelId === "model_b_deep") return "Model B (deep)";
  if (modelId === "model_a_wide_attn_diag") return "Model A (wide-attn, diag)";
  if (modelId === "model_b_standard_ffn_diag") return "Model B (standard-ffn, diag)";
  if (modelId === "model_a") return "Model A";
  if (modelId === "model_b") return "Model B";
  return String(modelId);
}

function parseMicroSublabel(text) {
  const out = {};
  for (const part of String(text || "").split(",")) {
    const [rawKey, rawValue] = part.trim().split("=");
    if (!rawKey || rawValue == null) continue;
    out[rawKey] = safeNumber(rawValue.trim());
  }
  return out;
}

async function loadMainRows(datasetName, platform, attachment) {
  const table = await attachment.parquet();
  return Array.from(table, (row) => {
    const runName = pickString(row, ["run_name", "config.run_name", "run_id"], "unknown-run");
    const runLabel = normalizeRunLabel(runName);
    const modelId = inferModelId(runLabel);
    const modelLabel = modelDisplay(modelId);
    return {
      dataset: datasetName,
      platform,
      run_name: runName,
      run_label: runLabel,
      run_stamp: parseRunStamp(runName),
      model_id: modelId,
      model_label: modelLabel,
      series_label: `${modelLabel} (${platform.toUpperCase()})`,
      state: pickString(row, ["state"], "unknown"),
      d_model: pickNumber(row, ["config.model_settings.d_model", "config.d_model"]),
      num_layers: pickNumber(row, ["config.model_settings.num_layers", "config.num_layers"]),
      num_heads: pickNumber(row, ["config.model_settings.num_heads", "config.num_heads"]),
      d_ff: pickNumber(row, ["config.model_settings.d_ff", "config.d_ff"]),
      context_length: pickNumber(row, ["config.model_settings.context_length", "config.context_length"]),
      throughput_toks: pickNumber(row, ["Throughput/Tokens per sec"]),
      step_s: pickNumber(row, ["Time/Total step"]),
      loss: pickNumber(row, ["Loss"]),
      eval_loss: pickNumber(row, ["Eval Loss", "Eval/Loss", "Eval/Loss"]),
      eval_perplexity: pickNumber(row, ["Eval Perplexity", "Eval/Perplexity"]),
      memory_current_gb: pickNumber(row, ["Memory/Current allocated (GB)"]),
      memory_max_gb: pickNumber(row, ["Memory/Max allocated (GB)"])
    };
  });
}

async function loadHistoryRows(datasetName, platform, attachment) {
  const table = await attachment.parquet();
  return Array.from(table, (row) => {
    const runName = pickString(row, ["run_name", "config.run_name", "run_id"], "unknown-run");
    const runLabel = normalizeRunLabel(runName);
    const modelId = inferModelId(runLabel);
    const modelLabel = modelDisplay(modelId);
    const runStamp = parseRunStamp(runName);
    return {
      dataset: datasetName,
      platform,
      run_name: runName,
      run_label: runLabel,
      run_stamp: runStamp,
      model_id: modelId,
      model_label: modelLabel,
      series_key: `${platform}:${runName}`,
      series_label: `${modelLabel} (${platform.toUpperCase()})`,
      series_verbose: runStamp ? `${modelLabel} (${platform.toUpperCase()}, ${runStamp})` : `${modelLabel} (${platform.toUpperCase()})`,
      step: pickNumber(row, ["_step"]),
      loss: pickNumber(row, ["Loss"]),
      eval_loss: pickNumber(row, ["Eval Loss", "Eval/Loss", "Eval/Loss"]),
      eval_perplexity: pickNumber(row, ["Eval Perplexity", "Eval/Perplexity"]),
      throughput_toks: pickNumber(row, ["Throughput/Tokens per sec"]),
      step_s: pickNumber(row, ["Time/Total step"]),
      grad_norm_unclipped: pickNumber(row, [
        "Grad/Norm (unclipped)",
        "Grad/Norm (pre-clip)",
        "Grad/Norm (preclip)",
        "Grad/Norm (raw)",
        "Grad/Norm"
      ])
    };
  }).filter((row) => Number.isFinite(row.step));
}

function buildSpeedupRows(mainRows) {
  const mpsByModel = new Map(
    d3
      .groups(
        mainRows.filter((row) => row.platform === "mps"),
        (row) => row.model_id
      )
      .map(([modelId, rows]) => [
        modelId,
        [...rows].sort((a, b) => d3.descending(a.run_stamp, b.run_stamp) || d3.descending(a.run_name, b.run_name))[0]
      ])
  );
  const cudaRows = [...mainRows]
    .filter((row) => row.platform === "cuda")
    .sort((a, b) => d3.descending(a.run_stamp, b.run_stamp) || d3.descending(a.run_name, b.run_name));
  const usedModels = new Set();
  const out = [];

  for (const gpuRow of cudaRows) {
    if (usedModels.has(gpuRow.model_id)) continue;
    usedModels.add(gpuRow.model_id);
    const mpsRow = mpsByModel.get(gpuRow.model_id);
    if (!mpsRow) continue;
    const throughputSpeedup = gpuRow.throughput_toks / mpsRow.throughput_toks;
    const stepTimeSpeedup = mpsRow.step_s / gpuRow.step_s;
    out.push({
      model_id: gpuRow.model_id,
      model_label: gpuRow.model_label,
      run_label: gpuRow.run_label,
      cuda_tokens_per_sec: gpuRow.throughput_toks,
      mps_tokens_per_sec: mpsRow.throughput_toks,
      throughput_speedup: throughputSpeedup,
      cuda_step_s: gpuRow.step_s,
      mps_step_s: mpsRow.step_s,
      step_time_speedup: stepTimeSpeedup,
      throughput_delta: gpuRow.throughput_toks - mpsRow.throughput_toks,
      step_s_delta: gpuRow.step_s - mpsRow.step_s
    });
  }

  return out.sort((a, b) => d3.descending(a.throughput_speedup, b.throughput_speedup));
}

function estimateParamCount(row) {
  const dModel = safeNumber(row.d_model);
  const numLayers = safeNumber(row.num_layers);
  const dFf = safeNumber(row.d_ff);
  if (!Number.isFinite(dModel) || !Number.isFinite(numLayers) || !Number.isFinite(dFf)) return NaN;
  const vocabSize = 10000;
  return (
    2 * vocabSize * dModel +
    dModel +
    numLayers * (2 * dModel + 4 * dModel * dModel + 3 * dModel * dFf)
  );
}

export async function loadEmpiricalData() {
  if (!empiricalDataPromise) {
    empiricalDataPromise = (async () => {
      const [
        mpsMainRows,
        gpuMainRows,
        mpsHistoryRows,
        gpuHistoryRows,
        trainRaw,
        microRaw
      ] = await Promise.all([
        loadMainRows("mps_comp", "mps", ATTACHMENTS.mps_main),
        loadMainRows("gpu_comp", "cuda", ATTACHMENTS.gpu_main),
        loadHistoryRows("mps_comp", "mps", ATTACHMENTS.mps_history),
        loadHistoryRows("gpu_comp", "cuda", ATTACHMENTS.gpu_history),
        ATTACHMENTS.train.json(),
        ATTACHMENTS.micro.json()
      ]);

      const mainRows = [...mpsMainRows, ...gpuMainRows];
      const historyRows = [...mpsHistoryRows, ...gpuHistoryRows];
      const speedupRows = buildSpeedupRows(mainRows);

      const trainRows = Array.isArray(trainRaw?.results)
        ? trainRaw.results.map((row) => ({
            batch_size: safeNumber(row.batch_size),
            seq_len: safeNumber(row.seq_len),
            d_model: safeNumber(row.d_model),
            d_head: safeNumber(row.d_head),
            num_heads: safeNumber(row.num_heads),
            num_layers: safeNumber(row.num_layers),
            d_ff: safeNumber(row.d_ff),
            est_memory_gb: safeNumber(row.est_memory_gb),
            tokens_per_sec: safeNumber(row.tokens_per_sec),
            steps_per_sec: safeNumber(row.steps_per_sec),
            median_s: safeNumber(row.median_s),
            mean_s: safeNumber(row.mean_s),
            iqr_s: safeNumber(row.iqr_s),
            median_ms: safeNumber(row.median_s) * 1000,
            tokens_per_step: safeNumber(row.batch_size) * safeNumber(row.seq_len),
            num_params: estimateParamCount(row),
            num_params_m: estimateParamCount(row) / 1e6,
            ffn_ratio: safeNumber(row.d_ff) / safeNumber(row.d_model),
            label: `B=${safeNumber(row.batch_size, 0)} S=${safeNumber(row.seq_len, 0)} d=${safeNumber(row.d_model, 0)}`
          }))
        : [];

      const microRows = Array.isArray(microRaw)
        ? microRaw.map((row) => {
            const spec = parseMicroSublabel(row.sublabel);
            return {
              label: String(row.label || "micro"),
              sublabel: String(row.sublabel || ""),
              benchmark: `${row.label || "micro"} | ${row.sublabel || ""}`,
              median_s: safeNumber(row.median_s),
              mean_s: safeNumber(row.mean_s),
              iqr_s: safeNumber(row.iqr_s),
              num_runs: safeNumber(row.num_runs),
              batch_size: safeNumber(spec.B),
              seq_len: safeNumber(spec.S),
              d_head: safeNumber(spec.d_head),
              num_heads: safeNumber(spec.h)
            };
          })
        : [];

      return {mainRows, historyRows, speedupRows, trainRows, microRows, trainRaw};
    })();
  }

  return empiricalDataPromise;
}

function selectControl(labelText, values, initialValue) {
  const wrapper = el("label");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "0.5rem";

  const select = el("select");
  for (const value of values) {
    const option = el("option", value.label);
    option.value = value.value;
    if (value.value === initialValue) option.selected = true;
    select.appendChild(option);
  }

  wrapper.append(document.createTextNode(labelText), select);
  return {node: wrapper, select};
}

function checkboxGroup(values, initialValues, keyPrefix, legendText) {
  const group = el("fieldset");
  group.style.border = "none";
  group.style.padding = "0";
  group.style.margin = "0";
  group.style.display = "flex";
  group.style.flexWrap = "wrap";
  group.style.gap = "0.75rem";

  const legend = el("legend", legendText);
  legend.style.fontWeight = "600";
  legend.style.marginBottom = "0.35rem";
  group.appendChild(legend);

  for (const [idx, value] of values.entries()) {
    const id = `${keyPrefix}-${idx}`;
    const label = el("label");
    label.htmlFor = id;
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "0.3rem";
    label.style.cursor = "pointer";

    const input = el("input");
    input.type = "checkbox";
    input.id = id;
    input.dataset.value = String(value);
    input.checked = initialValues.includes(value);

    label.append(input, document.createTextNode(value));
    group.appendChild(label);
  }

  return {
    node: group,
    getSelected() {
      return Array.from(group.querySelectorAll("input[type=checkbox]"))
        .filter((input) => input.checked)
        .map((input) => String(input.dataset.value || ""));
    },
    onChange(callback) {
      group.addEventListener("change", callback);
    }
  };
}

function makeRangeControl(labelText, min, max, step, value) {
  const wrapper = el("label");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "0.5rem";

  const input = el("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);

  const output = el("output", String(value));
  wrapper.append(document.createTextNode(labelText), input, output);
  return {node: wrapper, input, output};
}

export function metricValue(row, metric) {
  if (metric === "Loss") return row.loss;
  if (metric === "Eval Loss") return row.eval_loss;
  if (metric === "Eval Perplexity") return row.eval_perplexity;
  if (metric === "Throughput/Tokens per sec") return row.throughput_toks;
  return row.step_s;
}

export function metricLabel(metric) {
  if (metric === "Loss") return "Loss";
  if (metric === "Eval Loss") return "Eval Loss";
  if (metric === "Eval Perplexity") return "Eval Perplexity";
  if (metric === "Throughput/Tokens per sec") return "Tokens / sec";
  return "Seconds / step";
}

function metricValid(metric, value) {
  if (!Number.isFinite(value)) return false;
  if (metric === "Eval Loss" || metric === "Eval Perplexity") return value > 0;
  if (metric === "Loss") return value > 0;
  if (metric === "Throughput/Tokens per sec") return value > 0;
  if (metric === "Time/Total step") return value > 0;
  return true;
}

function renderLoadError(host, error) {
  clearNode(host);
  host.append(sectionHeading("Load Error"), emptyState(`Failed to load empirical benchmark data: ${error.message}`));
}

function clampRowLimit(value, fallback) {
  const n = Math.floor(safeNumber(value, fallback));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function collapsible(summaryText) {
  const details = el("details");
  const summary = el("summary", summaryText);
  summary.style.cursor = "pointer";
  summary.style.fontWeight = "600";
  details.appendChild(summary);
  return details;
}

function rowLimitNote(displayed, total) {
  const text =
    displayed >= total
      ? `Showing all ${total} row(s).`
      : `Showing ${displayed} of ${total} row(s).`;
  const note = el("p", text);
  note.style.margin = "0";
  return note;
}

function asNumericSet(values) {
  const numbers = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  return new Set(numbers);
}

function uniqueSortedNumeric(rows, key) {
  return Array.from(new Set(rows.map((row) => Number(row[key])).filter((v) => Number.isFinite(v)))).sort(d3.ascending);
}

function renderTrainGridSection(data, options = {}) {
  const {trainRows, trainRaw} = data;
  const host = card();
  host.appendChild(sectionHeading("Training Benchmark Grid (MPS)"));

  if (trainRows.length === 0) {
    host.appendChild(emptyState("No train benchmark JSON rows available."));
    return host;
  }

  const summary = el(
    "p",
    `Device: ${String(trainRaw?.device || "unknown")} | Timestamp: ${String(trainRaw?.timestamp || "unknown")} | Rows: ${trainRows.length}`
  );
  summary.style.margin = "0";
  host.appendChild(summary);

  const batchValues = uniqueSortedNumeric(trainRows, "batch_size").map(String);
  const seqValues = uniqueSortedNumeric(trainRows, "seq_len").map(String);
  const dModelValues = uniqueSortedNumeric(trainRows, "d_model").map(String);
  const dHeadValues = uniqueSortedNumeric(trainRows, "d_head").map(String);
  const numHeadsValues = uniqueSortedNumeric(trainRows, "num_heads").map(String);
  const numLayersValues = uniqueSortedNumeric(trainRows, "num_layers").map(String);
  const dFfValues = uniqueSortedNumeric(trainRows, "d_ff").map(String);

  const batchControl = checkboxGroup(batchValues, batchValues, "grid-batch", "Batch");
  const seqControl = checkboxGroup(seqValues, seqValues, "grid-seq", "Seq Len");
  const dModelControl = checkboxGroup(dModelValues, dModelValues, "grid-dmodel", "d_model");
  const dHeadControl = checkboxGroup(dHeadValues, dHeadValues, "grid-dhead", "d_head");
  const numHeadsControl = checkboxGroup(numHeadsValues, numHeadsValues, "grid-heads", "num_heads");
  const numLayersControl = checkboxGroup(numLayersValues, numLayersValues, "grid-layers", "num_layers");
  const dFfControl = checkboxGroup(dFfValues, dFfValues, "grid-dff", "d_ff");

  const metricOptions = [
    {value: "batch_size", label: "Batch size (B)"},
    {value: "seq_len", label: "Sequence length (S)"},
    {value: "d_model", label: "Model dimension (d_model)"},
    {value: "d_head", label: "Head dimension (d_head)"},
    {value: "num_heads", label: "Attention heads (h)"},
    {value: "num_layers", label: "Transformer layers (L)"},
    {value: "d_ff", label: "FFN dimension (d_ff)"},
    {value: "tokens_per_sec", label: "Tokens / sec"},
    {value: "steps_per_sec", label: "Steps / sec"},
    {value: "median_ms", label: "Median step (ms)"},
    {value: "mean_s", label: "Mean step (s)"},
    {value: "iqr_s", label: "Step IQR (s)"},
    {value: "tokens_per_step", label: "Tokens / step"},
    {value: "est_memory_gb", label: "Estimated memory (GB)"},
    {value: "num_params_m", label: "Parameters (M)"},
    {value: "ffn_ratio", label: "FFN ratio"}
  ];
  const axisLabels = Object.fromEntries(metricOptions.map((opt) => [opt.value, opt.label]));

  const xMetricControl = selectControl("X", metricOptions, options.gridX || "est_memory_gb");
  const yMetricControl = selectControl("Y", metricOptions, options.gridY || "tokens_per_sec");
  const colorByControl = selectControl("Color", metricOptions, options.gridColor || "d_model");
  const zMetricControl = selectControl(
    "Mark Size",
    [{value: "(fixed)", label: "(none / fixed size)"}, ...metricOptions],
    options.gridZ || options.gridSize || "batch_size"
  );
  const chartModeControl = selectControl(
    "Marks",
    [
      {value: "dots", label: "dots"},
      {value: "dots+trend", label: "dots + trend"}
    ],
    options.gridMode || "dots+trend"
  );
  const tableLimitControl = makeRangeControl("Table rows", 25, 300, 25, clampRowLimit(options.gridTableLimit, 100));
  const resetAxesButton = el("button", "Reset X/Y");
  resetAxesButton.type = "button";
  const axisActions = el("div");
  axisActions.style.display = "flex";
  axisActions.style.gap = "0.5rem";
  axisActions.appendChild(resetAxesButton);

  const controls = card();
  controls.append(
    batchControl.node,
    seqControl.node,
    dModelControl.node,
    dHeadControl.node,
    numHeadsControl.node,
    numLayersControl.node,
    dFfControl.node,
    xMetricControl.node,
    yMetricControl.node,
    zMetricControl.node,
    axisActions,
    colorByControl.node,
    chartModeControl.node,
    tableLimitControl.node
  );

  const chartHost = card();
  const tableHost = card();
  host.append(controls, chartHost, tableHost);

  const refresh = () => {
    tableLimitControl.output.textContent = tableLimitControl.input.value;

    const batchSet = asNumericSet(batchControl.getSelected());
    const seqSet = asNumericSet(seqControl.getSelected());
    const dModelSet = asNumericSet(dModelControl.getSelected());
    const dHeadSet = asNumericSet(dHeadControl.getSelected());
    const numHeadsSet = asNumericSet(numHeadsControl.getSelected());
    const numLayersSet = asNumericSet(numLayersControl.getSelected());
    const dFfSet = asNumericSet(dFfControl.getSelected());

    const filtered = trainRows
      .filter((row) => batchSet.has(row.batch_size))
      .filter((row) => seqSet.has(row.seq_len))
      .filter((row) => dModelSet.has(row.d_model))
      .filter((row) => dHeadSet.has(row.d_head))
      .filter((row) => numHeadsSet.has(row.num_heads))
      .filter((row) => numLayersSet.has(row.num_layers))
      .filter((row) => dFfSet.has(row.d_ff));

    clearNode(chartHost);
    clearNode(tableHost);
    chartHost.appendChild(sectionHeading("Interactive Grid View"));

    if (filtered.length === 0) {
      chartHost.appendChild(emptyState("No rows match current filters."));
      tableHost.appendChild(emptyState("No rows to display."));
      return;
    }

    const xKey = xMetricControl.select.value;
    const yKey = yMetricControl.select.value;
    const zKey = zMetricControl.select.value;
    const colorKey = colorByControl.select.value;
    const chartMode = chartModeControl.select.value;

    const plotted = filtered
      .filter((row) => Number.isFinite(Number(row[xKey])))
      .filter((row) => Number.isFinite(Number(row[yKey])))
      .filter((row) => Number.isFinite(Number(row[colorKey])))
      .filter((row) => zKey === "(fixed)" || Number.isFinite(Number(row[zKey])));
    const colorValue = (row) => Number(row[colorKey]);
    const zValue = (row) => Number(row[zKey]);
    const zMin = zKey === "(fixed)" ? NaN : d3.min(plotted, zValue);
    const zMax = zKey === "(fixed)" ? NaN : d3.max(plotted, zValue);
    const plottedOrdered =
      zKey === "(fixed)"
        ? plotted
        : [...plotted].sort((a, b) => d3.ascending(zValue(a), zValue(b)));
    const radiusFor = (row) => {
      if (zKey === "(fixed)") return 4;
      const v = zValue(row);
      if (!Number.isFinite(v)) return 4;
      if (!Number.isFinite(zMin) || !Number.isFinite(zMax) || zMax <= zMin) return 6;
      const t = (v - zMin) / (zMax - zMin);
      return 2.5 + t * 8.5;
    };
    const zLabel = zKey === "(fixed)" ? "none" : axisLabels[zKey] || zKey;

    const marks = [
      Plot.dot(plottedOrdered, {
        x: xKey,
        y: yKey,
        fill: colorValue,
        r: radiusFor,
        title: (d) => `B=${d.batch_size} S=${d.seq_len} d=${d.d_model} h=${d.num_heads} L=${d.num_layers} d_ff=${d.d_ff}\ntok/s=${Number(d.tokens_per_sec).toFixed(1)}  ms=${Number(d.median_ms).toFixed(1)}  mem=${Number(d.est_memory_gb).toFixed(2)}GB  params=${Number(d.num_params_m).toFixed(1)}M\nz=${zKey === "(fixed)" ? "n/a" : Number(d[zKey]).toFixed(3)}`,
        tip: true
      })
    ];
    if (chartMode === "dots+trend" && plotted.length > 10) {
      marks.push(Plot.linearRegressionY(plotted, {x: xKey, y: yKey, stroke: "currentColor"}));
    }

    chartHost.appendChild(
      Plot.plot({
        width: 920,
        height: 380,
        x: {label: axisLabels[xKey] || xKey, grid: true},
        y: {label: axisLabels[yKey] || yKey, grid: true},
        color: {scheme: "warm", legend: true, label: axisLabels[colorKey] || colorKey},
        r: zKey === "(fixed)" ? {legend: false} : {legend: true, label: zLabel},
        marks
      })
    );

    const tableLimit = clampRowLimit(tableLimitControl.input.value, 100);
    const tableRows = [...plotted]
      .sort((a, b) => d3.descending(a.tokens_per_sec, b.tokens_per_sec) || d3.ascending(a.est_memory_gb, b.est_memory_gb))
      .slice(0, tableLimit);

    const details = collapsible("expand to view table of individual observations");
    details.append(
      rowLimitNote(tableRows.length, plotted.length),
      renderSimpleTable(tableRows, [
        {key: "batch_size", label: "Batch", align: "right"},
        {key: "seq_len", label: "Seq", align: "right"},
        {key: "d_model", label: "d_model", align: "right"},
        {key: "d_head", label: "d_head", align: "right"},
        {key: "num_heads", label: "heads", align: "right"},
        {key: "num_layers", label: "layers", align: "right"},
        {key: "d_ff", label: "d_ff", align: "right"},
        {key: "tokens_per_sec", label: "tok/s", align: "right", format: (v) => Number(v).toFixed(1)},
        {key: "median_ms", label: "median ms", align: "right", format: (v) => Number(v).toFixed(1)},
        {key: "est_memory_gb", label: "mem GB", align: "right", format: (v) => Number(v).toFixed(2)},
        {key: "num_params_m", label: "params M", align: "right", format: (v) => Number(v).toFixed(1)},
        {key: "ffn_ratio", label: "ffn x", align: "right", format: (v) => Number(v).toFixed(2)}
      ])
    );
    tableHost.appendChild(details);
  };

  const listeners = [
    [batchControl, "change"],
    [seqControl, "change"],
    [dModelControl, "change"],
    [dHeadControl, "change"],
    [numHeadsControl, "change"],
    [numLayersControl, "change"],
    [dFfControl, "change"]
  ];
  for (const [control] of listeners) control.onChange(refresh);
  xMetricControl.select.addEventListener("change", refresh);
  yMetricControl.select.addEventListener("change", refresh);
  zMetricControl.select.addEventListener("change", refresh);
  colorByControl.select.addEventListener("change", refresh);
  chartModeControl.select.addEventListener("change", refresh);
  tableLimitControl.input.addEventListener("input", refresh);
  resetAxesButton.addEventListener("click", () => {
    xMetricControl.select.value = "est_memory_gb";
    yMetricControl.select.value = "tokens_per_sec";
    refresh();
  });

  refresh();
  return host;
}

function renderExpectedVsActualSection(data, options = {}) {
  const M4_FP32_TFLOPS = 3.2;
  const TRAIN_BENCH_VOCAB_SIZE = 10000;
  const {trainRows} = data;
  const host = card();
  host.appendChild(sectionHeading("Expected vs Actual Performance"));

  if (trainRows.length === 0) {
    host.appendChild(emptyState("No train benchmark rows available."));
    return host;
  }

  const batchValues = uniqueSortedNumeric(trainRows, "batch_size");
  const seqValues = uniqueSortedNumeric(trainRows, "seq_len");
  const dModelValues = uniqueSortedNumeric(trainRows, "d_model");
  const dHeadValues = uniqueSortedNumeric(trainRows, "d_head");
  const numHeadsValues = uniqueSortedNumeric(trainRows, "num_heads");
  const numLayersValues = uniqueSortedNumeric(trainRows, "num_layers");
  const dFfValues = uniqueSortedNumeric(trainRows, "d_ff");

  const batchControl = checkboxGroup(batchValues, batchValues, "eva-batch", "Batch size (B)");
  const seqControl = checkboxGroup(seqValues, seqValues, "eva-seq", "Sequence length (S)");
  const dModelControl = checkboxGroup(dModelValues, dModelValues, "eva-dm", "d_model");
  const dHeadControl = checkboxGroup(dHeadValues, dHeadValues, "eva-dh", "d_head");
  const numHeadsControl = checkboxGroup(numHeadsValues, numHeadsValues, "eva-nh", "heads");
  const numLayersControl = checkboxGroup(numLayersValues, numLayersValues, "eva-nl", "layers");
  const dFfControl = checkboxGroup(dFfValues, dFfValues, "eva-ff", "d_ff");
  const colorByControl = selectControl("Dot color", [
    {label: "Batch size (B)", value: "batch_size"},
    {label: "Sequence length (S)", value: "seq_len"},
    {label: "Model parameters (M)", value: "num_params_m"}
  ], "batch_size");
  const xAxisControl = selectControl("Observed tok/s chart X axis", [
    {label: "Batch size (B)", value: "batch_size"},
    {label: "Sequence length (S)", value: "seq_len"},
    {label: "Model dimension (d_model)", value: "d_model"},
    {label: "Head dimension (d_head)", value: "d_head"},
    {label: "Attention heads (h)", value: "num_heads"},
    {label: "Transformer layers (L)", value: "num_layers"},
    {label: "FFN dimension (d_ff)", value: "d_ff"},
    {label: "Estimated memory (GB)", value: "est_memory_gb"},
    {label: "Model parameters (M)", value: "num_params_m"},
    {label: "Tokens per iteration", value: "tokens_per_iteration"}
  ], "d_model");

  const allEva = computeExpectedVsActual(trainRows);
  const observedMinBound = d3.min(allEva, (d) => d.actual_step_s) ?? 0;
  const observedMaxBound = d3.max(allEva, (d) => d.actual_step_s) ?? 10;
  const expectedMinBound = d3.min(allEva, (d) => d.expected_step_s) ?? 0;
  const expectedMaxBound = d3.max(allEva, (d) => d.expected_step_s) ?? 10;
  const observedStepRes = Math.max((observedMaxBound - observedMinBound) / 5000, 1e-6);
  const expectedStepRes = Math.max((expectedMaxBound - expectedMinBound) / 5000, 1e-6);
  const minObservedControl = makeRangeControl("Min observed step (s)", observedMinBound, observedMaxBound, observedStepRes, observedMinBound);
  const maxObservedControl = makeRangeControl("Max observed step (s)", observedMinBound, observedMaxBound, observedStepRes, observedMaxBound);
  const minExpectedControl = makeRangeControl("Min expected step (s)", expectedMinBound, expectedMaxBound, expectedStepRes, expectedMinBound);
  const maxExpectedControl = makeRangeControl("Max expected step (s)", expectedMinBound, expectedMaxBound, expectedStepRes, expectedMaxBound);

  const formatRangeValue = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "n/a";
    if (n >= 1) return n.toFixed(4);
    if (n >= 0.01) return n.toFixed(5);
    return n.toPrecision(4);
  };

  const syncRangePair = (minControl, maxControl) => {
    const update = () => {
      let minValue = safeNumber(minControl.input.value, 0);
      let maxValue = safeNumber(maxControl.input.value, 0);
      if (minValue > maxValue) {
        if (document.activeElement === minControl.input) {
          maxValue = minValue;
          maxControl.input.value = String(maxValue);
        } else {
          minValue = maxValue;
          minControl.input.value = String(minValue);
        }
      }
      minControl.output.textContent = formatRangeValue(minValue);
      maxControl.output.textContent = formatRangeValue(maxValue);
    };
    minControl.input.addEventListener("input", update);
    maxControl.input.addEventListener("input", update);
    update();
  };

  syncRangePair(minObservedControl, maxObservedControl);
  syncRangePair(minExpectedControl, maxExpectedControl);

  const filters = el("div");
  filters.style.display = "grid";
  filters.style.gap = "0.5rem";
  filters.append(
    batchControl.node, seqControl.node, dModelControl.node, dHeadControl.node,
    numHeadsControl.node, numLayersControl.node, dFfControl.node, colorByControl.node,
    minObservedControl.node, maxObservedControl.node, minExpectedControl.node, maxExpectedControl.node
  );
  host.appendChild(filters);

  const chartStepHost = el("div");
  chartStepHost.className = "card";
  const chartThroughputHost = el("div");
  chartThroughputHost.className = "card";
  const bottomChartControlsHost = card();
  bottomChartControlsHost.appendChild(xAxisControl.node);
  const chartTokensByXHost = el("div");
  chartTokensByXHost.className = "card";
  const tableHost = el("div");
  host.append(chartStepHost, chartThroughputHost, bottomChartControlsHost, chartTokensByXHost, tableHost);

  function computeExpectedVsActual(filtered) {
    return filtered.map((row) => {
      const fwd = calculateForwardFlops(
        row.batch_size, row.seq_len, TRAIN_BENCH_VOCAB_SIZE,
        row.d_model, row.num_heads, row.num_layers, row.d_ff
      );
      const train = calculateTrainingStepFlops(fwd.total);
      const expectedStepS = train.total_TFLOPs / M4_FP32_TFLOPS;
      const tokensPerIteration = row.batch_size * row.seq_len;
      const expectedTokensPerSec = tokensPerIteration / expectedStepS;
      const actualParamsMPerSec = row.median_s > 0 ? row.num_params_m / row.median_s : NaN;
      const expectedParamsMPerSec = expectedStepS > 0 ? row.num_params_m / expectedStepS : NaN;
      const modelSpec = `B=${row.batch_size}, S=${row.seq_len}, d_model=${row.d_model}, d_head=${row.d_head}, h=${row.num_heads}, L=${row.num_layers}, d_ff=${row.d_ff}`;
      return {
        batch_size: row.batch_size, seq_len: row.seq_len,
        d_model: row.d_model, d_head: row.d_head,
        num_heads: row.num_heads, num_layers: row.num_layers, d_ff: row.d_ff,
        model_spec: modelSpec,
        est_memory_gb: row.est_memory_gb, num_params_m: row.num_params_m,
        tokens_per_iteration: tokensPerIteration,
        actual_step_s: row.median_s, expected_step_s: expectedStepS,
        actual_tokens_per_sec: row.tokens_per_sec,
        expected_tokens_per_sec: expectedTokensPerSec,
        actual_params_m_per_sec: actualParamsMPerSec,
        expected_params_m_per_sec: expectedParamsMPerSec,
        step_ratio_actual_over_expected: row.median_s / expectedStepS,
        throughput_ratio_actual_over_expected: row.tokens_per_sec / expectedTokensPerSec,
        params_ratio_actual_over_expected: actualParamsMPerSec / expectedParamsMPerSec
      };
    });
  }

  function buildDiagonalScatter(hostEl, rows, xKey, yKey, xLabel, yLabel, emptyMsg, colorBy, scaleOpts = {}) {
    clearNode(hostEl);
    const colorLabelByKey = {
      batch_size: "Batch size (B)",
      seq_len: "Sequence length (S)",
      num_params_m: "Model parameters (M)"
    };
    const colorLabel = colorLabelByKey[colorBy] || colorBy;
    const colorValue = (d) => Number(d[colorBy]);
    let scatterRows = rows
      .filter((d) => Number.isFinite(d[xKey]) && d[xKey] > 0)
      .filter((d) => Number.isFinite(d[yKey]) && d[yKey] > 0)
      .filter((d) => Number.isFinite(colorValue(d)));
    if (scatterRows.length === 0) {
      hostEl.appendChild(emptyState(emptyMsg));
      return;
    }
    const colorConfig = {legend: true, label: colorLabel, scheme: "warm"};
    const xMin = d3.min(scatterRows, (d) => d[xKey]);
    const xMax = d3.max(scatterRows, (d) => d[xKey]);
    const yMin = d3.min(scatterRows, (d) => d[yKey]);
    const yMax = d3.max(scatterRows, (d) => d[yKey]);
    const minDiag = Math.max(xMin ?? NaN, yMin ?? NaN);
    const maxDiag = Math.min(xMax ?? NaN, yMax ?? NaN);
    const diagRows =
      Number.isFinite(minDiag) && Number.isFinite(maxDiag) && maxDiag > minDiag
        ? [{v: minDiag}, {v: maxDiag}]
        : [];
    const kernelTrendRows = (() => {
      if (scatterRows.length < 12) return [];
      const logX = Boolean(scaleOpts.logX);
      const transformed = scatterRows
        .map((d) => {
          const x = Number(d[xKey]);
          const y = Number(d[yKey]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          if (logX && x <= 0) return null;
          return {x, tx: logX ? Math.log10(x) : x, y};
        })
        .filter((d) => d != null);
      if (transformed.length < 12) return [];

      transformed.sort((a, b) => d3.ascending(a.tx, b.tx));
      const txMin = transformed[0]?.tx;
      const txMax = transformed[transformed.length - 1]?.tx;
      const txRange = txMax - txMin;
      if (!Number.isFinite(txRange) || txRange <= 0) return [];

      const std = d3.deviation(transformed, (d) => d.tx);
      const n = transformed.length;
      const silverman = Number.isFinite(std) && std > 0 ? 1.06 * std * Math.pow(n, -0.2) : NaN;
      const bandwidth = Number.isFinite(silverman) && silverman > 0 ? silverman : txRange / 12;
      if (!Number.isFinite(bandwidth) || bandwidth <= 0) return [];

      const gaussian = (u) => Math.exp(-0.5 * u * u);
      const samples = Math.min(120, Math.max(40, Math.round(Math.sqrt(n) * 3)));
      const out = [];

      for (let i = 0; i < samples; i += 1) {
        const t = txMin + (txRange * i) / (samples - 1);
        let wSum = 0;
        let ySum = 0;
        for (const row of transformed) {
          const w = gaussian((t - row.tx) / bandwidth);
          wSum += w;
          ySum += w * row.y;
        }
        if (wSum <= 0) continue;
        const x = logX ? Math.pow(10, t) : t;
        const y = ySum / wSum;
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        out.push({x, y});
      }
      return out;
    })();
    hostEl.appendChild(
      Plot.plot({
        width: 920,
        height: 380,
        x: {label: xLabel, grid: true, type: scaleOpts.logX ? "log" : "linear"},
        y: {label: yLabel, grid: true, type: scaleOpts.logY ? "log" : "linear"},
        color: colorConfig,
        marks: [
          Plot.dot(scatterRows, {
            x: xKey, y: yKey, fill: colorValue, title: "model_spec", r: 3.8, tip: true
          }),
          ...(kernelTrendRows.length > 1
            ? [Plot.line(kernelTrendRows, {x: "x", y: "y", stroke: "var(--theme-foreground-focus)", curve: "natural"})]
            : []),
          ...(diagRows.length > 0
            ? [Plot.line(diagRows, {x: "v", y: "v", stroke: "var(--theme-foreground-muted)", strokeDasharray: "4 4"})]
            : [])
        ]
      })
    );
  }

  function buildTokensByXScatter(hostEl, rows, xKey, xLabel, emptyMsg, colorBy) {
    clearNode(hostEl);
    const colorLabelByKey = {
      batch_size: "Batch size (B)",
      seq_len: "Sequence length (S)",
      num_params_m: "Model parameters (M)"
    };
    const colorLabel = colorLabelByKey[colorBy] || colorBy;
    const colorValue = (d) => Number(d[colorBy]);
    const tokensRows = rows.map((d) => ({
      ...d,
      x_value: d[xKey],
      y_value: d.actual_tokens_per_sec
    }))
      .filter((d) => Number.isFinite(d.x_value))
      .filter((d) => Number.isFinite(d.y_value) && d.y_value > 0)
      .filter((d) => Number.isFinite(colorValue(d)));

    if (tokensRows.length === 0) {
      hostEl.appendChild(emptyState(emptyMsg));
      return;
    }
    const colorConfig = {legend: true, label: colorLabel, scheme: "warm"};

    hostEl.appendChild(
      Plot.plot({
        width: 920,
        height: 380,
        x: {label: xLabel, grid: true},
        y: {label: "Observed tokens / sec", grid: true},
        color: colorConfig,
        marks: [
          Plot.dot(tokensRows, {
            x: "x_value",
            y: "y_value",
            fill: colorValue,
            r: 3.6,
            opacity: 0.85,
            title: (d) => `Observed tok/s\n${d.model_spec}`,
            tip: true
          }),
          ...(tokensRows.length > 2
            ? [Plot.linearRegressionY(tokensRows, {x: "x_value", y: "y_value", stroke: "var(--theme-foreground-muted)"})]
            : [])
        ]
      })
    );
  }

  const refresh = () => {
    const selectedBatch = asNumericSet(batchControl.getSelected());
    const selectedSeq = asNumericSet(seqControl.getSelected());
    const selectedDModel = asNumericSet(dModelControl.getSelected());
    const selectedDHead = asNumericSet(dHeadControl.getSelected());
    const selectedNumHeads = asNumericSet(numHeadsControl.getSelected());
    const selectedNumLayers = asNumericSet(numLayersControl.getSelected());
    const selectedDFf = asNumericSet(dFfControl.getSelected());
    const colorBy = colorByControl.select.value;
    const xKey = xAxisControl.select.value;
    const xAxisLabels = {
      batch_size: "Batch size (B)",
      seq_len: "Sequence length (S)",
      d_model: "Model dimension (d_model)",
      d_head: "Head dimension (d_head)",
      num_heads: "Attention heads (h)",
      num_layers: "Transformer layers (L)",
      d_ff: "FFN dimension (d_ff)",
      est_memory_gb: "Estimated memory (GB)",
      num_params_m: "Model parameters (M)",
      tokens_per_iteration: "Tokens per iteration"
    };

    const filtered = trainRows
      .filter((d) => selectedBatch.has(d.batch_size))
      .filter((d) => selectedSeq.has(d.seq_len))
      .filter((d) => selectedDModel.has(d.d_model))
      .filter((d) => selectedDHead.has(d.d_head))
      .filter((d) => selectedNumHeads.has(d.num_heads))
      .filter((d) => selectedNumLayers.has(d.num_layers))
      .filter((d) => selectedDFf.has(d.d_ff));

    const minObs = safeNumber(minObservedControl.input.value, -Infinity);
    const maxObs = safeNumber(maxObservedControl.input.value, Infinity);
    const minExp = safeNumber(minExpectedControl.input.value, -Infinity);
    const maxExp = safeNumber(maxExpectedControl.input.value, Infinity);
    const evaRows = computeExpectedVsActual(filtered)
      .filter((d) => d.actual_step_s >= minObs)
      .filter((d) => d.actual_step_s <= maxObs)
      .filter((d) => d.expected_step_s >= minExp)
      .filter((d) => d.expected_step_s <= maxExp);

    buildDiagonalScatter(
      chartStepHost, evaRows,
      "expected_step_s", "actual_step_s",
      "Expected iteration time (s)", "Observed iteration time (s)",
      "No rows available for expected-vs-observed iteration-time chart.", colorBy,
      {logX: true}
    );
    buildDiagonalScatter(
      chartThroughputHost, evaRows,
      "expected_tokens_per_sec", "actual_tokens_per_sec",
      "Expected throughput (tok/s)", "Observed throughput (tok/s)",
      "No rows available for expected-vs-observed throughput chart.", colorBy
    );
    buildTokensByXScatter(
      chartTokensByXHost,
      evaRows,
      xKey,
      xAxisLabels[xKey] || xKey,
      "No rows available for tokens/sec vs selected variable chart.",
      colorBy
    );

    clearNode(tableHost);
    if (evaRows.length > 0) {
      const details = collapsible("expand to view expected-vs-observed table");
      details.append(
        renderSimpleTable(evaRows, [
          {key: "batch_size", label: "B", align: "right"},
          {key: "seq_len", label: "S", align: "right"},
          {key: "d_model", label: "d_model", align: "right"},
          {key: "d_head", label: "d_k", align: "right"},
          {key: "num_heads", label: "h", align: "right"},
          {key: "num_layers", label: "L", align: "right"},
          {key: "d_ff", label: "d_ff", align: "right"},
          {key: "tokens_per_iteration", label: "tok/iter", align: "right", format: (v) => Number(v).toFixed(0)},
          {key: "actual_step_s", label: "actual step (s)", align: "right", format: (v) => Number(v).toFixed(4)},
          {key: "expected_step_s", label: "expected step (s)", align: "right", format: (v) => Number(v).toFixed(4)},
          {key: "actual_tokens_per_sec", label: "actual tok/s", align: "right", format: (v) => Number(v).toFixed(1)},
          {key: "expected_tokens_per_sec", label: "expected tok/s", align: "right", format: (v) => Number(v).toFixed(1)},
          {key: "step_ratio_actual_over_expected", label: "actual/expected step", align: "right", format: (v) => `${Number(v).toFixed(2)}x`},
          {key: "throughput_ratio_actual_over_expected", label: "actual/expected tok/s", align: "right", format: (v) => `${Number(v).toFixed(2)}x`}
        ])
      );
      tableHost.appendChild(details);
    }
  };

  const filterListeners = [batchControl, seqControl, dModelControl, dHeadControl, numHeadsControl, numLayersControl, dFfControl];
  for (const ctrl of filterListeners) ctrl.onChange(refresh);
  colorByControl.select.addEventListener("change", refresh);
  xAxisControl.select.addEventListener("change", refresh);
  minObservedControl.input.addEventListener("input", refresh);
  maxObservedControl.input.addEventListener("input", refresh);
  minExpectedControl.input.addEventListener("input", refresh);
  maxExpectedControl.input.addEventListener("input", refresh);

  refresh();
  return host;
}

function renderDeviceComparisonSection(data, options = {}) {
  const {speedupRows, historyRows} = data;
  const host = card();
  host.appendChild(sectionHeading("Training Throughput Comparison"));

  if (speedupRows.length === 0) {
    host.appendChild(emptyState("No platform comparison rows available."));
    return host;
  }

  const modelValues = Array.from(new Set(speedupRows.map((row) => row.model_label))).sort(d3.ascending);
  const platformRows = speedupRows.flatMap((row) => [
    {
      model_label: row.model_label,
      platform_label: "MPS",
      tokens_per_sec: row.mps_tokens_per_sec,
      iterations_per_sec: Number.isFinite(Number(row.mps_step_s)) && Number(row.mps_step_s) > 0 ? 1 / Number(row.mps_step_s) : NaN
    },
    {
      model_label: row.model_label,
      platform_label: "CUDA",
      tokens_per_sec: row.cuda_tokens_per_sec,
      iterations_per_sec: Number.isFinite(Number(row.cuda_step_s)) && Number(row.cuda_step_s) > 0 ? 1 / Number(row.cuda_step_s) : NaN
    }
  ]).filter((row) => Number.isFinite(Number(row.tokens_per_sec)) || Number.isFinite(Number(row.iterations_per_sec)));
  const throughputHost = card();
  const iterationsHost = card();
  const speedupHost = card();
  const performanceHost = card();
  const tableHost = card();
  host.append(throughputHost, iterationsHost, speedupHost, performanceHost, tableHost);

  const renderMetricBarChart = (container, chartTitle, yLabel, valueKey) => {
    clearNode(container);
    container.appendChild(sectionHeading(chartTitle));

    const chartRows = platformRows.filter((row) => Number.isFinite(Number(row[valueKey])));
    if (chartRows.length === 0) {
      container.appendChild(emptyState(`No rows available for ${chartTitle.toLowerCase()}.`));
      return;
    }

    const positiveValues = chartRows
      .map((row) => Number(row[valueKey]))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (positiveValues.length === 0) {
      container.appendChild(emptyState(`No positive values available for ${chartTitle.toLowerCase()}.`));
      return;
    }
    const yMin = d3.min(positiveValues);
    const yMax = d3.max(positiveValues);
    const yFloor = Math.max(Number.EPSILON, yMin / 2);

    container.appendChild(
      Plot.plot({
        width: 920,
        height: 340,
        marginBottom: 72,
        x: {label: null, domain: modelValues, tickRotate: -20},
        y: {label: `${yLabel} (log scale)`, type: "log", grid: true, domain: [yFloor, yMax]},
        fx: {label: "Device"},
        color: {legend: true, label: "Model", scheme: "warm", domain: modelValues},
        marks: [
          Plot.ruleY([yFloor], {stroke: "var(--theme-foreground-faint)"}),
          Plot.rectY(chartRows, {
            fx: "platform_label",
            x: "model_label",
            y1: yFloor,
            y2: valueKey,
            fill: "model_label",
            title: (d) =>
              `${d.model_label} (${d.platform_label})\n` +
              `${valueKey === "tokens_per_sec" ? "Tokens/sec" : "Iterations/sec"}: ${Number(d[valueKey]).toFixed(valueKey === "tokens_per_sec" ? 1 : 3)}`
          })
        ]
      })
    );
  };

  const refresh = () => {
    renderMetricBarChart(throughputHost, "Tokens / sec by model and device", "Tokens / sec", "tokens_per_sec");
    renderMetricBarChart(iterationsHost, "Iterations / sec by model and device", "Iterations / sec", "iterations_per_sec");
    clearNode(speedupHost);
    clearNode(performanceHost);
    clearNode(tableHost);

    speedupHost.appendChild(sectionHeading("GPU vs MPS Speedup"));
    if (speedupRows.length === 0) {
      speedupHost.appendChild(emptyState("No paired MPS/CUDA rows available."));
    } else {
      const sorted = [...speedupRows].sort((a, b) => d3.descending(a.throughput_speedup, b.throughput_speedup));
      speedupHost.appendChild(
        Plot.plot({
          width: 920,
          height: Math.min(420, 140 + sorted.length * 48),
          marginLeft: 220,
          x: {label: "CUDA / MPS throughput speedup", grid: true},
          color: {scheme: "warm", legend: true, label: "Speedup"},
          marks: [
            Plot.ruleX([1], {stroke: "var(--theme-foreground-faint)", strokeDasharray: "4 4"}),
            Plot.barX(sorted, {y: "model_label", x: "throughput_speedup", fill: "throughput_speedup", tip: true}),
            Plot.text(sorted, {
              y: "model_label",
              x: "throughput_speedup",
              text: (d) => `${d.throughput_speedup.toFixed(2)}\u00d7`,
              dx: 4,
              textAnchor: "start"
            })
          ]
        })
      );
    }

    performanceHost.appendChild(sectionHeading("Tokens per Second"));
    const trendSeriesRowsByPlatformModel = d3
      .groups(historyRows, (row) => `${row.platform}:${row.model_id}`)
      .map(([, rows]) => {
        const byRun = d3
          .groups(rows, (row) => row.run_name)
          .map(([, runRows]) => runRows)
          .sort(
            (a, b) =>
              d3.descending(a[0]?.run_stamp || "", b[0]?.run_stamp || "") ||
              d3.descending(a[0]?.run_name || "", b[0]?.run_name || "")
          );
        return byRun[0] || [];
      })
      .filter((rows) => rows.length > 0);
    const allTrendRows = trendSeriesRowsByPlatformModel
      .flatMap((rows) => rows)
      .filter((row) => Number.isFinite(Number(row.step)))
      .sort((a, b) => d3.ascending(a.step, b.step));
    const tokensTrendRows = allTrendRows
      .filter((row) => Number.isFinite(Number(row.throughput_toks)) && Number(row.throughput_toks) > 0)
      .sort((a, b) => d3.ascending(a.step, b.step));
    const stepTimeTrendRows = allTrendRows
      .filter((row) => Number.isFinite(Number(row.step_s)) && Number(row.step_s) > 0)
      .sort((a, b) => d3.ascending(a.step, b.step));

    if (tokensTrendRows.length === 0) {
      performanceHost.appendChild(emptyState("No token throughput rows available."));
    } else {
      performanceHost.appendChild(
        Plot.plot({
          width: 920,
          height: 320,
          x: {label: "Step", grid: true},
          y: {label: "Tokens per second", grid: true},
          color: {legend: true, scheme: "warm", label: "Series"},
          marks: [
            Plot.dot(tokensTrendRows, {
              x: "step",
              y: "throughput_toks",
              fill: "series_label",
              z: "series_key",
              r: 1.1,
              opacity: 0.85,
              title: (d) =>
                `${d.series_label}\nStep: ${Number(d.step).toFixed(0)}\n` +
                `Tokens/s: ${Number(d.throughput_toks).toFixed(1)}\n` +
                `Step time (s): ${Number(d.step_s).toFixed(4)}`,
              tip: true
            })
          ]
        })
      );
    }

    performanceHost.appendChild(sectionHeading("Step Time (seconds per iteration)"));
    if (stepTimeTrendRows.length === 0) {
      performanceHost.appendChild(emptyState("No step-time rows available."));
    } else {
      performanceHost.appendChild(
        Plot.plot({
          width: 920,
          height: 320,
          x: {label: "Step", grid: true},
          y: {label: "Seconds per step", grid: true},
          color: {legend: true, scheme: "warm", label: "Series"},
          marks: [
            Plot.dot(stepTimeTrendRows, {
              x: "step",
              y: "step_s",
              fill: "series_label",
              z: "series_key",
              r: 1.1,
              opacity: 0.85,
              title: (d) =>
                `${d.series_label}\nStep: ${Number(d.step).toFixed(0)}\n` +
                `Step time (s): ${Number(d.step_s).toFixed(4)}\n` +
                `Tokens/s: ${Number(d.throughput_toks).toFixed(1)}`,
              tip: true
            })
          ]
        })
      );
    }

    const tableRows = [...speedupRows]
      .sort((a, b) => d3.descending(a.throughput_speedup, b.throughput_speedup));
    if (tableRows.length === 0) {
      tableHost.appendChild(emptyState("No comparison rows to tabulate."));
    } else {
      const details = collapsible("expand to view comparison table");
      details.append(
        renderSimpleTable(tableRows, [
          {key: "model_label", label: "Model"},
          {key: "mps_tokens_per_sec", label: "MPS tok/s", align: "right", format: (v) => Number(v).toFixed(1)},
          {key: "cuda_tokens_per_sec", label: "CUDA tok/s", align: "right", format: (v) => Number(v).toFixed(1)},
          {
            key: "throughput_speedup",
            label: "tok/s speedup",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? `${Number(v).toFixed(2)}x` : "n/a")
          },
          {key: "mps_step_s", label: "MPS step s", align: "right", format: (v) => Number(v).toFixed(3)},
          {key: "cuda_step_s", label: "CUDA step s", align: "right", format: (v) => Number(v).toFixed(3)},
          {
            key: "step_time_speedup",
            label: "step-time speedup",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? `${Number(v).toFixed(2)}x` : "n/a")
          }
        ])
      );
      tableHost.appendChild(details);
    }
  };

  refresh();
  return host;
}

function filterHistoryRows(historyRows, {selectedSeries, metric, minStep, maxStep, positiveOnly}) {
  const output = [];
  for (const row of historyRows) {
    if (!selectedSeries.has(row.series_key)) continue;
    const step = Number(row.step);
    if (!Number.isFinite(step)) continue;
    if (step < minStep || step > maxStep) continue;
    const value = metricValue(row, metric);
    if (!metricValid(metric, value)) continue;
    if (positiveOnly && value <= 0) continue;
    output.push({...row, metric_value: value});
  }
  return output.sort((a, b) => d3.ascending(a.step, b.step));
}

export function buildSegmentedHistoryRows(historyRows, options) {
  const {
    selectedSeries,
    metric,
    stride,
    maxGap,
    minStep,
    maxStep,
    positiveOnly
  } = options;
  const output = [];

  const grouped = d3.groups(
    historyRows.filter((row) => selectedSeries.has(row.series_key)),
    (row) => row.series_key
  );
  for (const [, rows] of grouped) {
    const ordered = [...rows].sort((a, b) => d3.ascending(a.step, b.step));
    let segment = 0;
    let lastStep = NaN;
    for (const row of ordered) {
      const step = Number(row.step);
      if (!Number.isFinite(step)) continue;
      if (step < minStep || step > maxStep) continue;

      const value = metricValue(row, metric);
      if (!metricValid(metric, value)) {
        lastStep = NaN;
        segment += 1;
        continue;
      }
      if (positiveOnly && value <= 0) continue;
      if (stride > 1 && step % stride !== 0) continue;
      if (Number.isFinite(lastStep) && (step <= lastStep || step - lastStep > maxGap)) segment += 1;

      output.push({
        ...row,
        metric_value: value,
        segment_key: `${row.series_key}:${segment}`
      });
      lastStep = step;
    }
  }

  return output.sort((a, b) => d3.ascending(a.step, b.step));
}

function renderTrainingCurvesSection(data, options = {}) {
  const {historyRows} = data;
  const host = card();
  host.appendChild(sectionHeading("Training Curves"));

  if (historyRows.length === 0) {
    host.appendChild(emptyState("No history rows available."));
    return host;
  }

  const preferredModelOrder = [
    "model_a_wide",
    "model_b_deep",
    "model_a",
    "model_b",
    "assignment_default",
    "model_a_wide_attn_diag",
    "model_b_standard_ffn_diag"
  ];
  const preferredPlatformOrder = ["mps", "cuda"];
  const modelRank = (modelId) => {
    const idx = preferredModelOrder.indexOf(String(modelId));
    return idx >= 0 ? idx : 999;
  };
  const platformRank = (platform) => {
    const idx = preferredPlatformOrder.indexOf(String(platform));
    return idx >= 0 ? idx : 999;
  };

  const seriesRowsByPlatformModel = d3
    .groups(historyRows, (row) => `${row.platform}:${row.model_id}`)
    .map(([, rows]) => {
      const byRun = d3.groups(rows, (row) => row.run_name).map(([, runRows]) => {
        const evalCount = runRows.reduce(
          (acc, row) =>
            acc +
            (Number.isFinite(Number(row.eval_loss)) && Number(row.eval_loss) > 0
              ? 1
              : Number.isFinite(Number(row.eval_perplexity)) && Number(row.eval_perplexity) > 0
                ? 1
                : 0),
          0
        );
        return {rows: runRows, evalCount};
      });
      byRun.sort(
        (a, b) =>
          d3.descending(a.evalCount, b.evalCount) ||
          d3.descending(a.rows[0]?.run_stamp || "", b.rows[0]?.run_stamp || "") ||
          d3.descending(a.rows[0]?.run_name || "", b.rows[0]?.run_name || "")
      );
      return byRun[0]?.rows || [];
    })
    .filter((rows) => rows.length > 0);

  const canonicalSeriesMeta = seriesRowsByPlatformModel
    .map((rows) => rows[0])
    .sort(
      (a, b) =>
        d3.ascending(modelRank(a.model_id), modelRank(b.model_id)) ||
        d3.ascending(platformRank(a.platform), platformRank(b.platform)) ||
        d3.ascending(a.series_label, b.series_label) ||
        d3.descending(a.run_stamp || "", b.run_stamp || "") ||
        d3.descending(a.run_name || "", b.run_name || "")
    );
  const canonicalSeriesKeys = canonicalSeriesMeta.slice(0, 4).map((row) => row.series_key);
  const canonicalSeriesKeySet = new Set(canonicalSeriesKeys);
  const curveRowsSource = historyRows.filter((row) => canonicalSeriesKeySet.has(row.series_key));
  const curveRows = curveRowsSource.length > 0 ? curveRowsSource : historyRows;

  const seriesOptions = Array.from(
    new Map(curveRows.map((row) => [row.series_key, row.series_verbose || row.series_label])).entries()
  )
    .map(([value, label]) => ({value, label}))
    .sort((a, b) => d3.ascending(a.label, b.label));
  const defaultSeries = seriesOptions.map((row) => row.value);
  const seriesControl = checkboxGroup(
    seriesOptions.map((row) => row.value),
    options.historyRuns && options.historyRuns.length > 0 ? options.historyRuns : defaultSeries,
    "curve-series",
    "Series"
  );

  const labelBySeries = new Map(seriesOptions.map((row) => [row.value, row.label]));
  for (const checkbox of seriesControl.node.querySelectorAll("input[type=checkbox]")) {
    const raw = checkbox.dataset.value || "";
    const labelNode = checkbox.parentElement;
    if (labelNode) labelNode.lastChild.textContent = labelBySeries.get(raw) || raw;
  }

  const initialCurveMetric =
    options.historyMetric === "Eval Perplexity" || options.historyMetric === "Perplexity" ? "LossLog" : "Loss";
  const curveMetricControl = selectControl(
    "Main chart",
    [
      {value: "Loss", label: "Loss (train + eval)"},
      {value: "LossLog", label: "Loss (log scale, train + eval)"}
    ],
    initialCurveMetric
  );
  const channelControl = selectControl(
    "Channels",
    [
      {value: "both", label: "Training + Eval"},
      {value: "train", label: "Training only"},
      {value: "eval", label: "Eval only"}
    ],
    options.historyChannel || "both"
  );
  const stepMin = d3.min(curveRows, (row) => row.step) ?? 0;
  const stepMax = d3.max(curveRows, (row) => row.step) ?? 1;
  const stepStartControl = makeRangeControl("Step start", stepMin, stepMax, 1, options.historyStepStart ?? stepMin);
  const stepEndControl = makeRangeControl("Step end", stepMin, stepMax, 1, options.historyStepEnd ?? stepMax);
  const tableLimitControl = makeRangeControl("Table rows", 50, 1000, 50, clampRowLimit(options.historyTableLimit, 300));

  const controls = card();
  controls.append(
    seriesControl.node,
    curveMetricControl.node,
    channelControl.node,
    stepStartControl.node,
    stepEndControl.node,
    tableLimitControl.node
  );
  const mainChartHost = card();
  const gradChartHost = card();
  const tableHost = card();
  host.append(controls, mainChartHost, gradChartHost, tableHost);

  function buildMainCurveRows(selectedSeries, start, end, curveMetric, channelMode = "both") {
    const output = [];
    const useLoss = curveMetric === "Loss" || curveMetric === "LossLog";
    const includeTraining = channelMode !== "eval";
    const includeEval = channelMode !== "train";
    const grouped = d3.groups(
      curveRows.filter((row) => selectedSeries.has(row.series_key)),
      (row) => row.series_key
    );
    for (const [, rows] of grouped) {
      const ordered = [...rows].sort((a, b) => d3.ascending(a.step, b.step));
      for (const row of ordered) {
        const step = Number(row.step);
        if (!Number.isFinite(step) || step < start || step > end) continue;
        const seriesBase = row.series_verbose || row.series_label || row.series_key;

        if (includeTraining) {
          const trainValue =
            useLoss
              ? Number(row.loss)
              : NaN;
          if (Number.isFinite(trainValue) && trainValue > 0) {
            output.push({
              ...row,
              step,
              curve_channel: "Training",
              metric_value: trainValue,
              series_channel_key: `${row.series_key}:train`,
              curve_series_id: `${row.series_key}:train`,
              curve_series_label: `${seriesBase} (Training)`
            });
          }
        }

        if (includeEval) {
          const evalValue =
            useLoss
              ? Number.isFinite(Number(row.eval_loss)) && Number(row.eval_loss) > 0
                ? Number(row.eval_loss)
                : Number.isFinite(Number(row.eval_perplexity)) && Number(row.eval_perplexity) > 0
                  ? Math.log(Number(row.eval_perplexity))
                  : NaN
              : NaN;
          if (Number.isFinite(evalValue) && evalValue > 0) {
            output.push({
              ...row,
              step,
              curve_channel: "Eval",
              metric_value: evalValue,
              series_channel_key: `${row.series_key}:eval`,
              curve_series_id: `${row.series_key}:eval`,
              curve_series_label: `${seriesBase} (Eval)`
            });
          }
        }
      }
    }
    return output.sort((a, b) => d3.ascending(a.step, b.step));
  }

  function buildSplineTrendRows(rows, selectionEnd) {
    const output = [];
    const grouped = d3.groups(rows, (row) => row.curve_series_id);
    for (const [, seriesRows] of grouped) {
      const ordered = [...seriesRows].sort((a, b) => d3.ascending(a.step, b.step));
      const n = ordered.length;
      if (n === 0) continue;
      const template = ordered[0];
      const xMin = Number(ordered[0].step);
      const rawXMax = Number(ordered[n - 1].step);
      const xMax =
        template.curve_channel === "Eval" && Number.isFinite(selectionEnd)
          ? Math.max(rawXMax, Number(selectionEnd))
          : rawXMax;
      if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) continue;

      if (n <= 2 || xMax <= xMin) {
        for (const row of ordered) output.push({...row, metric_trend: row.metric_value});
        if (template.curve_channel === "Eval" && xMax > rawXMax) {
          output.push({...template, step: xMax, metric_trend: ordered[n - 1].metric_value});
        }
        continue;
      }

      const knotCount = Math.max(12, Math.min(72, Math.round(Math.sqrt(n) * 5)));
      const binWidth = (xMax - xMin) / Math.max(1, knotCount - 1);
      const bins = Array.from({length: knotCount}, () => []);
      for (const row of ordered) {
        const x = Number(row.step);
        const y = Number(row.metric_value);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const idx = Math.max(0, Math.min(knotCount - 1, Math.round((x - xMin) / Math.max(binWidth, 1e-9))));
        bins[idx].push(y);
      }

      const knotY = bins.map((values) => (values.length > 0 ? d3.median(values) : NaN));
      let lastKnown = -1;
      for (let i = 0; i < knotY.length; i += 1) {
        if (Number.isFinite(knotY[i])) {
          if (lastKnown >= 0 && i - lastKnown > 1) {
            const y0 = Number(knotY[lastKnown]);
            const y1 = Number(knotY[i]);
            for (let j = lastKnown + 1; j < i; j += 1) {
              const t = (j - lastKnown) / (i - lastKnown);
              knotY[j] = y0 + t * (y1 - y0);
            }
          }
          lastKnown = i;
        }
      }
      const firstKnown = knotY.findIndex((v) => Number.isFinite(v));
      if (firstKnown >= 0) {
        for (let i = 0; i < firstKnown; i += 1) knotY[i] = knotY[firstKnown];
        let trailing = NaN;
        for (let i = knotY.length - 1; i >= 0; i -= 1) {
          if (Number.isFinite(knotY[i])) trailing = knotY[i];
          else if (Number.isFinite(trailing)) knotY[i] = trailing;
        }
      }

      for (let i = 0; i < knotCount; i += 1) {
        const y = Number(knotY[i]);
        if (!Number.isFinite(y)) continue;
        output.push({
          ...template,
          step: xMin + i * binWidth,
          metric_trend: y
        });
      }
    }
    return output.sort((a, b) => d3.ascending(a.step, b.step));
  }

  function buildGradRows(selectedSeries, start, end) {
    const output = [];
    const grouped = d3.groups(
      curveRows.filter((row) => selectedSeries.has(row.series_key)),
      (row) => row.series_key
    );
    for (const [, rows] of grouped) {
      const ordered = [...rows].sort((a, b) => d3.ascending(a.step, b.step));
      for (const row of ordered) {
        const step = Number(row.step);
        if (!Number.isFinite(step) || step < start || step > end) continue;
        const value = Number(row.grad_norm_unclipped);
        if (!Number.isFinite(value) || value <= 0) continue;
        output.push({
          ...row,
          step,
          metric_value: value,
          series_segment: `${row.series_key}:grad`,
          curve_channel: "Training",
          curve_series_id: `${row.series_key}:grad`,
          curve_series_label: `${row.series_verbose || row.series_label || row.series_key} (Pre-clip grad norm)`
        });
      }
    }
    return output.sort((a, b) => d3.ascending(a.step, b.step));
  }

  const refresh = () => {
    tableLimitControl.output.textContent = tableLimitControl.input.value;
    stepStartControl.output.textContent = stepStartControl.input.value;
    stepEndControl.output.textContent = stepEndControl.input.value;

    let start = Number(stepStartControl.input.value);
    let end = Number(stepEndControl.input.value);
    if (start > end) {
      if (document.activeElement === stepStartControl.input) {
        end = start;
        stepEndControl.input.value = String(end);
      } else {
        start = end;
        stepStartControl.input.value = String(start);
      }
    }

    const selectedSeries = new Set(seriesControl.getSelected());
    const curveMetric = curveMetricControl.select.value;
    const useLogLossScale = curveMetric === "LossLog";
    const channelMode = channelControl.select.value;
    const mainRows = buildMainCurveRows(selectedSeries, start, end, curveMetric, channelMode);
    const trainingRows = mainRows.filter((row) => row.curve_channel === "Training");
    const evalRows = mainRows.filter((row) => row.curve_channel === "Eval");
    const trainingTrendRows = buildSplineTrendRows(trainingRows, end);
    const gradRows = buildGradRows(selectedSeries, start, end);
    const gradTrendRows = buildSplineTrendRows(gradRows, end);

    clearNode(mainChartHost);
    clearNode(gradChartHost);
    clearNode(tableHost);
    const metricTitle = useLogLossScale ? "Loss Trends (log scale)" : "Loss Trends";
    const channelTitle =
      channelMode === "train" ? "Training" : channelMode === "eval" ? "Eval" : "Training + Eval";
    mainChartHost.appendChild(sectionHeading(`${metricTitle} (${channelTitle})`));
    gradChartHost.appendChild(sectionHeading("Pre-clip Gradient Norm Trend"));

    if (mainRows.length === 0) {
      mainChartHost.appendChild(emptyState("No history rows for current selections."));
      tableHost.appendChild(emptyState("No rows to display."));
    } else {
      const mainMarks = [];
      if (trainingRows.length > 0) {
        mainMarks.push(
          Plot.lineY(trainingTrendRows.length > 0 ? trainingTrendRows : trainingRows, {
            x: "step",
            y: trainingTrendRows.length > 0 ? "metric_trend" : "metric_value",
            stroke: "curve_series_label",
            z: "curve_series_id",
            curve: "natural",
            strokeWidth: 2.2,
            tip: true
          })
        );
      }
      if (evalRows.length > 0) {
        mainMarks.push(
          Plot.lineY(evalRows, {
            x: "step",
            y: "metric_value",
            stroke: "curve_series_label",
            z: "curve_series_id",
            curve: "natural",
            strokeWidth: 2.0,
            tip: true
          }),
          Plot.dot(evalRows, {
            x: "step",
            y: "metric_value",
            fill: "curve_series_label",
            z: "curve_series_id",
            r: 1.2,
            opacity: 0.9,
            tip: true
          })
        );
      }

      mainChartHost.appendChild(
        Plot.plot({
          width: 920,
          height: 360,
          x: {label: "Step", grid: true},
          y: {label: "Loss", grid: true, ...(useLogLossScale ? {type: "log"} : {})},
          color: {legend: true},
          marks: mainMarks
        })
      );

      const tableLimit = clampRowLimit(tableLimitControl.input.value, 300);
      const limited = mainRows.slice(0, tableLimit);
      const details = collapsible("expand to view training/eval trend data");
      details.append(
        rowLimitNote(limited.length, mainRows.length),
        renderSimpleTable(limited, [
          {key: "series_verbose", label: "Series"},
          {key: "curve_channel", label: "Channel"},
          {key: "run_name", label: "Run"},
          {key: "step", label: "Step", align: "right"},
          {
            key: "metric_value",
            label: "Loss",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")
          }
        ])
      );
      tableHost.appendChild(details);
    }

    if (gradRows.length === 0) {
      gradChartHost.appendChild(emptyState("No pre-clip gradient rows for current selections."));
      return;
    }

    gradChartHost.appendChild(
      Plot.plot({
        width: 920,
        height: 300,
        x: {label: "Step", grid: true},
        y: {label: "Pre-clip grad norm", grid: true, type: "log"},
        color: {legend: true},
        marks: [
          Plot.lineY(gradTrendRows.length > 0 ? gradTrendRows : gradRows, {
            x: "step",
            y: gradTrendRows.length > 0 ? "metric_trend" : "metric_value",
            stroke: "curve_series_label",
            z: "curve_series_id",
            curve: "natural",
            strokeWidth: 2.0,
            tip: true
          }),
          Plot.dot(gradRows, {
            x: "step",
            y: "metric_value",
            fill: "curve_series_label",
            z: "series_segment",
            r: 1.2,
            opacity: 0.45,
            tip: true
          })
        ]
      })
    );
  };

  seriesControl.onChange(refresh);
  curveMetricControl.select.addEventListener("change", refresh);
  channelControl.select.addEventListener("change", refresh);
  stepStartControl.input.addEventListener("input", refresh);
  stepEndControl.input.addEventListener("input", refresh);
  tableLimitControl.input.addEventListener("input", refresh);
  refresh();
  return host;
}

function renderDiagnosticsSection(data, options = {}) {
  const {microRows} = data;
  const host = card();
  host.appendChild(sectionHeading("Diagnostic Benchmarks (Optional)"));
  host.appendChild(
    el(
      "p",
      "Micro-benchmarks and sequential-fragmentation checks were used for bug diagnosis, not for final architecture conclusions. They are shown as optional context."
    )
  );

  if (!options.includeMicroChart) return host;
  if (microRows.length === 0) {
    host.appendChild(emptyState("No micro benchmark rows available."));
    return host;
  }

  const sortedMicro = [...microRows].sort((a, b) => d3.ascending(a.median_s, b.median_s));
  host.appendChild(
    Plot.plot({
      width: 920,
      height: Math.min(560, 140 + sortedMicro.length * 16),
      marginLeft: 290,
      x: {label: "median runtime (s)", grid: true},
      marks: [Plot.barX(sortedMicro, {y: "benchmark", x: "median_s", tip: true})]
    })
  );
  return host;
}

async function renderSection(builder, options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-perf-empirical-section";
  root.style.display = "grid";
  root.style.gap = "1rem";

  let data;
  try {
    data = await loadEmpiricalData();
  } catch (error) {
    renderLoadError(root, error);
    return root;
  }

  root.appendChild(builder(data, options));
  return root;
}

export async function renderPerfEmpiricalTrainBenchmark(options = {}) {
  return renderSection(renderTrainGridSection, options);
}

export async function renderPerfEmpiricalExpectedVsActual(options = {}) {
  return renderSection(renderExpectedVsActualSection, options);
}

export async function renderPerfEmpiricalDeviceComparison(options = {}) {
  return renderSection(renderDeviceComparisonSection, options);
}

export async function renderPerfEmpiricalTrainingCurves(options = {}) {
  return renderSection(renderTrainingCurvesSection, options);
}

export async function renderPerfEmpiricalDiagnostics(options = {}) {
  return renderSection(renderDiagnosticsSection, options);
}

const COMPARISON_MODEL_IDS = ["models_yaml:model_a", "models_yaml:model_b", "models_yaml:assignment_default"];

const COMPARISON_PLATFORMS = [
  {key: "mps", label: "MPS (M4)", wt_dtype: "float32", ft_dtype: "float32", grad_dtype: "float32", use_amp: false},
  {key: "cuda", label: "RTX 4090 (AMP)", wt_dtype: "float32", ft_dtype: "bfloat16", grad_dtype: "bfloat16", use_amp: true}
];

export async function renderPerfEmpiricalModelSelection() {
  const root = el("div");
  root.style.display = "grid";
  root.style.gap = "1.2rem";

  let catalog;
  try {
    catalog = await ATTACHMENTS.catalog.json();
  } catch (err) {
    root.appendChild(emptyState(`Failed to load model catalog: ${err.message}`));
    return root;
  }

  const configs = COMPARISON_MODEL_IDS.map((id) => catalog.named_configs.find((c) => c.id === id)).filter(Boolean);
  if (configs.length === 0) {
    root.appendChild(emptyState("No matching model configs found in catalog."));
    return root;
  }

  root.appendChild(sectionHeading("Model Hyperparameters"));
  root.appendChild(
    renderSimpleTable(configs, [
      {key: "name", label: "Model"},
      {key: "batch_size", label: "B", align: "right"},
      {key: "seq_len", label: "S", align: "right"},
      {key: "d_model", label: "d_model", align: "right"},
      {key: "num_heads", label: "h", align: "right"},
      {key: "d_head", label: "d_head", align: "right"},
      {key: "num_layers", label: "L", align: "right"},
      {key: "d_ff", label: "d_ff", align: "right"},
      {key: "vocab_size", label: "V", align: "right"}
    ])
  );

  const resourceRows = configs.map((cfg) => {
    const params = calculateModelParams(cfg.vocab_size, cfg.d_model, cfg.num_heads, cfg.num_layers, cfg.d_ff);
    const fwdFlops = calculateForwardFlops(cfg.batch_size, cfg.seq_len, cfg.vocab_size, cfg.d_model, cfg.num_heads, cfg.num_layers, cfg.d_ff);
    const stepFlops = calculateTrainingStepFlops(fwdFlops.total);
    const row = {
      name: cfg.name,
      params: params.total_M.toFixed(2) + "M",
      tflops: stepFlops.total_TFLOPs.toFixed(3)
    };
    for (const plat of COMPARISON_PLATFORMS) {
      const mem = calculateMemoryAccounting({
        B: cfg.batch_size,
        S: cfg.seq_len,
        V: cfg.vocab_size,
        d_model: cfg.d_model,
        n_heads: cfg.num_heads,
        n_blocks: cfg.num_layers,
        d_ff: cfg.d_ff,
        d_head: cfg.d_head,
        wt_dtype: plat.wt_dtype,
        ft_dtype: plat.ft_dtype,
        grad_dtype: plat.grad_dtype,
        use_amp: plat.use_amp
      });
      row[`${plat.key}_peak`] = mem.peak_training;
    }
    return row;
  });

  root.appendChild(sectionHeading("Estimated Training Resources"));
  root.appendChild(
    renderSimpleTable(resourceRows, [
      {key: "name", label: "Model"},
      {key: "params", label: "Params", align: "right"},
      {key: "tflops", label: "Step TFLOPs", align: "right"},
      {key: "mps_peak", label: "MPS Peak Mem", align: "right"},
      {key: "cuda_peak", label: "4090 Peak Mem", align: "right"}
    ])
  );
  return root;
}

export async function renderPerfEmpirical(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-perf-empirical";
  root.style.display = "grid";
  root.style.gap = "1rem";

  const title = el("h2", "Empirical Performance Analysis");
  title.style.margin = "0";
  const subtitle = el(
    "p",
    "Train-grid search (MPS), controlled MPS vs CUDA comparison, and corrected training-curve diagnostics."
  );
  subtitle.style.margin = "0";

  const status = el("p");
  status.style.margin = "0";
  root.append(title, subtitle, status);

  let data;
  try {
    data = await loadEmpiricalData();
  } catch (error) {
    renderLoadError(root, error);
    return root;
  }

  const mode = options.mode || "full";
  const includeTrain = mode !== "summary" || Boolean(options.includeGrid);
  const includeCurves = mode !== "summary" || Boolean(options.includeTraining);
  const includeDiagnostics = Boolean(options.includeDiagnostics);

  if (includeTrain) root.appendChild(renderTrainGridSection(data, options));
  if (includeTrain) root.appendChild(renderExpectedVsActualSection(data, options));
  root.appendChild(renderDeviceComparisonSection(data, options));
  if (includeCurves) root.appendChild(renderTrainingCurvesSection(data, options));
  if (includeDiagnostics) root.appendChild(renderDiagnosticsSection(data, options));

  status.textContent = `Loaded ${data.mainRows.length} platform rows, ${data.historyRows.length} history rows, ${data.trainRows.length} train-grid rows, ${data.microRows.length} micro rows.`;
  return root;
}
