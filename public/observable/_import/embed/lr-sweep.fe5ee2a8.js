import {FileAttachment} from "../../_observablehq/stdlib.43270668.js";
import * as Plot from "../components/echart-plot.1ac4f9d1.js";
import * as d3 from "../../_npm/d3@7.9.0/e324157d.js";
import {
  clearNode,
  emptyState,
  renderSimpleTable,
  multiSelectControl,
  collapsible,
  el,
  card,
  selectControl,
  rangeControl,
  debounce
} from "../components/dom-utils.167339c7.js";

const ATTACHMENTS = {
  main: FileAttachment({"name":"../../data/raw/benchmarks/lr_sweeps_main.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/lr_sweeps_main.98e6db0c.parquet","lastModified":1771874136930,"size":15015}, import.meta.url),
  history: FileAttachment({"name":"../../data/raw/benchmarks/lr_sweeps_history.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/lr_sweeps_history.4f809053.parquet","lastModified":1771874136930,"size":3312658}, import.meta.url)
};

let sweepDataPromise;
const SWEEP_CACHE_IDLE_MS = 2 * 60 * 1000;
let sweepCacheTimer = null;

const OPTIMIZER_SWEEP_ATTACHMENTS = {
  main: FileAttachment({"name":"../../data/raw/benchmarks/optimizer_sweep_l28yv8f7_20260222_151711_main.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/optimizer_sweep_l28yv8f7_20260222_151711_main.5801ffde.parquet","lastModified":1771874136940,"size":61729}, import.meta.url),
  history: FileAttachment({"name":"../../data/raw/benchmarks/optimizer_sweep_history.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/optimizer_sweep_history.94921937.parquet","lastModified":1771882112224,"size":8766116}, import.meta.url)
};

let optimizerSweepDataPromise;
let optimizerSweepCacheTimer = null;

const LR_CONTINUOUS_COLOR_STOPS = [
  "#4c6cb3",
  "#2f8ea5",
  "#5cbf88",
  "#c9c65b",
  "#e39b4a"
];

function interpolateLrContinuous(t) {
  const clamped = Number.isFinite(Number(t)) ? Math.max(0, Math.min(1, Number(t))) : 0;
  return d3.interpolateRgbBasis(LR_CONTINUOUS_COLOR_STOPS)(clamped);
}

function touchSweepCache() {
  if (typeof window === "undefined") return;
  if (sweepCacheTimer) window.clearTimeout(sweepCacheTimer);
  sweepCacheTimer = window.setTimeout(() => {
    sweepDataPromise = null;
    sweepCacheTimer = null;
  }, SWEEP_CACHE_IDLE_MS);
}

function touchOptimizerSweepCache() {
  if (typeof window === "undefined") return;
  if (optimizerSweepCacheTimer) window.clearTimeout(optimizerSweepCacheTimer);
  optimizerSweepCacheTimer = window.setTimeout(() => {
    optimizerSweepDataPromise = null;
    optimizerSweepCacheTimer = null;
  }, SWEEP_CACHE_IDLE_MS);
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

function attachInputRefresh(input, refresh, options = {}) {
  const delayMs = Number.isFinite(Number(options.delayMs)) ? Math.max(0, Number(options.delayMs)) : 90;
  const onInput = typeof options.onInput === "function" ? options.onInput : null;
  let timeoutId = null;
  const scheduleRefresh =
    delayMs > 0
      ? () => {
          if (timeoutId != null) clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            timeoutId = null;
            refresh();
          }, delayMs);
        }
      : refresh;
  const flushRefresh = () => {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    refresh();
  };
  input.addEventListener("input", () => {
    if (onInput) onInput("input");
    scheduleRefresh();
  });
  input.addEventListener("change", () => {
    if (onInput) onInput("change");
    flushRefresh();
  });
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
  const historyByRun = d3.group(historyRows, (row) => row.run_name);
  for (const rows of historyByRun.values()) {
    rows.sort((a, b) => d3.ascending(a.step, b.step));
  }
  const runs = new Set([...mainByRun.keys(), ...historyByRun.keys()]);
  const points = [];

  for (const run of runs) {
    const main = mainByRun.get(run);
    const history = historyByRun.get(run) || [];
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
    sweepDataPromise.catch(() => {
      sweepDataPromise = null;
    });
  }
  touchSweepCache();
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
    optimizerSweepDataPromise.catch(() => {
      optimizerSweepDataPromise = null;
    });
  }
  touchOptimizerSweepCache();
  return optimizerSweepDataPromise;
}

