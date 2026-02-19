import {FileAttachment} from "../../_observablehq/stdlib.43270668.js";
import * as Plot from "../../_npm/@observablehq/plot@0.6.17/7c43807f.js";
import * as d3 from "../../_npm/d3@7.9.0/e324157d.js";
import {clearNode, emptyState, renderSimpleTable, collapsible} from "../components/dom-utils.363530d4.js";

const ATTACHMENTS = {
  main: FileAttachment({"name":"../../data/raw/benchmarks/lr_sweeps_main.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/lr_sweeps_main.98e6db0c.parquet","lastModified":1771466904236,"size":15015}, import.meta.url),
  history: FileAttachment({"name":"../../data/raw/benchmarks/lr_sweeps_history.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/lr_sweeps_history.4f809053.parquet","lastModified":1771468224300,"size":3312658}, import.meta.url)
};

let sweepDataPromise;

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

function runNumber(name) {
  const match = String(name || "").match(/(\d+)$/);
  return match ? Number(match[1]) : NaN;
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

function rangeWindowControl(labelText, min, max, step, startValue, endValue) {
  const wrapper = el("div");
  wrapper.style.display = "grid";
  wrapper.style.gap = "0.5rem";

  const header = el("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "flex-start";
  header.style.gap = "0.75rem";
  const title = el("span", labelText);
  title.style.fontWeight = "600";
  header.appendChild(title);

  const output = el("output");
  output.style.fontVariantNumeric = "tabular-nums";
  header.appendChild(output);

  const startControl = rangeControl("Start", min, max, step, startValue);
  const endControl = rangeControl("End", min, max, step, endValue);

  function sync(activeHandle = null) {
    let start = Number(startControl.input.value);
    let end = Number(endControl.input.value);
    if (!Number.isFinite(start)) start = min;
    if (!Number.isFinite(end)) end = max;
    if (start > end) {
      if (activeHandle === "start") {
        end = start;
      } else {
        start = end;
      }
    }
    startControl.input.value = String(start);
    endControl.input.value = String(end);
    startControl.output.textContent = String(Math.round(start));
    endControl.output.textContent = String(Math.round(end));
    output.textContent = `${Math.round(start)} - ${Math.round(end)}`;
  }

  sync();
  wrapper.append(header, startControl.node, endControl.node);

  return {
    node: wrapper,
    getWindow() {
      sync();
      return {start: Number(startControl.input.value), end: Number(endControl.input.value)};
    },
    onChange(handler) {
      startControl.input.addEventListener("input", () => {
        sync("start");
        handler();
      });
      endControl.input.addEventListener("input", () => {
        sync("end");
        handler();
      });
    }
  };
}

function metricValue(row, metric) {
  if (metric === "Loss") return row.loss;
  if (metric === "Eval Loss") return row.eval_loss;
  if (metric === "Eval Perplexity") return row.eval_perplexity;
  if (metric === "Throughput/Tokens per sec") return row.tokens_per_sec;
  if (metric === "LR") return row.lr;
  return row.step_s;
}

function normalizeEvalLoss(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

function smoothByRun(rows, valueKey, windowSize = 25) {
  const output = [];
  const grouped = d3.groups(rows, (row) => row.run_name);

  for (const [, runRows] of grouped) {
    const ordered = [...runRows].sort((a, b) => d3.ascending(a.step, b.step));
    let runningTotal = 0;
    const values = ordered.map((row) => Number(row[valueKey]));

    for (let i = 0; i < ordered.length; i += 1) {
      const current = values[i];
      runningTotal += current;

      if (i >= windowSize) {
        runningTotal -= values[i - windowSize];
      }

      const windowLength = Math.min(i + 1, windowSize);
      const smoothed = runningTotal / windowLength;
      output.push({...ordered[i], [`${valueKey}_smoothed`]: smoothed});
    }
  }

  return output;
}

function summarizeSweepPoints(mainRows, historyRows) {
  const mainByRun = new Map(mainRows.map((row) => [row.run_name, row]));
  const runs = new Set([...mainByRun.keys(), ...historyRows.map((row) => row.run_name)]);
  const points = [];

  for (const run of runs) {
    const main = mainByRun.get(run);
    const history = historyRows
      .filter((row) => row.run_name === run)
      .sort((a, b) => d3.ascending(a.step, b.step));
    const evalRows = history.filter((row) => Number.isFinite(row.eval_loss) && row.eval_loss > 0);
    const finalEvalRow = evalRows.length > 0 ? evalRows[evalRows.length - 1] : null;

    const peakLrFromHistory = d3.max(history, (row) => row.lr);
    const peakLr = Number.isFinite(peakLrFromHistory) ? peakLrFromHistory : main?.lr_max;

    points.push({
      run_name: run,
      run_number: Number.isFinite(main?.run_number) ? main.run_number : runNumber(run),
      peak_lr: Number.isFinite(peakLr) ? peakLr : NaN,
      final_eval_loss: finalEvalRow ? finalEvalRow.eval_loss : NaN,
      final_eval_step: finalEvalRow ? finalEvalRow.step : NaN
    });
  }

  return points
    .filter((row) => Number.isFinite(row.run_number))
    .sort((a, b) => d3.ascending(a.run_number, b.run_number));
}

function withLossDelta(historyRows) {
  const byRun = d3.groups(historyRows, (row) => row.run_name);
  const output = [];

  for (const [, rows] of byRun) {
    const ordered = [...rows].sort((a, b) => d3.ascending(a.step, b.step));
    for (let i = 0; i < ordered.length; i += 1) {
      const current = ordered[i];
      const next = ordered[i + 1];
      const delta =
        next && Number.isFinite(current.loss) && Number.isFinite(next.loss) && next.step === current.step + 1
          ? current.loss - next.loss
          : NaN;

      output.push({...current, next_step: next ? next.step : NaN, next_loss: next ? next.loss : NaN, loss_delta: delta});
    }
  }

  return output;
}

async function loadSweepData() {
  if (!sweepDataPromise) {
    sweepDataPromise = (async () => {
      const [mainTable, historyTable] = await Promise.all([ATTACHMENTS.main.parquet(), ATTACHMENTS.history.parquet()]);

      const mainRows = Array.from(mainTable, (row) => {
        const run_name = pickString(row, ["run_name", "config.run_name"], "unknown-run");
        return {
          run_name,
          run_number: runNumber(run_name),
          state: pickString(row, ["state"], "unknown"),
          lr_max: pickNumber(row, ["config.scheduler_lr_max", "lr_max", "LR"]),
          eval_best_loss: pickNumber(row, ["Eval Best loss", "Eval/Best loss"]),
          eval_loss: pickNumber(row, ["Eval Loss", "Eval/Loss"]),
          eval_perplexity: pickNumber(row, ["Eval Perplexity", "Eval/Perplexity"]),
          tokens_per_sec: pickNumber(row, ["Throughput/Tokens per sec"]),
          step_s: pickNumber(row, ["Time/Total step"])
        };
      }).sort((a, b) => d3.ascending(a.run_number, b.run_number));

      const historyRowsRaw = Array.from(historyTable, (row) => {
        const run_name = pickString(row, ["run_name", "config.run_name"], "unknown-run");
        return {
          run_name,
          run_number: runNumber(run_name),
          step: pickNumber(row, ["_step", "step"]),
          lr: pickNumber(row, ["LR", "config.scheduler_lr_max", "lr_max"]),
          loss: pickNumber(row, ["Loss"]),
          eval_loss: normalizeEvalLoss(pickNumber(row, ["Eval Loss", "Eval/Loss"])),
          eval_perplexity: pickNumber(row, ["Eval Perplexity", "Eval/Perplexity"]),
          tokens_per_sec: pickNumber(row, ["Throughput/Tokens per sec"]),
          step_s: pickNumber(row, ["Time/Total step"]),
          grad_clipped: pickNumber(row, ["Grad/Norm (clipped)"]),
          grad_unclipped: pickNumber(row, ["Grad/Norm (unclipped)"]),
          state: pickString(row, ["state"], "unknown")
        };
      }).filter((row) => Number.isFinite(row.step));

      const historyRows = withLossDelta(historyRowsRaw);
      const sweepPoints = summarizeSweepPoints(mainRows, historyRows);

      return {mainRows, historyRows, sweepPoints};
    })();
  }

  return sweepDataPromise;
}

function inferColumns(rows) {
  if (rows.length === 0) return {all: [], numeric: []};
  const all = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const numeric = all.filter((key) => {
    const sample = rows.slice(0, 300).map((row) => row[key]);
    const finite = sample.filter((value) => Number.isFinite(Number(value))).length;
    return finite > 0;
  });
  return {all, numeric};
}

function aggregatePivot(rows, xKey, yKey, colorKey, aggregation, topN) {
  const grouped = d3.rollups(
    rows,
    (group) => {
      const values = group.map((row) => Number(row[yKey])).filter((v) => Number.isFinite(v));
      const base = {
        count: group.length,
        sum: d3.sum(values),
        min: d3.min(values) ?? NaN,
        max: d3.max(values) ?? NaN,
        mean: d3.mean(values) ?? NaN
      };
      const value = aggregation === "count" ? base.count : base[aggregation];
      return {value: Number(value), count: base.count};
    },
    (row) => String(row[xKey]),
    (row) => (colorKey === "(none)" ? "all" : String(row[colorKey]))
  );

  return grouped
    .flatMap(([x, byColor]) =>
      byColor.map(([split, metrics]) => ({
        x,
        split,
        value: metrics.value,
        count: metrics.count
      }))
    )
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => d3.descending(a.value, b.value))
    .slice(0, topN);
}

export async function renderLrSweepFrontier(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-lr-sweep-frontier";
  root.style.display = "grid";
  root.style.gap = "1rem";

  let data;
  try {
    data = await loadSweepData();
  } catch (error) {
    root.appendChild(emptyState(`Failed to load LR sweep parquet snapshots: ${error.message}`));
    return root;
  }

  const {mainRows} = data;
  if (mainRows.length === 0) {
    root.appendChild(emptyState("No sweep summary rows available."));
    return root;
  }

  const frontierRows = mainRows.filter((row) => Number.isFinite(row.lr_max) && row.lr_max > 0 && Number.isFinite(row.eval_best_loss));

  const host = card();
  host.append(
    Plot.plot({
      title: "Best Evaluation Loss by Maximum Learning Rate",
      width: 920,
      height: 340,
      x: {label: "Best Eval Loss", grid: true},
      y: {type: "log", label: "Max LR", grid: true},
      color: {legend: false},
      marks: [Plot.dot(frontierRows, {x: "eval_best_loss", y: "lr_max", fill: "run_name", tip: true})]
    })
  );

  const details = collapsible("expand to view sweep summary table");
  const tableRows = [...mainRows].sort((a, b) => d3.ascending(a.run_number, b.run_number));

  details.appendChild(
    renderSimpleTable(tableRows, [
      {key: "run_number", label: "Run #", align: "right"},
      {key: "lr_max", label: "LR Max", align: "right", format: (v) => Number(v).toFixed(5)},
      {key: "eval_best_loss", label: "Eval Best Loss", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")}
    ])
  );
  host.appendChild(details);
  root.appendChild(host);

  return root;
}

export async function renderLrSweepThreshold(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-lr-sweep-threshold";
  root.style.display = "grid";
  root.style.gap = "1rem";

  let data;
  try {
    data = await loadSweepData();
  } catch (error) {
    root.appendChild(emptyState(`Failed to load LR sweep data: ${error.message}`));
    return root;
  }

  const {historyRows, sweepPoints} = data;
  const historyByRun = d3.group(
    historyRows.filter((row) => Number.isFinite(row.step)),
    (row) => row.run_name
  );
  for (const rows of historyByRun.values()) {
    rows.sort((a, b) => d3.ascending(a.step, b.step));
  }

  const thresholdControl = rangeControl("Loss threshold", 0.5, 10, 0.1, options.lossThreshold ?? 5);
  const chartHost = card();
  const tableHost = card();
  root.append(thresholdControl.node, chartHost, tableHost);

  function refresh() {
    thresholdControl.output.textContent = thresholdControl.input.value;
    const threshold = Number(thresholdControl.input.value);
    const thresholdRows = sweepPoints
      .map((point) => {
        const first = (historyByRun.get(point.run_name) || []).find(
          (row) => Number.isFinite(row.loss) && row.loss < threshold
        );
        return {...point, first_step_below_threshold: first ? first.step : NaN};
      })
      .filter((row) => Number.isFinite(row.peak_lr));

    clearNode(chartHost);
    clearNode(tableHost);
    if (thresholdRows.length === 0) {
      chartHost.appendChild(emptyState("No threshold rows available."));
      return;
    }

    const plotted = thresholdRows.filter((row) => Number.isFinite(row.first_step_below_threshold));
    chartHost.appendChild(
      Plot.plot({
        width: 920,
        height: 320,
        x: {type: "log", label: "Peak LR", grid: true},
        y: {label: "First step below threshold", grid: true},
        marks: [Plot.dot(plotted, {x: "peak_lr", y: "first_step_below_threshold", fill: "run_number", tip: true})]
      })
    );
    
    const details = collapsible("expand to view threshold table");
    details.appendChild(
      renderSimpleTable(thresholdRows, [
        {key: "run_name", label: "Run"},
        {key: "run_number", label: "Run #", align: "right"},
        {key: "peak_lr", label: "Peak LR", align: "right", format: (v) => Number(v).toFixed(5)},
        {key: "first_step_below_threshold", label: "First Step", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(0) : "n/a")},
        {key: "final_eval_loss", label: "Final Eval Loss", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toExponential(2) : "n/a")}
      ])
    );
    tableHost.appendChild(details);
  }

  thresholdControl.input.addEventListener("input", refresh);
  refresh();
  return root;
}

export async function renderLrSweepHistory(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-lr-sweep-history";
  root.style.display = "grid";
  root.style.gap = "1rem";

  let data;
  try {
    data = await loadSweepData();
  } catch (error) {
    root.appendChild(emptyState(`Failed to load LR sweep data: ${error.message}`));
    return root;
  }

  const {historyRows} = data;
  const runLabels = Array.from(new Set(historyRows.map((row) => row.run_name))).sort();
  const runControl = checkboxGroup(
    runLabels,
    Array.isArray(options.historyRuns) && options.historyRuns.length > 0 ? options.historyRuns : runLabels.slice(0, 5),
    "Runs",
    "history-run"
  );
  const metricControl = selectControl(
    "Metric",
    [
      {value: "Loss", label: "Loss"},
      {value: "Eval Loss", label: "Eval Loss"},
      {value: "Eval Perplexity", label: "Eval Perplexity"},
      {value: "Throughput/Tokens per sec", label: "Throughput"},
      {value: "LR", label: "LR"},
      {value: "Time/Total step", label: "Step Time"}
    ],
    options.historyMetric || "Eval Loss"
  );
  const strideControl = rangeControl("History stride", 1, 100, 1, options.historyStride ?? 10);

  const controls = card();
  controls.append(runControl.node, metricControl.node, strideControl.node);
  const chartHost = card();
  const tableHost = card();
  root.append(controls, chartHost, tableHost);

  function refresh() {
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
    
    if (filtered.length === 0) {
      chartHost.appendChild(emptyState("No history rows for selected runs/metric."));
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

    const details = collapsible(`expand to view ${metric} history table`);
    details.appendChild(
      renderSimpleTable(filtered.slice(0, 1000), [
        {key: "run_name", label: "Run"},
        {key: "step", label: "Step", align: "right"},
        {key: "lr", label: "LR", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(5) : "n/a")},
        {key: "loss", label: "Loss", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")},
        {key: "eval_loss", label: "Eval Loss", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")}
      ])
    );
    tableHost.appendChild(details);
  }

  runControl.onChange(refresh);
  metricControl.select.addEventListener("change", refresh);
  strideControl.input.addEventListener("input", refresh);
  refresh();
  return root;
}

export async function renderLrSweepGradient(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-lr-sweep-gradient";
  root.style.display = "grid";
  root.style.gap = "1rem";

  let data;
  try {
    data = await loadSweepData();
  } catch (error) {
    root.appendChild(emptyState(`Failed to load LR sweep data: ${error.message}`));
    return root;
  }

  const {historyRows} = data;
  const runLabels = Array.from(new Set(historyRows.map((row) => row.run_name))).sort();
  const runControl = checkboxGroup(
    runLabels,
    Array.isArray(options.historyRuns) && options.historyRuns.length > 0 ? options.historyRuns : runLabels.slice(0, 5),
    "Runs",
    "grad-run"
  );
  
  const controls = card();
  controls.appendChild(runControl.node);
  
  const gradClippedHost = card();
  const gradUnclippedHost = card();
  const deltaHost = card();
  
  root.append(controls, gradClippedHost, gradUnclippedHost, deltaHost);

  function refresh() {
    const selectedRuns = new Set(runControl.getSelected());
    const gradRows = historyRows.filter((row) => selectedRuns.size === 0 || selectedRuns.has(row.run_name));

    clearNode(gradClippedHost);
    clearNode(gradUnclippedHost);
    clearNode(deltaHost);

    const gradClippedRows = gradRows.filter((row) => Number.isFinite(row.lr) && Number.isFinite(row.grad_clipped));
    if (gradClippedRows.length > 0) {
      gradClippedHost.appendChild(
        Plot.plot({
          title: "Clipped Gradient Norm vs LR",
          width: 920,
          height: 320,
          x: {type: "log", label: "LR", grid: true},
          y: {label: "Grad/Norm (clipped)", grid: true},
          color: {legend: true},
          marks: [Plot.dot(gradClippedRows, {x: "lr", y: "grad_clipped", fill: "run_name", tip: true})]
        })
      );
    } else {
      gradClippedHost.appendChild(emptyState("No clipped gradient rows available."));
    }

    const gradUnclippedRows = gradRows.filter((row) => Number.isFinite(row.lr) && Number.isFinite(row.grad_unclipped));
    if (gradUnclippedRows.length > 0) {
      gradUnclippedHost.appendChild(
        Plot.plot({
          title: "Unclipped Gradient Norm vs LR",
          width: 920,
          height: 320,
          x: {type: "log", label: "LR", grid: true},
          y: {label: "Grad/Norm (unclipped)", grid: true},
          color: {legend: true},
          marks: [Plot.dot(gradUnclippedRows, {x: "lr", y: "grad_unclipped", fill: "run_name", tip: true})]
        })
      );
    } else {
      gradUnclippedHost.appendChild(emptyState("No unclipped gradient rows available."));
    }

    const deltaRows = gradRows.filter((row) => Number.isFinite(row.lr) && Number.isFinite(row.loss_delta));
    if (deltaRows.length > 0) {
      deltaHost.appendChild(
        Plot.plot({
          title: "Loss Delta (l_t - l_t+1) vs LR",
          width: 920,
          height: 320,
          x: {type: "log", label: "LR", grid: true},
          y: {label: "Loss Delta", grid: true},
          color: {legend: true},
          marks: [Plot.dot(deltaRows, {x: "lr", y: "loss_delta", fill: "run_name", tip: true})]
        })
      );
      
      const details = collapsible("expand to view loss delta table");
      details.appendChild(
        renderSimpleTable(deltaRows.slice(0, 250), [
          {key: "run_name", label: "Run"},
          {key: "step", label: "Step", align: "right"},
          {key: "next_step", label: "Next Step", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(0) : "n/a")},
          {key: "lr", label: "LR", align: "right", format: (v) => Number(v).toFixed(5)},
          {key: "loss", label: "Loss", align: "right", format: (v) => Number(v).toFixed(6)},
          {key: "next_loss", label: "Next Loss", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")},
          {key: "loss_delta", label: "Delta", align: "right", format: (v) => Number(v).toFixed(6)}
        ])
      );
      deltaHost.appendChild(details);
    } else {
      deltaHost.appendChild(emptyState("No loss-delta rows available."));
    }
  }

  runControl.onChange(refresh);
  refresh();
  return root;
}

export async function renderLrSweepPivot(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-lr-sweep-pivot";
  root.style.display = "grid";
  root.style.gap = "1rem";

  let data;
  try {
    data = await loadSweepData();
  } catch (error) {
    root.appendChild(emptyState(`Failed to load LR sweep data: ${error.message}`));
    return root;
  }

  const {mainRows, historyRows} = data;
  
  const pivotSource = selectControl(
    "Source",
    [{value: "main", label: "main"}, {value: "history", label: "history"}],
    "main"
  );
  const pivotAgg = selectControl(
    "Aggregation",
    [{value: "mean", label: "mean"}, {value: "min", label: "min"}, {value: "max", label: "max"}, {value: "sum", label: "sum"}, {value: "count", label: "count"}],
    "mean"
  );
  const pivotChartType = selectControl(
    "Chart type",
    [{value: "bar", label: "bar"}, {value: "line", label: "line"}],
    "bar"
  );
  const pivotTopN = rangeControl("Top N", 5, 200, 5, 50);

  const controls = card();
  const chartHost = card();
  const tableHost = card();
  root.append(controls, chartHost, tableHost);

  let pivotX;
  let pivotY;
  let pivotColor;

  function rebuildPivotControls() {
    clearNode(controls);
    const sourceRows = pivotSource.select.value === "main" ? mainRows : historyRows;
    const {all, numeric} = inferColumns(sourceRows);

    const xDefault = all.includes("run_name") ? "run_name" : all[0] || "run_name";
    const yDefault = numeric.includes("eval_best_loss") ? "eval_best_loss" : numeric.includes("eval_loss") ? "eval_loss" : numeric[0] || all[0] || "run_number";
    const colorDefault = all.includes("state") ? "state" : "(none)";

    pivotX = selectControl("X", all.map((value) => ({value, label: value})), xDefault);
    pivotY = selectControl("Y", (numeric.length > 0 ? numeric : all).map((value) => ({value, label: value})), yDefault);
    pivotColor = selectControl("Color", [{value: "(none)", label: "(none)"}, ...all.map((value) => ({value, label: value}))], colorDefault);

    controls.append(pivotSource.node, pivotX.node, pivotY.node, pivotColor.node, pivotAgg.node, pivotChartType.node, pivotTopN.node);

    pivotX.select.addEventListener("change", refresh);
    pivotY.select.addEventListener("change", refresh);
    pivotColor.select.addEventListener("change", refresh);
  }

  function refresh() {
    pivotTopN.output.textContent = pivotTopN.input.value;
    if (!pivotX || !pivotY || !pivotColor) return;

    const pivotRows = pivotSource.select.value === "main" ? mainRows : historyRows;
    const aggregated = aggregatePivot(
      pivotRows,
      pivotX.select.value,
      pivotY.select.value,
      pivotColor.select.value,
      pivotAgg.select.value,
      Number(pivotTopN.input.value)
    );

    clearNode(chartHost);
    clearNode(tableHost);

    if (aggregated.length === 0) {
      chartHost.appendChild(emptyState("No rows for selected pivot settings."));
      return;
    }

    const marks = pivotChartType.select.value === "line"
      ? [Plot.lineY(aggregated, {x: "x", y: "value", stroke: "split", tip: true}), Plot.dot(aggregated, {x: "x", y: "value", fill: "split", tip: true})]
      : [Plot.barY(aggregated, {x: "x", y: "value", fill: "split", fx: "split", tip: true})];

    chartHost.appendChild(
      Plot.plot({
        width: 920,
        height: 360,
        x: {label: pivotX.select.value},
        y: {label: `${pivotAgg.select.value}(${pivotY.select.value})`, grid: true},
        color: {legend: true},
        marks
      })
    );

    const details = collapsible("expand to view pivot table");
    details.appendChild(
      renderSimpleTable(aggregated, [
        {key: "x", label: pivotX.select.value},
        {key: "split", label: "split"},
        {key: "value", label: `${pivotAgg.select.value}(${pivotY.select.value})`, align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")},
        {key: "count", label: "count", align: "right"}
      ])
    );
    tableHost.appendChild(details);
  }

  pivotSource.select.addEventListener("change", () => {
    rebuildPivotControls();
    refresh();
  });
  pivotAgg.select.addEventListener("change", refresh);
  pivotChartType.select.addEventListener("change", refresh);
  pivotTopN.input.addEventListener("input", refresh);

  rebuildPivotControls();
  refresh();
  return root;
}

export async function renderLrSweepSummaryTable(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-lr-sweep-summary-table";
  root.style.display = "grid";
  root.style.gap = "1rem";

  let data;
  try {
    data = await loadSweepData();
  } catch (error) {
    root.appendChild(emptyState(`Failed to load LR sweep parquet snapshots: ${error.message}`));
    return root;
  }

  const {mainRows, historyRows} = data;
  if (mainRows.length === 0) {
    root.appendChild(emptyState("No sweep summary rows available."));
    return root;
  }

  const historyByRun = d3.group(
    historyRows,
    (r) => r.run_name
  );

  const tableData = mainRows.map((mainRow) => {
    const runHistory = historyByRun.get(mainRow.run_name) || [];
    const gradNorms = runHistory.filter((r) => Number.isFinite(r.grad_unclipped)).map((r) => r.grad_unclipped).sort(d3.ascending);

    const evalRows = runHistory.filter((r) => Number.isFinite(r.eval_loss) && r.eval_loss > 0).sort((a, b) => d3.ascending(a.step, b.step));
    const final_eval_loss = evalRows.length > 0 ? evalRows[evalRows.length - 1].eval_loss : NaN;

    let grad_mean = NaN, grad_median = NaN, grad_max = NaN, grad_p99 = NaN;
    if (gradNorms.length > 0) {
      grad_mean = d3.mean(gradNorms);
      grad_median = d3.median(gradNorms);
      grad_max = d3.max(gradNorms);
      grad_p99 = d3.quantile(gradNorms, 0.99);
    }

    return {
      run_number: mainRow.run_number,
      lr_max: mainRow.lr_max,
      final_eval_loss,
      eval_best_loss: mainRow.eval_best_loss,
      grad_mean,
      grad_median,
      grad_max,
      grad_p99
    };
  }).sort((a, b) => d3.ascending(a.run_number, b.run_number));

  const host = card();
  host.appendChild(
    renderSimpleTable(tableData, [
      {key: "run_number", label: "Run #", align: "right"},
      {key: "lr_max", label: "Max LR", align: "right", format: (v) => Number(v).toFixed(5)},
      {key: "final_eval_loss", label: "Final Eval Loss", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")},
      {key: "eval_best_loss", label: "Min Eval Loss", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")},
      {key: "grad_mean", label: "Grad Norm (Mean)", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "n/a")},
      {key: "grad_median", label: "Grad Norm (Median)", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "n/a")},
      {key: "grad_p99", label: "Grad Norm (p99)", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "n/a")},
      {key: "grad_max", label: "Grad Norm (Max)", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "n/a")}
    ])
  );
  root.appendChild(host);

  const evalHistoryRows = historyRows
    .filter((row) => Number.isFinite(row.step) && Number.isFinite(row.eval_loss) && row.eval_loss > 0 && Number.isFinite(row.run_number))
    .sort((a, b) => d3.ascending(a.run_number, b.run_number) || d3.ascending(a.step, b.step));
  const lossHistoryRows = historyRows
    .filter((row) => Number.isFinite(row.step) && Number.isFinite(row.loss) && row.loss > 0 && Number.isFinite(row.run_number))
    .sort((a, b) => d3.ascending(a.run_number, b.run_number) || d3.ascending(a.step, b.step));

  const chartHost = card();
  if (evalHistoryRows.length === 0) {
    chartHost.appendChild(emptyState("No evaluation-loss history rows available."));
  } else {
    const minIteration = Math.floor(d3.min(evalHistoryRows, (d) => d.step) ?? 0);
    const maxIteration = Math.ceil(d3.max(evalHistoryRows, (d) => d.step) ?? 1);
    const windowControl = rangeWindowControl("Iteration window", minIteration, maxIteration, 1, minIteration, maxIteration);
    chartHost.appendChild(windowControl.node);
    const evalPlotHost = el("div");
    const lossPlotHost = el("div");
    chartHost.append(evalPlotHost, lossPlotHost);

    function refreshChart() {
      const window = windowControl.getWindow();
      const filteredEvalRows = evalHistoryRows.filter((row) => row.step >= window.start && row.step <= window.end);
      const filteredLossRows = lossHistoryRows.filter((row) => row.step >= window.start && row.step <= window.end);
      const smoothedLossRows = smoothByRun(filteredLossRows, "loss", 25);

      clearNode(evalPlotHost);
      clearNode(lossPlotHost);

      if (filteredEvalRows.length === 0) {
        evalPlotHost.appendChild(emptyState("No evaluation-loss rows in selected iteration window."));
        return;
      }

      evalPlotHost.appendChild(
        Plot.plot({
          title: "Evaluation Loss by Iteration (All Runs)",
          width: 920,
          height: 360,
          x: {label: "Iteration", grid: true},
          y: {type: "log", label: "Eval Loss", grid: true},
          color: {type: "linear", interpolate: d3.interpolateWarm, legend: true, label: "Run #"},
          marks: [
            Plot.lineY(filteredEvalRows, {x: "step", y: "eval_loss", stroke: "run_number"}),
            Plot.dot(filteredEvalRows, {
              x: "step",
              y: "eval_loss",
              fill: "run_number",
              r: 2,
              opacity: 0.45,
              title: (d) => `Run ${d.run_number}\nStep ${Math.round(d.step)}\nEval Loss ${Number(d.eval_loss).toFixed(6)}`,
              tip: true
            }),
            Plot.tip(
              filteredEvalRows,
              Plot.pointer({
                x: "step",
                y: "eval_loss",
                title: (d) => `Run ${d.run_number}\nStep ${Math.round(d.step)}\nEval Loss ${Number(d.eval_loss).toFixed(6)}`
              })
            )
          ]
        })
      );

      if (smoothedLossRows.length === 0) {
        lossPlotHost.appendChild(emptyState("No training-loss rows in selected iteration window."));
        return;
      }

      lossPlotHost.appendChild(
        Plot.plot({
          title: "Smoothed Training Loss by Iteration (All Runs)",
          width: 920,
          height: 320,
          x: {label: "Iteration", grid: true},
          y: {type: "log", label: "Loss (25-step trailing mean)", grid: true},
          color: {type: "linear", interpolate: d3.interpolateWarm, legend: false},
          marks: [
            Plot.lineY(smoothedLossRows, {x: "step", y: "loss_smoothed", stroke: "run_number"}),
            Plot.tip(
              smoothedLossRows,
              Plot.pointer({
                x: "step",
                y: "loss_smoothed",
                title: (d) => `Run ${d.run_number}\nStep ${Math.round(d.step)}\nSmoothed Loss ${Number(d.loss_smoothed).toFixed(6)}`
              })
            )
          ]
        })
      );
    }

    windowControl.onChange(refreshChart);
    refreshChart();
  }
  root.appendChild(chartHost);

  return root;
}

export async function renderLrSweep(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-lr-sweep";
  root.style.display = "grid";
  root.style.gap = "1rem";

  try {
    root.append(
      el("h2", "Sweep Summary and Frontier"),
      await renderLrSweepSummaryTable(options),
      await renderLrSweepFrontier(options),
      await renderLrSweepThreshold(options),
      await renderLrSweepHistory(options),
      await renderLrSweepGradient(options),
      await renderLrSweepPivot(options)
    );
  } catch (error) {
    root.appendChild(emptyState(`Failed to render LR sweep sections: ${error.message}`));
  }

  return root;
}
