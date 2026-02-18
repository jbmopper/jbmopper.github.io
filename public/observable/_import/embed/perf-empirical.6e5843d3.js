import {FileAttachment} from "../../_observablehq/stdlib.43270668.js";
import * as Plot from "../../_npm/@observablehq/plot@0.6.17/7c43807f.js";
import * as d3 from "../../_npm/d3@7.9.0/e324157d.js";
import {formatMs, normalizeRunLabel} from "../components/data-utils.e2caa41c.js";
import {clearNode, emptyState, renderSimpleTable, sectionHeading} from "../components/dom-utils.aaca454b.js";
import {calculateForwardFlops, calculateTrainingStepFlops} from "../components/perf-estimates.d771a94d.js";

const ATTACHMENTS = {
  mps_main: FileAttachment({"name":"../../data/raw/benchmarks/mps_comp_main.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/mps_comp_main.ccc27b69.parquet","lastModified":1770927469238,"size":25521}, import.meta.url),
  gpu_main: FileAttachment({"name":"../../data/raw/benchmarks/gpu_comp_main.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/gpu_comp_main.8b657d6c.parquet","lastModified":1770927469234,"size":26614}, import.meta.url),
  mps_history: FileAttachment({"name":"../../data/raw/benchmarks/mps_comp_history.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/mps_comp_history.81dcba33.parquet","lastModified":1770927469238,"size":220323}, import.meta.url),
  gpu_history: FileAttachment({"name":"../../data/raw/benchmarks/gpu_comp_history.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/gpu_comp_history.4a516c8a.parquet","lastModified":1770927469233,"size":189583}, import.meta.url),
  train: FileAttachment({"name":"../../data/raw/benchmarks/train_benchmark_20260127_092323.json","mimeType":"application/json","path":"../../_file/data/raw/benchmarks/train_benchmark_20260127_092323.e80aa474.json","lastModified":1770920604379,"size":1945563}, import.meta.url),
  micro: FileAttachment({"name":"../../data/raw/benchmarks/micro_benchmarks_20260126_130256.json","mimeType":"application/json","path":"../../_file/data/raw/benchmarks/micro_benchmarks_20260126_130256.0003d6fe.json","lastModified":1770920604377,"size":2403}, import.meta.url)
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
      step_s: pickNumber(row, ["Time/Total step"])
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

  const xMetricControl = selectControl(
    "X",
    [
      {value: "est_memory_gb", label: "Estimated Memory (GB)"},
      {value: "num_params_m", label: "Params (M)"},
      {value: "median_ms", label: "Median Step (ms)"},
      {value: "ffn_ratio", label: "FFN Ratio"}
    ],
    options.gridX || "est_memory_gb"
  );
  const yMetricControl = selectControl(
    "Y",
    [
      {value: "tokens_per_sec", label: "Tokens / sec"},
      {value: "steps_per_sec", label: "Steps / sec"},
      {value: "median_ms", label: "Median Step (ms)"},
      {value: "est_memory_gb", label: "Estimated Memory (GB)"}
    ],
    options.gridY || "tokens_per_sec"
  );
  const colorByControl = selectControl(
    "Color",
    [
      {value: "batch_size", label: "batch_size"},
      {value: "seq_len", label: "seq_len"},
      {value: "d_model", label: "d_model"},
      {value: "d_head", label: "d_head"},
      {value: "num_layers", label: "num_layers"},
      {value: "d_ff", label: "d_ff"}
    ],
    options.gridColor || "d_model"
  );
  const sizeByControl = selectControl(
    "Point size",
    [
      {value: "(fixed)", label: "fixed"},
      {value: "batch_size", label: "batch_size"},
      {value: "seq_len", label: "seq_len"},
      {value: "d_model", label: "d_model"},
      {value: "num_layers", label: "num_layers"}
    ],
    options.gridSize || "batch_size"
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
    colorByControl.node,
    sizeByControl.node,
    chartModeControl.node,
    tableLimitControl.node
  );

  const chartHost = card();
  const tableHost = card();
  host.append(controls, chartHost, tableHost);

  const axisLabels = {
    est_memory_gb: "Estimated Memory (GB)",
    num_params_m: "Parameters (M)",
    median_ms: "Median Step Time (ms)",
    ffn_ratio: "FFN Ratio",
    tokens_per_sec: "Tokens / sec",
    steps_per_sec: "Steps / sec"
  };

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
    const colorKey = colorByControl.select.value;
    const sizeKey = sizeByControl.select.value;
    const chartMode = chartModeControl.select.value;

    const plotted = filtered
      .filter((row) => Number.isFinite(Number(row[xKey])))
      .filter((row) => Number.isFinite(Number(row[yKey])));

    const marks = [
      Plot.dot(plotted, {
        x: xKey,
        y: yKey,
        fill: (d) => String(d[colorKey]),
        r:
          sizeKey === "(fixed)"
            ? 4
            : (d) => {
                const v = Number(d[sizeKey]);
                return Number.isFinite(v) ? Math.max(2.5, Math.min(10, 1.5 + Math.sqrt(Math.max(v, 0)) / 4)) : 4;
              },
        title: (d) => `B=${d.batch_size} S=${d.seq_len} d=${d.d_model} h=${d.num_heads} L=${d.num_layers} d_ff=${d.d_ff}\ntok/s=${Number(d.tokens_per_sec).toFixed(1)}  ms=${Number(d.median_ms).toFixed(1)}  mem=${Number(d.est_memory_gb).toFixed(2)}GB  params=${Number(d.num_params_m).toFixed(1)}M`,
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
        color: {type: "categorical", scheme: "observable10", legend: true},
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
  colorByControl.select.addEventListener("change", refresh);
  sizeByControl.select.addEventListener("change", refresh);
  chartModeControl.select.addEventListener("change", refresh);
  tableLimitControl.input.addEventListener("input", refresh);

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
    {label: "Sequence length (S)", value: "seq_len"}
  ], "batch_size");

  const allEva = computeExpectedVsActual(trainRows);
  const maxObserved = d3.max(allEva, (d) => d.actual_step_s) ?? 10;
  const maxExpected = d3.max(allEva, (d) => d.expected_step_s) ?? 10;
  const stepRes = Math.pow(10, Math.floor(Math.log10(Math.max(maxObserved, maxExpected))) - 2);
  const maxObservedControl = makeRangeControl("Max observed step (s)", 0, maxObserved, stepRes, maxObserved);
  const maxExpectedControl = makeRangeControl("Max expected step (s)", 0, maxExpected, stepRes, maxExpected);
  maxObservedControl.input.addEventListener("input", () => { maxObservedControl.output.textContent = Number(maxObservedControl.input.value).toFixed(3); });
  maxExpectedControl.input.addEventListener("input", () => { maxExpectedControl.output.textContent = Number(maxExpectedControl.input.value).toFixed(3); });
  maxObservedControl.output.textContent = Number(maxObserved).toFixed(3);
  maxExpectedControl.output.textContent = Number(maxExpected).toFixed(3);

  const filters = el("div");
  filters.style.display = "grid";
  filters.style.gap = "0.5rem";
  filters.append(
    batchControl.node, seqControl.node, dModelControl.node, dHeadControl.node,
    numHeadsControl.node, numLayersControl.node, dFfControl.node, colorByControl.node,
    maxObservedControl.node, maxExpectedControl.node
  );
  host.appendChild(filters);

  const chartStepHost = el("div");
  chartStepHost.className = "card";
  const chartThroughputHost = el("div");
  chartThroughputHost.className = "card";
  const chartParamsHost = el("div");
  chartParamsHost.className = "card";
  const tableHost = el("div");
  host.append(chartStepHost, chartThroughputHost, chartParamsHost, tableHost);

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
    const colorLabel = colorBy === "batch_size" ? "Batch size (B)" : "Sequence length (S)";
    const fillValue = (d) => (colorBy === "batch_size" ? `B=${d.batch_size}` : `S=${d.seq_len}`);
    const scatterRows = rows
      .filter((d) => Number.isFinite(d[xKey]) && d[xKey] > 0)
      .filter((d) => Number.isFinite(d[yKey]) && d[yKey] > 0);
    if (scatterRows.length === 0) {
      hostEl.appendChild(emptyState(emptyMsg));
      return;
    }
    const colorDomain = [...new Set(scatterRows.map(fillValue))]
      .sort((a, b) => {
        const na = parseFloat(a.replace(/\D+/, ""));
        const nb = parseFloat(b.replace(/\D+/, ""));
        return (na || 0) - (nb || 0);
      });
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
    hostEl.appendChild(
      Plot.plot({
        width: 920,
        height: 380,
        x: {label: xLabel, grid: true, type: scaleOpts.logX ? "log" : "linear"},
        y: {label: yLabel, grid: true, type: scaleOpts.logY ? "log" : "linear"},
        color: {legend: true, label: colorLabel, domain: colorDomain},
        marks: [
          Plot.dot(scatterRows, {
            x: xKey, y: yKey, fill: fillValue, title: "model_spec", r: 3.8, tip: true
          }),
          ...(diagRows.length > 0
            ? [Plot.line(diagRows, {x: "v", y: "v", stroke: "var(--theme-foreground-muted)", strokeDasharray: "4 4"})]
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

    const filtered = trainRows
      .filter((d) => selectedBatch.has(d.batch_size))
      .filter((d) => selectedSeq.has(d.seq_len))
      .filter((d) => selectedDModel.has(d.d_model))
      .filter((d) => selectedDHead.has(d.d_head))
      .filter((d) => selectedNumHeads.has(d.num_heads))
      .filter((d) => selectedNumLayers.has(d.num_layers))
      .filter((d) => selectedDFf.has(d.d_ff));

    const maxObs = safeNumber(maxObservedControl.input.value, Infinity);
    const maxExp = safeNumber(maxExpectedControl.input.value, Infinity);
    const evaRows = computeExpectedVsActual(filtered)
      .filter((d) => d.actual_step_s <= maxObs)
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
    buildDiagonalScatter(
      chartParamsHost, evaRows,
      "expected_params_m_per_sec", "actual_params_m_per_sec",
      "Expected model params / sec (M)", "Observed model params / sec (M)",
      "No rows available for expected-vs-observed model-params/sec chart.", colorBy
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
  maxObservedControl.input.addEventListener("input", refresh);
  maxExpectedControl.input.addEventListener("input", refresh);

  refresh();
  return host;
}

function renderDeviceComparisonSection(data, options = {}) {
  const {mainRows, speedupRows} = data;
  const host = card();
  host.appendChild(sectionHeading("Device Comparison Summary"));

  if (mainRows.length === 0) {
    host.appendChild(emptyState("No platform comparison rows available."));
    return host;
  }

  const modelValues = Array.from(new Set(mainRows.map((row) => row.model_label))).sort();
  const modelControl = checkboxGroup(modelValues, modelValues, "cmp-model", "Models");
  const speedMetricControl = selectControl(
    "Speedup metric",
    [
      {value: "throughput_speedup", label: "tokens/sec speedup"},
      {value: "step_time_speedup", label: "step-time speedup"}
    ],
    options.speedMetric || "throughput_speedup"
  );
  const rowLimitControl = makeRangeControl("Table rows", 10, 200, 10, clampRowLimit(options.compareTableLimit, 80));

  const controls = card();
  controls.append(modelControl.node, speedMetricControl.node, rowLimitControl.node);
  const scatterHost = card();
  const speedupHost = card();
  const tableHost = card();
  host.append(controls, scatterHost, speedupHost, tableHost);

  const refresh = () => {
    rowLimitControl.output.textContent = rowLimitControl.input.value;
    const selectedModels = new Set(modelControl.getSelected());
    const filteredMain = mainRows.filter((row) => selectedModels.has(row.model_label));
    const filteredSpeedups = speedupRows.filter((row) => selectedModels.has(row.model_label));
    const speedMetric = speedMetricControl.select.value;

    clearNode(scatterHost);
    clearNode(speedupHost);
    clearNode(tableHost);

    scatterHost.appendChild(sectionHeading("Throughput vs Step Time"));
    if (filteredMain.length === 0) {
      scatterHost.appendChild(emptyState("No rows for selected models."));
    } else {
      scatterHost.appendChild(
        Plot.plot({
          width: 920,
          height: 340,
          x: {label: "Seconds / step", grid: true},
          y: {label: "Tokens / sec", grid: true},
          color: {legend: true},
          marks: [
            Plot.dot(filteredMain, {
              x: "step_s",
              y: "throughput_toks",
              fill: "series_label",
              symbol: "platform",
              tip: true
            })
          ]
        })
      );
    }

    speedupHost.appendChild(sectionHeading("GPU vs MPS Speedup"));
    if (filteredSpeedups.length === 0) {
      speedupHost.appendChild(emptyState("No paired MPS/CUDA rows available."));
    } else {
      const sorted = [...filteredSpeedups].sort((a, b) => d3.descending(a[speedMetric], b[speedMetric]));
      const speedLabel = speedMetric === "throughput_speedup" ? "CUDA / MPS throughput" : "MPS / CUDA step time";
      speedupHost.appendChild(
        Plot.plot({
          width: 920,
          height: Math.min(420, 140 + sorted.length * 48),
          marginLeft: 220,
          x: {label: `${speedLabel} speedup`, grid: true},
          marks: [
            Plot.ruleX([1], {stroke: "var(--theme-foreground-faint)", strokeDasharray: "4 4"}),
            Plot.barX(sorted, {y: "model_label", x: speedMetric, fill: "var(--theme-foreground-focus)", tip: true}),
            Plot.text(sorted, {
              y: "model_label",
              x: speedMetric,
              text: (d) => `${d[speedMetric].toFixed(2)}\u00d7`,
              dx: 4,
              textAnchor: "start"
            })
          ]
        })
      );
    }

    const rowLimit = clampRowLimit(rowLimitControl.input.value, 80);
    const tableRows = [...filteredSpeedups]
      .sort((a, b) => d3.descending(a.throughput_speedup, b.throughput_speedup))
      .slice(0, rowLimit);
    if (tableRows.length === 0) {
      tableHost.appendChild(emptyState("No comparison rows to tabulate."));
    } else {
      const details = collapsible("expand to view comparison table");
      details.append(
        rowLimitNote(tableRows.length, filteredSpeedups.length),
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

  modelControl.onChange(refresh);
  speedMetricControl.select.addEventListener("change", refresh);
  rowLimitControl.input.addEventListener("input", refresh);
  refresh();
  return host;
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

  const seriesOptions = Array.from(
    new Map(historyRows.map((row) => [row.series_key, row.series_verbose || row.series_label])).entries()
  )
    .map(([value, label]) => ({value, label}))
    .sort((a, b) => d3.ascending(a.label, b.label));
  const defaultSeries = seriesOptions.slice(0, Math.min(4, seriesOptions.length)).map((row) => row.value);
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

  const metricControl = selectControl(
    "Metric",
    [
      {value: "Loss", label: "Loss"},
      {value: "Eval Loss", label: "Eval Loss"},
      {value: "Eval Perplexity", label: "Eval Perplexity"},
      {value: "Throughput/Tokens per sec", label: "Throughput"},
      {value: "Time/Total step", label: "Step Time"}
    ],
    options.historyMetric || "Loss"
  );
  const styleControl = selectControl(
    "Marks",
    [
      {value: "lines", label: "lines"},
      {value: "lines+dots", label: "lines + dots"},
      {value: "dots", label: "dots"}
    ],
    options.historyStyle || "lines"
  );
  const yScaleControl = selectControl(
    "Y scale",
    [
      {value: "linear", label: "linear"},
      {value: "log", label: "log"}
    ],
    options.historyScale || "linear"
  );

  const stepMin = d3.min(historyRows, (row) => row.step) ?? 0;
  const stepMax = d3.max(historyRows, (row) => row.step) ?? 1;
  const strideControl = makeRangeControl("Downsample stride", 1, 100, 1, options.historyStride ?? 5);
  const gapControl = makeRangeControl("Break line if step gap >", 1, 300, 1, options.historyGap ?? 60);
  const stepStartControl = makeRangeControl("Step start", stepMin, stepMax, 1, options.historyStepStart ?? stepMin);
  const stepEndControl = makeRangeControl("Step end", stepMin, stepMax, 1, options.historyStepEnd ?? stepMax);
  const tableLimitControl = makeRangeControl("Table rows", 50, 1000, 50, clampRowLimit(options.historyTableLimit, 300));

  const controls = card();
  controls.append(
    seriesControl.node,
    metricControl.node,
    styleControl.node,
    yScaleControl.node,
    strideControl.node,
    gapControl.node,
    stepStartControl.node,
    stepEndControl.node,
    tableLimitControl.node
  );
  const chartHost = card();
  const tableHost = card();
  host.append(controls, chartHost, tableHost);

  const refresh = () => {
    strideControl.output.textContent = strideControl.input.value;
    gapControl.output.textContent = gapControl.input.value;
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
    const stride = Number(strideControl.input.value);
    const maxGap = Number(gapControl.input.value);
    const metric = metricControl.select.value;
    const style = styleControl.select.value;
    const positiveOnly = yScaleControl.select.value === "log";

    const filtered = buildSegmentedHistoryRows(historyRows, {
      selectedSeries,
      metric,
      stride,
      maxGap,
      minStep: start,
      maxStep: end,
      positiveOnly
    });

    clearNode(chartHost);
    clearNode(tableHost);
    chartHost.appendChild(sectionHeading(`Training Curve: ${metric}`));

    if (filtered.length === 0) {
      chartHost.appendChild(emptyState("No history rows for current selections."));
      tableHost.appendChild(emptyState("No rows to display."));
      return;
    }

    const marks = [];
    if (style !== "dots") {
      marks.push(
        Plot.lineY(filtered, {
          x: "step",
          y: "metric_value",
          stroke: "series_label",
          z: "segment_key",
          tip: true
        })
      );
    }
    if (style !== "lines") {
      marks.push(
        Plot.dot(filtered, {
          x: "step",
          y: "metric_value",
          fill: "series_label",
          r: 2.7,
          tip: true
        })
      );
    }

    chartHost.appendChild(
      Plot.plot({
        width: 920,
        height: 360,
        x: {label: "step", grid: true},
        y: {
          label: metricLabel(metric),
          grid: true,
          type: yScaleControl.select.value === "log" ? "log" : "linear"
        },
        color: {legend: true},
        marks
      })
    );

    const tableLimit = clampRowLimit(tableLimitControl.input.value, 300);
    const limited = filtered.slice(0, tableLimit);
    const details = collapsible("expand to view training curve data");
    details.append(
      rowLimitNote(limited.length, filtered.length),
      renderSimpleTable(limited, [
        {key: "series_verbose", label: "Series"},
        {key: "run_name", label: "Run"},
        {key: "step", label: "Step", align: "right"},
        {
          key: "metric_value",
          label: metricLabel(metric),
          align: "right",
          format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")
        }
      ])
    );
    tableHost.appendChild(details);
  };

  seriesControl.onChange(refresh);
  metricControl.select.addEventListener("change", refresh);
  styleControl.select.addEventListener("change", refresh);
  yScaleControl.select.addEventListener("change", refresh);
  strideControl.input.addEventListener("input", refresh);
  gapControl.input.addEventListener("input", refresh);
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