export async function renderOptimizerSweepPaths(options = {}) {
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

  const {mainRows, historyRows} = data;

  const runSummaryByName = new Map();
  for (const row of historyRows) {
    const key = row.run_name || "unknown-run";
    const summary = runSummaryByName.get(key) || {final_iteration: NaN, final_eval_loss: NaN};
    if (Number.isFinite(row.step) && (!Number.isFinite(summary.final_iteration) || row.step > summary.final_iteration)) {
      summary.final_iteration = row.step;
    }
    if (Number.isFinite(row.eval_loss) && row.eval_loss > 0) {
      summary.final_eval_loss = row.eval_loss;
    }
    runSummaryByName.set(key, summary);
  }

  const basePoints = mainRows
    .sort((a, b) => d3.ascending(a.run_number, b.run_number) || d3.ascending(a.run_name, b.run_name))
    .map((row) => {
      const summary = runSummaryByName.get(row.run_name || "unknown-run");
      const final_iteration = Number.isFinite(summary?.final_iteration) ? Number(summary.final_iteration) : NaN;
      const final_eval_loss_history = Number.isFinite(summary?.final_eval_loss) ? Number(summary.final_eval_loss) : NaN;
      const final_eval_loss =
        Number.isFinite(final_eval_loss_history) && final_eval_loss_history > 0
          ? final_eval_loss_history
          : Number.isFinite(row.eval_loss) && row.eval_loss > 0
            ? Number(row.eval_loss)
            : Number.isFinite(row.eval_best_loss) && row.eval_best_loss > 0
              ? Number(row.eval_best_loss)
              : NaN;
      return {
        ...row,
        final_iteration,
        final_eval_loss
      };
    });

  const points = basePoints
    .filter(
      (row) =>
        Number.isFinite(row.optimizer_beta2) &&
        Number.isFinite(row.optimizer_weight_decay) &&
        row.optimizer_weight_decay > 0 &&
        Number.isFinite(row.lr_max) &&
        row.lr_max > 0 &&
        Number.isFinite(row.final_iteration) &&
        Number.isFinite(row.eval_best_loss) &&
        row.eval_best_loss > 0
    )
    .map((row, idx) => ({
      ...row,
      run_order: idx + 1,
      run_color: Number.isFinite(row.run_number) ? row.run_number : idx + 1
    }));
  if (points.length === 0) {
    root.appendChild(
      emptyState("No optimizer-sweep rows with β2, weight decay, max LR, final iteration, and best eval-loss values.")
    );
    return root;
  }

  const beta2Min = d3.min(points, (row) => row.optimizer_beta2) ?? 0.95;
  const beta2Max = d3.max(points, (row) => row.optimizer_beta2) ?? 0.999;
  const wdMin = d3.min(points, (row) => row.optimizer_weight_decay) ?? 1e-3;
  const wdMax = d3.max(points, (row) => row.optimizer_weight_decay) ?? 1e-1;
  const lrMin = d3.min(points, (row) => row.lr_max) ?? 5e-4;
  const lrMax = d3.max(points, (row) => row.lr_max) ?? 5e-1;
  const finalIterationMin = d3.min(points, (row) => row.final_iteration) ?? 0;
  const finalIterationMax = d3.max(points, (row) => row.final_iteration) ?? 1000;
  const bestEvalLossMin = d3.min(points, (row) => row.eval_best_loss) ?? 1e-2;
  const bestEvalLossMax = d3.max(points, (row) => row.eval_best_loss) ?? 10;

  const axisSpecs = [
    {
      key: "optimizer_beta2",
      label: "β2",
      normalize(value) {
        if (!Number.isFinite(value)) return NaN;
        if (!(beta2Max > beta2Min)) return 0.5;
        return Math.max(0, Math.min(1, (value - beta2Min) / (beta2Max - beta2Min)));
      },
      denormalize(t) {
        return beta2Min + (beta2Max - beta2Min) * t;
      },
      format(value) {
        return Number.isFinite(value) ? value.toFixed(4) : "n/a";
      }
    },
    {
      key: "optimizer_weight_decay",
      label: "weight decay",
      normalize(value) {
        if (!Number.isFinite(value) || value <= 0) return NaN;
        const min = Math.log10(wdMin);
        const max = Math.log10(wdMax);
        if (!(max > min)) return 0.5;
        return Math.max(0, Math.min(1, (Math.log10(value) - min) / (max - min)));
      },
      denormalize(t) {
        const min = Math.log10(wdMin);
        const max = Math.log10(wdMax);
        return 10 ** (min + (max - min) * t);
      },
      format(value) {
        return Number.isFinite(value) ? value.toExponential(1) : "n/a";
      }
    },
    {
      key: "lr_max",
      label: "max LR",
      normalize(value) {
        if (!Number.isFinite(value) || value <= 0) return NaN;
        const min = Math.log10(lrMin);
        const max = Math.log10(lrMax);
        if (!(max > min)) return 0.5;
        return Math.max(0, Math.min(1, (Math.log10(value) - min) / (max - min)));
      },
      denormalize(t) {
        const min = Math.log10(lrMin);
        const max = Math.log10(lrMax);
        return 10 ** (min + (max - min) * t);
      },
      format(value) {
        return Number.isFinite(value) ? value.toExponential(1) : "n/a";
      }
    },
    {
      key: "final_iteration",
      label: "final iteration",
      normalize(value) {
        if (!Number.isFinite(value)) return NaN;
        if (!(finalIterationMax > finalIterationMin)) return 0.5;
        return Math.max(0, Math.min(1, (value - finalIterationMin) / (finalIterationMax - finalIterationMin)));
      },
      denormalize(t) {
        return finalIterationMin + (finalIterationMax - finalIterationMin) * t;
      },
      format(value) {
        return Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "n/a";
      }
    },
    {
      key: "eval_best_loss",
      label: "best eval loss",
      normalize(value) {
        if (!Number.isFinite(value) || value <= 0) return NaN;
        const min = Math.log10(bestEvalLossMin);
        const max = Math.log10(bestEvalLossMax);
        if (!(max > min)) return 0.5;
        return Math.max(0, Math.min(1, (Math.log10(value) - min) / (max - min)));
      },
      denormalize(t) {
        const min = Math.log10(bestEvalLossMin);
        const max = Math.log10(bestEvalLossMax);
        return 10 ** (min + (max - min) * t);
      },
      format(value) {
        return Number.isFinite(value) ? value.toExponential(2) : "n/a";
      }
    }
  ];

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
  lineToggleLabel.append(lineToggle, document.createTextNode("Show run lines"));

  const speedControl = rangeControl(
    "Frame delay (ms)",
    1,
    300,
    1,
    Number.isFinite(Number(options.triangleFrameMs))
      ? Math.max(1, Math.min(300, Number(options.triangleFrameMs)))
      : 120
  );
  const runControl = rangeControl(
    "Current run index",
    1,
    points.length,
    1,
    Number.isFinite(Number(options.currentRunIndex))
      ? Math.max(1, Math.min(points.length, Number(options.currentRunIndex)))
      : points.length
  );
  const windowSizeControl = rangeControl(
    "Visible runs (window)",
    1,
    points.length,
    1,
    Number.isFinite(Number(options.triangleWindowSize))
      ? Math.max(1, Math.min(points.length, Number(options.triangleWindowSize)))
      : Math.min(10, points.length)
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
    .scaleSequential([runColorMin, runColorMax > runColorMin ? runColorMax : runColorMin + 1], interpolateLrContinuous)
    .clamp(true);

  const CHART_WIDTH = 920;
  const CHART_HEIGHT = 430;
  const CHART_MARGIN_LEFT = 78;
  const CHART_MARGIN_RIGHT = 170;
  const CHART_MARGIN_TOP = 36;
  const CHART_MARGIN_BOTTOM = 58;
  const CHART_INNER_WIDTH = CHART_WIDTH - CHART_MARGIN_LEFT - CHART_MARGIN_RIGHT;
  const CHART_INNER_HEIGHT = CHART_HEIGHT - CHART_MARGIN_TOP - CHART_MARGIN_BOTTOM;
  const axisTicks = [0, 0.25, 0.5, 0.75, 1];
  const axisCount = axisSpecs.length;

  function axisX(axisIndex) {
    if (axisCount <= 1) return CHART_MARGIN_LEFT + CHART_INNER_WIDTH / 2;
    return CHART_MARGIN_LEFT + (CHART_INNER_WIDTH * axisIndex) / (axisCount - 1);
  }

  function valueY(normValue) {
    const clamped = Number.isFinite(normValue) ? Math.max(0, Math.min(1, normValue)) : 0.5;
    return CHART_MARGIN_TOP + (1 - clamped) * CHART_INNER_HEIGHT;
  }

  const plotCard = card();
  const plotTitle = el("strong", "Optimizer Hyperparameters (Parallel Coordinates)");
  plotCard.appendChild(plotTitle);

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`);
  svg.setAttribute("width", String(CHART_WIDTH));
  svg.setAttribute("height", String(CHART_HEIGHT));
  svg.style.maxWidth = "100%";
  svg.style.height = "auto";
  svg.style.display = "block";
  svg.style.overflow = "visible";

  const axisLayer = document.createElementNS(svgNs, "g");
  svg.appendChild(axisLayer);
  const lineLayer = document.createElementNS(svgNs, "g");
  svg.appendChild(lineLayer);
  const dotLayer = document.createElementNS(svgNs, "g");
  svg.appendChild(dotLayer);

  for (let axisIndex = 0; axisIndex < axisCount; axisIndex += 1) {
    const axis = axisSpecs[axisIndex];
    const x = axisX(axisIndex);

    const axisLine = document.createElementNS(svgNs, "line");
    axisLine.setAttribute("x1", String(x));
    axisLine.setAttribute("y1", String(valueY(0)));
    axisLine.setAttribute("x2", String(x));
    axisLine.setAttribute("y2", String(valueY(1)));
    axisLine.setAttribute("stroke", "currentColor");
    axisLine.setAttribute("stroke-opacity", "0.32");
    axisLine.setAttribute("stroke-width", "1");
    axisLine.setAttribute("vector-effect", "non-scaling-stroke");
    axisLayer.appendChild(axisLine);

    const axisLabel = document.createElementNS(svgNs, "text");
    axisLabel.setAttribute("x", String(x));
    axisLabel.setAttribute("y", String(CHART_MARGIN_TOP - 14));
    axisLabel.setAttribute("text-anchor", "middle");
    axisLabel.setAttribute("font-size", "12");
    axisLabel.setAttribute("font-weight", "600");
    axisLabel.setAttribute("fill", "currentColor");
    axisLabel.textContent = axis.label;
    axisLayer.appendChild(axisLabel);

    for (const tick of axisTicks) {
      const y = valueY(tick);
      const tickMark = document.createElementNS(svgNs, "line");
      tickMark.setAttribute("x1", String(x - 4));
      tickMark.setAttribute("y1", String(y));
      tickMark.setAttribute("x2", String(x + 4));
      tickMark.setAttribute("y2", String(y));
      tickMark.setAttribute("stroke", "currentColor");
      tickMark.setAttribute("stroke-opacity", "0.24");
      tickMark.setAttribute("stroke-width", "1");
      tickMark.setAttribute("vector-effect", "non-scaling-stroke");
      axisLayer.appendChild(tickMark);

      const tickText = document.createElementNS(svgNs, "text");
      tickText.setAttribute("x", String(x + 7));
      tickText.setAttribute("y", String(y + 3));
      tickText.setAttribute("text-anchor", "start");
      tickText.setAttribute("font-size", "10");
      tickText.setAttribute("fill", "currentColor");
      tickText.setAttribute("opacity", "0.82");
      tickText.textContent = axis.format(axis.denormalize(tick));
      axisLayer.appendChild(tickText);
    }
  }

  const runLineNodes = points.map((point) => {
    const coords = axisSpecs.map((axis, axisIndex) => `${axisX(axisIndex)},${valueY(axis.normalize(point[axis.key]))}`).join(" ");
    const node = document.createElementNS(svgNs, "polyline");
    node.setAttribute("points", coords);
    node.setAttribute("fill", "none");
    node.setAttribute("stroke", runColorScale(point.run_color));
    node.setAttribute("stroke-opacity", "0.45");
    node.setAttribute("stroke-width", "1.25");
    node.setAttribute("vector-effect", "non-scaling-stroke");
    const title = document.createElementNS(svgNs, "title");
    title.textContent = `${point.run_name}\nRun # ${Number.isFinite(point.run_number) ? point.run_number : "n/a"}\nβ2 ${Number(
      point.optimizer_beta2
    ).toFixed(6)}\nWeight decay ${Number(point.optimizer_weight_decay).toExponential(3)}\nMax LR ${Number(
      point.lr_max
    ).toExponential(3)}\nFinal iteration ${Math.round(point.final_iteration).toLocaleString(
      "en-US"
    )}\nBest eval loss ${Number(point.eval_best_loss).toExponential(2)}`;
    node.appendChild(title);
    lineLayer.appendChild(node);
    return {point, node};
  });

  const runDotNodes = points.map((point) => {
    const nodes = axisSpecs.map((axis, axisIndex) => {
      const value = point[axis.key];
      const node = document.createElementNS(svgNs, "circle");
      node.setAttribute("cx", String(axisX(axisIndex)));
      node.setAttribute("cy", String(valueY(axis.normalize(value))));
      node.setAttribute("r", "2.8");
      node.setAttribute("fill", runColorScale(point.run_color));
      node.setAttribute("stroke", "white");
      node.setAttribute("stroke-width", "0.45");
      node.setAttribute("vector-effect", "non-scaling-stroke");
      const title = document.createElementNS(svgNs, "title");
      title.textContent = `${point.run_name}\nRun # ${Number.isFinite(point.run_number) ? point.run_number : "n/a"}\n${axis.label}: ${axis.format(
        value
      )}\nβ2 ${Number(point.optimizer_beta2).toFixed(6)}\nWeight decay ${Number(point.optimizer_weight_decay).toExponential(
        3
      )}\nMax LR ${Number(point.lr_max).toExponential(3)}\nFinal iteration ${Math.round(point.final_iteration).toLocaleString(
        "en-US"
      )}\nBest eval loss ${Number(point.eval_best_loss).toExponential(2)}`;
      node.appendChild(title);
      dotLayer.appendChild(node);
      return node;
    });
    return {point, nodes};
  });

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
    "p",
    "Each vertical axis uses raw units. Runs are connected left-to-right across β2, weight decay, max LR, final iteration, and best eval loss."
  );
  scaleHelp.style.margin = "0";
  scaleHelp.style.fontSize = "0.85rem";
  scaleHelp.style.opacity = "0.82";
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
  let animationToken = 0;

  function stopAnimation() {
    animationToken += 1;
    if (timerId != null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }
  function startAnimation() {
    stopAnimation();
    if (!animateToggle.checked) return;
    const token = animationToken;
    const frameMs = Math.max(1, Number(speedControl.input.value) || 120);
    timerId = window.setInterval(() => {
      if (token !== animationToken) return;
      if (!root.isConnected) {
        stopAnimation();
        return;
      }
      let current = Number(runControl.input.value);
      if (!Number.isFinite(current)) current = 0;
      current = Math.round(current);
      current = current >= points.length ? 1 : current + 1;
      runControl.input.value = String(current);
      refresh();
    }, frameMs);
  }

  function refresh() {
    speedControl.output.textContent = String(Math.round(Number(speedControl.input.value)));
    windowSizeControl.output.textContent = String(Math.round(Number(windowSizeControl.input.value)));
    const windowSize = Math.max(1, Math.min(points.length, Math.round(Number(windowSizeControl.input.value) || 1)));
    windowSizeControl.input.value = String(windowSize);
    const animateEnabled = animateToggle.checked;
    const maxWindowStart = Math.max(1, points.length - windowSize + 1);

    speedControl.input.disabled = !animateEnabled;
    runControl.input.disabled = false;
    runControl.input.min = "1";
    runControl.input.max = animateEnabled ? String(points.length) : String(maxWindowStart);

    const runLabelNode = runControl.node.firstChild;
    if (runLabelNode?.nodeType === 3) {
      runLabelNode.textContent = animateEnabled ? "Current run index" : "Window start index";
    }

    let current = Math.max(1, Math.min(points.length, Math.round(Number(runControl.input.value) || 1)));
    let start = 1;
    let end = points.length;
    if (animateEnabled) {
      runControl.input.value = String(current);
      start = Math.max(1, current - windowSize + 1);
      end = current;
    } else {
      const windowStart = Math.max(1, Math.min(maxWindowStart, current));
      runControl.input.value = String(windowStart);
      start = windowStart;
      end = Math.min(points.length, windowStart + windowSize - 1);
      current = end;
    }
    runControl.output.textContent = runControl.input.value;

    const visiblePoints = points.filter((point) => point.run_order >= start && point.run_order <= end);
    const visibleRunCount = visiblePoints.length;
    const pointRadius = animateEnabled ? 2.4 : 2.8;
    const highlightRadius = animateEnabled ? 3.6 : 2.8;

    for (const {point, node} of runLineNodes) {
      const visible = lineToggle.checked && point.run_order >= start && point.run_order <= end;
      node.style.display = visible ? "" : "none";
    }

    for (const {point, nodes} of runDotNodes) {
      const visible = point.run_order >= start && point.run_order <= end;
      const radius = animateEnabled && point.run_order === current ? highlightRadius : pointRadius;
      for (const node of nodes) {
        node.style.display = visible ? "" : "none";
        if (visible) node.setAttribute("r", String(radius));
      }
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
        for (let rowIdx = 0; rowIdx < windowSize; rowIdx += 1) {
          const row = tableRows[rowIdx];
          const hasData = Boolean(row);
          const tr = el("tr");
          tr.style.height = "1.8rem";

          const runNumberCell = el(
            "td",
            hasData ? (Number.isFinite(row.run_number) ? String(Math.round(row.run_number)) : "n/a") : ""
          );
          runNumberCell.style.padding = "0.2rem 0.45rem";
          runNumberCell.style.textAlign = "right";
          runNumberCell.style.verticalAlign = "middle";
          tr.appendChild(runNumberCell);

          const runNameCell = el("td", hasData ? row.run_name || "" : "");
          runNameCell.style.padding = "0.2rem 0.45rem";
          runNameCell.style.textAlign = "left";
          runNameCell.style.verticalAlign = "middle";
          tr.appendChild(runNameCell);

          const betaCell = el(
            "td",
            hasData && Number.isFinite(Number(row.optimizer_beta2)) ? Number(row.optimizer_beta2).toFixed(6) : ""
          );
          betaCell.style.padding = "0.2rem 0.45rem";
          betaCell.style.textAlign = "right";
          betaCell.style.verticalAlign = "middle";
          tr.appendChild(betaCell);

          const wdCell = el(
            "td",
            hasData && Number.isFinite(Number(row.optimizer_weight_decay))
              ? Number(row.optimizer_weight_decay).toExponential(3)
              : ""
          );
          wdCell.style.padding = "0.2rem 0.45rem";
          wdCell.style.textAlign = "right";
          wdCell.style.verticalAlign = "middle";
          tr.appendChild(wdCell);

          const lrCell = el("td", hasData && Number.isFinite(Number(row.lr_max)) ? Number(row.lr_max).toExponential(3) : "");
          lrCell.style.padding = "0.2rem 0.45rem";
          lrCell.style.textAlign = "right";
          lrCell.style.verticalAlign = "middle";
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
        lineToggle.checked ? `, ${visibleRunCount.toLocaleString("en-US")} run line(s)` : ""
      }.`;
    } else {
      summaryHost.textContent = `Animation off: window ${start.toLocaleString("en-US")}–${end.toLocaleString(
        "en-US"
      )} of ${points.length.toLocaleString("en-US")} runs${
        lineToggle.checked ? `, ${visibleRunCount.toLocaleString("en-US")} run line(s)` : ""
      }.`;
    }
  }

  animateToggle.addEventListener("change", () => {
    if (animateToggle.checked) {
      if (!(Number(runControl.input.value) >= 1)) runControl.input.value = "1";
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

function squaredDistance(a, b) {
  const n = Math.min(a.length, b.length);
  let total = 0;
  for (let idx = 0; idx < n; idx += 1) {
    const delta = a[idx] - b[idx];
    total += delta * delta;
  }
  return total;
}

function farthestPointIndex(vectors, centers) {
  if (vectors.length === 0) return -1;
  if (centers.length === 0) return 0;

  let bestIdx = 0;
  let bestMinDist = -Infinity;
  for (let idx = 0; idx < vectors.length; idx += 1) {
    const vector = vectors[idx];
    let minDist = Infinity;
    for (const center of centers) {
      const dist = squaredDistance(vector, center);
      if (dist < minDist) minDist = dist;
    }
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      bestIdx = idx;
    }
  }
  return bestIdx;
}

function runKMeans3(vectors, k, maxIterations = 60) {
  const n = vectors.length;
  if (n === 0) return {assignments: [], centers: []};
  const dims = vectors[0]?.length ?? 0;

  const safeK = Math.max(1, Math.min(Math.round(k), n));
  const centers = [vectors[0].slice()];
  while (centers.length < safeK) {
    const nextIdx = farthestPointIndex(vectors, centers);
    centers.push(vectors[nextIdx].slice());
  }

  const assignments = new Array(n).fill(0);
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let changed = false;
    for (let idx = 0; idx < n; idx += 1) {
      const vector = vectors[idx];
      let bestCluster = 0;
      let bestDist = Infinity;
      for (let clusterIdx = 0; clusterIdx < safeK; clusterIdx += 1) {
        const dist = squaredDistance(vector, centers[clusterIdx]);
        if (dist < bestDist) {
          bestDist = dist;
          bestCluster = clusterIdx;
        }
      }
      if (assignments[idx] !== bestCluster) {
        assignments[idx] = bestCluster;
        changed = true;
      }
    }

    if (!changed && iteration > 0) break;

    const sums = Array.from({length: safeK}, () => Array.from({length: dims}, () => 0));
    const counts = new Array(safeK).fill(0);
    for (let idx = 0; idx < n; idx += 1) {
      const clusterIdx = assignments[idx];
      const vector = vectors[idx];
      for (let dim = 0; dim < dims; dim += 1) {
        sums[clusterIdx][dim] += vector[dim];
      }
      counts[clusterIdx] += 1;
    }

    for (let clusterIdx = 0; clusterIdx < safeK; clusterIdx += 1) {
      if (counts[clusterIdx] > 0) {
        centers[clusterIdx] = sums[clusterIdx].map((sum) => sum / counts[clusterIdx]);
      } else {
        const remainingCenters = centers.filter((_, idx) => idx !== clusterIdx);
        const fallbackIdx = farthestPointIndex(vectors, remainingCenters);
        centers[clusterIdx] = vectors[fallbackIdx].slice();
      }
    }
  }

  return {assignments, centers};
}

function dotProduct(a, b) {
  let total = 0;
  const n = Math.min(a.length, b.length);
  for (let idx = 0; idx < n; idx += 1) total += a[idx] * b[idx];
  return total;
}

function vectorNorm(a) {
  return Math.sqrt(dotProduct(a, a));
}

function normalizeVector(a) {
  const n = vectorNorm(a);
  if (!(n > 0)) return a.map(() => 0);
  return a.map((v) => v / n);
}

function matVec3(matrix, vector) {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2]
  ];
}

function topEigenvectorSymmetric3(matrix, seed = [1, 0, 0], iterations = 60) {
  let v = normalizeVector(seed);
  for (let i = 0; i < iterations; i += 1) {
    const next = matVec3(matrix, v);
    const norm = vectorNorm(next);
    if (!(norm > 0)) break;
    v = next.map((x) => x / norm);
  }
  const mv = matVec3(matrix, v);
  const eigenvalue = dotProduct(v, mv);
  return {vector: v, eigenvalue};
}

function computePca2From3D(vectors3) {
  if (vectors3.length === 0) {
    return {scores: [], means: [0, 0, 0], components: [[1, 0, 0], [0, 1, 0]], explainedRatio: [0, 0]};
  }

  const n = vectors3.length;
  const means = [0, 0, 0];
  for (const vector of vectors3) {
    means[0] += vector[0];
    means[1] += vector[1];
    means[2] += vector[2];
  }
  means[0] /= n;
  means[1] /= n;
  means[2] /= n;

  const centered = vectors3.map((vector) => [vector[0] - means[0], vector[1] - means[1], vector[2] - means[2]]);
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const denom = Math.max(1, n - 1);
  for (const vector of centered) {
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) cov[i][j] += (vector[i] * vector[j]) / denom;
    }
  }

  const pc1 = topEigenvectorSymmetric3(cov, [1, 1, 1], 80);
  const deflated = cov.map((row, i) =>
    row.map((value, j) => value - pc1.eigenvalue * pc1.vector[i] * pc1.vector[j])
  );
  const pc2 = topEigenvectorSymmetric3(deflated, [1, -1, 0], 80);

  const scores = centered.map((vector) => [dotProduct(vector, pc1.vector), dotProduct(vector, pc2.vector)]);
  const totalVariance = Math.max(1e-12, cov[0][0] + cov[1][1] + cov[2][2]);
  const explainedRatio = [Math.max(0, pc1.eigenvalue) / totalVariance, Math.max(0, pc2.eigenvalue) / totalVariance];

  return {scores, means, components: [pc1.vector, pc2.vector], explainedRatio};
}

