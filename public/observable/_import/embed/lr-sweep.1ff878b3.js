import {FileAttachment} from "../../_observablehq/stdlib.43270668.js";
import * as Plot from "../../_npm/@observablehq/plot@0.6.17/7c43807f.js";
import * as d3 from "../../_npm/d3@7.9.0/e324157d.js";
import {clearNode, emptyState, renderSimpleTable, collapsible} from "../components/dom-utils.d6dae979.js";

const ATTACHMENTS = {
  main: FileAttachment({"name":"../../data/raw/benchmarks/lr_sweeps_main.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/lr_sweeps_main.98e6db0c.parquet","lastModified":1771874136930,"size":15015}, import.meta.url),
  history: FileAttachment({"name":"../../data/raw/benchmarks/lr_sweeps_history.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/lr_sweeps_history.4f809053.parquet","lastModified":1771874136930,"size":3312658}, import.meta.url)
};

let sweepDataPromise;

const OPTIMIZER_SWEEP_ATTACHMENTS = {
  main: FileAttachment({"name":"../../data/raw/benchmarks/optimizer_sweep_l28yv8f7_20260222_151711_main.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/optimizer_sweep_l28yv8f7_20260222_151711_main.5801ffde.parquet","lastModified":1771874136940,"size":61729}, import.meta.url),
  history: FileAttachment({"name":"../../data/raw/benchmarks/optimizer_sweep_history.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/optimizer_sweep_history.94921937.parquet","lastModified":1771882112224,"size":8766116}, import.meta.url)
};

let optimizerSweepDataPromise;

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

