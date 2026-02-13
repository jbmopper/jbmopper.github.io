import {FileAttachment} from "../../_observablehq/stdlib.43270668.js";
import * as Plot from "../../_npm/@observablehq/plot@0.6.17/7c43807f.js";
import * as d3 from "../../_npm/d3@7.9.0/e324157d.js";
import {formatMs, normalizeRunLabel} from "../components/data-utils.e2caa41c.js";
import {clearNode, emptyState, renderSimpleTable, sectionHeading} from "../components/dom-utils.aaca454b.js";

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

function pickNumber(row, keys) {
  for (const key of keys) {
    const n = safeNumber(row[key]);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function pickString(row, keys, fallback = "") {
  for (const key of keys) {
    const value = row[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text.length > 0) return text;
  }
  return fallback;
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
    return {
      dataset: datasetName,
      platform,
      run_name: runName,
      run_label: normalizeRunLabel(runName),
      state: pickString(row, ["state"], "unknown"),
      d_model: pickNumber(row, ["config.model_settings.d_model", "config.d_model"]),
      num_layers: pickNumber(row, ["config.model_settings.num_layers", "config.num_layers"]),
      num_heads: pickNumber(row, ["config.model_settings.num_heads", "config.num_heads"]),
      d_ff: pickNumber(row, ["config.model_settings.d_ff", "config.d_ff"]),
      context_length: pickNumber(row, ["config.model_settings.context_length", "config.context_length"]),
      throughput_toks: pickNumber(row, ["Throughput/Tokens per sec"]),
      step_s: pickNumber(row, ["Time/Total step"]),
      loss: pickNumber(row, ["Loss"]),
      eval_loss: pickNumber(row, ["Eval Loss", "Eval/Loss"]),
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
    return {
      dataset: datasetName,
      platform,
      run_name: runName,
      run_label: normalizeRunLabel(runName),
      step: pickNumber(row, ["_step"]),
      loss: pickNumber(row, ["Loss"]),
      eval_loss: pickNumber(row, ["Eval Loss", "Eval/Loss"]),
      throughput_toks: pickNumber(row, ["Throughput/Tokens per sec"]),
      step_s: pickNumber(row, ["Time/Total step"])
    };
  });
}

function buildSpeedupRows(mainRows) {
  const mpsByLabel = new Map(mainRows.filter((r) => r.platform === "mps").map((r) => [r.run_label, r]));
  const cudaRows = mainRows.filter((r) => r.platform === "cuda");
  const out = [];

  for (const gpuRow of cudaRows) {
    const mpsRow = mpsByLabel.get(gpuRow.run_label);
    if (!mpsRow) continue;
    const throughputSpeedup = gpuRow.throughput_toks / mpsRow.throughput_toks;
    const stepTimeSpeedup = mpsRow.step_s / gpuRow.step_s;
    out.push({
      run_label: gpuRow.run_label,
      cuda_tokens_per_sec: gpuRow.throughput_toks,
      mps_tokens_per_sec: mpsRow.throughput_toks,
      throughput_speedup: throughputSpeedup,
      cuda_step_s: gpuRow.step_s,
      mps_step_s: mpsRow.step_s,
      step_time_speedup: stepTimeSpeedup
    });
  }

  return out.sort((a, b) => d3.descending(a.throughput_speedup, b.throughput_speedup));
}

async function loadEmpiricalData() {
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
            num_layers: safeNumber(row.num_layers),
            d_ff: safeNumber(row.d_ff),
            est_memory_gb: safeNumber(row.est_memory_gb),
            tokens_per_sec: safeNumber(row.tokens_per_sec),
            median_s: safeNumber(row.median_s),
            iqr_s: safeNumber(row.iqr_s),
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

  for (const value of values) {
    const id = `${keyPrefix}-${value}`;
    const label = el("label");
    label.htmlFor = id;
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "0.3rem";
    label.style.cursor = "pointer";

    const input = el("input");
    input.type = "checkbox";
    input.id = id;
    input.checked = initialValues.includes(value);

    label.append(input, document.createTextNode(value));
    group.appendChild(label);
  }

  return {
    node: group,
    getSelected() {
      return Array.from(group.querySelectorAll("input[type=checkbox]"))
        .filter((input) => input.checked)
        .map((input) => input.id.replace(`${keyPrefix}-`, ""));
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

function metricValue(row, metric) {
  if (metric === "Loss") return row.loss;
  if (metric === "Eval Loss") return row.eval_loss;
  if (metric === "Throughput/Tokens per sec") return row.throughput_toks;
  return row.step_s;
}

function metricLabel(metric) {
  if (metric === "Loss") return "Loss";
  if (metric === "Eval Loss") return "Eval Loss";
  if (metric === "Throughput/Tokens per sec") return "Tokens / sec";
  return "Seconds / step";
}

function renderLoadError(host, error) {
  clearNode(host);
  host.append(sectionHeading("Load Error"), emptyState(`Failed to load empirical benchmark data: ${error.message}`));
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
    "Device comparison, training curves, benchmark grid, and micro-benchmark runtime analysis."
  );
  subtitle.style.margin = "0";

  const status = el("p");
  status.style.margin = "0";

  const summaryHost = card();
  const curvesHost = card();
  const gridHost = card();
  const microHost = card();

  root.append(title, subtitle, status, summaryHost, curvesHost, gridHost, microHost);

  let data;
  try {
    data = await loadEmpiricalData();
  } catch (error) {
    renderLoadError(root, error);
    return root;
  }

  const {mainRows, speedupRows, historyRows, trainRows, microRows, trainRaw} = data;

  clearNode(summaryHost);
  summaryHost.appendChild(sectionHeading("Device Comparison Summary"));

  if (mainRows.length === 0) {
    summaryHost.appendChild(emptyState("No platform comparison rows available."));
  } else {
    const summaryRows = [...mainRows].sort(
      (a, b) => d3.descending(a.throughput_toks, b.throughput_toks) || d3.ascending(a.run_label, b.run_label)
    );

    summaryHost.append(
      renderSimpleTable(summaryRows, [
        {key: "platform", label: "Platform"},
        {key: "run_label", label: "Run"},
        {key: "state", label: "State"},
        {
          key: "throughput_toks",
          label: "Tokens / sec",
          align: "right",
          format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : "n/a")
        },
        {key: "step_s", label: "Step Time", align: "right", format: (v) => formatMs(Number(v) * 1000)},
        {key: "eval_loss", label: "Eval Loss", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(4) : "n/a")}
      ])
    );

    if (speedupRows.length > 0) {
      summaryHost.appendChild(sectionHeading("GPU vs MPS Speedup"));
      summaryHost.append(
        Plot.plot({
          width: 900,
          height: Math.min(440, 120 + speedupRows.length * 18),
          marginLeft: 250,
          x: {label: "throughput speedup (cuda / mps)", grid: true},
          marks: [Plot.barX(speedupRows, {y: "run_label", x: "throughput_speedup", tip: true})]
        }),
        renderSimpleTable(speedupRows, [
          {key: "run_label", label: "Run"},
          {
            key: "throughput_speedup",
            label: "Tokens Speedup",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? `${Number(v).toFixed(2)}x` : "n/a")
          },
          {
            key: "step_time_speedup",
            label: "Step-Time Speedup",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? `${Number(v).toFixed(2)}x` : "n/a")
          }
        ])
      );
    }
  }

  const mode = options.mode || "full";
  const includeCurves = mode !== "summary" || Boolean(options.includeTraining);
  const includeGrid = mode !== "summary" || Boolean(options.includeGrid);
  const includeMicro = mode !== "summary" || Boolean(options.includeMicro);

  if (!includeCurves) {
    clearNode(curvesHost);
    curvesHost.append(sectionHeading("Training Curves"), emptyState("Training curves hidden in summary mode."));
  } else {
    clearNode(curvesHost);
    curvesHost.appendChild(sectionHeading("Training Curves"));

    const runLabels = Array.from(new Set(historyRows.map((row) => row.run_label))).sort();
    const runControl = checkboxGroup(
      runLabels,
      options.historyRuns && options.historyRuns.length > 0 ? options.historyRuns : runLabels.slice(0, 4),
      "run",
      "Runs"
    );
    const metricControl = selectControl(
      "Metric",
      [
        {value: "Loss", label: "Loss"},
        {value: "Eval Loss", label: "Eval Loss"},
        {value: "Throughput/Tokens per sec", label: "Throughput"},
        {value: "Time/Total step", label: "Step Time"}
      ],
      options.historyMetric || "Loss"
    );
    const strideControl = makeRangeControl("Downsample stride", 1, 50, 1, options.historyStride ?? 5);

    const controls = card();
    controls.append(runControl.node, metricControl.node, strideControl.node);
    const chartHost = card();
    const tableHost = card();
    curvesHost.append(controls, chartHost, tableHost);

    const refreshCurves = () => {
      strideControl.output.textContent = strideControl.input.value;
      const selectedRuns = new Set(runControl.getSelected());
      const stride = Number(strideControl.input.value);
      const metric = metricControl.select.value;

      const filtered = historyRows
        .filter((row) => selectedRuns.size === 0 || selectedRuns.has(row.run_label))
        .filter((row) => Number.isFinite(row.step))
        .filter((row) => Number.isFinite(metricValue(row, metric)))
        .filter((row) => Number(row.step) % stride === 0);

      clearNode(chartHost);
      chartHost.appendChild(sectionHeading(`Training Curve: ${metric}`));

      if (filtered.length === 0) {
        chartHost.appendChild(emptyState("No history rows for current selections."));
      } else {
        chartHost.appendChild(
          Plot.plot({
            width: 920,
            height: 340,
            x: {label: "step", grid: true},
            y: {label: metricLabel(metric), grid: true},
            color: {legend: true},
            marks: [Plot.lineY(filtered, {x: "step", y: (d) => metricValue(d, metric), stroke: "run_label", tip: true})]
          })
        );
      }

      clearNode(tableHost);
      tableHost.appendChild(sectionHeading("History Rows (first 1000)"));
      if (filtered.length === 0) {
        tableHost.appendChild(emptyState("No history rows to display."));
      } else {
        tableHost.appendChild(
          renderSimpleTable(filtered.slice(0, 1000), [
            {key: "platform", label: "Platform"},
            {key: "run_label", label: "Run"},
            {key: "step", label: "Step", align: "right"},
            {key: "loss", label: "Loss", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(4) : "n/a")},
            {
              key: "eval_loss",
              label: "Eval Loss",
              align: "right",
              format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(4) : "n/a")
            },
            {
              key: "throughput_toks",
              label: "Tokens / sec",
              align: "right",
              format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : "n/a")
            },
            {key: "step_s", label: "Step Time", align: "right", format: (v) => formatMs(Number(v) * 1000)}
          ])
        );
      }
    };

    runControl.onChange(refreshCurves);
    metricControl.select.addEventListener("change", refreshCurves);
    strideControl.input.addEventListener("input", refreshCurves);
    refreshCurves();
  }

  clearNode(gridHost);
  gridHost.appendChild(sectionHeading("Broad Benchmark Grid"));
  if (!includeGrid) {
    gridHost.appendChild(emptyState("Grid benchmark section hidden in summary mode."));
  } else if (trainRows.length === 0) {
    gridHost.appendChild(emptyState("No train benchmark JSON rows available."));
  } else {
    gridHost.append(
      el(
        "p",
        `Device: ${String(trainRaw?.device || "unknown")}, timestamp: ${String(trainRaw?.timestamp || "unknown")}, rows: ${trainRows.length}`
      ),
      Plot.plot({
        width: 900,
        height: 350,
        x: {label: "estimated memory (GB)", grid: true},
        y: {label: "tokens / sec", grid: true},
        color: {legend: true},
        marks: [Plot.dot(trainRows, {x: "est_memory_gb", y: "tokens_per_sec", fill: "batch_size", tip: true})]
      }),
      renderSimpleTable(trainRows.slice(0, 1000), [
        {key: "label", label: "Spec"},
        {key: "batch_size", label: "B", align: "right"},
        {key: "seq_len", label: "S", align: "right"},
        {key: "d_model", label: "d_model", align: "right"},
        {key: "est_memory_gb", label: "Est Mem (GB)", align: "right", format: (v) => Number(v).toFixed(2)},
        {key: "tokens_per_sec", label: "Tokens / sec", align: "right", format: (v) => Number(v).toFixed(1)},
        {key: "median_s", label: "Median", align: "right", format: (v) => formatMs(Number(v) * 1000)}
      ])
    );
  }

  clearNode(microHost);
  microHost.appendChild(sectionHeading("Micro-Benchmarks"));
  if (!includeMicro) {
    microHost.appendChild(emptyState("Micro section hidden in summary mode."));
  } else if (microRows.length === 0) {
    microHost.appendChild(emptyState("No micro benchmark JSON rows available."));
  } else {
    const sortedMicro = [...microRows].sort((a, b) => d3.ascending(a.median_s, b.median_s));
    microHost.append(
      Plot.plot({
        width: 900,
        height: Math.min(560, 140 + sortedMicro.length * 16),
        marginLeft: 290,
        x: {label: "median runtime (s)", grid: true},
        marks: [Plot.barX(sortedMicro, {y: "benchmark", x: "median_s", tip: true})]
      }),
      renderSimpleTable(sortedMicro, [
        {key: "label", label: "Label"},
        {key: "sublabel", label: "Sublabel"},
        {key: "median_s", label: "Median (s)", align: "right", format: (v) => Number(v).toFixed(4)},
        {key: "mean_s", label: "Mean (s)", align: "right", format: (v) => Number(v).toFixed(4)},
        {key: "iqr_s", label: "IQR (s)", align: "right", format: (v) => Number(v).toFixed(4)},
        {key: "num_runs", label: "Runs", align: "right", format: (v) => Number(v || 0).toFixed(0)}
      ])
    );
  }

  status.textContent = `Loaded ${mainRows.length} platform-summary rows, ${historyRows.length} history rows, ${trainRows.length} grid rows, ${microRows.length} micro rows.`;

  return root;
}