export async function renderOptimizerSweepClusters(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-optimizer-sweep-clusters";
  root.style.display = "grid";
  root.style.gap = "1rem";

  let data;
  try {
    data = await loadOptimizerSweepData();
  } catch (error) {
    root.appendChild(emptyState(`Failed to load optimizer sweep parquet snapshots: ${error.message}`));
    return root;
  }

  const {mainRows, historyRows} = data;
  const runSummaryByName = new Map();
  for (const row of historyRows) {
    const key = row.run_name || "unknown-run";
    const summary = runSummaryByName.get(key) || {final_iteration: NaN, final_eval_loss: NaN};
    if (Number.isFinite(row.step) && (!Number.isFinite(summary.final_iteration) || row.step > summary.final_iteration)) {
      summary.final_iteration = row.step;
    }
    if (Number.isFinite(row.eval_loss) && row.eval_loss > 0) {
      summary.final_eval_loss = row.eval_loss;
    }
    runSummaryByName.set(key, summary);
  }

  const rows = mainRows
    .map((row) => {
      const summary = runSummaryByName.get(row.run_name || "unknown-run");
      const final_iteration = Number.isFinite(summary?.final_iteration) ? Number(summary.final_iteration) : NaN;
      const final_eval_loss_history = Number.isFinite(summary?.final_eval_loss) ? Number(summary.final_eval_loss) : NaN;
      const final_eval_loss =
        Number.isFinite(final_eval_loss_history) && final_eval_loss_history > 0
          ? final_eval_loss_history
          : Number.isFinite(row.eval_loss) && row.eval_loss > 0
            ? Number(row.eval_loss)
            : Number.isFinite(row.eval_best_loss) && row.eval_best_loss > 0
              ? Number(row.eval_best_loss)
              : NaN;
      return {
        ...row,
        final_iteration,
        final_eval_loss
      };
    })
    .filter(
      (row) =>
        Number.isFinite(row.optimizer_beta2) &&
        Number.isFinite(row.optimizer_weight_decay) &&
        row.optimizer_weight_decay > 0 &&
        Number.isFinite(row.lr_max) &&
        row.lr_max > 0 &&
        Number.isFinite(row.final_iteration) &&
        Number.isFinite(row.eval_best_loss) &&
        row.eval_best_loss > 0
    )
    .sort((a, b) => d3.ascending(a.run_number, b.run_number) || d3.ascending(a.run_name, b.run_name));

  if (rows.length < 2) {
    root.appendChild(emptyState("Need at least two optimizer-sweep rows to run k-means clustering."));
    return root;
  }

  const beta2Min = d3.min(rows, (row) => row.optimizer_beta2) ?? 0.95;
  const beta2Max = d3.max(rows, (row) => row.optimizer_beta2) ?? 0.999;
  const wdLogMin = d3.min(rows, (row) => Math.log10(row.optimizer_weight_decay)) ?? -6;
  const wdLogMax = d3.max(rows, (row) => Math.log10(row.optimizer_weight_decay)) ?? 0;
  const lrLogMin = d3.min(rows, (row) => Math.log10(row.lr_max)) ?? -6;
  const lrLogMax = d3.max(rows, (row) => Math.log10(row.lr_max)) ?? 0;
  const finalIterationMin = d3.min(rows, (row) => row.final_iteration) ?? 0;
  const finalIterationMax = d3.max(rows, (row) => row.final_iteration) ?? 1000;

  function normalize(value, min, max) {
    if (!Number.isFinite(value)) return NaN;
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0.5;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

  const pointRows = rows.map((row) => {
    const beta2Norm = normalize(row.optimizer_beta2, beta2Min, beta2Max);
    const wdNorm = normalize(Math.log10(row.optimizer_weight_decay), wdLogMin, wdLogMax);
    const lrNorm = normalize(Math.log10(row.lr_max), lrLogMin, lrLogMax);
    return {
      ...row,
      beta2_norm: beta2Norm,
      wd_norm: wdNorm,
      lr_norm: lrNorm
    };
  });

  const controls = card();
  controls.dataset.section = "optimizer-main-clusters-controls";
  const chartHost = card();
  chartHost.dataset.section = "optimizer-main-clusters-chart";
  const centroidHost = card();
  centroidHost.dataset.section = "optimizer-main-clusters-centroids";
  const clustersHost = card();
  clustersHost.dataset.section = "optimizer-main-clusters-details";
  const subsetControlHost = card();
  subsetControlHost.dataset.section = "optimizer-subset-clusters-controls";
  const subsetChartHost = card();
  subsetChartHost.dataset.section = "optimizer-subset-clusters-chart";
  const subsetCentroidHost = card();
  subsetCentroidHost.dataset.section = "optimizer-subset-clusters-centroids";
  const subsetClustersHost = card();
  subsetClustersHost.dataset.section = "optimizer-subset-clusters-details";
  const summaryHost = el("p");
  summaryHost.dataset.section = "optimizer-clusters-summary";
  summaryHost.style.margin = "0";
  summaryHost.style.fontSize = "0.9rem";
  root.append(
    controls,
    chartHost,
    centroidHost,
    clustersHost,
    subsetControlHost,
    subsetChartHost,
    subsetCentroidHost,
    subsetClustersHost,
    summaryHost
  );

  const maxClusters = Math.min(10, pointRows.length);
  const kControl = rangeControl(
    "K clusters",
    2,
    maxClusters,
    1,
    Number.isFinite(Number(options.optimizerClustersK))
      ? Math.max(2, Math.min(maxClusters, Number(options.optimizerClustersK)))
      : Math.min(4, maxClusters)
  );
  const subsetPointRows = pointRows.filter(
    (row) => Number.isFinite(row.final_iteration) && row.final_iteration >= 1000 && Number.isFinite(row.eval_best_loss) && row.eval_best_loss > 0
  );
  const maxSubsetClusters = Math.min(10, subsetPointRows.length);
  const subsetClusterUpper = Math.max(2, maxSubsetClusters);
  const kSubsetControl = rangeControl(
    "K clusters (>=1000-iter subset)",
    2,
    subsetClusterUpper,
    1,
    Number.isFinite(Number(options.optimizerClustersK1000))
      ? Math.max(2, Math.min(subsetClusterUpper, Number(options.optimizerClustersK1000)))
      : Math.min(4, subsetClusterUpper)
  );
  if (subsetPointRows.length < 2) kSubsetControl.input.disabled = true;
  controls.append(kControl.node);
  subsetControlHost.append(el("strong", "Subset controls"), kSubsetControl.node);

  function refresh() {
    const mainFilteredRows = pointRows.filter(
      (row) => Number.isFinite(row.eval_best_loss) && row.eval_best_loss > 0
    );
    const mainFilteredCount = mainFilteredRows.length;
    const activeMaxClusters = Math.min(maxClusters, mainFilteredCount);

    kControl.output.textContent = String(Math.round(Number(kControl.input.value)));
    const k = mainFilteredCount >= 2 ? Math.max(2, Math.min(activeMaxClusters, Math.round(Number(kControl.input.value) || 2))) : 2;
    kControl.input.value = String(k);
    if (subsetPointRows.length >= 2) {
      kSubsetControl.output.textContent = String(Math.round(Number(kSubsetControl.input.value)));
    } else {
      kSubsetControl.output.textContent = "n/a";
    }

    clearNode(chartHost);
    clearNode(centroidHost);
    clearNode(clustersHost);

    if (mainFilteredCount >= 2) {
      const featureVectors = mainFilteredRows.map((row) => [row.beta2_norm, row.wd_norm, row.lr_norm]);
      const {assignments, centers} = runKMeans3(featureVectors, k, 80);
      const mainBestEvalLogMin = d3.min(mainFilteredRows, (row) => Math.log10(row.eval_best_loss)) ?? -6;
      const mainBestEvalLogMax = d3.max(mainFilteredRows, (row) => Math.log10(row.eval_best_loss)) ?? 0;

      const clusteredRows = mainFilteredRows.map((row, idx) => {
        const clusterId = assignments[idx] + 1;
        return {
          ...row,
          cluster_id: clusterId,
          cluster_label: `Cluster ${clusterId}`
        };
      });

      const grouped = d3
        .groups(clusteredRows, (row) => row.cluster_id)
        .sort((a, b) => d3.ascending(a[0], b[0]));

    const parallelAxisSpecs = [
      {
        key: "optimizer_beta2",
        label: "β2",
        normalize(value) {
          return normalize(value, beta2Min, beta2Max);
        },
        denormalize(t) {
          return beta2Min + (beta2Max - beta2Min) * t;
        },
        format(value) {
          return Number.isFinite(value) ? Number(value).toFixed(4) : "n/a";
        }
      },
      {
        key: "optimizer_weight_decay",
        label: "weight decay",
        normalize(value) {
          return normalize(Math.log10(value), wdLogMin, wdLogMax);
        },
        denormalize(t) {
          return 10 ** (wdLogMin + (wdLogMax - wdLogMin) * t);
        },
        format(value) {
          return Number.isFinite(value) ? Number(value).toExponential(1) : "n/a";
        }
      },
      {
        key: "lr_max",
        label: "max LR",
        normalize(value) {
          return normalize(Math.log10(value), lrLogMin, lrLogMax);
        },
        denormalize(t) {
          return 10 ** (lrLogMin + (lrLogMax - lrLogMin) * t);
        },
        format(value) {
          return Number.isFinite(value) ? Number(value).toExponential(1) : "n/a";
        }
      },
      {
        key: "final_iteration",
        label: "final iteration",
        normalize(value) {
          return normalize(value, finalIterationMin, finalIterationMax);
        },
        denormalize(t) {
          return finalIterationMin + (finalIterationMax - finalIterationMin) * t;
        },
        format(value) {
          return Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "n/a";
        }
      },
      {
        key: "eval_best_loss",
        label: "log10(best eval loss)",
        normalize(value) {
          return normalize(Math.log10(value), mainBestEvalLogMin, mainBestEvalLogMax);
        },
        denormalize(t) {
          return 10 ** (mainBestEvalLogMin + (mainBestEvalLogMax - mainBestEvalLogMin) * t);
        },
        format(value) {
          return Number.isFinite(value) && value > 0 ? Math.log10(Number(value)).toFixed(3) : "n/a";
        }
      }
    ];
    const axisTicks = [0, 0.25, 0.5, 0.75, 1];
    const parallelAxisRows = parallelAxisSpecs.map((axis, axisIndex) => ({
      axis_index: axisIndex,
      axis_label: axis.label
    }));
    const parallelTickRows = parallelAxisSpecs.flatMap((axis, axisIndex) =>
      axisTicks.map((tick) => ({
        axis_index: axisIndex,
        axis_value_norm: tick,
        tick_label: axis.format(axis.denormalize(tick))
      }))
    );
      const parallelRows = clusteredRows.flatMap((row) =>
        parallelAxisSpecs.map((axis, axisIndex) => ({
          ...row,
          axis_index: axisIndex,
          axis_label: axis.label,
          axis_value_norm: axis.normalize(row[axis.key]),
          axis_value_raw: row[axis.key]
        }))
      );

      chartHost.appendChild(
        Plot.plot({
        title: `K-means Clusters on Swept Hyperparameters (Parallel Coordinates, K=${k})`,
        width: 920,
        height: 420,
        x: {domain: parallelAxisRows.map((row) => row.axis_index), axis: null},
        y: {domain: [-0.08, 1.06], axis: null},
        color: {type: "categorical", scheme: "observable10", legend: true},
        marks: [
          Plot.ruleX(parallelAxisRows, {
            x: "axis_index",
            y1: 0,
            y2: 1,
            stroke: "currentColor",
            strokeOpacity: 0.28
          }),
          Plot.line(parallelRows, {
            x: "axis_index",
            y: "axis_value_norm",
            z: "run_name",
            seriesName: "cluster_label",
            stroke: "cluster_label",
            strokeOpacity: 0.52,
            strokeWidth: 1,
            tip: true,
            title: (d) =>
              `${d.cluster_label}\nSweep # ${Number.isFinite(d.run_number) ? d.run_number : "n/a"} (${d.run_name})\nβ2 ${Number(
                d.optimizer_beta2
              ).toFixed(6)}\nWeight decay ${Number(d.optimizer_weight_decay).toExponential(3)}\nMax LR ${Number(
                d.lr_max
              ).toExponential(3)}\nFinal iteration ${Math.round(d.final_iteration).toLocaleString(
                "en-US"
              )}\nlog10(Best eval loss) ${Math.log10(Number(d.eval_best_loss)).toFixed(3)}`
          }),
          Plot.text(parallelAxisRows, {
            x: "axis_index",
            y: 1.03,
            text: "axis_label",
            textAnchor: "middle",
            fontWeight: "700",
            fontSize: 11,
            fill: "currentColor"
          }),
          Plot.text(parallelTickRows, {
            x: "axis_index",
            y: "axis_value_norm",
            text: "tick_label",
            dx: 6,
            textAnchor: "start",
            fontSize: 9,
            fill: "currentColor",
            opacity: 0.78
          })
        ]
        })
      );

      const groupedById = new Map(grouped);
      const centroidSummaryRows = centers.map((center, idx) => {
        const clusterId = idx + 1;
        const clusterRows = groupedById.get(clusterId) || [];
        const beta2CenterRaw = beta2Min + center[0] * (beta2Max - beta2Min);
        const wdCenterRaw = 10 ** (wdLogMin + center[1] * (wdLogMax - wdLogMin));
        const lrCenterRaw = 10 ** (lrLogMin + center[2] * (lrLogMax - lrLogMin));
        return {
          cluster: `Cluster ${clusterId}`,
          runs: clusterRows.length,
          centroid_beta2: beta2CenterRaw,
          centroid_weight_decay: wdCenterRaw,
          centroid_lr_max: lrCenterRaw,
          mean_beta2: d3.mean(clusterRows, (row) => row.optimizer_beta2),
          mean_weight_decay: d3.mean(clusterRows, (row) => row.optimizer_weight_decay),
          mean_lr: d3.mean(clusterRows, (row) => row.lr_max)
        };
      });

      centroidHost.append(
        el("strong", "Cluster centroids (3-feature k-means) and mean raw values"),
        renderSimpleTable(centroidSummaryRows, [
          {key: "cluster", label: "Cluster"},
          {key: "runs", label: "Runs", align: "right"},
          {key: "centroid_beta2", label: "Centroid β2", align: "right", format: (v) => Number(v).toFixed(6)},
          {
            key: "centroid_weight_decay",
            label: "Centroid Weight Decay",
            align: "right",
            format: (v) => Number(v).toExponential(3)
          },
          {key: "centroid_lr_max", label: "Centroid Max LR", align: "right", format: (v) => Number(v).toExponential(3)},
          {key: "mean_beta2", label: "Mean β2", align: "right", format: (v) => Number(v).toFixed(6)},
          {key: "mean_weight_decay", label: "Mean Weight Decay", align: "right", format: (v) => Number(v).toExponential(3)},
          {key: "mean_lr", label: "Mean LR", align: "right", format: (v) => Number(v).toExponential(3)}
        ])
      );

      for (const [clusterId, clusterRows] of grouped) {
        const clusterLabel = `Cluster ${clusterId}`;
        const meanLr = d3.mean(clusterRows, (row) => row.lr_max);
        const details = collapsible(
          `${clusterLabel} (${clusterRows.length.toLocaleString("en-US")} runs, mean LR ${
            Number.isFinite(meanLr) ? Number(meanLr).toExponential(2) : "n/a"
          })`
        );
        details.appendChild(
          renderSimpleTable(
            clusterRows.map((row) => ({
              run_number: row.run_number,
              run_name: row.run_name,
              optimizer_beta2: row.optimizer_beta2,
              optimizer_weight_decay: row.optimizer_weight_decay,
              lr_max: row.lr_max,
              final_iteration: row.final_iteration,
              final_eval_loss: row.final_eval_loss,
              eval_best_loss: row.eval_best_loss
            })),
            [
              {key: "run_number", label: "Run #", align: "right"},
              {key: "run_name", label: "Run"},
              {key: "optimizer_beta2", label: "β2", align: "right", format: (v) => Number(v).toFixed(6)},
              {key: "optimizer_weight_decay", label: "Weight Decay", align: "right", format: (v) => Number(v).toExponential(3)},
              {key: "lr_max", label: "Max LR", align: "right", format: (v) => Number(v).toExponential(3)},
              {
                key: "final_iteration",
                label: "Final Iteration",
                align: "right",
                format: (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)).toLocaleString("en-US") : "n/a")
              },
              {
                key: "final_eval_loss",
                label: "log10 Final Eval Loss",
                align: "right",
                format: (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.log10(Number(v)).toFixed(3) : "n/a")
              },
              {
                key: "eval_best_loss",
                label: "Eval Best Loss",
                align: "right",
                format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")
              }
            ]
          )
        );
        clustersHost.appendChild(details);
      }
    } else {
      chartHost.appendChild(
        emptyState("Need at least two runs with finite best eval-loss for main clusters.")
      );
    }

    clearNode(subsetChartHost);
    clearNode(subsetCentroidHost);
    clearNode(subsetClustersHost);
    if (subsetPointRows.length < 2) {
      subsetChartHost.appendChild(
        emptyState("Need at least two runs with final iteration >= 1000 and best eval loss to compute subset clusters.")
      );
    } else {
      const subsetK = Math.max(2, Math.min(maxSubsetClusters, Math.round(Number(kSubsetControl.input.value) || 2)));
      kSubsetControl.input.value = String(subsetK);

      const subsetBeta2Min = d3.min(subsetPointRows, (row) => row.optimizer_beta2) ?? beta2Min;
      const subsetBeta2Max = d3.max(subsetPointRows, (row) => row.optimizer_beta2) ?? beta2Max;
      const subsetWdLogMin = d3.min(subsetPointRows, (row) => Math.log10(row.optimizer_weight_decay)) ?? wdLogMin;
      const subsetWdLogMax = d3.max(subsetPointRows, (row) => Math.log10(row.optimizer_weight_decay)) ?? wdLogMax;
      const subsetLrLogMin = d3.min(subsetPointRows, (row) => Math.log10(row.lr_max)) ?? lrLogMin;
      const subsetLrLogMax = d3.max(subsetPointRows, (row) => Math.log10(row.lr_max)) ?? lrLogMax;
      const subsetBestEvalLogMin = d3.min(subsetPointRows, (row) => Math.log10(row.eval_best_loss)) ?? -6;
      const subsetBestEvalLogMax = d3.max(subsetPointRows, (row) => Math.log10(row.eval_best_loss)) ?? 1;

      const subsetRows = subsetPointRows.map((row) => ({
        ...row,
        beta2_subset_norm: normalize(row.optimizer_beta2, subsetBeta2Min, subsetBeta2Max),
        wd_subset_norm: normalize(Math.log10(row.optimizer_weight_decay), subsetWdLogMin, subsetWdLogMax),
        lr_subset_norm: normalize(Math.log10(row.lr_max), subsetLrLogMin, subsetLrLogMax),
        eval_best_subset_norm: normalize(Math.log10(row.eval_best_loss), subsetBestEvalLogMin, subsetBestEvalLogMax)
      }));

      const subsetFeatureVectors = subsetRows.map((row) => [
        row.beta2_subset_norm,
        row.wd_subset_norm,
        row.lr_subset_norm,
        row.eval_best_subset_norm
      ]);
      const {assignments: subsetAssignments, centers: subsetCenters} = runKMeans3(subsetFeatureVectors, subsetK, 80);

      const subsetClusteredRows = subsetRows.map((row, idx) => ({
        ...row,
        subset_cluster_id: subsetAssignments[idx] + 1,
        subset_cluster_label: `Subset Cluster ${subsetAssignments[idx] + 1}`
      }));
      const subsetGrouped = d3
        .groups(subsetClusteredRows, (row) => row.subset_cluster_id)
        .sort((a, b) => d3.ascending(a[0], b[0]));

      const subsetAxisSpecs = [
        {
          key: "optimizer_beta2",
          label: "β2",
          normalize(value) {
            return normalize(value, subsetBeta2Min, subsetBeta2Max);
          },
          denormalize(t) {
            return subsetBeta2Min + (subsetBeta2Max - subsetBeta2Min) * t;
          },
          format(value) {
            return Number.isFinite(value) ? Number(value).toFixed(4) : "n/a";
          }
        },
        {
          key: "optimizer_weight_decay",
          label: "weight decay",
          normalize(value) {
            return normalize(Math.log10(value), subsetWdLogMin, subsetWdLogMax);
          },
          denormalize(t) {
            return 10 ** (subsetWdLogMin + (subsetWdLogMax - subsetWdLogMin) * t);
          },
          format(value) {
            return Number.isFinite(value) ? Number(value).toExponential(1) : "n/a";
          }
        },
        {
          key: "lr_max",
          label: "max LR",
          normalize(value) {
            return normalize(Math.log10(value), subsetLrLogMin, subsetLrLogMax);
          },
          denormalize(t) {
            return 10 ** (subsetLrLogMin + (subsetLrLogMax - subsetLrLogMin) * t);
          },
          format(value) {
            return Number.isFinite(value) ? Number(value).toExponential(1) : "n/a";
          }
        },
        {
          key: "eval_best_loss",
          label: "log10(best eval loss)",
          normalize(value) {
            return normalize(Math.log10(value), subsetBestEvalLogMin, subsetBestEvalLogMax);
          },
          denormalize(t) {
            return 10 ** (subsetBestEvalLogMin + (subsetBestEvalLogMax - subsetBestEvalLogMin) * t);
          },
          format(value) {
            return Number.isFinite(value) && value > 0 ? Math.log10(Number(value)).toFixed(3) : "n/a";
          }
        }
      ];
      const subsetAxisTicks = [0, 0.25, 0.5, 0.75, 1];
      const subsetAxisRows = subsetAxisSpecs.map((axis, axisIndex) => ({
        axis_index: axisIndex,
        axis_label: axis.label
      }));
      const subsetTickRows = subsetAxisSpecs.flatMap((axis, axisIndex) =>
        subsetAxisTicks.map((tick) => ({
          axis_index: axisIndex,
          axis_value_norm: tick,
          tick_label: axis.format(axis.denormalize(tick))
        }))
      );
      const subsetParallelRows = subsetClusteredRows.flatMap((row) =>
        subsetAxisSpecs.map((axis, axisIndex) => ({
          ...row,
          axis_index: axisIndex,
          axis_value_norm: axis.normalize(row[axis.key])
        }))
      );

      subsetChartHost.appendChild(
        Plot.plot({
          title: `Runs with final iteration >= 1000: K-means clusters (Parallel Coordinates, K=${subsetK})`,
          width: 920,
          height: 420,
          x: {domain: subsetAxisRows.map((row) => row.axis_index), axis: null},
          y: {domain: [-0.08, 1.06], axis: null},
          color: {type: "categorical", scheme: "observable10", legend: true},
          marks: [
            Plot.ruleX(subsetAxisRows, {
              x: "axis_index",
              y1: 0,
              y2: 1,
              stroke: "currentColor",
              strokeOpacity: 0.28
            }),
            Plot.line(subsetParallelRows, {
              x: "axis_index",
              y: "axis_value_norm",
              z: "run_name",
              seriesName: "subset_cluster_label",
              stroke: "subset_cluster_label",
              strokeOpacity: 0.52,
              strokeWidth: 1,
              tip: true,
              title: (d) =>
                `${d.subset_cluster_label}\nSweep # ${Number.isFinite(d.run_number) ? d.run_number : "n/a"} (${d.run_name})\nβ2 ${Number(
                  d.optimizer_beta2
                ).toFixed(6)}\nWeight decay ${Number(d.optimizer_weight_decay).toExponential(3)}\nMax LR ${Number(
                  d.lr_max
                ).toExponential(3)}\nlog10(Best eval loss) ${Math.log10(Number(d.eval_best_loss)).toFixed(3)}`
            }),
            Plot.text(subsetAxisRows, {
              x: "axis_index",
              y: 1.03,
              text: "axis_label",
              textAnchor: "middle",
              fontWeight: "700",
              fontSize: 11,
              fill: "currentColor"
            }),
            Plot.text(subsetTickRows, {
              x: "axis_index",
              y: "axis_value_norm",
              text: "tick_label",
              dx: 6,
              textAnchor: "start",
              fontSize: 9,
              fill: "currentColor",
              opacity: 0.78
            })
          ]
        })
      );

      const subsetGroupedById = new Map(subsetGrouped);
      const subsetCentroidSummaryRows = subsetCenters.map((center, idx) => {
        const clusterId = idx + 1;
        const clusterRows = subsetGroupedById.get(clusterId) || [];
        const beta2CenterRaw = subsetBeta2Min + center[0] * (subsetBeta2Max - subsetBeta2Min);
        const wdCenterRaw = 10 ** (subsetWdLogMin + center[1] * (subsetWdLogMax - subsetWdLogMin));
        const lrCenterRaw = 10 ** (subsetLrLogMin + center[2] * (subsetLrLogMax - subsetLrLogMin));
        const bestEvalCenterRaw = 10 ** (subsetBestEvalLogMin + center[3] * (subsetBestEvalLogMax - subsetBestEvalLogMin));
        return {
          cluster: `Subset Cluster ${clusterId}`,
          runs: clusterRows.length,
          centroid_beta2: beta2CenterRaw,
          centroid_weight_decay: wdCenterRaw,
          centroid_lr_max: lrCenterRaw,
          centroid_eval_best_loss: bestEvalCenterRaw,
          mean_beta2: d3.mean(clusterRows, (row) => row.optimizer_beta2),
          mean_weight_decay: d3.mean(clusterRows, (row) => row.optimizer_weight_decay),
          mean_lr: d3.mean(clusterRows, (row) => row.lr_max),
          mean_eval_best_loss: d3.mean(clusterRows, (row) => row.eval_best_loss)
        };
      });

      subsetCentroidHost.append(
        el("strong", ">=1000-iteration subset centroids (4-feature k-means) and means"),
        renderSimpleTable(subsetCentroidSummaryRows, [
          {key: "cluster", label: "Cluster"},
          {key: "runs", label: "Runs", align: "right"},
          {key: "centroid_beta2", label: "Centroid β2", align: "right", format: (v) => Number(v).toFixed(6)},
          {key: "centroid_weight_decay", label: "Centroid Weight Decay", align: "right", format: (v) => Number(v).toExponential(3)},
          {key: "centroid_lr_max", label: "Centroid Max LR", align: "right", format: (v) => Number(v).toExponential(3)},
          {
            key: "centroid_eval_best_loss",
            label: "Centroid Best Eval Loss",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")
          },
          {key: "mean_beta2", label: "Mean β2", align: "right", format: (v) => Number(v).toFixed(6)},
          {key: "mean_weight_decay", label: "Mean Weight Decay", align: "right", format: (v) => Number(v).toExponential(3)},
          {key: "mean_lr", label: "Mean LR", align: "right", format: (v) => Number(v).toExponential(3)},
          {
            key: "mean_eval_best_loss",
            label: "Mean Best Eval Loss",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")
          }
        ])
      );

      for (const [clusterId, clusterRows] of subsetGrouped) {
        const clusterLabel = `Subset Cluster ${clusterId}`;
        const meanBestEval = d3.mean(clusterRows, (row) => row.eval_best_loss);
        const details = collapsible(
          `${clusterLabel} (${clusterRows.length.toLocaleString("en-US")} runs, mean best eval ${
            Number.isFinite(meanBestEval) ? Number(meanBestEval).toFixed(6) : "n/a"
          })`
        );
        details.appendChild(
          renderSimpleTable(
            clusterRows.map((row) => ({
              run_number: row.run_number,
              run_name: row.run_name,
              optimizer_beta2: row.optimizer_beta2,
              optimizer_weight_decay: row.optimizer_weight_decay,
              lr_max: row.lr_max,
              eval_best_loss: row.eval_best_loss,
              final_iteration: row.final_iteration
            })),
            [
              {key: "run_number", label: "Run #", align: "right"},
              {key: "run_name", label: "Run"},
              {key: "optimizer_beta2", label: "β2", align: "right", format: (v) => Number(v).toFixed(6)},
              {key: "optimizer_weight_decay", label: "Weight Decay", align: "right", format: (v) => Number(v).toExponential(3)},
              {key: "lr_max", label: "Max LR", align: "right", format: (v) => Number(v).toExponential(3)},
              {
                key: "eval_best_loss",
                label: "Best Eval Loss",
                align: "right",
                format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")
              },
              {
                key: "final_iteration",
                label: "Final Iteration",
                align: "right",
                format: (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)).toLocaleString("en-US") : "n/a")
              }
            ]
          )
        );
        subsetClustersHost.appendChild(details);
      }
    }

    summaryHost.textContent =
      "Main clusters use normalized [beta2, log10(weight decay), log10(max LR)] for runs with finite best eval loss; " +
      "subset clusters use [beta2, log10(weight decay), log10(max LR), log10(best eval loss)] for runs with final iteration >= 1000.";
  }

  attachInputRefresh(kControl.input, refresh);
  attachInputRefresh(kSubsetControl.input, refresh);
  refresh();
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
  const runNumberValues = enrichedRows.map((row) => Number(row.run_number)).filter((value) => Number.isFinite(value));
  const runNumberMin = d3.min(runNumberValues);
  const runNumberMax = d3.max(runNumberValues);
  const runColorExtent = d3.extent(enrichedRows, (row) => Number(row.run_color));
  const runColorMin = Number.isFinite(runColorExtent[0]) ? Number(runColorExtent[0]) : 1;
  const runColorMax = Number.isFinite(runColorExtent[1]) ? Number(runColorExtent[1]) : runColorMin + 1;
  const sweepColorMin = Number.isFinite(runNumberMin) ? Number(runNumberMin) : runColorMin;
  const sweepColorMax = Number.isFinite(runNumberMax) ? Number(runNumberMax) : runColorMax;
  const sweepColorScale = d3
    .scaleSequential(
      [sweepColorMin, sweepColorMax > sweepColorMin ? sweepColorMax : sweepColorMin + 1],
      interpolateLrContinuous
    )
    .clamp(true);

  const panel = card();
  panel.dataset.section = "optimizer-window-panel";
  const controlsRow = el("div");
  controlsRow.style.display = "grid";
  controlsRow.style.gap = "0.5rem";

  const summaryHost = el("p");
  summaryHost.style.margin = "0";
  const evalHost = el("div");
  evalHost.dataset.section = "optimizer-eval-loss-chart";
  const gradHost = el("div");
  gradHost.dataset.section = "optimizer-grad-norm-chart";
  panel.append(controlsRow, summaryHost, evalHost, gradHost);
  root.appendChild(panel);

  const muTableHost = card();
  muTableHost.dataset.section = "optimizer-rank-correlation-table";
  const muRegressionHost = card();
  muRegressionHost.dataset.section = "optimizer-regression-coefficient-table";
  const muLogisticHost = card();
  muLogisticHost.dataset.section = "optimizer-logistic-regression-table";
  const muQuadrantHost = card();
  muQuadrantHost.dataset.section = "optimizer-quadrant-analysis";
  root.append(muTableHost, muRegressionHost, muLogisticHost, muQuadrantHost);
  const bestEvalLossByRun = new Map(
    Array.from(d3.group(enrichedRows, (row) => row.run_name).entries(), ([runName, runRows]) => {
      const bestFromMetric = d3.min(
        runRows
          .map((row) => (Number.isFinite(row.eval_best_loss) && row.eval_best_loss > 0 ? row.eval_best_loss : NaN))
          .filter((value) => Number.isFinite(value))
      );
      const bestFromEval = d3.min(
        runRows
          .map((row) => (Number.isFinite(row.eval_loss) && row.eval_loss > 0 ? row.eval_loss : NaN))
          .filter((value) => Number.isFinite(value))
      );
      const best =
        Number.isFinite(bestFromMetric) && Number.isFinite(bestFromEval)
          ? Math.min(bestFromMetric, bestFromEval)
          : Number.isFinite(bestFromMetric)
            ? bestFromMetric
            : Number.isFinite(bestFromEval)
              ? bestFromEval
              : NaN;
      return [runName, best];
    })
  );
  controlsRow.style.display = "none";

  function pearsonCorrelation(valuesA, valuesB) {
    if (valuesA.length !== valuesB.length || valuesA.length < 2) return NaN;
    const meanA = d3.mean(valuesA);
    const meanB = d3.mean(valuesB);
    if (!Number.isFinite(meanA) || !Number.isFinite(meanB)) return NaN;
    let covariance = 0;
    let varianceA = 0;
    let varianceB = 0;
    for (let idx = 0; idx < valuesA.length; idx += 1) {
      const da = valuesA[idx] - meanA;
      const db = valuesB[idx] - meanB;
      covariance += da * db;
      varianceA += da * da;
      varianceB += db * db;
    }
    if (!(varianceA > 0) || !(varianceB > 0)) return NaN;
    return covariance / Math.sqrt(varianceA * varianceB);
  }

  function averageTieRanks(values) {
    const indexed = values.map((value, idx) => ({value, idx})).sort((a, b) => d3.ascending(a.value, b.value));
    const ranks = new Array(values.length).fill(NaN);
    let cursor = 0;
    while (cursor < indexed.length) {
      let end = cursor + 1;
      while (end < indexed.length && indexed[end].value === indexed[cursor].value) end += 1;
      const averageRank = (cursor + 1 + end) / 2;
      for (let i = cursor; i < end; i += 1) ranks[indexed[i].idx] = averageRank;
      cursor = end;
    }
    return ranks;
  }

  function spearmanCorrelation(valuesA, valuesB) {
    if (valuesA.length !== valuesB.length || valuesA.length < 2) return NaN;
    return pearsonCorrelation(averageTieRanks(valuesA), averageTieRanks(valuesB));
  }

  function buildMuCheckpointRows(iterationTarget) {
    const detailedRows = [];
    for (const [runName, runRows] of d3.group(enrichedRows, (row) => row.run_name)) {
      let sample = null;
      for (const row of runRows) {
        if (!(Number.isFinite(row.step))) continue;
        if (row.step === iterationTarget) sample = row;
      }
      if (!sample) continue;
      detailedRows.push({
        run_name: runName,
        run_number: sample.run_number,
        sampled_step: sample.step,
        sweep_metric_m: Number.isFinite(sample.sweep_metric_m) ? sample.sweep_metric_m : NaN,
        eval_loss: Number.isFinite(sample.eval_loss) && sample.eval_loss > 0 ? sample.eval_loss : NaN,
        eval_best_loss: bestEvalLossByRun.get(runName)
      });
    }
    return detailedRows.sort((a, b) => d3.ascending(a.run_number, b.run_number) || d3.ascending(a.run_name, b.run_name));
  }

  function solveLinearSystem3x3(matrix, vector) {
    const a = matrix.map((row, rowIdx) => [...row, vector[rowIdx]]);
    const n = 3;
    const EPS = 1e-12;
    for (let pivot = 0; pivot < n; pivot += 1) {
      let pivotRow = pivot;
      for (let row = pivot + 1; row < n; row += 1) {
        if (Math.abs(a[row][pivot]) > Math.abs(a[pivotRow][pivot])) pivotRow = row;
      }
      if (Math.abs(a[pivotRow][pivot]) < EPS) return null;
      if (pivotRow !== pivot) {
        const tmp = a[pivot];
        a[pivot] = a[pivotRow];
        a[pivotRow] = tmp;
      }
      const pivotValue = a[pivot][pivot];
      for (let col = pivot; col <= n; col += 1) {
        a[pivot][col] /= pivotValue;
      }
      for (let row = 0; row < n; row += 1) {
        if (row === pivot) continue;
        const factor = a[row][pivot];
        if (!Number.isFinite(factor) || Math.abs(factor) < EPS) continue;
        for (let col = pivot; col <= n; col += 1) {
          a[row][col] -= factor * a[pivot][col];
        }
      }
    }
    return [a[0][n], a[1][n], a[2][n]];
  }

  function invert3x3(matrix) {
    const inv = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    for (let col = 0; col < 3; col += 1) {
      const unit = [0, 0, 0];
      unit[col] = 1;
      const solution = solveLinearSystem3x3(matrix, unit);
      if (!solution) return null;
      for (let row = 0; row < 3; row += 1) inv[row][col] = solution[row];
    }
    return inv;
  }

  function multiply3x3(a, b) {
    const out = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        let total = 0;
        for (let k = 0; k < 3; k += 1) total += a[i][k] * b[k][j];
        out[i][j] = total;
      }
    }
    return out;
  }

  function transpose3x3(matrix) {
    return [
      [matrix[0][0], matrix[1][0], matrix[2][0]],
      [matrix[0][1], matrix[1][1], matrix[2][1]],
      [matrix[0][2], matrix[1][2], matrix[2][2]]
    ];
  }

  function fitMuEvalRegression(rows) {
    if (rows.length < 3) return null;
    const usedRows = [];
    let n = 0;
    let sumM = 0;
    let sumE = 0;
    let sumY = 0;
    let sumMM = 0;
    let sumEE = 0;
    let sumME = 0;
    let sumMY = 0;
    let sumEY = 0;
    for (const row of rows) {
      const m = row.sweep_metric_m;
      const e = row.eval_loss;
      const y = row.eval_best_loss;
      if (!(Number.isFinite(m) && Number.isFinite(e) && Number.isFinite(y) && e > 0 && y > 0)) continue;
      usedRows.push({m, e, y});
      n += 1;
      sumM += m;
      sumE += e;
      sumY += y;
      sumMM += m * m;
      sumEE += e * e;
      sumME += m * e;
      sumMY += m * y;
      sumEY += e * y;
    }
    if (n < 3) return null;
    const xtx = [
      [n, sumM, sumE],
      [sumM, sumMM, sumME],
      [sumE, sumME, sumEE]
    ];
    const coefficients = solveLinearSystem3x3(xtx, [sumY, sumMY, sumEY]);
    if (!coefficients) return null;
    const xtxInv = invert3x3(xtx);
    let interceptSe = NaN;
    let coefMSe = NaN;
    let coefEvalSe = NaN;
    if (xtxInv && n > 3) {
      let sse = 0;
      for (const row of usedRows) {
        const predicted = coefficients[0] + coefficients[1] * row.m + coefficients[2] * row.e;
        const residual = row.y - predicted;
        sse += residual * residual;
      }
      const sigma2 = sse / Math.max(1, n - 3);
      interceptSe = Math.sqrt(Math.max(0, sigma2 * xtxInv[0][0]));
      coefMSe = Math.sqrt(Math.max(0, sigma2 * xtxInv[1][1]));
      coefEvalSe = Math.sqrt(Math.max(0, sigma2 * xtxInv[2][2]));
    }
    const z95 = 1.96;
    const intercept = coefficients[0];
    const coefM = coefficients[1];
    const coefEval = coefficients[2];
    return {
      intercept,
      coef_m: coefM,
      coef_eval: coefEval,
      intercept_se: interceptSe,
      coef_m_se: coefMSe,
      coef_eval_se: coefEvalSe,
      intercept_ci_low: Number.isFinite(interceptSe) ? intercept - z95 * interceptSe : NaN,
      intercept_ci_high: Number.isFinite(interceptSe) ? intercept + z95 * interceptSe : NaN,
      coef_m_ci_low: Number.isFinite(coefMSe) ? coefM - z95 * coefMSe : NaN,
      coef_m_ci_high: Number.isFinite(coefMSe) ? coefM + z95 * coefMSe : NaN,
      coef_eval_ci_low: Number.isFinite(coefEvalSe) ? coefEval - z95 * coefEvalSe : NaN,
      coef_eval_ci_high: Number.isFinite(coefEvalSe) ? coefEval + z95 * coefEvalSe : NaN,
      sample_size: n
    };
  }

  function sigmoid(value) {
    if (value >= 0) {
      const z = Math.exp(-value);
      return 1 / (1 + z);
    }
    const z = Math.exp(value);
    return z / (1 + z);
  }

  function fitLogisticRegressionAt125(rows, targetKey) {
    const samples = rows
      .filter(
        (row) =>
          Number.isFinite(row.sweep_metric_m) &&
          Number.isFinite(row.eval_loss) &&
          row.eval_loss > 0 &&
          (row[targetKey] === 0 || row[targetKey] === 1)
      )
      .map((row) => ({
        m: row.sweep_metric_m,
        e: row.eval_loss,
        y: row[targetKey]
      }));

    if (samples.length < 6) return null;
    const positives = d3.sum(samples, (row) => row.y);
    const negatives = samples.length - positives;
    if (positives === 0 || negatives === 0) return null;

    const mMean = d3.mean(samples, (row) => row.m) ?? 0;
    const eMean = d3.mean(samples, (row) => row.e) ?? 0;
    const mStdRaw = d3.deviation(samples, (row) => row.m) ?? 0;
    const eStdRaw = d3.deviation(samples, (row) => row.e) ?? 0;
    const mStd = mStdRaw > 1e-12 ? mStdRaw : 1;
    const eStd = eStdRaw > 1e-12 ? eStdRaw : 1;

    let beta = [0, 0, 0];
    let converged = false;
    const maxIterations = 60;
    const ridge = 1e-6;

    for (let iter = 0; iter < maxIterations; iter += 1) {
      const xtwx = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
      ];
      const xtwz = [0, 0, 0];

      for (const row of samples) {
        const mz = (row.m - mMean) / mStd;
        const ez = (row.e - eMean) / eStd;
        const x = [1, mz, ez];
        const eta = beta[0] + beta[1] * x[1] + beta[2] * x[2];
        const p = Math.max(1e-8, Math.min(1 - 1e-8, sigmoid(eta)));
        const w = Math.max(1e-8, p * (1 - p));
        const z = eta + (row.y - p) / w;

        for (let a = 0; a < 3; a += 1) {
          xtwz[a] += x[a] * w * z;
          for (let b = 0; b < 3; b += 1) {
            xtwx[a][b] += x[a] * w * x[b];
          }
        }
      }

      xtwx[1][1] += ridge;
      xtwx[2][2] += ridge;
      const nextBeta = solveLinearSystem3x3(xtwx, xtwz);
      if (!nextBeta) break;

      const delta = Math.max(
        Math.abs(nextBeta[0] - beta[0]),
        Math.abs(nextBeta[1] - beta[1]),
        Math.abs(nextBeta[2] - beta[2])
      );
      beta = nextBeta;
      if (delta < 1e-7) {
        converged = true;
        break;
      }
    }

    const coefMRaw = beta[1] / mStd;
    const coefEvalRaw = beta[2] / eStd;
    const interceptRaw = beta[0] - (beta[1] * mMean) / mStd - (beta[2] * eMean) / eStd;
    let interceptSe = NaN;
    let coefMSe = NaN;
    let coefEvalSe = NaN;
    const xtwxFinal = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    for (const row of samples) {
      const mz = (row.m - mMean) / mStd;
      const ez = (row.e - eMean) / eStd;
      const x = [1, mz, ez];
      const eta = beta[0] + beta[1] * x[1] + beta[2] * x[2];
      const p = Math.max(1e-8, Math.min(1 - 1e-8, sigmoid(eta)));
      const w = Math.max(1e-8, p * (1 - p));
      for (let a = 0; a < 3; a += 1) {
        for (let b = 0; b < 3; b += 1) {
          xtwxFinal[a][b] += x[a] * w * x[b];
        }
      }
    }
    xtwxFinal[1][1] += ridge;
    xtwxFinal[2][2] += ridge;
    const covStd = invert3x3(xtwxFinal);
    if (covStd) {
      const jacobian = [
        [1, -mMean / mStd, -eMean / eStd],
        [0, 1 / mStd, 0],
        [0, 0, 1 / eStd]
      ];
      const covRaw = multiply3x3(multiply3x3(jacobian, covStd), transpose3x3(jacobian));
      interceptSe = Math.sqrt(Math.max(0, covRaw[0][0]));
      coefMSe = Math.sqrt(Math.max(0, covRaw[1][1]));
      coefEvalSe = Math.sqrt(Math.max(0, covRaw[2][2]));
    }
    const z95 = 1.96;
    const interceptCiLow = Number.isFinite(interceptSe) ? interceptRaw - z95 * interceptSe : NaN;
    const interceptCiHigh = Number.isFinite(interceptSe) ? interceptRaw + z95 * interceptSe : NaN;
    const coefMCiLow = Number.isFinite(coefMSe) ? coefMRaw - z95 * coefMSe : NaN;
    const coefMCiHigh = Number.isFinite(coefMSe) ? coefMRaw + z95 * coefMSe : NaN;
    const coefEvalCiLow = Number.isFinite(coefEvalSe) ? coefEvalRaw - z95 * coefEvalSe : NaN;
    const coefEvalCiHigh = Number.isFinite(coefEvalSe) ? coefEvalRaw + z95 * coefEvalSe : NaN;
    return {
      sample_size: samples.length,
      positives,
      negatives,
      converged,
      intercept: interceptRaw,
      coef_m: coefMRaw,
      coef_eval: coefEvalRaw,
      intercept_se: interceptSe,
      coef_m_se: coefMSe,
      coef_eval_se: coefEvalSe,
      intercept_ci_low: interceptCiLow,
      intercept_ci_high: interceptCiHigh,
      coef_m_ci_low: coefMCiLow,
      coef_m_ci_high: coefMCiHigh,
      coef_eval_ci_low: coefEvalCiLow,
      coef_eval_ci_high: coefEvalCiHigh,
      odds_ratio_m: Math.exp(coefMRaw),
      odds_ratio_eval: Math.exp(coefEvalRaw),
      odds_ratio_m_ci_low: Number.isFinite(coefMCiLow) ? Math.exp(coefMCiLow) : NaN,
      odds_ratio_m_ci_high: Number.isFinite(coefMCiHigh) ? Math.exp(coefMCiHigh) : NaN,
      odds_ratio_eval_ci_low: Number.isFinite(coefEvalCiLow) ? Math.exp(coefEvalCiLow) : NaN,
      odds_ratio_eval_ci_high: Number.isFinite(coefEvalCiHigh) ? Math.exp(coefEvalCiHigh) : NaN
    };
  }

  function renderMuCheckpointTables() {
    clearNode(muTableHost);
    const checkpoints = [125, 275, 525, 1000];
    const sectionRows = checkpoints.map((iteration) => ({
      iteration,
      rows: buildMuCheckpointRows(iteration)
    }));

    const summaryRows = sectionRows.map(({iteration, rows}) => {
      const muEvalPairs = rows.filter(
        (row) => Number.isFinite(row.sweep_metric_m) && Number.isFinite(row.eval_loss) && row.eval_loss > 0
      );
      return {
        iteration,
        runs_at_iteration: rows.length,
        m_eval_pairs: muEvalPairs.length,
        spearman_m_eval: spearmanCorrelation(
          muEvalPairs.map((row) => row.sweep_metric_m),
          muEvalPairs.map((row) => row.eval_loss)
        )
      };
    });

    muTableHost.appendChild(el("strong", "Sweep Metric M vs Eval Loss at Iteration Checkpoints"));
    const note = el(
      "p",
      "Each checkpoint uses rows exactly at the target iteration; Spearman rank correlation is computed for Sweep Metric M vs Eval Loss."
    );
    note.style.margin = "0";
    note.style.fontSize = "0.9rem";
    note.style.opacity = "0.85";
    muTableHost.appendChild(note);

    muTableHost.appendChild(
      renderSimpleTable(summaryRows, [
        {key: "iteration", label: "Target Iteration", align: "right"},
        {key: "runs_at_iteration", label: "Runs at Iteration", align: "right"},
        {key: "m_eval_pairs", label: "Pairs (M, Eval)", align: "right"},
        {
          key: "spearman_m_eval",
          label: "Spearman(M, Eval)",
          align: "right",
          format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(3) : "n/a")
        }
      ])
    );

    for (const {iteration, rows} of sectionRows) {
      const details = collapsible(
        `Iteration ${iteration.toLocaleString("en-US")} (${rows.length.toLocaleString("en-US")} available run(s))`
      );
      if (rows.length === 0) {
        details.appendChild(emptyState("No runs have data exactly at this checkpoint."));
      } else {
        details.appendChild(
          renderSimpleTable(rows, [
            {key: "run_number", label: "Run #", align: "right"},
            {key: "run_name", label: "Run"},
            {key: "sampled_step", label: "Sampled Step", align: "right"},
            {
              key: "sweep_metric_m",
              label: "Sweep Metric M",
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
              key: "eval_best_loss",
              label: "Eval Best Loss",
              align: "right",
              format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")
            }
          ])
        );
      }
      muTableHost.appendChild(details);
    }
  }

  function renderMuRegressionChart() {
    clearNode(muRegressionHost);
    muRegressionHost.appendChild(el("strong", "Per-Iteration Regression Coefficients for Best Eval Loss"));
    const help = el(
      "p",
      "Model at each iteration: best_eval_loss = intercept + (coef_M * Sweep Metric M) + (coef_Eval * Eval Loss). Error bars show approximate 95% confidence intervals."
    );
    help.style.margin = "0";
    help.style.fontSize = "0.9rem";
    help.style.opacity = "0.85";
    muRegressionHost.appendChild(help);

    const regressionRows = [];
    for (const [iteration, iterRows] of d3.group(enrichedRows, (row) => row.step).entries()) {
      const rowsForRegression = iterRows
        .map((row) => ({
          ...row,
          eval_best_loss: bestEvalLossByRun.get(row.run_name)
        }))
        .filter(
          (row) =>
            Number.isFinite(row.sweep_metric_m) &&
            Number.isFinite(row.eval_loss) &&
            row.eval_loss > 0 &&
            Number.isFinite(row.eval_best_loss) &&
            row.eval_best_loss > 0
        );
      const fit = fitMuEvalRegression(rowsForRegression);
      if (!fit) continue;
      regressionRows.push(
        {
          iteration,
          series: "M coefficient",
          value: fit.coef_m,
          ci_low: fit.coef_m_ci_low,
          ci_high: fit.coef_m_ci_high,
          sample_size: fit.sample_size
        },
        {
          iteration,
          series: "Eval-loss coefficient",
          value: fit.coef_eval,
          ci_low: fit.coef_eval_ci_low,
          ci_high: fit.coef_eval_ci_high,
          sample_size: fit.sample_size
        },
        {
          iteration,
          series: "Intercept",
          value: fit.intercept,
          ci_low: fit.intercept_ci_low,
          ci_high: fit.intercept_ci_high,
          sample_size: fit.sample_size
        }
      );
    }

    regressionRows.sort((a, b) => d3.ascending(a.iteration, b.iteration) || d3.ascending(a.series, b.series));

    if (regressionRows.length === 0) {
      muRegressionHost.appendChild(emptyState("No iterations have enough rows to fit the regression model."));
      return;
    }
    const ciRows = regressionRows.filter(
      (row) => Number.isFinite(row.ci_low) && Number.isFinite(row.ci_high) && row.ci_low <= row.ci_high
    );

    muRegressionHost.appendChild(
      Plot.plot({
        title: "Regression Coefficient Traces by Iteration",
        width: 920,
        height: 360,
        marginBottom: 72,
        x: {label: "Iteration", grid: true},
        y: {label: "Coefficient value", grid: true},
        dataZoom: Plot.dataZoomXY(),
        color: {legend: true},
        marks: [
          Plot.ruleX(ciRows, {
            x: "iteration",
            y1: "ci_low",
            y2: "ci_high",
            stroke: "series",
            strokeOpacity: 0.3
          }),
          Plot.lineY(regressionRows, {x: "iteration", y: "value", stroke: "series", z: "series", strokeWidth: 1})
        ]
      })
    );
  }

  function renderMuLogisticRegression() {
    clearNode(muLogisticHost);
    muLogisticHost.appendChild(el("strong", "Logistic Regression at Iteration 125"));
    const help = el(
      "p",
      "Features at exact step 125: Sweep Metric M and Eval Loss. Targets: survived to at least step 200 and at least step 600. Coefficient and odds-ratio intervals are approximate 95% confidence intervals."
    );
    help.style.margin = "0";
    help.style.fontSize = "0.9rem";
    help.style.opacity = "0.85";
    muLogisticHost.appendChild(help);

    const byRun = d3.group(enrichedRows, (row) => row.run_name);
    const modelRows = [];
    for (const [runName, runRows] of byRun) {
      let at125 = null;
      let finalIteration = NaN;
      let runNum = NaN;
      for (const row of runRows) {
        if (Number.isFinite(row.step) && (!Number.isFinite(finalIteration) || row.step > finalIteration)) {
          finalIteration = row.step;
        }
        if (!Number.isFinite(runNum) && Number.isFinite(row.run_number)) runNum = row.run_number;
        if (Number.isFinite(row.step) && row.step === 125) at125 = row;
      }
      if (!at125) continue;
      modelRows.push({
        run_name: runName,
        run_number: Number.isFinite(at125.run_number) ? at125.run_number : runNum,
        final_iteration: finalIteration,
        sweep_metric_m: at125.sweep_metric_m,
        eval_loss: at125.eval_loss,
        survived_200: Number.isFinite(finalIteration) && finalIteration >= 200 ? 1 : 0,
        survived_600: Number.isFinite(finalIteration) && finalIteration >= 600 ? 1 : 0
      });
    }

    modelRows.sort((a, b) => d3.ascending(a.run_number, b.run_number) || d3.ascending(a.run_name, b.run_name));
    if (modelRows.length === 0) {
      muLogisticHost.appendChild(emptyState("No runs have feature rows exactly at iteration 125."));
      return;
    }

    const fit200 = fitLogisticRegressionAt125(modelRows, "survived_200");
    const fit600 = fitLogisticRegressionAt125(modelRows, "survived_600");
    function intervalText(low, high, digits = 6) {
      if (!Number.isFinite(low) || !Number.isFinite(high)) return "n/a";
      return `[${Number(low).toFixed(digits)}, ${Number(high).toFixed(digits)}]`;
    }
    function fmtNumber(value, digits) {
      return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "n/a";
    }
    function fmtInt(value) {
      return Number.isFinite(Number(value)) ? Number(value).toFixed(0) : "n/a";
    }
    function targetValue(model, key) {
      if (!model) return "n/a";
      if (key === "converged") return model.converged ? "yes" : "no";
      if (key === "available_runs") return fmtInt(modelRows.length);
      if (key === "fit_runs") return fmtInt(model.sample_size);
      if (key === "positives") return fmtInt(model.positives);
      if (key === "negatives") return fmtInt(model.negatives);
      if (key === "intercept") return fmtNumber(model.intercept, 6);
      if (key === "coef_m") return fmtNumber(model.coef_m, 6);
      if (key === "coef_eval") return fmtNumber(model.coef_eval, 6);
      if (key === "odds_ratio_m") return fmtNumber(model.odds_ratio_m, 4);
      if (key === "odds_ratio_eval") return fmtNumber(model.odds_ratio_eval, 4);
      if (key === "intercept_ci") return intervalText(model.intercept_ci_low, model.intercept_ci_high, 6);
      if (key === "coef_m_ci") return intervalText(model.coef_m_ci_low, model.coef_m_ci_high, 6);
      if (key === "coef_eval_ci") return intervalText(model.coef_eval_ci_low, model.coef_eval_ci_high, 6);
      if (key === "odds_ratio_m_ci") return intervalText(model.odds_ratio_m_ci_low, model.odds_ratio_m_ci_high, 4);
      if (key === "odds_ratio_eval_ci") return intervalText(model.odds_ratio_eval_ci_low, model.odds_ratio_eval_ci_high, 4);
      return "n/a";
    }
    const summaryRows = [
      {metric: "Runs @125", key: "available_runs"},
      {metric: "Fit Runs", key: "fit_runs"},
      {metric: "Positive", key: "positives"},
      {metric: "Negative", key: "negatives"},
      {metric: "Converged", key: "converged"},
      {metric: "Intercept", key: "intercept"},
      {metric: "Intercept 95% CI", key: "intercept_ci"},
      {metric: "Coef M", key: "coef_m"},
      {metric: "Coef M 95% CI", key: "coef_m_ci"},
      {metric: "Odds Ratio M", key: "odds_ratio_m"},
      {metric: "Odds Ratio M 95% CI", key: "odds_ratio_m_ci"},
      {metric: "Coef Eval Loss", key: "coef_eval"},
      {metric: "Coef Eval 95% CI", key: "coef_eval_ci"},
      {metric: "Odds Ratio Eval", key: "odds_ratio_eval"},
      {metric: "Odds Ratio Eval 95% CI", key: "odds_ratio_eval_ci"}
    ].map((row) => ({
      metric: row.metric,
      survive_200: targetValue(fit200, row.key),
      survive_600: targetValue(fit600, row.key)
    }));
    muLogisticHost.appendChild(
      renderSimpleTable(summaryRows, [
        {key: "metric", label: "Metric"},
        {key: "survive_200", label: "Survive >= 200", align: "right"},
        {key: "survive_600", label: "Survive >= 600", align: "right"}
      ])
    );

    function predictedProbability(row, fit) {
      if (!fit) return NaN;
      const logit = fit.intercept + fit.coef_m * row.sweep_metric_m + fit.coef_eval * row.eval_loss;
      return sigmoid(logit);
    }

    const details200 = collapsible("expand to view per-run probabilities (target: survive >= 200)");
    details200.appendChild(
      renderSimpleTable(
        modelRows.map((row) => ({
          run_number: row.run_number,
          run_name: row.run_name,
          final_iteration: row.final_iteration,
          sweep_metric_m: row.sweep_metric_m,
          eval_loss: row.eval_loss,
          survived_200: row.survived_200,
          p_survive_200: predictedProbability(row, fit200)
        })),
        [
          {key: "run_number", label: "Run #", align: "right"},
          {key: "run_name", label: "Run"},
          {key: "final_iteration", label: "Final Iter", align: "right"},
          {key: "sweep_metric_m", label: "M @125", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")},
          {key: "eval_loss", label: "Eval @125", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")},
          {key: "survived_200", label: "Observed", align: "right"},
          {key: "p_survive_200", label: "Pred P", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(4) : "n/a")}
        ]
      )
    );
    muLogisticHost.appendChild(details200);

    const details600 = collapsible("expand to view per-run probabilities (target: survive >= 600)");
    details600.appendChild(
      renderSimpleTable(
        modelRows.map((row) => ({
          run_number: row.run_number,
          run_name: row.run_name,
          final_iteration: row.final_iteration,
          sweep_metric_m: row.sweep_metric_m,
          eval_loss: row.eval_loss,
          survived_600: row.survived_600,
          p_survive_600: predictedProbability(row, fit600)
        })),
        [
          {key: "run_number", label: "Run #", align: "right"},
          {key: "run_name", label: "Run"},
          {key: "final_iteration", label: "Final Iter", align: "right"},
          {key: "sweep_metric_m", label: "M @125", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")},
          {key: "eval_loss", label: "Eval @125", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")},
          {key: "survived_600", label: "Observed", align: "right"},
          {key: "p_survive_600", label: "Pred P", align: "right", format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(4) : "n/a")}
        ]
      )
    );
    muLogisticHost.appendChild(details600);
  }

  function renderMuQuadrantAnalysis() {
    clearNode(muQuadrantHost);
    muQuadrantHost.appendChild(el("strong", "Quadrant Analysis: M vs Eval Loss at Iteration 125"));
    const help = el(
      "p",
      "Runs split at the median of Sweep Metric M and Eval Loss at step 125. " +
        "Since Hyperband minimizes M, \u201cGood M\u201d (below median) marks runs Hyperband favored. " +
        "The \u2605 quadrant highlights runs with high eval loss that M nonetheless kept alive. " +
        "Point color maps to final iteration with a warm sequential scale. " +
        "Use the x/y dataZoom sliders to define the active quadrant window."
    );
    help.style.margin = "0";
    help.style.fontSize = "0.9rem";
    help.style.opacity = "0.85";
    muQuadrantHost.appendChild(help);

    const byRun = d3.group(enrichedRows, (row) => row.run_name);
    const allQuadrantRows = [];
    for (const [runName, runRows] of byRun) {
      let at125 = null;
      let finalIteration = NaN;
      let runNum = NaN;
      for (const row of runRows) {
        if (Number.isFinite(row.step) && (!Number.isFinite(finalIteration) || row.step > finalIteration)) {
          finalIteration = row.step;
        }
        if (!Number.isFinite(runNum) && Number.isFinite(row.run_number)) runNum = row.run_number;
        if (Number.isFinite(row.step) && row.step === 125) at125 = row;
      }
      if (!at125) continue;
      if (!Number.isFinite(at125.sweep_metric_m) || !Number.isFinite(at125.eval_loss) || at125.eval_loss <= 0) continue;
      allQuadrantRows.push({
        run_name: runName,
        run_number: Number.isFinite(at125.run_number) ? at125.run_number : runNum,
        run_color: Number.isFinite(at125.run_color) ? at125.run_color : runIndexByName.get(runName),
        final_iteration: finalIteration,
        sweep_metric_m: at125.sweep_metric_m,
        eval_loss: at125.eval_loss,
        survived_200: Number.isFinite(finalIteration) && finalIteration >= 200 ? 1 : 0,
        survived_600: Number.isFinite(finalIteration) && finalIteration >= 600 ? 1 : 0,
        best_eval_loss: bestEvalLossByRun.get(runName)
      });
    }

    if (allQuadrantRows.length === 0) {
      muQuadrantHost.appendChild(emptyState("No runs with both M and eval loss at iteration 125."));
      return;
    }

    const fullMMin = d3.min(allQuadrantRows, (row) => row.sweep_metric_m);
    const fullMMax = d3.max(allQuadrantRows, (row) => row.sweep_metric_m);
    const fullEvalMin = d3.min(allQuadrantRows, (row) => row.eval_loss);
    const fullEvalMax = d3.max(allQuadrantRows, (row) => row.eval_loss);
    if (
      !Number.isFinite(fullMMin) ||
      !Number.isFinite(fullMMax) ||
      !Number.isFinite(fullEvalMin) ||
      !Number.isFinite(fullEvalMax)
    ) {
      muQuadrantHost.appendChild(emptyState("Unable to derive valid eval/M ranges for quadrant analysis."));
      return;
    }

    const summaryLine = el("p");
    summaryLine.style.margin = "0";
    summaryLine.style.fontSize = "0.85rem";
    summaryLine.style.opacity = "0.8";
    muQuadrantHost.appendChild(summaryLine);

    const chartHost = el("div");
    chartHost.style.minHeight = "450px";
    chartHost.style.maxWidth = "100%";
    chartHost.style.overflowX = "auto";
    chartHost.style.contain = "layout paint";
    const tableHost = el("div");
    tableHost.style.minHeight = "150px";
    tableHost.style.maxWidth = "100%";
    tableHost.style.overflowX = "auto";
    tableHost.style.contain = "layout paint";
    muQuadrantHost.append(chartHost, tableHost);

    const quadrantOrder = [
      "Bad Eval / Good M \u2605",
      "Good Eval / Good M",
      "Good Eval / Bad M",
      "Bad Eval / Bad M"
    ];

    function resolveLinearZoomBounds(zoomOption, minValue, maxValue) {
      let lo = Number(minValue);
      let hi = Number(maxValue);
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [minValue, maxValue];
      if (hi < lo) [lo, hi] = [hi, lo];

      if (zoomOption && Number.isFinite(Number(zoomOption.startValue))) lo = Number(zoomOption.startValue);
      if (zoomOption && Number.isFinite(Number(zoomOption.endValue))) hi = Number(zoomOption.endValue);

      if (!(zoomOption && Number.isFinite(Number(zoomOption.startValue)) && Number.isFinite(Number(zoomOption.endValue)))) {
        const start = Number.isFinite(Number(zoomOption?.start)) ? Number(zoomOption.start) : 0;
        const end = Number.isFinite(Number(zoomOption?.end)) ? Number(zoomOption.end) : 100;
        const clampedStart = Math.max(0, Math.min(100, start));
        const clampedEnd = Math.max(0, Math.min(100, end));
        const span = hi - lo;
        if (span > 0) {
          lo += (Math.min(clampedStart, clampedEnd) / 100) * span;
          hi = Number(minValue) + (Math.max(clampedStart, clampedEnd) / 100) * span;
        }
      }

      if (hi < lo) [lo, hi] = [hi, lo];
      return [lo, hi];
    }

    function classifyQuadrants(rows, medianEval, medianM) {
      return rows.map((row) => {
        const goodM = row.sweep_metric_m <= medianM;
        const goodEval = row.eval_loss <= medianEval;
        let quadrant = "Bad Eval / Bad M";
        if (goodEval && goodM) quadrant = "Good Eval / Good M";
        else if (!goodEval && goodM) quadrant = "Bad Eval / Good M \u2605";
        else if (goodEval && !goodM) quadrant = "Good Eval / Bad M";
        return {...row, quadrant};
      });
    }

    function renderSummaryTableForRows(windowRows, evalBounds, mBounds) {
      clearNode(tableHost);
      summaryLine.textContent =
        `${windowRows.length} of ${allQuadrantRows.length} runs in zoom window` +
        ` (Eval ${Number(evalBounds[0]).toFixed(4)} \u2192 ${Number(evalBounds[1]).toFixed(4)},` +
        ` M ${Number(mBounds[0]).toFixed(4)} \u2192 ${Number(mBounds[1]).toFixed(4)}).`;

      if (windowRows.length < 4) {
        tableHost.appendChild(emptyState("Zoom window contains too few runs for quadrant summary statistics."));
        return;
      }

      const medianM = d3.median(windowRows, (row) => row.sweep_metric_m);
      const medianEval = d3.median(windowRows, (row) => row.eval_loss);
      const classifiedRows = classifyQuadrants(windowRows, medianEval, medianM);
      const quadrantSummary = quadrantOrder.map((q) => {
        const qRows = classifiedRows.filter((row) => row.quadrant === q);
        const survived200 = qRows.filter((row) => row.survived_200).length;
        const survived600 = qRows.filter((row) => row.survived_600).length;
        const bestEvals = qRows.map((row) => row.best_eval_loss).filter(Number.isFinite);
        const surv600Evals = qRows
          .filter((row) => row.survived_600)
          .map((row) => row.best_eval_loss)
          .filter(Number.isFinite);
        return {
          quadrant: q,
          count: qRows.length,
          survived_200: survived200,
          pct_survived_200: qRows.length > 0 ? ((survived200 / qRows.length) * 100).toFixed(1) + "%" : "n/a",
          survived_600: survived600,
          pct_survived_600: qRows.length > 0 ? ((survived600 / qRows.length) * 100).toFixed(1) + "%" : "n/a",
          median_best_eval: d3.median(bestEvals),
          median_surv600_eval: d3.median(surv600Evals)
        };
      });

      tableHost.appendChild(
        renderSimpleTable(quadrantSummary, [
          {key: "quadrant", label: "Quadrant"},
          {key: "count", label: "Runs", align: "right"},
          {key: "survived_200", label: "Surv. 200+", align: "right"},
          {key: "pct_survived_200", label: "% Surv. 200", align: "right"},
          {key: "survived_600", label: "Surv. 600+", align: "right"},
          {key: "pct_survived_600", label: "% Surv. 600", align: "right"},
          {
            key: "median_best_eval",
            label: "Med. Best Eval",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(4) : "n/a")
          },
          {
            key: "median_surv600_eval",
            label: "Med. Best Eval (Surv. 600)",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(4) : "n/a")
          }
        ])
      );
    }

    const baseMedianM = d3.median(allQuadrantRows, (row) => row.sweep_metric_m);
    const baseMedianEval = d3.median(allQuadrantRows, (row) => row.eval_loss);
    const labelData = [
      {x: (fullEvalMin + baseMedianEval) / 2, y: (fullMMin + baseMedianM) / 2, text: "Good Eval\nGood M"},
      {x: (baseMedianEval + fullEvalMax) / 2, y: (fullMMin + baseMedianM) / 2, text: "Bad Eval\nGood M \u2605"},
      {x: (fullEvalMin + baseMedianEval) / 2, y: (baseMedianM + fullMMax) / 2, text: "Good Eval\nBad M"},
      {x: (baseMedianEval + fullEvalMax) / 2, y: (baseMedianM + fullMMax) / 2, text: "Bad Eval\nBad M"}
    ];

    const chartNode = Plot.plot({
      title: "Sweep Metric M vs Eval Loss at Step 125",
      width: 920,
      height: 420,
      marginBottom: 72,
      x: {label: "Eval Loss @125", grid: true},
      y: {label: "Sweep Metric M @125", grid: true},
      dataZoom: Plot.dataZoomXY(),
      color: {legend: false},
      marks: [
        Plot.ruleX([baseMedianEval], {stroke: "currentColor", strokeDasharray: "6 4", strokeOpacity: 0.4}),
        Plot.ruleY([baseMedianM], {stroke: "currentColor", strokeDasharray: "6 4", strokeOpacity: 0.4}),
        Plot.text(labelData, {
          x: "x",
          y: "y",
          text: "text",
          fill: "currentColor",
          fillOpacity: 0.3,
          fontSize: 11,
          fontStyle: "italic",
          textAnchor: "middle"
        }),
        Plot.dot(allQuadrantRows, {
          x: "eval_loss",
          y: "sweep_metric_m",
          fill: (d) => sweepColorScale(d.run_color),
          r: 4,
          opacity: 0.8,
          tip: true,
          title: (d) =>
            `Sweep # ${d.run_number}: ${d.run_name}\nM @125: ${Number(d.sweep_metric_m).toFixed(4)}` +
            `\nEval @125: ${Number(d.eval_loss).toFixed(4)}\nFinal iter: ${d.final_iteration}` +
            `\nBest eval: ${Number.isFinite(d.best_eval_loss) ? Number(d.best_eval_loss).toFixed(4) : "n/a"}`
        })
      ]
    });
    chartHost.appendChild(chartNode);

    const updateFromZoom = (instance) => {
      const model = instance?.getModel?.();
      const zoomModels = model?.queryComponents?.({mainType: "dataZoom"}) || [];
      let xSlider = null;
      let ySlider = null;
      for (const zoomModel of zoomModels) {
        const option = zoomModel?.option;
        if (!option || String(option.type || "") !== "slider") continue;
        if (option.xAxisIndex != null) xSlider = option;
        if (option.yAxisIndex != null) ySlider = option;
      }
      const evalBounds = resolveLinearZoomBounds(xSlider, fullEvalMin, fullEvalMax);
      const mBounds = resolveLinearZoomBounds(ySlider, fullMMin, fullMMax);
      const windowRows = allQuadrantRows.filter(
        (row) =>
          row.eval_loss >= evalBounds[0] &&
          row.eval_loss <= evalBounds[1] &&
          row.sweep_metric_m >= mBounds[0] &&
          row.sweep_metric_m <= mBounds[1]
      );
      renderSummaryTableForRows(windowRows, evalBounds, mBounds);
    };

    const bindZoomListener = () => {
      if (!chartNode.isConnected) return;
      const instance = chartNode.__echart;
      if (!instance) {
        window.setTimeout(bindZoomListener, 250);
        return;
      }
      const onZoom = () => updateFromZoom(instance);
      instance.on("dataZoom", onZoom);
      updateFromZoom(instance);
      const priorCleanup = chartNode.__cleanup;
      chartNode.__cleanup = () => {
        try {
          instance.off("dataZoom", onZoom);
        } catch {
          // noop
        }
        if (typeof priorCleanup === "function") priorCleanup();
      };
    };
    bindZoomListener();
  }

  renderMuCheckpointTables();
  renderMuRegressionChart();
  renderMuLogisticRegression();
  renderMuQuadrantAnalysis();

  const stepDiffs = [];
  for (const [, runRows] of d3.group(enrichedRows, (row) => row.run_name)) {
    const runEval = runRows.filter((row) => Number.isFinite(row.eval_loss) && row.eval_loss > 0);
    for (let idx = 1; idx < runEval.length; idx += 1) {
      const delta = runEval[idx].step - runEval[idx - 1].step;
      if (Number.isFinite(delta) && delta > 0) stepDiffs.push(delta);
    }
  }
  const medianEvalInterval = d3.median(stepDiffs);

  function refresh() {
    const filteredRows = enrichedRows;
    const evalRows = filteredRows.filter((row) => Number.isFinite(row.eval_loss) && row.eval_loss > 0);
    const gradRows = filteredRows.filter((row) => Number.isFinite(row.grad_unclipped) && row.grad_unclipped > 0);

    clearNode(evalHost);
    clearNode(gradHost);

    summaryHost.textContent = `${runNames.length.toLocaleString("en-US")} runs total, ${evalRows.length.toLocaleString(
      "en-US"
    )} eval points, ${gradRows.length.toLocaleString("en-US")} grad points${
      Number.isFinite(medianEvalInterval)
        ? `, median eval interval ${Number(medianEvalInterval).toFixed(0)} iterations`
        : ""
    }.`;

    if (evalRows.length === 0) {
      evalHost.appendChild(emptyState("No eval-loss points remain after current filters."));
    } else {
      const compactLogTick = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? d3.format(".3~g")(n) : "";
      };
      evalHost.appendChild(
        Plot.plot({
          title: "Optimizer Sweep Eval Loss vs Iteration (All Runs)",
          width: 920,
          height: 360,
          x: {label: "Iteration", grid: true},
          y: {type: "log", label: "Eval Loss", grid: true, tickFormat: compactLogTick},
          brush: false,
          dataZoom: Plot.dataZoomXY(),
          legend: false,
          color: {legend: false},
          marks: [
            Plot.lineY(evalRows, {
              x: "step",
              y: "eval_loss",
              z: "run_name",
              stroke: (d) => sweepColorScale(d.run_color),
              title: (d) =>
                `Sweep # ${Number.isFinite(d.run_number) ? Math.round(d.run_number) : "n/a"} (${d.run_name})\nStep ${Math.round(
                  d.step
                )}\nEval Loss ${Number(d.eval_loss).toFixed(6)}`,
              tip: true
            })
          ]
        })
      );
    }

    if (gradRows.length === 0) {
      gradHost.appendChild(emptyState("No unclipped-grad-norm points remain after current filters."));
    } else {
      const compactLogTick = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? d3.format(".3~g")(n) : "";
      };
      gradHost.appendChild(
        Plot.plot({
          title: "Optimizer Sweep Unclipped Grad Norm vs Iteration (All Runs)",
          width: 920,
          height: 340,
          x: {label: "Iteration", grid: true},
          y: {
            type: "log",
            label: "Unclipped Grad Norm",
            grid: true,
            tickFormat: compactLogTick
          },
          brush: false,
          dataZoom: Plot.dataZoomXY(),
          legend: false,
          color: {legend: false},
          marks: [
            Plot.dot(gradRows, {
              x: "step",
              y: "grad_unclipped",
              fill: (d) => sweepColorScale(Number.isFinite(d.run_number) ? d.run_number : d.run_color),
              r: 3,
              opacity: 0.36,
              title: (d) =>
                `Sweep # ${Number.isFinite(d.run_number) ? Math.round(d.run_number) : "n/a"} (${d.run_name})\nStep ${Math.round(
                  d.step
                )}\nGrad Norm ${Number(d.grad_unclipped).toFixed(6)}`,
              tip: true
            })
          ]
        })
      );
    }
  }

  refresh();
  return root;
}

