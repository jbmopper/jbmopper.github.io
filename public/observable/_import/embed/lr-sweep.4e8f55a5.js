import {FileAttachment} from "../../_observablehq/stdlib.43270668.js";
import * as Plot from "../../_npm/@observablehq/plot@0.6.17/7c43807f.js";
import * as d3 from "../../_npm/d3@7.9.0/e324157d.js";
import {clearNode, emptyState, renderSimpleTable, sectionHeading} from "../components/dom-utils.aaca454b.js";

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

function metricValue(row, metric) {
  if (metric === "Loss") return row.loss;
  if (metric === "Eval Loss") return row.eval_loss;
  if (metric === "Eval Perplexity") return row.eval_perplexity;
  if (metric === "Throughput/Tokens per sec") return row.tokens_per_sec;
  if (metric === "LR") return row.lr;
  return row.step_s;
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
    const evalRows = history.filter((row) => Number.isFinite(row.eval_loss));
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
          eval_loss: pickNumber(row, ["Eval Loss", "Eval/Loss"]),
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

export async function renderLrSweep(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-lr-sweep";
  root.style.display = "grid";
  root.style.gap = "1rem";

  const title = el("h2", "Learning-Rate Sweep Analysis");
  title.style.margin = "0";
  const subtitle = el(
    "p",
    "Frontier, threshold crossing, history curves, gradient diagnostics, and pivot-style aggregation."
  );
  subtitle.style.margin = "0";

  const status = el("p");
  status.style.margin = "0";

  const summaryHost = card();
  const thresholdHost = card();
  const historyHost = card();
  const gradHost = card();
  const pivotHost = card();

  root.append(title, subtitle, status, summaryHost, thresholdHost, historyHost, gradHost, pivotHost);

  let data;
  try {
    data = await loadSweepData();
  } catch (error) {
    status.textContent = `Failed to load LR sweep parquet snapshots: ${error.message}`;
    summaryHost.appendChild(emptyState("LR sweep summary unavailable."));
    thresholdHost.appendChild(emptyState("Threshold section unavailable."));
    historyHost.appendChild(emptyState("History section unavailable."));
    gradHost.appendChild(emptyState("Gradient section unavailable."));
    pivotHost.appendChild(emptyState("Pivot section unavailable."));
    return root;
  }

  const {mainRows, historyRows, sweepPoints} = data;
  status.textContent = `Loaded ${mainRows.length} sweep rows and ${historyRows.length} history rows.`;

  clearNode(summaryHost);
  summaryHost.appendChild(sectionHeading("Sweep Summary and Frontier"));
  if (mainRows.length === 0) {
    summaryHost.appendChild(emptyState("No sweep summary rows available."));
  } else {
    const frontierRows = mainRows.filter((row) => Number.isFinite(row.lr_max) && row.lr_max > 0 && Number.isFinite(row.eval_best_loss));

    summaryHost.append(
      Plot.plot({
        width: 920,
        height: 340,
        x: {type: "log", label: "Max LR", grid: true},
        y: {label: "Best Eval Loss", grid: true},
        color: {legend: true},
        marks: [Plot.dot(frontierRows, {x: "lr_max", y: "eval_best_loss", fill: "state", tip: true})]
      }),
      renderSimpleTable(
        [...mainRows].sort((a, b) => d3.ascending(a.eval_best_loss, b.eval_best_loss)),
        [
          {key: "run_name", label: "Run"},
          {key: "run_number", label: "Run #", align: "right"},
          {key: "state", label: "State"},
          {key: "lr_max", label: "LR Max", align: "right", format: (v) => Number(v).toExponential(2)},
          {
            key: "eval_best_loss",
            label: "Eval Best Loss",
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
          }
        ]
      )
    );
  }

  clearNode(thresholdHost);
  thresholdHost.appendChild(sectionHeading("Threshold Crossing Workflow"));
  const thresholdControl = rangeControl("Loss threshold", 0.5, 10, 0.1, options.lossThreshold ?? 5);
  const thresholdChartHost = card();
  const thresholdTableHost = card();
  thresholdHost.append(thresholdControl.node, thresholdChartHost, thresholdTableHost);

  const runLabels = Array.from(new Set(historyRows.map((row) => row.run_name))).sort();
  const historyRunControl = checkboxGroup(
    runLabels,
    Array.isArray(options.historyRuns) && options.historyRuns.length > 0 ? options.historyRuns : runLabels.slice(0, 5),
    "Runs",
    "history-run"
  );
  const historyMetricControl = selectControl(
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
  const historyStrideControl = rangeControl("History stride", 1, 100, 1, options.historyStride ?? 10);

  clearNode(historyHost);
  historyHost.appendChild(sectionHeading("Run History Controls and Curves"));
  const historyControls = card();
  const historyChartHost = card();
  const historyTableHost = card();
  historyControls.append(historyRunControl.node, historyMetricControl.node, historyStrideControl.node);
  historyHost.append(historyControls, historyChartHost, historyTableHost);

  clearNode(gradHost);
  gradHost.appendChild(sectionHeading("Gradient vs LR and Loss Delta"));
  const gradClippedHost = card();
  const gradUnclippedHost = card();
  const deltaHost = card();
  const deltaTableHost = card();
  gradHost.append(gradClippedHost, gradUnclippedHost, deltaHost, deltaTableHost);

  clearNode(pivotHost);
  pivotHost.appendChild(sectionHeading("Pivot-Style Chart Builder"));
  const pivotControls = card();
  const pivotChartHost = card();
  const pivotTableHost = card();
  pivotHost.append(pivotControls, pivotChartHost, pivotTableHost);

  const pivotSource = selectControl(
    "Source",
    [
      {value: "main", label: "main"},
      {value: "history", label: "history"}
    ],
    "main"
  );
  const pivotAgg = selectControl(
    "Aggregation",
    [
      {value: "mean", label: "mean"},
      {value: "min", label: "min"},
      {value: "max", label: "max"},
      {value: "sum", label: "sum"},
      {value: "count", label: "count"}
    ],
    "mean"
  );
  const pivotChartType = selectControl(
    "Chart type",
    [
      {value: "bar", label: "bar"},
      {value: "line", label: "line"}
    ],
    "bar"
  );
  const pivotTopN = rangeControl("Top N", 5, 200, 5, 50);

  let pivotX;
  let pivotY;
  let pivotColor;

  function rebuildPivotControls() {
    clearNode(pivotControls);
    const sourceRows = pivotSource.select.value === "main" ? mainRows : historyRows;
    const {all, numeric} = inferColumns(sourceRows);

    const xDefault = all.includes("run_name") ? "run_name" : all[0] || "run_name";
    const yDefault = numeric.includes("eval_best_loss")
      ? "eval_best_loss"
      : numeric.includes("eval_loss")
        ? "eval_loss"
        : numeric[0] || all[0] || "run_number";
    const colorDefault = all.includes("state") ? "state" : "(none)";

    pivotX = selectControl(
      "X",
      all.map((value) => ({value, label: value})),
      xDefault
    );
    pivotY = selectControl(
      "Y",
      (numeric.length > 0 ? numeric : all).map((value) => ({value, label: value})),
      yDefault
    );
    pivotColor = selectControl(
      "Color",
      [{value: "(none)", label: "(none)"}, ...all.map((value) => ({value, label: value}))],
      colorDefault
    );

    pivotControls.append(
      pivotSource.node,
      pivotX.node,
      pivotY.node,
      pivotColor.node,
      pivotAgg.node,
      pivotChartType.node,
      pivotTopN.node
    );

    pivotX.select.addEventListener("change", refreshAll);
    pivotY.select.addEventListener("change", refreshAll);
    pivotColor.select.addEventListener("change", refreshAll);
  }

  function refreshAll() {
    thresholdControl.output.textContent = thresholdControl.input.value;
    historyStrideControl.output.textContent = historyStrideControl.input.value;
    pivotTopN.output.textContent = pivotTopN.input.value;

    const threshold = Number(thresholdControl.input.value);
    const thresholdRows = sweepPoints
      .map((point) => {
        const first = historyRows
          .filter((row) => row.run_name === point.run_name)
          .find((row) => Number.isFinite(row.loss) && row.loss < threshold);
        return {
          ...point,
          first_step_below_threshold: first ? first.step : NaN
        };
      })
      .filter((row) => Number.isFinite(row.peak_lr));

    clearNode(thresholdChartHost);
    clearNode(thresholdTableHost);
    thresholdChartHost.appendChild(sectionHeading(`Peak LR vs first step with Loss < ${threshold.toFixed(1)}`));
    if (thresholdRows.length === 0) {
      thresholdChartHost.appendChild(emptyState("No threshold rows available."));
      thresholdTableHost.appendChild(emptyState("No threshold table rows available."));
    } else {
      const plotted = thresholdRows.filter((row) => Number.isFinite(row.first_step_below_threshold));
      thresholdChartHost.appendChild(
        Plot.plot({
          width: 920,
          height: 320,
          x: {type: "log", label: "Peak LR", grid: true},
          y: {label: "First step below threshold", grid: true},
          marks: [Plot.dot(plotted, {x: "peak_lr", y: "first_step_below_threshold", fill: "run_number", tip: true})]
        })
      );
      thresholdTableHost.appendChild(
        renderSimpleTable(thresholdRows, [
          {key: "run_name", label: "Run"},
          {key: "run_number", label: "Run #", align: "right"},
          {key: "peak_lr", label: "Peak LR", align: "right", format: (v) => Number(v).toExponential(2)},
          {
            key: "first_step_below_threshold",
            label: "First Step",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(0) : "n/a")
          },
          {
            key: "final_eval_loss",
            label: "Final Eval Loss",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")
          }
        ])
      );
    }

    const selectedRuns = new Set(historyRunControl.getSelected());
    const metric = historyMetricControl.select.value;
    const stride = Number(historyStrideControl.input.value);

    const historyFiltered = historyRows
      .filter((row) => selectedRuns.size === 0 || selectedRuns.has(row.run_name))
      .filter((row) => Number.isFinite(metricValue(row, metric)))
      .filter((row) => Number.isFinite(row.step) && row.step % stride === 0);

    clearNode(historyChartHost);
    clearNode(historyTableHost);
    historyChartHost.appendChild(sectionHeading(`History Metric: ${metric}`));
    if (historyFiltered.length === 0) {
      historyChartHost.appendChild(emptyState("No history rows for selected runs/metric."));
      historyTableHost.appendChild(emptyState("No history rows to display."));
    } else {
      historyChartHost.appendChild(
        Plot.plot({
          width: 920,
          height: 340,
          x: {label: "step", grid: true},
          y: {label: metric, grid: true},
          color: {legend: true},
          marks: [Plot.lineY(historyFiltered, {x: "step", y: (d) => metricValue(d, metric), stroke: "run_name", tip: true})]
        })
      );
      historyTableHost.appendChild(
        renderSimpleTable(historyFiltered.slice(0, 1000), [
          {key: "run_name", label: "Run"},
          {key: "step", label: "Step", align: "right"},
          {key: "lr", label: "LR", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toExponential(2) : "n/a")},
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
          }
        ])
      );
    }

    const gradRows = historyRows.filter((row) => selectedRuns.size === 0 || selectedRuns.has(row.run_name));

    clearNode(gradClippedHost);
    clearNode(gradUnclippedHost);
    clearNode(deltaHost);
    clearNode(deltaTableHost);

    gradClippedHost.appendChild(sectionHeading("Clipped Gradient Norm vs LR"));
    const gradClippedRows = gradRows.filter((row) => Number.isFinite(row.lr) && Number.isFinite(row.grad_clipped));
    if (gradClippedRows.length === 0) {
      gradClippedHost.appendChild(emptyState("No clipped gradient rows available."));
    } else {
      gradClippedHost.appendChild(
        Plot.plot({
          width: 920,
          height: 320,
          x: {type: "log", label: "LR", grid: true},
          y: {label: "Grad/Norm (clipped)", grid: true},
          color: {legend: true},
          marks: [Plot.dot(gradClippedRows, {x: "lr", y: "grad_clipped", fill: "run_name", tip: true})]
        })
      );
    }

    gradUnclippedHost.appendChild(sectionHeading("Unclipped Gradient Norm vs LR"));
    const gradUnclippedRows = gradRows.filter((row) => Number.isFinite(row.lr) && Number.isFinite(row.grad_unclipped));
    if (gradUnclippedRows.length === 0) {
      gradUnclippedHost.appendChild(emptyState("No unclipped gradient rows available."));
    } else {
      gradUnclippedHost.appendChild(
        Plot.plot({
          width: 920,
          height: 320,
          x: {type: "log", label: "LR", grid: true},
          y: {label: "Grad/Norm (unclipped)", grid: true},
          color: {legend: true},
          marks: [Plot.dot(gradUnclippedRows, {x: "lr", y: "grad_unclipped", fill: "run_name", tip: true})]
        })
      );
    }

    deltaHost.appendChild(sectionHeading("Loss Delta (l_t - l_t+1) vs LR"));
    const deltaRows = gradRows.filter((row) => Number.isFinite(row.lr) && Number.isFinite(row.loss_delta));
    if (deltaRows.length === 0) {
      deltaHost.appendChild(emptyState("No loss-delta rows available."));
      deltaTableHost.appendChild(emptyState("No loss-delta table rows available."));
    } else {
      deltaHost.appendChild(
        Plot.plot({
          width: 920,
          height: 320,
          x: {type: "log", label: "LR", grid: true},
          y: {label: "Loss Delta", grid: true},
          color: {legend: true},
          marks: [Plot.dot(deltaRows, {x: "lr", y: "loss_delta", fill: "run_name", tip: true})]
        })
      );
      deltaTableHost.appendChild(
        renderSimpleTable(deltaRows.slice(0, 250), [
          {key: "run_name", label: "Run"},
          {key: "step", label: "Step", align: "right"},
          {key: "next_step", label: "Next Step", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(0) : "n/a")},
          {key: "lr", label: "LR", align: "right", format: (v) => Number(v).toExponential(2)},
          {key: "loss", label: "Loss", align: "right", format: (v) => Number(v).toFixed(6)},
          {key: "next_loss", label: "Next Loss", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")},
          {key: "loss_delta", label: "Delta", align: "right", format: (v) => Number(v).toFixed(6)}
        ])
      );
    }

    if (!pivotX || !pivotY || !pivotColor) return;

    const pivotRows = pivotSource.select.value === "main" ? mainRows : historyRows;
    const pivotAggregated = aggregatePivot(
      pivotRows,
      pivotX.select.value,
      pivotY.select.value,
      pivotColor.select.value,
      pivotAgg.select.value,
      Number(pivotTopN.input.value)
    );

    clearNode(pivotChartHost);
    clearNode(pivotTableHost);
    pivotChartHost.appendChild(sectionHeading("Pivot Chart"));

    if (pivotAggregated.length === 0) {
      pivotChartHost.appendChild(emptyState("No rows for selected pivot settings."));
      pivotTableHost.appendChild(emptyState("No pivot table rows."));
    } else {
      const marks =
        pivotChartType.select.value === "line"
          ? [Plot.lineY(pivotAggregated, {x: "x", y: "value", stroke: "split", tip: true}), Plot.dot(pivotAggregated, {x: "x", y: "value", fill: "split", tip: true})]
          : [Plot.barY(pivotAggregated, {x: "x", y: "value", fill: "split", fx: "split", tip: true})];

      pivotChartHost.appendChild(
        Plot.plot({
          width: 920,
          height: 360,
          x: {label: pivotX.select.value},
          y: {label: `${pivotAgg.select.value}(${pivotY.select.value})`, grid: true},
          color: {legend: true},
          marks
        })
      );

      pivotTableHost.appendChild(
        renderSimpleTable(pivotAggregated, [
          {key: "x", label: pivotX.select.value},
          {key: "split", label: "split"},
          {
            key: "value",
            label: `${pivotAgg.select.value}(${pivotY.select.value})`,
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")
          },
          {key: "count", label: "count", align: "right"}
        ])
      );
    }
  }

  thresholdControl.input.addEventListener("input", refreshAll);
  historyRunControl.onChange(refreshAll);
  historyMetricControl.select.addEventListener("change", refreshAll);
  historyStrideControl.input.addEventListener("input", refreshAll);

  pivotSource.select.addEventListener("change", () => {
    rebuildPivotControls();
    refreshAll();
  });
  pivotAgg.select.addEventListener("change", refreshAll);
  pivotChartType.select.addEventListener("change", refreshAll);
  pivotTopN.input.addEventListener("input", refreshAll);

  rebuildPivotControls();
  refreshAll();

  return root;
}
