import {FileAttachment} from "../../_observablehq/stdlib.43270668.js";
import * as Plot from "../../_npm/@observablehq/plot@0.6.17/7c43807f.js";
import * as d3 from "../../_npm/d3@7.9.0/e324157d.js";
import {formatMs} from "../components/data-utils.e2caa41c.js";
import {clearNode, emptyState, renderSimpleTable, sectionHeading} from "../components/dom-utils.aaca454b.js";

const ATTACHMENTS = {
  main: FileAttachment({"name":"../../data/raw/benchmarks/ablations_main.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/ablations_main.89f4a063.parquet","lastModified":1771465633669,"size":32130}, import.meta.url),
  history: FileAttachment({"name":"../../data/raw/benchmarks/ablations_history.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/ablations_history.32f488b0.parquet","lastModified":1771465877012,"size":687805}, import.meta.url)
};

let ablationDataPromise;

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
  if (path in row) return row[path];
  const parts = path.split(".");
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

function checkboxGroup(values, initialValues, legendText, keyPrefix) {
  const fieldset = el("fieldset");
  fieldset.style.border = "none";
  fieldset.style.margin = "0";
  fieldset.style.padding = "0";
  fieldset.style.display = "flex";
  fieldset.style.flexWrap = "wrap";
  fieldset.style.gap = "0.7rem";

  const legend = el("legend", legendText);
  legend.style.fontWeight = "600";
  legend.style.marginBottom = "0.35rem";
  fieldset.appendChild(legend);

  for (const [idx, value] of values.entries()) {
    const id = `${keyPrefix}-${idx}`;
    const label = el("label");
    label.htmlFor = id;
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "0.3rem";

    const input = el("input");
    input.type = "checkbox";
    input.id = id;
    input.dataset.value = value;
    input.checked = initialValues.includes(value);

    label.append(input, document.createTextNode(value));
    fieldset.appendChild(label);
  }

  return {
    node: fieldset,
    getSelected() {
      return Array.from(fieldset.querySelectorAll("input[type=checkbox]"))
        .filter((input) => input.checked)
        .map((input) => input.dataset.value || "");
    },
    onChange(handler) {
      fieldset.addEventListener("change", handler);
    }
  };
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

function rangeControl(labelText, min, max, step, value) {
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
  if (metric === "Eval Perplexity") return row.eval_perplexity;
  if (metric === "Throughput/Tokens per sec") return row.tokens_per_sec;
  return row.step_s;
}

async function loadAblationData() {
  if (!ablationDataPromise) {
    ablationDataPromise = (async () => {
      const [mainTable, historyTable] = await Promise.all([ATTACHMENTS.main.parquet(), ATTACHMENTS.history.parquet()]);

      const mainRows = Array.from(mainTable, (row) => ({
        run_name: pickString(row, ["run_name", "config.run_name"], "unknown-run"),
        state: pickString(row, ["state"], "unknown"),
        norm_mode: pickString(row, ["config.model_settings.norm_mode", "norm_mode"], "unknown"),
        use_rope: pickString(row, ["config.model_settings.use_rope", "use_rope"], "unknown"),
        ffn_type: pickString(row, ["config.model_settings.ffn_type", "ffn_type"], "unknown"),
        d_model: pickNumber(row, ["config.model_settings.d_model", "d_model"]),
        num_layers: pickNumber(row, ["config.model_settings.num_layers", "num_layers"]),
        loss: pickNumber(row, ["Loss"]),
        eval_loss: pickNumber(row, ["Eval Loss", "Eval/Loss"]),
        eval_perplexity: pickNumber(row, ["Eval Perplexity", "Eval/Perplexity"]),
        tokens_per_sec: pickNumber(row, ["Throughput/Tokens per sec"]),
        memory_max_gb: pickNumber(row, ["Memory/Max allocated (GB)"]),
        step_s: pickNumber(row, ["Time/Total step"])
      })).sort((a, b) => d3.ascending(a.eval_loss, b.eval_loss));

      const historyRows = Array.from(historyTable, (row) => ({
        run_name: pickString(row, ["run_name", "config.run_name"], "unknown-run"),
        norm_mode: pickString(row, ["config.model_settings.norm_mode", "norm_mode"], "unknown"),
        use_rope: pickString(row, ["config.model_settings.use_rope", "use_rope"], "unknown"),
        ffn_type: pickString(row, ["config.model_settings.ffn_type", "ffn_type"], "unknown"),
        step: pickNumber(row, ["_step", "step"]),
        loss: pickNumber(row, ["Loss"]),
        eval_loss: pickNumber(row, ["Eval Loss", "Eval/Loss"]),
        eval_perplexity: pickNumber(row, ["Eval Perplexity", "Eval/Perplexity"]),
        tokens_per_sec: pickNumber(row, ["Throughput/Tokens per sec"]),
        step_s: pickNumber(row, ["Time/Total step"])
      }))
        .filter((row) => Number.isFinite(row.step))
        .sort((a, b) => d3.ascending(a.step, b.step));

      return {mainRows, historyRows};
    })();
  }

  return ablationDataPromise;
}

export async function renderAblations(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-ablations";
  root.style.display = "grid";
  root.style.gap = "1rem";

  const title = el("h2", "Ablation Analysis");
  title.style.margin = "0";
  const subtitle = el(
    "p",
    "Ablation summary metrics, eval-loss/throughput/memory views, and history controls."
  );
  subtitle.style.margin = "0";

  const status = el("p");
  status.style.margin = "0";

  const summaryHost = card();
  const chartsHost = card();
  const historyHost = card();

  root.append(title, subtitle, status, summaryHost, chartsHost, historyHost);

  let data;
  try {
    data = await loadAblationData();
  } catch (error) {
    status.textContent = `Failed to load ablations parquet snapshots: ${error.message}`;
    summaryHost.appendChild(emptyState("Ablation summary unavailable."));
    chartsHost.appendChild(emptyState("Ablation charts unavailable."));
    historyHost.appendChild(emptyState("Ablation history unavailable."));
    return root;
  }

  const {mainRows, historyRows} = data;
  status.textContent = `Loaded ${mainRows.length} summary rows and ${historyRows.length} history rows.`;

  clearNode(summaryHost);
  summaryHost.appendChild(sectionHeading("Ablation Summary Table"));
  if (mainRows.length === 0) {
    summaryHost.appendChild(emptyState("No ablation summary rows available."));
  } else {
    summaryHost.appendChild(
      renderSimpleTable(mainRows, [
        {key: "run_name", label: "Run"},
        {key: "state", label: "State"},
        {key: "norm_mode", label: "Norm"},
        {key: "use_rope", label: "RoPE"},
        {key: "ffn_type", label: "FFN"},
        {
          key: "eval_loss",
          label: "Eval Loss",
          align: "right",
          format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")
        },
        {
          key: "tokens_per_sec",
          label: "Tokens / sec",
          align: "right",
          format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : "n/a")
        },
        {
          key: "memory_max_gb",
          label: "Max Mem (GB)",
          align: "right",
          format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "n/a")
        },
        {
          key: "step_s",
          label: "Step Time",
          align: "right",
          format: (v) => (Number.isFinite(Number(v)) ? formatMs(Number(v) * 1000) : "n/a")
        }
      ])
    );
  }

  clearNode(chartsHost);
  chartsHost.appendChild(sectionHeading("Eval-Loss, Throughput, and Memory Charts"));
  if (mainRows.length === 0) {
    chartsHost.appendChild(emptyState("No rows for chart rendering."));
  } else {
    const evalRows = mainRows.filter((row) => Number.isFinite(row.eval_loss));
    const throughputRows = mainRows.filter((row) => Number.isFinite(row.tokens_per_sec));
    const memRows = mainRows.filter((row) => Number.isFinite(row.memory_max_gb) && Number.isFinite(row.tokens_per_sec));

    if (evalRows.length > 0) {
      chartsHost.appendChild(
        Plot.plot({
          width: 920,
          height: 300,
          marginLeft: 220,
          x: {label: "Eval Loss", grid: true},
          y: {label: null},
          color: {legend: true},
          marks: [Plot.barX(evalRows, {x: "eval_loss", y: "run_name", fill: "state", tip: true})]
        })
      );
    }

    if (throughputRows.length > 0) {
      chartsHost.appendChild(
        Plot.plot({
          width: 920,
          height: 320,
          marginLeft: 220,
          x: {label: "Tokens / sec", grid: true},
          y: {label: null},
          color: {legend: true},
          marks: [Plot.barX(throughputRows, {x: "tokens_per_sec", y: "run_name", fill: "norm_mode", tip: true})]
        })
      );
    }

    if (memRows.length > 0) {
      chartsHost.appendChild(
        Plot.plot({
          width: 920,
          height: 320,
          x: {label: "Max Memory (GB)", grid: true},
          y: {label: "Tokens / sec", grid: true},
          color: {legend: true},
          marks: [Plot.dot(memRows, {x: "memory_max_gb", y: "tokens_per_sec", fill: "run_name", tip: true})]
        })
      );
    }
  }

  const runNames = Array.from(new Set(mainRows.map((row) => row.run_name))).sort();
  const runControl = checkboxGroup(
    runNames,
    Array.isArray(options.historyRuns) && options.historyRuns.length > 0 ? options.historyRuns : runNames.slice(0, 5),
    "Runs",
    "ablation-run"
  );
  const metricControl = selectControl(
    "Metric",
    [
      {value: "Loss", label: "Loss"},
      {value: "Eval Loss", label: "Eval Loss"},
      {value: "Eval Perplexity", label: "Eval Perplexity"},
      {value: "Throughput/Tokens per sec", label: "Throughput"},
      {value: "Time/Total step", label: "Step Time"}
    ],
    options.historyMetric || "Eval Loss"
  );
  const strideControl = rangeControl("Downsample stride", 1, 100, 1, options.historyStride ?? 10);

  clearNode(historyHost);
  historyHost.appendChild(sectionHeading("History Controls and Curves"));
  const controlsHost = card();
  const chartHost = card();
  const tableHost = card();
  controlsHost.append(runControl.node, metricControl.node, strideControl.node);
  historyHost.append(controlsHost, chartHost, tableHost);

  function refreshHistory() {
    strideControl.output.textContent = strideControl.input.value;
    const selectedRuns = new Set(runControl.getSelected());
    const metric = metricControl.select.value;
    const stride = Number(strideControl.input.value);

    const filtered = historyRows
      .filter((row) => selectedRuns.size === 0 || selectedRuns.has(row.run_name))
      .filter((row) => Number.isFinite(metricValue(row, metric)))
      .filter((row) => Number.isFinite(row.step) && row.step % stride === 0);

    clearNode(chartHost);
    clearNode(tableHost);
    chartHost.appendChild(sectionHeading(`Ablation Curve: ${metric}`));

    if (filtered.length === 0) {
      chartHost.appendChild(emptyState("No ablation history rows for current selection."));
      tableHost.appendChild(emptyState("No rows to display."));
      return;
    }

    chartHost.appendChild(
      Plot.plot({
        width: 920,
        height: 340,
        x: {label: "step", grid: true},
        y: {label: metric, grid: true},
        color: {legend: true},
        marks: [Plot.lineY(filtered, {x: "step", y: (d) => metricValue(d, metric), stroke: "run_name", tip: true})]
      })
    );

    tableHost.appendChild(
      renderSimpleTable(filtered.slice(0, 1000), [
        {key: "run_name", label: "Run"},
        {key: "norm_mode", label: "Norm"},
        {key: "use_rope", label: "RoPE"},
        {key: "ffn_type", label: "FFN"},
        {key: "step", label: "Step", align: "right"},
        {
          key: "loss",
          label: "Loss",
          align: "right",
          format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")
        },
        {
          key: "eval_loss",
          label: "Eval Loss",
          align: "right",
          format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")
        },
        {
          key: "tokens_per_sec",
          label: "Tokens / sec",
          align: "right",
          format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : "n/a")
        },
        {
          key: "step_s",
          label: "Step Time",
          align: "right",
          format: (v) => (Number.isFinite(Number(v)) ? formatMs(Number(v) * 1000) : "n/a")
        }
      ])
    );
  }

  runControl.onChange(refreshHistory);
  metricControl.select.addEventListener("change", refreshHistory);
  strideControl.input.addEventListener("input", refreshHistory);

  refreshHistory();

  return root;
}