function pickOptimizerSection(root, selector, missingMessage) {
  const node = root.querySelector(selector);
  return node || emptyState(missingMessage);
}

export async function renderOptimizerSweepSubsetClusters(options = {}) {
  const root = await renderOptimizerSweepClusters(options);
  for (const selector of [
    "[data-section='optimizer-main-clusters-controls']",
    "[data-section='optimizer-main-clusters-chart']",
    "[data-section='optimizer-main-clusters-centroids']",
    "[data-section='optimizer-main-clusters-details']"
  ]) {
    const node = root.querySelector(selector);
    if (node) node.remove();
  }
  const summary = root.querySelector("[data-section='optimizer-clusters-summary']");
  if (summary) {
    summary.textContent =
      "Subset clusters use [β2, log10(weight decay), log10(max LR), log10(best eval loss)] for runs with final iteration >= 1000.";
  }
  return root;
}

export async function renderOptimizerSweepEvalLossChart(options = {}) {
  const root = await renderOptimizerSweepEvalLoss(options);
  const panel = pickOptimizerSection(
    root,
    "[data-section='optimizer-window-panel']",
    "Eval-loss chart section is unavailable."
  );
  const gradHost = panel.querySelector?.("[data-section='optimizer-grad-norm-chart']");
  if (gradHost) gradHost.remove();
  return panel;
}