function multiSelectControl(labelText, options, initialValues = [], size = 10) {
  const wrapper = el("div");
  wrapper.style.display = "grid";
  wrapper.style.gap = "0.45rem";

  const header = el("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.gap = "0.75rem";

  const title = el("span", labelText);
  title.style.fontWeight = "600";
  header.appendChild(title);

  const count = el("output", "");
  count.style.fontVariantNumeric = "tabular-nums";
  header.appendChild(count);

  const search = el("input");
  search.type = "search";
  search.placeholder = "Filter runs...";
  search.style.maxWidth = "24rem";

  const buttonRow = el("div");
  buttonRow.style.display = "flex";
  buttonRow.style.gap = "0.5rem";

  const selectAll = el("button", "Select all");
  selectAll.type = "button";
  const clearAll = el("button", "Clear");
  clearAll.type = "button";
  buttonRow.append(selectAll, clearAll);

  const select = el("select");
  select.multiple = true;
  select.size = Math.max(4, Math.min(size, Math.max(4, options.length)));
  select.style.minWidth = "20rem";

  const selected = new Set(initialValues.map((v) => String(v)));
  const listeners = new Set();

  function notify() {
    for (const listener of listeners) listener();
  }

  function visibleOptionValues() {
    return new Set(Array.from(select.options, (opt) => opt.value));
  }

  function syncCount() {
    count.textContent = `${selected.size} selected`;
  }

  function rebuildOptions() {
    const query = search.value.trim().toLowerCase();
    clearNode(select);
    for (const optionSpec of options) {
      const value = String(optionSpec.value);
      const label = String(optionSpec.label);
      if (query && !label.toLowerCase().includes(query)) continue;
      const option = el("option", label);
      option.value = value;
      option.selected = selected.has(value);
      select.appendChild(option);
    }
    syncCount();
  }

  select.addEventListener("change", () => {
    const visible = visibleOptionValues();
    for (const value of visible) selected.delete(value);
    for (const option of Array.from(select.selectedOptions)) selected.add(option.value);
    syncCount();
    notify();
  });

  search.addEventListener("input", rebuildOptions);
  selectAll.addEventListener("click", () => {
    for (const optionSpec of options) selected.add(String(optionSpec.value));
    rebuildOptions();
    notify();
  });
  clearAll.addEventListener("click", () => {
    selected.clear();
    rebuildOptions();
    notify();
  });

  wrapper.append(header, search, buttonRow, select);
  rebuildOptions();

  return {
    node: wrapper,
    getSelected() {
      return options.map((opt) => String(opt.value)).filter((value) => selected.has(value));
    },
    onChange(handler) {
      listeners.add(handler);
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

async function loadOptimizerSweepData() {
  if (!optimizerSweepDataPromise) {
    optimizerSweepDataPromise = (async () => {
      const [mainTable, historyTable] = await Promise.all([
        OPTIMIZER_SWEEP_ATTACHMENTS.main.parquet(),
        OPTIMIZER_SWEEP_ATTACHMENTS.history.parquet()
      ]);

      const mainRows = Array.from(mainTable, (row) => {
        const run_name = pickString(row, ["run_name", "config.run_name", "name", "run_id"], "unknown-run");
        return {
          run_name,
          run_number: runNumber(run_name),
          state: pickString(row, ["state"], "unknown"),
          optimizer_beta2: pickNumber(row, ["config.optimizer_beta2", "optimizer_beta2"]),
          optimizer_weight_decay: pickNumber(row, ["config.optimizer_weight_decay", "optimizer_weight_decay"]),
          lr_max: pickNumber(row, ["config.scheduler_lr_max", "config.lr_max", "lr_max", "LR"]),
          sweep_metric_m: pickNumber(row, ["Sweep Metric M"]),
          eval_best_loss: pickNumber(row, ["Eval Best loss", "Eval/Best loss"]),
          eval_loss: normalizeEvalLoss(pickNumber(row, ["Eval Loss", "Eval/Loss"]))
        };
      }).sort((a, b) => d3.ascending(a.run_number, b.run_number) || d3.ascending(a.run_name, b.run_name));

      const runNumberByName = new Map(
        mainRows
          .filter((row) => row.run_name && Number.isFinite(row.run_number))
          .map((row) => [row.run_name, row.run_number])
      );

      const historyRows = Array.from(historyTable, (row) => {
        const run_name = pickString(row, ["run_name", "config.run_name", "name", "run_id"], "unknown-run");
        const parsedRunNumber = runNumber(run_name);
        return {
          run_name,
          run_number: Number.isFinite(parsedRunNumber) ? parsedRunNumber : runNumberByName.get(run_name),
          step: pickNumber(row, ["_step", "step"]),
          lr: pickNumber(row, ["LR", "config.scheduler_lr_max", "lr_max"]),
          loss: pickNumber(row, ["Loss"]),
          eval_loss: normalizeEvalLoss(pickNumber(row, ["Eval Loss", "Eval/Loss"])),
          eval_best_loss: pickNumber(row, ["Eval Best loss", "Eval/Best loss"]),
          sweep_metric_m: pickNumber(row, ["Sweep Metric M"]),
          grad_clipped: pickNumber(row, ["Grad/Norm (clipped)"]),
          grad_unclipped: pickNumber(row, ["Grad/Norm (unclipped)"]),
          tokens_per_sec: pickNumber(row, ["Throughput/Tokens per sec"]),
          step_s: pickNumber(row, ["Time/Total step"])
        };
      })
        .filter((row) => Number.isFinite(row.step))
        .sort(
          (a, b) =>
            d3.ascending(a.run_number, b.run_number) ||
            d3.ascending(a.run_name, b.run_name) ||
            d3.ascending(a.step, b.step)
        );

      return {mainRows, historyRows};
    })();
  }

  return optimizerSweepDataPromise;
}

export async function renderOptimizerSweepTriangle(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-optimizer-sweep-triangle";
  root.style.display = "grid";
  root.style.gap = "1rem";

  let data;
  try {
    data = await loadOptimizerSweepData();
  } catch (error) {
    root.appendChild(emptyState(`Failed to load optimizer sweep parquet snapshots: ${error.message}`));
    return root;
  }

  const {mainRows} = data;
  const rows = mainRows
    .filter(
      (row) =>
        Number.isFinite(row.optimizer_beta2) &&
        Number.isFinite(row.optimizer_weight_decay) &&
        row.optimizer_weight_decay > 0 &&
        Number.isFinite(row.lr_max) &&
        row.lr_max > 0
    )
    .sort((a, b) => d3.ascending(a.run_number, b.run_number) || d3.ascending(a.run_name, b.run_name));
  if (rows.length === 0) {
    root.appendChild(emptyState("No optimizer-sweep rows with β2, weight decay, and max LR values."));
    return root;
  }

  const beta2Min = d3.min(rows, (row) => row.optimizer_beta2) ?? 0;
  const beta2Max = d3.max(rows, (row) => row.optimizer_beta2) ?? 1;
  const wdLogMin = d3.min(rows, (row) => Math.log10(row.optimizer_weight_decay)) ?? -6;
  const wdLogMax = d3.max(rows, (row) => Math.log10(row.optimizer_weight_decay)) ?? 0;
  const lrLogMin = d3.min(rows, (row) => Math.log10(row.lr_max)) ?? -6;
  const lrLogMax = d3.max(rows, (row) => Math.log10(row.lr_max)) ?? 0;
  const h = Math.sqrt(3) / 2;
  const TRIANGLE_WIDTH = 860;
  const TRIANGLE_MARGIN_LEFT = 44;
  const TRIANGLE_MARGIN_RIGHT = 44;
  const TRIANGLE_MARGIN_TOP = 46;
  const TRIANGLE_MARGIN_BOTTOM = 40;
  const TRIANGLE_INNER_WIDTH = TRIANGLE_WIDTH - TRIANGLE_MARGIN_LEFT - TRIANGLE_MARGIN_RIGHT;
  const TRIANGLE_INNER_HEIGHT = Math.round(TRIANGLE_INNER_WIDTH * h);
  const TRIANGLE_HEIGHT = TRIANGLE_MARGIN_TOP + TRIANGLE_MARGIN_BOTTOM + TRIANGLE_INNER_HEIGHT;

  function normalize(value, min, max) {
    if (!Number.isFinite(value)) return NaN;
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0.5;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

  const points = rows.map((row, idx) => {
    const beta2Norm = normalize(row.optimizer_beta2, beta2Min, beta2Max);
    const wdNorm = normalize(Math.log10(row.optimizer_weight_decay), wdLogMin, wdLogMax);
    const lrNorm = normalize(Math.log10(row.lr_max), lrLogMin, lrLogMax);
    const rawSum = beta2Norm + wdNorm + lrNorm;
    const wBeta2 = rawSum > 0 ? beta2Norm / rawSum : 1 / 3;
    const wWd = rawSum > 0 ? wdNorm / rawSum : 1 / 3;
    const wLr = rawSum > 0 ? lrNorm / rawSum : 1 / 3;
    return {
      ...row,
      run_order: idx + 1,
      run_color: Number.isFinite(row.run_number) ? row.run_number : idx + 1,
      beta2_norm: beta2Norm,
      wd_norm: wdNorm,
      lr_norm: lrNorm,
      w_beta2: wBeta2,
      w_wd: wWd,
      w_lr: wLr,
      x: wWd + 0.5 * wLr,
      y: h * wLr
    };
  });

  const sortedForPath = [...points].sort(
    (a, b) => d3.ascending(a.run_number, b.run_number) || d3.ascending(a.run_order, b.run_order)
  );
  const segmentsAll = [];
  for (let idx = 0; idx + 1 < sortedForPath.length; idx += 1) {
    const source = sortedForPath[idx];
    const target = sortedForPath[idx + 1];
    if (!source || !target) continue;
    segmentsAll.push({
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
      source_run_number: source.run_color,
      source_order: source.run_order,
      target_order: target.run_order
    });
  }

  const controls = card();

  const animateToggleLabel = el("label");
  animateToggleLabel.style.display = "flex";
  animateToggleLabel.style.alignItems = "center";
  animateToggleLabel.style.gap = "0.5rem";
  const animateToggle = el("input");
  animateToggle.type = "checkbox";
  animateToggle.checked = options.animateTriangle ?? true;
  animateToggleLabel.append(animateToggle, document.createTextNode("Animate window"));

  const lineToggleLabel = el("label");
  lineToggleLabel.style.display = "flex";
  lineToggleLabel.style.alignItems = "center";
  lineToggleLabel.style.gap = "0.5rem";
  const lineToggle = el("input");
  lineToggle.type = "checkbox";
  lineToggle.checked = options.showTrajectoryLines ?? true;
  lineToggleLabel.append(lineToggle, document.createTextNode("Show trajectory lines"));

  const speedControl = rangeControl(
    "Frame delay (ms)",
    120,
    2000,
    20,
    Number.isFinite(Number(options.triangleFrameMs)) ? Number(options.triangleFrameMs) : 450
  );
  const runControl = rangeControl(
    "Current run index",
    0,
    points.length,
    1,
    Number.isFinite(Number(options.currentRunIndex))
      ? Math.max(0, Math.min(points.length, Number(options.currentRunIndex)))
      : points.length
  );
  const windowSizeControl = rangeControl(
    "Visible runs (window)",
    1,
    points.length,
    1,
    Number.isFinite(Number(options.triangleWindowSize))
      ? Math.max(1, Math.min(points.length, Number(options.triangleWindowSize)))
      : Math.min(4, points.length)
  );
  controls.append(animateToggleLabel, lineToggleLabel, speedControl.node, runControl.node, windowSizeControl.node);

  const chartHost = el("div");
  const windowTableHost = el("div");
  const summaryHost = el("p");
  summaryHost.style.margin = "0";
  root.append(controls, chartHost, windowTableHost, summaryHost);

  const runColorExtent = d3.extent(points, (point) => point.run_color);
  const runColorMin = Number.isFinite(runColorExtent[0]) ? runColorExtent[0] : 1;
  const runColorMax = Number.isFinite(runColorExtent[1]) ? runColorExtent[1] : points.length;
  const runColorScale = d3
    .scaleSequential([runColorMin, runColorMax > runColorMin ? runColorMax : runColorMin + 1], d3.interpolateWarm)
    .clamp(true);

  function clampCurrent(value) {
    return Math.max(0, Math.min(points.length, Math.round(Number(value) || 0)));
  }

  function toPixelX(value) {
    return TRIANGLE_MARGIN_LEFT + value * TRIANGLE_INNER_WIDTH;
  }

  function toPixelY(value) {
    return TRIANGLE_MARGIN_TOP + ((h - value) / h) * TRIANGLE_INNER_HEIGHT;
  }

  function barycentricPoint(wBeta2, wWd, wLr) {
    return {
      x: wWd + 0.5 * wLr,
      y: h * wLr
    };
  }

  function barycentricPixel(wBeta2, wWd, wLr) {
    const point = barycentricPoint(wBeta2, wWd, wLr);
    return {x: toPixelX(point.x), y: toPixelY(point.y)};
  }

  const plotCard = card();
  const plotTitle = el("strong", "Optimizer Hyperparameter Triangle (Bayesian Sweep)");
  plotCard.appendChild(plotTitle);

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", `0 0 ${TRIANGLE_WIDTH} ${TRIANGLE_HEIGHT}`);
  svg.setAttribute("width", String(TRIANGLE_WIDTH));
  svg.setAttribute("height", String(TRIANGLE_HEIGHT));
  svg.style.maxWidth = "100%";
  svg.style.height = "auto";
  svg.style.display = "block";

  const baseline = document.createElementNS(svgNs, "line");
  baseline.setAttribute("x1", String(toPixelX(0)));
  baseline.setAttribute("y1", String(toPixelY(0)));
  baseline.setAttribute("x2", String(toPixelX(1)));
  baseline.setAttribute("y2", String(toPixelY(0)));
  baseline.setAttribute("stroke", "currentColor");
  baseline.setAttribute("stroke-opacity", "0.08");
  baseline.setAttribute("stroke-width", "1");
  baseline.setAttribute("vector-effect", "non-scaling-stroke");
  svg.appendChild(baseline);

  const triangle = document.createElementNS(svgNs, "polyline");
  triangle.setAttribute(
    "points",
    `${toPixelX(0)},${toPixelY(0)} ${toPixelX(1)},${toPixelY(0)} ${toPixelX(0.5)},${toPixelY(h)} ${toPixelX(0)},${toPixelY(0)}`
  );
  triangle.setAttribute("fill", "none");
  triangle.setAttribute("stroke", "currentColor");
  triangle.setAttribute("stroke-opacity", "0.6");
  triangle.setAttribute("stroke-width", "1.5");
  triangle.setAttribute("vector-effect", "non-scaling-stroke");
  svg.appendChild(triangle);

  const gridLayer = document.createElementNS(svgNs, "g");
  svg.appendChild(gridLayer);
  const gridTicks = [0.2, 0.4, 0.6, 0.8];
  for (const tick of gridTicks) {
    const betaA = barycentricPixel(tick, 1 - tick, 0);
    const betaB = barycentricPixel(tick, 0, 1 - tick);
    const wdA = barycentricPixel(1 - tick, tick, 0);
    const wdB = barycentricPixel(0, tick, 1 - tick);
    const lrA = barycentricPixel(1 - tick, 0, tick);
    const lrB = barycentricPixel(0, 1 - tick, tick);

    for (const [start, end] of [
      [betaA, betaB],
      [wdA, wdB],
      [lrA, lrB]
    ]) {
      const line = document.createElementNS(svgNs, "line");
      line.setAttribute("x1", String(start.x));
      line.setAttribute("y1", String(start.y));
      line.setAttribute("x2", String(end.x));
      line.setAttribute("y2", String(end.y));
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("stroke-opacity", "0.12");
      line.setAttribute("stroke-width", "1");
      line.setAttribute("stroke-dasharray", "3 4");
      line.setAttribute("vector-effect", "non-scaling-stroke");
      gridLayer.appendChild(line);
    }
  }

  const segmentLayer = document.createElementNS(svgNs, "g");
  svg.appendChild(segmentLayer);
  const pointLayer = document.createElementNS(svgNs, "g");
  svg.appendChild(pointLayer);
  const labelLayer = document.createElementNS(svgNs, "g");
  svg.appendChild(labelLayer);

  const segmentNodes = segmentsAll.map((segment) => {
    const node = document.createElementNS(svgNs, "line");
    node.setAttribute("x1", String(toPixelX(segment.x1)));
    node.setAttribute("y1", String(toPixelY(segment.y1)));
    node.setAttribute("x2", String(toPixelX(segment.x2)));
    node.setAttribute("y2", String(toPixelY(segment.y2)));
    node.setAttribute("stroke", runColorScale(segment.source_run_number));
    node.setAttribute("stroke-opacity", "0.6");
    node.setAttribute("stroke-width", "1.2");
    node.setAttribute("vector-effect", "non-scaling-stroke");
    segmentLayer.appendChild(node);
    return {segment, node};
  });

  const pointNodes = sortedForPath.map((point) => {
    const node = document.createElementNS(svgNs, "circle");
    node.setAttribute("cx", String(toPixelX(point.x)));
    node.setAttribute("cy", String(toPixelY(point.y)));
    node.setAttribute("r", "0");
    node.setAttribute("fill", runColorScale(point.run_color));
    node.setAttribute("stroke", "white");
    node.setAttribute("stroke-width", "0.45");
    node.setAttribute("vector-effect", "non-scaling-stroke");
    const title = document.createElementNS(svgNs, "title");
    title.textContent = `${point.run_name}\nRun # ${Number.isFinite(point.run_number) ? point.run_number : "n/a"}\nβ2 ${Number(
      point.optimizer_beta2
    ).toFixed(6)}\nWeight decay ${Number(point.optimizer_weight_decay).toExponential(3)}\nMax LR ${Number(point.lr_max).toExponential(3)}`;
    node.appendChild(title);
    pointLayer.appendChild(node);
    return {point, node};
  });

  function lerp(min, max, t) {
    return min + (max - min) * t;
  }

  function denormalizeLinear(t, min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return NaN;
    return lerp(min, max, t);
  }

  function denormalizeLog(t, logMin, logMax) {
    if (!Number.isFinite(logMin) || !Number.isFinite(logMax) || logMax <= logMin) return NaN;
    return 10 ** lerp(logMin, logMax, t);
  }

  function formatBeta2(value) {
    return Number.isFinite(value) ? value.toFixed(4) : "n/a";
  }

  function formatSci(value) {
    return Number.isFinite(value) ? value.toExponential(1) : "n/a";
  }

  function sideLabel(text, position, angleDeg = 0) {
    const node = document.createElementNS(svgNs, "text");
    node.setAttribute("x", String(position.x));
    node.setAttribute("y", String(position.y));
    node.setAttribute("text-anchor", "middle");
    node.setAttribute("font-size", "12");
    node.setAttribute("font-weight", "600");
    node.setAttribute("fill", "currentColor");
    if (angleDeg !== 0) {
      node.setAttribute("transform", `rotate(${angleDeg} ${position.x} ${position.y})`);
    }
    node.textContent = text;
    labelLayer.appendChild(node);
  }

  const betaSideMid = barycentricPixel(0.5, 0.5, 0);
  const wdSideMid = barycentricPixel(0, 0.5, 0.5);
  const lrSideMid = barycentricPixel(0.5, 0, 0.5);
  sideLabel("β2", {x: betaSideMid.x, y: betaSideMid.y + 30}, 0);
  sideLabel("weight decay", {x: wdSideMid.x + 56, y: wdSideMid.y + 16}, 60);
  sideLabel("max LR", {x: lrSideMid.x - 56, y: lrSideMid.y + 16}, -60);

  const scaleLabelLayer = document.createElementNS(svgNs, "g");
  svg.appendChild(scaleLabelLayer);
  const scaleTicks = [0, 0.25, 0.5, 0.75, 1];
  for (const tick of scaleTicks) {
    const betaTick = barycentricPixel(tick, 1 - tick, 0);
    const betaText = document.createElementNS(svgNs, "text");
    betaText.setAttribute("x", String(betaTick.x));
    betaText.setAttribute("y", String(betaTick.y + 14));
    betaText.setAttribute("text-anchor", "middle");
    betaText.setAttribute("font-size", "10");
    betaText.setAttribute("fill", "currentColor");
    betaText.setAttribute("opacity", "0.82");
    betaText.textContent = formatBeta2(denormalizeLinear(tick, beta2Min, beta2Max));
    scaleLabelLayer.appendChild(betaText);

    const wdTick = barycentricPixel(0, tick, 1 - tick);
    const wdText = document.createElementNS(svgNs, "text");
    wdText.setAttribute("x", String(wdTick.x + 7));
    wdText.setAttribute("y", String(wdTick.y + 3));
    wdText.setAttribute("text-anchor", "start");
    wdText.setAttribute("font-size", "10");
    wdText.setAttribute("fill", "currentColor");
    wdText.setAttribute("opacity", "0.82");
    wdText.textContent = formatSci(denormalizeLog(tick, wdLogMin, wdLogMax));
    scaleLabelLayer.appendChild(wdText);

    const lrTick = barycentricPixel(1 - tick, 0, tick);
    const lrText = document.createElementNS(svgNs, "text");
    lrText.setAttribute("x", String(lrTick.x - 7));
    lrText.setAttribute("y", String(lrTick.y + 3));
    lrText.setAttribute("text-anchor", "end");
    lrText.setAttribute("font-size", "10");
    lrText.setAttribute("fill", "currentColor");
    lrText.setAttribute("opacity", "0.82");
    lrText.textContent = formatSci(denormalizeLog(tick, lrLogMin, lrLogMax));
    scaleLabelLayer.appendChild(lrText);
  }

  plotCard.appendChild(svg);

  const legend = el("div");
  legend.style.display = "flex";
  legend.style.alignItems = "center";
  legend.style.gap = "0.5rem";
  legend.style.flexWrap = "wrap";
  const legendLabel = el("span", "Run #");
  legendLabel.style.fontSize = "0.85rem";
  const legendMin = el("span", String(Math.round(runColorMin)));
  legendMin.style.fontVariantNumeric = "tabular-nums";
  legendMin.style.fontSize = "0.8rem";
  const legendSwatch = el("div");
  legendSwatch.style.width = "160px";
  legendSwatch.style.height = "10px";
  legendSwatch.style.borderRadius = "999px";
  legendSwatch.style.border = "1px solid rgba(127, 127, 127, 0.35)";
  legendSwatch.style.background = `linear-gradient(to right, ${runColorScale(runColorMin)}, ${runColorScale(runColorMax)})`;
  const legendMax = el("span", String(Math.round(runColorMax)));
  legendMax.style.fontVariantNumeric = "tabular-nums";
  legendMax.style.fontSize = "0.8rem";
  legend.append(legendLabel, legendMin, legendSwatch, legendMax);
  plotCard.appendChild(legend);
  const scaleHelp = el(
    "div",
    "Side ticks are shown in original parameter units. Point geometry still represents the normalized ternary mix used to place each run."
  );
  scaleHelp.style.fontSize = "0.8rem";
  scaleHelp.style.opacity = "0.8";
  plotCard.appendChild(scaleHelp);
  chartHost.appendChild(plotCard);

  const tableCard = card();
  const tableTitle = el("strong", "Current run window");
  tableCard.appendChild(tableTitle);
  const table = el("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "0.9rem";
  const tableHead = el("thead");
  const headRow = el("tr");
  for (const column of ["Run #", "Run", "β2", "Weight Decay", "Max LR"]) {
    const th = el("th", column);
    th.style.padding = "0.2rem 0.45rem";
    th.style.textAlign = column === "Run" ? "left" : "right";
    th.style.borderBottom = "1px solid rgba(127, 127, 127, 0.22)";
    headRow.appendChild(th);
  }
  tableHead.appendChild(headRow);
  const tableBody = el("tbody");
  table.append(tableHead, tableBody);
  const tableEmpty = el("p", "Run window is empty at index 0.");
  tableEmpty.style.margin = "0";
  tableCard.append(table, tableEmpty);
  windowTableHost.appendChild(tableCard);

  let timerId = null;
  function stopAnimation() {
    if (timerId != null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }
  function startAnimation() {
    stopAnimation();
    const frameMs = Math.max(120, Number(speedControl.input.value) || 450);
    timerId = window.setInterval(() => {
      if (!root.isConnected) {
        stopAnimation();
        return;
      }
      let current = Number(runControl.input.value);
      if (!Number.isFinite(current)) current = 0;
      current = (Math.round(current) + 1) % (points.length + 1);
      runControl.input.value = String(current);
      refresh();
    }, frameMs);
  }

  function refresh() {
    speedControl.output.textContent = String(Math.round(Number(speedControl.input.value)));
    runControl.output.textContent = String(Math.round(Number(runControl.input.value)));
    windowSizeControl.output.textContent = String(Math.round(Number(windowSizeControl.input.value)));

    speedControl.input.disabled = !animateToggle.checked;
    runControl.input.disabled = !animateToggle.checked;

    const animateEnabled = animateToggle.checked;
    const current = animateEnabled ? clampCurrent(runControl.input.value) : points.length;
    runControl.input.value = String(current);
    const windowSize = Math.max(1, Math.min(points.length, Math.round(Number(windowSizeControl.input.value) || 1)));
    windowSizeControl.input.value = String(windowSize);
    const start = animateEnabled ? Math.max(1, current - windowSize + 1) : 1;
    const end = animateEnabled ? current : points.length;

    const visiblePoints = [];
    for (const {point, node} of pointNodes) {
      const isVisible = point.run_order >= start && point.run_order <= end;
      node.style.display = isVisible ? "" : "none";
      if (!isVisible) continue;
      const pointSize = animateEnabled
        ? current <= 0
          ? 0
          : Math.max(2.5, 5 - (current - point.run_order))
        : 3.2;
      node.setAttribute("r", String(pointSize));
      visiblePoints.push(point);
    }

    let visibleSegmentsCount = 0;
    if (lineToggle.checked) {
      for (const {segment, node} of segmentNodes) {
        const isVisible = segment.source_order >= start && segment.target_order <= end;
        node.style.display = isVisible ? "" : "none";
        if (isVisible) visibleSegmentsCount += 1;
      }
    } else {
      for (const {node} of segmentNodes) node.style.display = "none";
    }

    const tableRows = visiblePoints.map((point) => ({
      run_number: point.run_number,
      run_name: point.run_name,
      optimizer_beta2: point.optimizer_beta2,
      optimizer_weight_decay: point.optimizer_weight_decay,
      lr_max: point.lr_max
    }));

    const showingAllRuns = tableRows.length === points.length;
    if (showingAllRuns) {
      tableCard.style.display = "none";
    } else {
      tableCard.style.display = "";
      clearNode(tableBody);
      if (tableRows.length > 0) {
        const fragment = document.createDocumentFragment();
        for (const row of tableRows) {
          const tr = el("tr");

          const runNumberCell = el("td", Number.isFinite(row.run_number) ? String(Math.round(row.run_number)) : "n/a");
          runNumberCell.style.padding = "0.2rem 0.45rem";
          runNumberCell.style.textAlign = "right";
          tr.appendChild(runNumberCell);

          const runNameCell = el("td", row.run_name || "");
          runNameCell.style.padding = "0.2rem 0.45rem";
          runNameCell.style.textAlign = "left";
          tr.appendChild(runNameCell);

          const betaCell = el("td", Number.isFinite(Number(row.optimizer_beta2)) ? Number(row.optimizer_beta2).toFixed(6) : "n/a");
          betaCell.style.padding = "0.2rem 0.45rem";
          betaCell.style.textAlign = "right";
          tr.appendChild(betaCell);

          const wdCell = el(
            "td",
            Number.isFinite(Number(row.optimizer_weight_decay)) ? Number(row.optimizer_weight_decay).toExponential(3) : "n/a"
          );
          wdCell.style.padding = "0.2rem 0.45rem";
          wdCell.style.textAlign = "right";
          tr.appendChild(wdCell);

          const lrCell = el("td", Number.isFinite(Number(row.lr_max)) ? Number(row.lr_max).toExponential(3) : "n/a");
          lrCell.style.padding = "0.2rem 0.45rem";
          lrCell.style.textAlign = "right";
          tr.appendChild(lrCell);

          fragment.appendChild(tr);
        }
        tableBody.appendChild(fragment);
        table.style.display = "";
        tableEmpty.style.display = "none";
      } else {
        table.style.display = "none";
        tableEmpty.style.display = "";
      }
    }

    if (animateEnabled) {
      summaryHost.textContent = `Run index ${current.toLocaleString("en-US")} / ${points.length.toLocaleString(
        "en-US"
      )}, showing up to ${windowSize.toLocaleString("en-US")} run(s) in the window${
        lineToggle.checked ? `, ${visibleSegmentsCount.toLocaleString("en-US")} line segment(s)` : ""
      }.`;
    } else {
      summaryHost.textContent = `Animation off: showing all ${tableRows.length.toLocaleString("en-US")} run(s)${
        lineToggle.checked ? `, ${visibleSegmentsCount.toLocaleString("en-US")} line segment(s)` : ""
      }.`;
    }
  }

  animateToggle.addEventListener("change", () => {
    if (animateToggle.checked) {
      if (Number(runControl.input.value) === points.length) {
        runControl.input.value = "0";
      }
      startAnimation();
    } else {
      stopAnimation();
    }
    refresh();
  });
  lineToggle.addEventListener("change", refresh);
  runControl.input.addEventListener("input", refresh);
  windowSizeControl.input.addEventListener("input", refresh);
  speedControl.input.addEventListener("input", () => {
    if (animateToggle.checked) startAnimation();
    refresh();
  });
  refresh();
  if (animateToggle.checked) startAnimation();
  return root;
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
      {key: "lr_max", label: "LR Max", align: "right", format: (v) => Number(v).toExponential(2)},
      {key: "eval_best_loss", label: "Eval Best Loss", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")}
    ])
  );
  host.appendChild(details);
  root.appendChild(host);

  return root;
}

export async function renderOptimizerSweepEvalLoss(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-optimizer-sweep-eval-loss";
  root.style.display = "grid";
  root.style.gap = "1rem";

  let data;
  try {
    data = await loadOptimizerSweepData();
  } catch (error) {
    root.appendChild(emptyState(`Failed to load optimizer sweep parquet snapshots: ${error.message}`));
    return root;
  }

  const {historyRows} = data;
  const rows = historyRows
    .filter((row) => Number.isFinite(row.step))
    .sort(
      (a, b) =>
        d3.ascending(a.run_number, b.run_number) ||
        d3.ascending(a.run_name, b.run_name) ||
        d3.ascending(a.step, b.step)
    );
  if (rows.length === 0) {
    root.appendChild(emptyState("No optimizer sweep history rows available."));
    return root;
  }

  const runNames = Array.from(new Set(rows.map((row) => row.run_name))).sort();
  const runIndexByName = new Map(runNames.map((runName, idx) => [runName, idx + 1]));
  const enrichedRows = rows.map((row) => ({
    ...row,
    run_color: Number.isFinite(row.run_number) ? row.run_number : runIndexByName.get(row.run_name)
  }));

  const stepMin = Math.floor(d3.min(enrichedRows, (row) => row.step) ?? 0);
  const stepMax = Math.ceil(d3.max(enrichedRows, (row) => row.step) ?? stepMin);
  const stepSpan = Math.max(0, stepMax - stepMin);
  const defaultExcludeFirst = Math.max(0, Math.min(stepSpan, Number(options.excludeFirstIterations ?? 0)));
  const defaultExcludeLast = Math.max(0, Math.min(stepSpan, Number(options.excludeLastIterations ?? 0)));

  const panel = card();
  const controlsRow = el("div");
  controlsRow.style.display = "grid";
  controlsRow.style.gap = "0.5rem";

  const excludeFirstControl = rangeControl(
    "Exclude first iterations",
    0,
    stepSpan,
    1,
    Math.round(defaultExcludeFirst)
  );
  const excludeLastControl = rangeControl(
    "Exclude last iterations",
    0,
    stepSpan,
    1,
    Math.round(defaultExcludeLast)
  );
  controlsRow.append(excludeFirstControl.node, excludeLastControl.node);

  const summaryHost = el("p");
  summaryHost.style.margin = "0";
  const evalHost = el("div");
  const gradHost = el("div");
  panel.append(controlsRow, summaryHost, evalHost, gradHost);
  root.appendChild(panel);

  const stepDiffs = [];
  for (const [, runRows] of d3.group(enrichedRows, (row) => row.run_name)) {
    const runEval = runRows.filter((row) => Number.isFinite(row.eval_loss) && row.eval_loss > 0);
    for (let idx = 1; idx < runEval.length; idx += 1) {
      const delta = runEval[idx].step - runEval[idx - 1].step;
      if (Number.isFinite(delta) && delta > 0) stepDiffs.push(delta);
    }
  }
  const medianEvalInterval = d3.median(stepDiffs);

  function syncExcludeValues(activeHandle = null) {
    let first = Number(excludeFirstControl.input.value);
    let last = Number(excludeLastControl.input.value);
    if (!Number.isFinite(first)) first = 0;
    if (!Number.isFinite(last)) last = 0;
    if (first + last > stepSpan) {
      if (activeHandle === "first") {
        last = Math.max(0, stepSpan - first);
      } else if (activeHandle === "last") {
        first = Math.max(0, stepSpan - last);
      } else {
        const scale = stepSpan / (first + last || 1);
        first = Math.floor(first * scale);
        last = Math.max(0, stepSpan - first);
      }
    }
    excludeFirstControl.input.value = String(Math.round(first));
    excludeLastControl.input.value = String(Math.round(last));
    excludeFirstControl.output.textContent = String(Math.round(first));
    excludeLastControl.output.textContent = String(Math.round(last));
    return {first: Math.round(first), last: Math.round(last)};
  }

  function refresh() {
    const {first, last} = syncExcludeValues();
    const minStep = stepMin + first;
    const maxStep = stepMax - last;

    const windowRows = enrichedRows.filter((row) => row.step >= minStep && row.step <= maxStep);
    const evalRows = windowRows.filter((row) => Number.isFinite(row.eval_loss) && row.eval_loss > 0);
    const gradRows = windowRows.filter((row) => Number.isFinite(row.grad_unclipped) && row.grad_unclipped > 0);

    clearNode(evalHost);
    clearNode(gradHost);

    summaryHost.textContent = `${runNames.length.toLocaleString("en-US")} runs, ${evalRows.length.toLocaleString(
      "en-US"
    )} eval points, ${gradRows.length.toLocaleString("en-US")} grad points${
      Number.isFinite(medianEvalInterval)
        ? `, median eval interval ${Number(medianEvalInterval).toFixed(0)} iterations`
        : ""
    }, window [${minStep.toLocaleString("en-US")}, ${maxStep.toLocaleString("en-US")}].`;

    if (evalRows.length === 0) {
      evalHost.appendChild(emptyState("No eval-loss points in the selected iteration window."));
    } else {
      const evalYMin = d3.min(evalRows, (row) => row.eval_loss) ?? 1e-8;
      const evalYMax = d3.max(evalRows, (row) => row.eval_loss) ?? 1;
      evalHost.appendChild(
        Plot.plot({
          title: "Optimizer Sweep Eval Loss vs Iteration (All Runs)",
          width: 920,
          height: 360,
          x: {label: "Iteration", grid: true, domain: [minStep, maxStep]},
          y: {type: "log", label: "Eval Loss", grid: true, domain: [evalYMin * 0.95, evalYMax * 1.05]},
          color: {type: "linear", interpolate: d3.interpolateWarm, legend: true, label: "Run #"},
          marks: [
            Plot.lineY(evalRows, {
              x: "step",
              y: "eval_loss",
              z: "run_name",
              stroke: "run_color"
            }),
            Plot.dot(evalRows, {
              x: "step",
              y: "eval_loss",
              z: "run_name",
              fill: "run_color",
              r: 1.8,
              opacity: 0.55,
              title: (d) =>
                `${d.run_name}\nStep ${Math.round(d.step)}\nEval Loss ${Number(d.eval_loss).toFixed(6)}`,
              tip: true
            })
          ]
        })
      );
    }

    if (gradRows.length === 0) {
      gradHost.appendChild(emptyState("No unclipped-grad-norm points in the selected iteration window."));
    } else {
      const gradYMin = d3.min(gradRows, (row) => row.grad_unclipped) ?? 1e-8;
      const gradYMax = d3.max(gradRows, (row) => row.grad_unclipped) ?? 1;
      gradHost.appendChild(
        Plot.plot({
          title: "Optimizer Sweep Unclipped Grad Norm vs Iteration (All Runs)",
          width: 920,
          height: 340,
          x: {label: "Iteration", grid: true, domain: [minStep, maxStep]},
          y: {type: "log", label: "Unclipped Grad Norm", grid: true, domain: [gradYMin * 0.95, gradYMax * 1.05]},
          color: {type: "linear", interpolate: d3.interpolateWarm, legend: false, label: "Run #"},
          marks: [
            Plot.lineY(gradRows, {
              x: "step",
              y: "grad_unclipped",
              z: "run_name",
              stroke: "run_color"
            }),
            Plot.dot(gradRows, {
              x: "step",
              y: "grad_unclipped",
              z: "run_name",
              fill: "run_color",
              r: 1.6,
              opacity: 0.45,
              title: (d) =>
                `${d.run_name}\nStep ${Math.round(d.step)}\nGrad Norm ${Number(d.grad_unclipped).toFixed(6)}`,
              tip: true
            })
          ]
        })
      );
    }
  }

  excludeFirstControl.input.addEventListener("input", () => {
    syncExcludeValues("first");
    refresh();
  });
  excludeLastControl.input.addEventListener("input", () => {
    syncExcludeValues("last");
    refresh();
  });
  refresh();
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

export async function renderLrSweepLrGradScatter(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-lr-sweep-lr-grad";
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
  const points = historyRows
    .filter((row) => Number.isFinite(row.step))
    .filter((row) => Number.isFinite(row.lr) && row.lr > 0)
    .filter((row) => Number.isFinite(row.grad_unclipped))
    .filter((row) => Number.isFinite(row.run_number))
    .sort((a, b) => d3.ascending(a.run_number, b.run_number) || d3.ascending(a.step, b.step));

  if (points.length === 0) {
    root.appendChild(emptyState("No rows available for LR vs unclipped gradient scatter."));
    return root;
  }

  const minLr = d3.min(points, (d) => d.lr) ?? 1e-6;
  const maxLr = d3.max(points, (d) => d.lr) ?? 1;
  const minLrLog10 = Math.log10(minLr);
  const maxLrLog10 = Math.log10(maxLr);
  const minGrad = Math.max(0, d3.min(points, (d) => d.grad_unclipped) ?? 0);
  const maxGrad = d3.max(points, (d) => d.grad_unclipped) ?? 1;

  const panelHost = card();
  const minLrDefault = Number.isFinite(Number(options.minLr)) && Number(options.minLr) > 0
    ? Math.log10(Number(options.minLr))
    : minLrLog10;
  const maxGradDefault = Number.isFinite(Number(options.maxGrad)) ? Number(options.maxGrad) : maxGrad;
  const minLrControl = rangeControl(
    "Min LR filter",
    Number(minLrLog10.toFixed(4)),
    Number(maxLrLog10.toFixed(4)),
    0.01,
    Number(Math.max(minLrLog10, Math.min(maxLrLog10, minLrDefault)).toFixed(4))
  );
  const gradStep = Math.max((maxGrad - minGrad) / 500, 0.001);
  const maxGradControl = rangeControl(
    "Max grad-norm filter",
    Number(minGrad.toFixed(4)),
    Number(maxGrad.toFixed(4)),
    Number(gradStep.toFixed(4)),
    Number(Math.max(minGrad, Math.min(maxGrad, maxGradDefault)).toFixed(4))
  );
  panelHost.append(minLrControl.node, maxGradControl.node);

  const chartHost = el("div");
  panelHost.appendChild(chartHost);
  root.appendChild(panelHost);

  function refresh() {
    const lrThreshold = 10 ** Number(minLrControl.input.value);
    const gradThreshold = Number(maxGradControl.input.value);
    minLrControl.output.textContent = Number.isFinite(lrThreshold) ? lrThreshold.toExponential(2) : "n/a";
    maxGradControl.output.textContent = Number.isFinite(gradThreshold) ? gradThreshold.toFixed(3) : "n/a";

    const filtered = points.filter((d) => d.lr >= lrThreshold && d.grad_unclipped <= gradThreshold);

    clearNode(chartHost);
    if (filtered.length === 0) {
      chartHost.appendChild(emptyState("No rows match the LR/grad filters."));
      return;
    }

    let xMin = d3.min(filtered, (d) => d.lr) ?? minLr;
    let xMax = d3.max(filtered, (d) => d.lr) ?? maxLr;
    if (!(xMin > 0)) xMin = minLr;
    if (!(xMax > 0)) xMax = maxLr;
    if (xMin === xMax) {
      const eps = xMin * 0.15 || 1e-8;
      xMin = Math.max(1e-12, xMin - eps);
      xMax = xMax + eps;
    }

    let yMin = d3.min(filtered, (d) => d.grad_unclipped) ?? minGrad;
    let yMax = d3.max(filtered, (d) => d.grad_unclipped) ?? maxGrad;
    if (yMin === yMax) {
      const eps = Math.max(Math.abs(yMin) * 0.1, 1e-3);
      yMin -= eps;
      yMax += eps;
    }

    chartHost.appendChild(
      Plot.plot({
        title: "Step-level LR vs Unclipped Gradient Norm",
        width: 920,
        height: 360,
        x: {type: "log", label: "Learning rate", grid: true, domain: [xMin, xMax]},
        y: {label: "Unclipped gradient norm", grid: true, domain: [yMin, yMax]},
        color: {type: "linear", interpolate: d3.interpolateWarm, label: "Run #", legend: true},
        marks: [
          Plot.dot(filtered, {
            x: "lr",
            y: "grad_unclipped",
            fill: "run_number",
            r: 2,
            opacity: 0.5,
            title: (d) =>
              `Run ${d.run_number}\nStep ${Math.round(d.step)}\nLR ${Number(d.lr).toExponential(3)}\nGrad ${Number(d.grad_unclipped).toFixed(4)}`,
            tip: true
          })
        ]
      })
    );

    chartHost.appendChild(el("p", `${filtered.length.toLocaleString("en-US")} points shown`));
  }

  minLrControl.input.addEventListener("input", refresh);
  maxGradControl.input.addEventListener("input", refresh);
  refresh();

  return root;
}

export async function renderLrSweepLrClipHistogram(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-lr-sweep-lr-clip-hist";
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
  const clipRows = historyRows
    .filter((row) => Number.isFinite(row.lr) && row.lr > 0)
    .filter((row) => Number.isFinite(row.grad_unclipped) && Number.isFinite(row.grad_clipped))
    .map((row) => ({
      ...row,
      lr_log10: Math.log10(row.lr),
      clipped: row.grad_clipped < row.grad_unclipped - 1e-9 ? 1 : 0
    }));

  if (clipRows.length === 0) {
    root.appendChild(emptyState("No rows available for LR-bin clipping histogram."));
    return root;
  }

  const panelHost = card();
  const minLog = d3.min(clipRows, (row) => row.lr_log10) ?? -6;
  const maxLog = d3.max(clipRows, (row) => row.lr_log10) ?? 0;
  const binsControl = rangeControl("LR bins", 8, 80, 1, Number(options.lrClipBins ?? 24));
  panelHost.appendChild(binsControl.node);
  const chartHost = el("div");
  panelHost.appendChild(chartHost);
  root.appendChild(panelHost);

  function refresh() {
    binsControl.output.textContent = binsControl.input.value;
    const binCount = Number(binsControl.input.value);
    const logSpan = maxLog - minLog;
    const logEdges =
      logSpan > 1e-12
        ? d3.range(0, binCount + 1).map((i) => minLog + (logSpan * i) / binCount)
        : [minLog, minLog + 1e-6];

    const bins = d3
      .bin()
      .value((row) => row.lr_log10)
      .domain([minLog, maxLog])
      .thresholds(logEdges)(clipRows);

    const binRows = bins
      .map((bin) => {
        const total = bin.length;
        const clippedCount = d3.sum(bin, (row) => row.clipped);
        const pctClipped = total > 0 ? (100 * clippedCount) / total : NaN;
        const x0 = Number.isFinite(bin.x0) ? bin.x0 : NaN;
        const x1 = Number.isFinite(bin.x1) ? bin.x1 : NaN;
        return {
          lr_lo: Number.isFinite(x0) ? 10 ** x0 : NaN,
          lr_hi: Number.isFinite(x1) ? 10 ** x1 : NaN,
          pct_clipped: pctClipped,
          total_steps: total,
          clipped_steps: clippedCount
        };
      })
      .filter((row) => Number.isFinite(row.lr_lo) && Number.isFinite(row.lr_hi) && row.total_steps > 0)
      .sort((a, b) => d3.ascending(a.lr_lo, b.lr_lo));

    clearNode(chartHost);
    if (binRows.length === 0) {
      chartHost.appendChild(emptyState("No histogram bins available for current settings."));
      return;
    }

    chartHost.appendChild(
      Plot.plot({
        title: "LR Histogram with Clip Rate per Bin",
        width: 920,
        height: 340,
        x: {type: "log", label: "Learning rate (bin edges)", grid: true},
        y: {label: "Clipped steps (%)", grid: true, domain: [0, 100]},
        color: {type: "linear", scheme: "warm", legend: false, domain: [0, 100]},
        marks: [
          Plot.rectY(binRows, {
            x1: "lr_lo",
            x2: "lr_hi",
            y: "pct_clipped",
            fill: "pct_clipped",
            tip: true,
            title: (d) =>
              `LR ${Number(d.lr_lo).toExponential(2)} to ${Number(d.lr_hi).toExponential(2)}\nClipped ${Number(d.pct_clipped).toFixed(
                1
              )}%\nClipped steps ${Math.round(d.clipped_steps)} / ${Math.round(d.total_steps)}`
          }),
          Plot.ruleY([0, 100])
        ]
      })
    );
  }

  binsControl.input.addEventListener("input", refresh);
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

  const historyByRun = d3.group(historyRows, (row) => row.run_name);
  const tableData = mainRows
    .map((mainRow) => {
      const runHistory = historyByRun.get(mainRow.run_name) || [];
      const gradNorms = runHistory.filter((row) => Number.isFinite(row.grad_unclipped)).map((row) => row.grad_unclipped).sort(d3.ascending);
      const evalRows = runHistory.filter((row) => Number.isFinite(row.eval_loss) && row.eval_loss > 0).sort((a, b) => d3.ascending(a.step, b.step));
      const final_eval_loss = evalRows.length > 0 ? evalRows[evalRows.length - 1].eval_loss : NaN;

      let grad_mean = NaN;
      let grad_median = NaN;
      let grad_max = NaN;
      let grad_p99 = NaN;
      if (gradNorms.length > 0) {
        grad_mean = d3.mean(gradNorms);
        grad_median = d3.median(gradNorms);
        grad_max = d3.max(gradNorms);
        grad_p99 = d3.quantile(gradNorms, 0.99);
      }

      return {
        run_name: mainRow.run_name,
        run_number: mainRow.run_number,
        lr_max: mainRow.lr_max,
        final_eval_loss,
        eval_best_loss: mainRow.eval_best_loss,
        grad_mean,
        grad_median,
        grad_max,
        grad_p99
      };
    })
    .sort((a, b) => d3.ascending(a.run_number, b.run_number));

  const runOptions = tableData.map((row) => ({
    value: row.run_name,
    label: Number.isFinite(row.run_number) ? `${row.run_number} - ${row.run_name}` : row.run_name
  }));
  const runNameSet = new Set(runOptions.map((option) => option.value));
  const runNameByNumber = new Map(
    tableData
      .filter((row) => Number.isFinite(row.run_number))
      .map((row) => [String(row.run_number), row.run_name])
  );
  const requestedRuns = Array.isArray(options.summaryRuns) ? options.summaryRuns : [];
  let initialSelectedRuns =
    requestedRuns.length > 0
      ? requestedRuns
          .map((value) => String(value))
          .map((value) => (runNameSet.has(value) ? value : runNameByNumber.get(value)))
          .filter(Boolean)
      : runOptions.map((option) => String(option.value));
  if (initialSelectedRuns.length === 0) initialSelectedRuns = runOptions.map((option) => String(option.value));

  const controlsHost = card();
  const runControl = multiSelectControl("Runs", runOptions, initialSelectedRuns, 12);
  controlsHost.appendChild(runControl.node);

  const tableHost = card();
  root.appendChild(tableHost);

  const evalHistoryRows = historyRows
    .filter((row) => Number.isFinite(row.step) && Number.isFinite(row.eval_loss) && row.eval_loss > 0 && Number.isFinite(row.run_number))
    .sort((a, b) => d3.ascending(a.run_number, b.run_number) || d3.ascending(a.step, b.step));
  const lossHistoryRows = historyRows
    .filter((row) => Number.isFinite(row.step) && Number.isFinite(row.loss) && row.loss > 0 && Number.isFinite(row.run_number))
    .sort((a, b) => d3.ascending(a.run_number, b.run_number) || d3.ascending(a.step, b.step));

  const chartHost = card();
  let windowControl = null;
  let evalPlotHost = null;
  let lossPlotHost = null;
  if (evalHistoryRows.length === 0) {
    chartHost.appendChild(emptyState("No evaluation-loss history rows available."));
  } else {
    const minIteration = Math.floor(d3.min(evalHistoryRows, (row) => row.step) ?? 0);
    const maxIteration = Math.ceil(d3.max(evalHistoryRows, (row) => row.step) ?? 1);
    windowControl = rangeWindowControl("Iteration window", minIteration, maxIteration, 1, minIteration, maxIteration);
    evalPlotHost = el("div");
    lossPlotHost = el("div");
    chartHost.append(windowControl.node, evalPlotHost, lossPlotHost);
  }
  root.appendChild(controlsHost);
  root.appendChild(chartHost);

  function refreshSummary() {
    const selectedRuns = new Set(runControl.getSelected());

    clearNode(tableHost);
    const summaryTable = renderSimpleTable(tableData, [
      {key: "run_number", label: "Run #", align: "right", bold: true, width: "9%"},
      {key: "lr_max", label: "Max LR", align: "right", width: "12%", format: (v) => Number(v).toExponential(2)},
      {key: "final_eval_loss", label: "Final Eval Loss", align: "right", width: "14%", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")},
      {key: "eval_best_loss", label: "Min Eval Loss", align: "right", width: "14%", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")},
      {key: "grad_mean", label: "Grad Norm (Mean)", align: "right", width: "12.5%", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "n/a")},
      {key: "grad_median", label: "Grad Norm (Median)", align: "right", width: "12.5%", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "n/a")},
      {key: "grad_p99", label: "Grad Norm (p99)", align: "right", width: "12.5%", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "n/a")},
      {key: "grad_max", label: "Grad Norm (Max)", align: "right", width: "12.5%", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "n/a")}
    ]);
    summaryTable.style.tableLayout = "fixed";
    tableHost.appendChild(summaryTable);

    if (!windowControl || !evalPlotHost || !lossPlotHost) return;

    clearNode(evalPlotHost);
    clearNode(lossPlotHost);
    if (selectedRuns.size === 0) {
      evalPlotHost.appendChild(emptyState("Select at least one run to view evaluation-loss curves."));
      lossPlotHost.appendChild(emptyState("Select at least one run to view training-loss curves."));
      return;
    }

    const window = windowControl.getWindow();
    const filteredEvalRows = evalHistoryRows
      .filter((row) => selectedRuns.has(row.run_name))
      .filter((row) => row.step >= window.start && row.step <= window.end);
    const filteredLossRows = lossHistoryRows
      .filter((row) => selectedRuns.has(row.run_name))
      .filter((row) => row.step >= window.start && row.step <= window.end);
    const smoothedLossRows = smoothByRun(filteredLossRows, "loss", 25);

    if (filteredEvalRows.length === 0) {
      evalPlotHost.appendChild(emptyState("No evaluation-loss rows for selected runs in this iteration window."));
    } else {
      evalPlotHost.appendChild(
        Plot.plot({
          title: "Evaluation Loss by Iteration (Selected Runs)",
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
    }

    if (smoothedLossRows.length === 0) {
      lossPlotHost.appendChild(emptyState("No training-loss rows for selected runs in this iteration window."));
      return;
    }

    lossPlotHost.appendChild(
      Plot.plot({
        title: "Smoothed Training Loss by Iteration (Selected Runs)",
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

  runControl.onChange(refreshSummary);
  if (windowControl) windowControl.onChange(refreshSummary);
  refreshSummary();

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