export async function renderOptimizerSweepGradNormChart(options = {}) {
  const root = await renderOptimizerSweepEvalLoss(options);
  const panel = pickOptimizerSection(
    root,
    "[data-section='optimizer-window-panel']",
    "Grad-norm chart section is unavailable."
  );
  const evalHost = panel.querySelector?.("[data-section='optimizer-eval-loss-chart']");
  if (evalHost) evalHost.remove();
  return panel;
}

export async function renderOptimizerSweepRankCorrelationTable(options = {}) {
  const root = await renderOptimizerSweepEvalLoss(options);
  return pickOptimizerSection(
    root,
    "[data-section='optimizer-rank-correlation-table']",
    "Rank-correlation table section is unavailable."
  );
}

export async function renderOptimizerSweepRegressionCoefficients(options = {}) {
  const root = await renderOptimizerSweepEvalLoss(options);
  return pickOptimizerSection(
    root,
    "[data-section='optimizer-regression-coefficient-table']",
    "Regression-coefficient section is unavailable."
  );
}

export async function renderOptimizerSweepLogisticTable(options = {}) {
  const root = await renderOptimizerSweepEvalLoss(options);
  return pickOptimizerSection(
    root,
    "[data-section='optimizer-logistic-regression-table']",
    "Logistic-regression table section is unavailable."
  );
}

export async function renderOptimizerSweepQuadrantAnalysis(options = {}) {
  const root = await renderOptimizerSweepEvalLoss(options);
  return pickOptimizerSection(
    root,
    "[data-section='optimizer-quadrant-analysis']",
    "Quadrant analysis section is unavailable."
  );
}

export async function renderOptimizerSweepRunEvalLoss(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-optimizer-sweep-single-run";
  root.style.display = "grid";
  root.style.gap = "0.75rem";

  let data;
  try {
    data = await loadOptimizerSweepData();
  } catch (error) {
    root.appendChild(emptyState(`Failed to load optimizer sweep parquet snapshots: ${error.message}`));
    return root;
  }

  const runNumberTarget = Number.isFinite(Number(options.runNumber)) ? Math.round(Number(options.runNumber)) : 148;
  const runNameTarget = options.runName == null ? "" : String(options.runName).trim();
  const allRows = data.historyRows.filter(
    (row) => Number.isFinite(row.step) && Number.isFinite(row.eval_loss) && row.eval_loss > 0
  );
  const runRows = allRows
    .filter((row) => (runNameTarget ? row.run_name === runNameTarget : row.run_number === runNumberTarget))
    .sort((a, b) => d3.ascending(a.step, b.step));

  if (runRows.length === 0) {
    const targetLabel = runNameTarget || `run #${runNumberTarget}`;
    root.appendChild(emptyState(`No eval-loss history found for ${targetLabel}.`));
    return root;
  }

  const runName = runRows[0].run_name || `run-${runNumberTarget}`;
  const runNumberValue = Number.isFinite(runRows[0].run_number) ? Math.round(runRows[0].run_number) : runNumberTarget;
  const bestEval = d3.min(runRows, (row) => row.eval_loss);
  const finalEval = runRows[runRows.length - 1]?.eval_loss;

  const summary = el(
    "p",
    `Sweep ${runNumberValue} (${runName}): ${runRows.length} eval points, best eval ${Number(bestEval).toFixed(6)}, final eval ${Number(
      finalEval
    ).toFixed(6)}.`
  );
  summary.style.margin = "0";
  summary.style.fontSize = "0.9rem";
  root.appendChild(summary);

  const yMin = d3.min(runRows, (row) => row.eval_loss) ?? 1e-6;
  const yMax = d3.max(runRows, (row) => row.eval_loss) ?? 1;
  const yLower = Math.max(1e-12, yMin * 0.95);
  const yUpper = Math.max(yLower * 1.01, yMax * 1.05);

  root.appendChild(
    Plot.plot({
      title: `Eval Loss vs Iteration (Sweep ${runNumberValue})`,
      width: 920,
      height: 340,
      x: {label: "Iteration", grid: true},
      y: {type: "log", label: "Eval Loss", grid: true, domain: [yLower, yUpper]},
      color: {type: "categorical", legend: false},
      marks: [
        Plot.ruleY([bestEval], {stroke: "currentColor", strokeDasharray: "6 4", strokeOpacity: 0.4}),
        Plot.lineY(runRows, {x: "step", y: "eval_loss", strokeWidth: 1}),
        Plot.dot(runRows, {
          x: "step",
          y: "eval_loss",
          r: 2.6,
          opacity: 0.9,
          tip: true,
          title: (d) => `${runName}\nIteration ${Math.round(d.step)}\nEval loss ${Number(d.eval_loss).toFixed(6)}`
        })
      ]
    })
  );

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
  const basePoints = historyRows
    .filter((row) => Number.isFinite(row.step))
    .filter((row) => Number.isFinite(row.lr) && row.lr > 0)
    .filter((row) => Number.isFinite(row.grad_unclipped))
    .sort((a, b) => d3.ascending(a.run_name, b.run_name) || d3.ascending(a.step, b.step));

  if (basePoints.length === 0) {
    root.appendChild(emptyState("No rows available for LR vs unclipped gradient scatter."));
    return root;
  }

  const runOrder = new Map(
    d3
      .groups(basePoints, (row) => row.run_name || "unknown-run")
      .sort((a, b) => {
        const aRun = d3.min(a[1], (row) => (Number.isFinite(row.run_number) ? row.run_number : Infinity)) ?? Infinity;
        const bRun = d3.min(b[1], (row) => (Number.isFinite(row.run_number) ? row.run_number : Infinity)) ?? Infinity;
        return d3.ascending(aRun, bRun) || d3.ascending(a[0], b[0]);
      })
      .map(([runName], idx) => [runName, idx + 1])
  );

  const points = basePoints.map((row) => ({
    ...row,
    run_order: runOrder.get(row.run_name || "unknown-run") ?? 1,
    run_label: Number.isFinite(row.run_number) ? `Run ${Math.round(row.run_number)}` : String(row.run_name || "unknown-run")
  }));

  const panelHost = card();
  const chartHost = el("div");
  const summaryHost = el("p");
  summaryHost.style.margin = "0";
  summaryHost.style.fontSize = "0.9rem";
  const minLrFilter = Number.isFinite(Number(options.minLr)) && Number(options.minLr) > 0 ? Number(options.minLr) : -Infinity;
  const maxGradFilter = Number.isFinite(Number(options.maxGrad)) ? Number(options.maxGrad) : Infinity;
  const filteredPoints = points.filter((d) => d.lr >= minLrFilter && d.grad_unclipped <= maxGradFilter);
  if (filteredPoints.length === 0) {
    root.appendChild(emptyState("No rows match the requested LR/grad thresholds."));
    return root;
  }

  summaryHost.textContent = `${filteredPoints.length.toLocaleString("en-US")} points shown` + (
    Number.isFinite(minLrFilter) || Number.isFinite(maxGradFilter)
      ? ` (min LR ${Number.isFinite(minLrFilter) ? minLrFilter.toExponential(2) : "off"}, max grad ${
          Number.isFinite(maxGradFilter) ? maxGradFilter.toFixed(3) : "off"
        })`
      : ""
  );

  panelHost.append(summaryHost);
  panelHost.appendChild(chartHost);
  root.appendChild(panelHost);

  chartHost.appendChild(
    Plot.plot({
      title: "Step-level LR vs Unclipped Gradient Norm",
      width: 920,
      height: 360,
      x: {type: "log", label: "Learning rate", grid: true},
      y: {label: "Unclipped gradient norm", grid: true},
      brush: false,
      dataZoom: Plot.dataZoomXY(),
      color: {type: "linear", interpolate: interpolateLrContinuous, label: "Run", legend: true},
      marks: [
        Plot.dot(filteredPoints, {
          x: "lr",
          y: "grad_unclipped",
          fill: "run_order",
          r: 3,
          opacity: 0.36,
          title: (d) =>
            `${d.run_label}\nStep ${Math.round(d.step)}\nLR ${Number(d.lr).toExponential(3)}\nGrad ${Number(d.grad_unclipped).toFixed(
              4
            )}`,
          tip: true
        })
      ]
    })
  );

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
        color: {type: "linear", interpolate: interpolateLrContinuous, legend: false, domain: [0, 100]},
        marks: [
          Plot.rectY(binRows, {
            x1: "lr_lo",
            x2: "lr_hi",
            y1: 0,
            y2: "pct_clipped",
            fill: (d) => {
              const value = Number(d.pct_clipped);
              const t = Number.isFinite(value) ? Math.max(0, Math.min(1, value / 100)) : 0;
              return interpolateLrContinuous(t);
            },
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

  attachInputRefresh(binsControl.input, refresh);
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
  const runControl = multiSelectControl("Runs", runOptions, initialSelectedRuns, {size: 12});
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
  let evalPlotHost = null;
  let lossPlotHost = null;
  if (evalHistoryRows.length === 0) {
    chartHost.appendChild(emptyState("No evaluation-loss history rows available."));
  } else {
    evalPlotHost = el("div");
    lossPlotHost = el("div");
    chartHost.append(evalPlotHost, lossPlotHost);
  }
  root.appendChild(controlsHost);
  root.appendChild(chartHost);

  function refreshSummary() {
    const selectedRuns = new Set(runControl.getSelected());
    const filteredTableRows =
      selectedRuns.size === 0 ? [] : tableData.filter((row) => selectedRuns.has(String(row.run_name)));

    clearNode(tableHost);
    if (filteredTableRows.length === 0) {
      tableHost.appendChild(emptyState("Select at least one run to view summary rows."));
    } else {
      const summaryTable = renderSimpleTable(filteredTableRows, [
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
    }

    if (!evalPlotHost || !lossPlotHost) return;

    clearNode(evalPlotHost);
    clearNode(lossPlotHost);
    if (selectedRuns.size === 0) {
      evalPlotHost.appendChild(emptyState("Select at least one run to view evaluation-loss curves."));
      lossPlotHost.appendChild(emptyState("Select at least one run to view training-loss curves."));
      return;
    }

    const filteredEvalRows = evalHistoryRows
      .filter((row) => selectedRuns.has(row.run_name));
    const filteredLossRows = lossHistoryRows
      .filter((row) => selectedRuns.has(row.run_name));
    const smoothedLossRows = smoothByRun(filteredLossRows, "loss", 25);

    if (filteredEvalRows.length === 0) {
      evalPlotHost.appendChild(emptyState("No evaluation-loss rows for selected runs."));
    } else {
      evalPlotHost.appendChild(
        Plot.plot({
          title: "Evaluation Loss by Iteration (Selected Runs)",
          width: 920,
          height: 360,
          marginBottom: 72,
          x: {label: "Iteration", grid: true},
          y: {type: "log", label: "Eval Loss", grid: true},
          dataZoom: Plot.dataZoomX(),
          color: {type: "linear", interpolate: interpolateLrContinuous, legend: true, label: "Run #"},
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
      lossPlotHost.appendChild(emptyState("No training-loss rows for selected runs."));
      return;
    }

    lossPlotHost.appendChild(
      Plot.plot({
        title: "Smoothed Training Loss by Iteration (Selected Runs)",
        width: 920,
        height: 320,
        marginBottom: 72,
        x: {label: "Iteration", grid: true},
        y: {type: "log", label: "Loss (25-step trailing mean)", grid: true},
        dataZoom: Plot.dataZoomX(),
        color: {type: "linear", interpolate: interpolateLrContinuous, legend: false},
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
      el("h2", "Sweep Summary"),
      await renderLrSweepSummaryTable(options)
    );
  } catch (error) {
    root.appendChild(emptyState(`Failed to render LR sweep sections: ${error.message}`));
  }

  return root;
}
