import {FileAttachment} from "../../_observablehq/stdlib.43270668.js";
import * as Plot from "../../_npm/@observablehq/plot@0.6.17/7c43807f.js";
import * as d3 from "../../_npm/d3@7.9.0/e324157d.js";
import {formatMs} from "../components/data-utils.e2caa41c.js";
import {clearNode, emptyState, renderSimpleTable, sectionHeading} from "../components/dom-utils.d6dae979.js";

const ATTACHMENTS = {
  main: FileAttachment({"name":"../../data/raw/benchmarks/ablations_main.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/ablations_main.912ec8a5.parquet","lastModified":1771466904212,"size":26405}, import.meta.url),
  history: FileAttachment({"name":"../../data/raw/benchmarks/ablations_history.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/ablations_history.c15e6588.parquet","lastModified":1771468208647,"size":2777049}, import.meta.url)
};

const EVAL_LOSS_CURVE = "catmull-rom";

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
  node.style.gap = "0.65rem";
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

function debounce(fn, waitMs = 120) {
  let timeoutId;
  return () => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      fn();
    }, waitMs);
  };
}

function fmt(value, digits = 4) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function stepDigits(step) {
  if (!Number.isFinite(step) || step >= 1) return 0;
  const text = String(step);
  if (text.includes("e-")) return Number(text.split("e-")[1]) || 0;
  const dot = text.indexOf(".");
  return dot >= 0 ? text.length - dot - 1 : 0;
}

function setRangeOutput(control) {
  const value = Number(control.input.value);
  const digits = stepDigits(Number(control.input.step));
  control.output.textContent = Number.isFinite(value) ? value.toFixed(digits) : String(control.input.value);
}

function syncRangeControl(control, min, max, step, value) {
  control.input.min = String(min);
  control.input.max = String(max);
  control.input.step = String(step);
  control.input.value = String(value);
  setRangeOutput(control);
}

function createLogMappedRangeControl(labelText, min, max, value) {
  const wrapper = el("label");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "0.5rem";

  const input = el("input");
  input.type = "range";
  input.min = "0";
  input.max = "1000";
  input.step = "1";

  const output = el("output", "");
  wrapper.append(document.createTextNode(labelText), input, output);
  const control = {node: wrapper, input, output, _min: 1e-6, _max: 1, _logMin: Math.log(1e-6), _logMax: Math.log(1)};
  setLogMappedRangeBounds(control, min, max, value);
  return control;
}

function getLogMappedRangeValue(control) {
  const pos = Number(control.input.value);
  const t = clamp((pos - 0) / 1000, 0, 1);
  return Math.exp(control._logMin + t * (control._logMax - control._logMin));
}

function setLogMappedRangeOutput(control, value = getLogMappedRangeValue(control)) {
  control.output.textContent = Number.isFinite(value) ? d3.format(".6~g")(value) : "n/a";
}

function setLogMappedRangeBounds(control, min, max, value) {
  const safeMin = Math.max(Number(min) || 1e-6, 1e-12);
  const safeMax = Math.max(Number(max) || safeMin * 2, safeMin * 1.000001);
  control._min = safeMin;
  control._max = safeMax;
  control._logMin = Math.log(safeMin);
  control._logMax = Math.log(safeMax);
  const clampedValue = clamp(Number(value) || safeMax, safeMin, safeMax);
  const span = control._logMax - control._logMin;
  const t = span > 0 ? (Math.log(clampedValue) - control._logMin) / span : 1;
  control.input.value = String(Math.round(clamp(t, 0, 1) * 1000));
  setLogMappedRangeOutput(control, clampedValue);
}

function isFinitePositive(value) {
  return Number.isFinite(value) && Number(value) > 0;
}

function yTopBounds(values) {
  const positive = values.filter((value) => isFinitePositive(value));
  if (positive.length === 0) return {min: 0.1, max: 1, step: 0.1, initial: 1};

  const dataMin = d3.min(positive);
  const dataMax = d3.max(positive);
  const min = Math.max(dataMin * 1.01, 1e-6);
  const max = Math.max(dataMax * 1.5, min * 2);
  const step =
    max <= 1 ? 0.0001 :
    max <= 10 ? 0.001 :
    max <= 100 ? 0.01 :
    max <= 1000 ? 0.1 :
    1;
  const initial = clamp(dataMax, min, max);
  return {min, max, step, initial};
}

function applyYAxisBoundsOptions(bounds, options = {}) {
  if (!options || typeof options !== "object") return bounds;
  const next = {...bounds};
  if (Number.isFinite(Number(options.stepMultiplier)) && Number(options.stepMultiplier) > 0) {
    next.step = bounds.step * Number(options.stepMultiplier);
  }
  if (Number.isFinite(Number(options.minStep)) && Number(options.minStep) > 0) {
    next.step = Math.max(next.step, Number(options.minStep));
  }
  return next;
}

function createYAxisControls(labelPrefix, values, defaultScale = "linear", defaultMax, boundsOptions = {}) {
  const bounds = applyYAxisBoundsOptions(yTopBounds(values), boundsOptions);
  const yScaleControl = selectControl(
    `${labelPrefix} Y scale`,
    [
      {value: "linear", label: "Linear"},
      {value: "log", label: "Log"}
    ],
    defaultScale
  );
  const clampedDefaultMax =
    Number.isFinite(Number(defaultMax)) ? clamp(Number(defaultMax), bounds.min, bounds.max) : bounds.initial;
  const yMaxControl = rangeControl(`${labelPrefix} Y max`, bounds.min, bounds.max, bounds.step, clampedDefaultMax);
  setRangeOutput(yMaxControl);
  return {yScaleControl, yMaxControl};
}

function buildYAxisConfig(values, label, yScale, yMax) {
  const positive = values.filter((value) => isFinitePositive(value));
  if (positive.length === 0) return {label, grid: true};

  const min = d3.min(positive);
  const maxData = d3.max(positive);
  const requested = Number.isFinite(Number(yMax)) ? Number(yMax) : maxData;
  const max = Math.max(requested, min * 1.01);
  if (yScale === "log") return {label, grid: true, type: "log", domain: [min, max]};
  return {label, grid: true, domain: [min, max]};
}

function syncYMaxControl(yMaxControl, values, autoScale = true, boundsOptions = {}) {
  const bounds = applyYAxisBoundsOptions(yTopBounds(values), boundsOptions);
  const current = Number(yMaxControl.input.value);
  const nextValue = autoScale ? bounds.initial : clamp(current, bounds.min, bounds.max);
  syncRangeControl(yMaxControl, bounds.min, bounds.max, bounds.step, nextValue);
}

function syncLogYMaxControl(yMaxControl, values, autoScale = true, boundsOptions = {}) {
  const bounds = applyYAxisBoundsOptions(yTopBounds(values), boundsOptions);
  const current = getLogMappedRangeValue(yMaxControl);
  const nextValue = autoScale ? bounds.initial : clamp(current, bounds.min, bounds.max);
  setLogMappedRangeBounds(yMaxControl, bounds.min, bounds.max, nextValue);
}

function buildXAxisConfig(rows, label = "Step") {
  const steps = rows.map((row) => Number(row.step)).filter((value) => Number.isFinite(value));
  if (steps.length === 0) return {label, grid: true};
  const min = d3.min(steps);
  const max = d3.max(steps);
  if (min === max) return {label, grid: true, domain: [min - 1, max + 1]};
  const autoTicks = d3.ticks(min, max, 7);
  const tickValues = Array.from(new Set([min, ...autoTicks, max])).sort(d3.ascending);
  return {label, grid: true, domain: [min, max], tickValues, tickFormat: d3.format(",d")};
}

function computeStepWindow(referenceRows, excludeStartCount, excludeEndCount) {
  const steps = Array.from(
    new Set(referenceRows.map((row) => Number(row.step)).filter((value) => Number.isFinite(value)))
  ).sort(d3.ascending);
  if (steps.length === 0) return null;

  const start = Math.max(0, Math.min(excludeStartCount, steps.length));
  const end = Math.max(0, Math.min(excludeEndCount, steps.length - start));
  if (start + end >= steps.length) return null;
  return {
    min: steps[start],
    max: steps[steps.length - 1 - end]
  };
}

function trimPointsToWindow(rows, stepWindow) {
  const ordered = rows
    .filter((row) => Number.isFinite(row.step))
    .sort((a, b) => d3.ascending(a.step, b.step));
  if (ordered.length === 0 || !stepWindow) return [];
  return ordered.filter((row) => row.step >= stepWindow.min && row.step <= stepWindow.max);
}

function trimPoints(rows, excludeStartCount, excludeEndCount, referenceRows = rows) {
  const stepWindow = computeStepWindow(referenceRows, excludeStartCount, excludeEndCount);
  return trimPointsToWindow(rows, stepWindow);
}

function smoothEwmaBySeries(rows, alpha = 0.08) {
  const a = Math.max(0.005, Math.min(1, Number(alpha) || 0.08));
  const grouped = d3.group(rows, (row) => row.series_label);
  const out = [];
  for (const seriesRows of grouped.values()) {
    const ordered = [...seriesRows].sort((aRow, bRow) => d3.ascending(aRow.step, bRow.step));
    let smoothed;
    for (const row of ordered) {
      const value = Number(row.value);
      if (!Number.isFinite(value)) continue;
      smoothed = smoothed == null ? value : a * value + (1 - a) * smoothed;
      out.push({...row, value: smoothed});
    }
  }
  return out;
}

function boolLikeLabel(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return "on";
  if (raw === "false" || raw === "0" || raw === "no") return "off";
  return value || "n/a";
}

function runDisplayName(summary, runName) {
  const runLabel = summary?.run_label;
  if (runLabel && runLabel !== runName) return `${runLabel} (${runName})`;
  return runName;
}

function runSummaryText(summary, historyRows, trimmedRows) {
  const norm = summary?.norm_mode || "n/a";
  const rope = boolLikeLabel(summary?.use_rope);
  const ffn = summary?.ffn_type || "n/a";
  const evalLoss = fmt(summary?.eval_loss, 5);
  const throughput = Number.isFinite(summary?.tokens_per_sec) ? summary.tokens_per_sec.toFixed(1) : "n/a";
  const stepTime = Number.isFinite(summary?.step_s) ? formatMs(summary.step_s * 1000) : "n/a";
  return `Norm: ${norm} | RoPE: ${rope} | FFN: ${ffn} | Final Eval Loss: ${evalLoss} | Throughput: ${throughput} tok/s | Step: ${stepTime} | Rows shown: ${trimmedRows.length}/${historyRows.length}`;
}

function isBaselineRun(mainByRun, runName) {
  const summary = mainByRun.get(runName);
  const text = [runName, summary?.run_label, summary?.state, summary?.norm_mode].filter(Boolean).join(" ").toLowerCase();
  return text.includes("baseline");
}

function sortRunNames(runNames, mainByRun) {
  return [...runNames].sort((a, b) => {
    const aBaseline = isBaselineRun(mainByRun, a) ? 0 : 1;
    const bBaseline = isBaselineRun(mainByRun, b) ? 0 : 1;
    if (aBaseline !== bBaseline) return d3.ascending(aBaseline, bBaseline);

    const ea = mainByRun.get(a)?.eval_loss;
    const eb = mainByRun.get(b)?.eval_loss;
    const av = Number.isFinite(ea) ? Number(ea) : Number.POSITIVE_INFINITY;
    const bv = Number.isFinite(eb) ? Number(eb) : Number.POSITIVE_INFINITY;
    return d3.ascending(av, bv) || d3.ascending(a, b);
  });
}

function pickBaselineRun(runNames, mainByRun) {
  return runNames.find((runName) => isBaselineRun(mainByRun, runName)) || null;
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function runMatchesOptions(runName, summary, options = {}) {
  const normalizedRun = normalizeText(runName);
  const exactRuns = Array.isArray(options.runs) ? options.runs.map((r) => String(r)) : [];
  if (exactRuns.length > 0 && !exactRuns.includes(runName)) return false;

  const matchAny = Array.isArray(options.matchAny) ? options.matchAny.map((t) => normalizeText(t)) : [];
  if (matchAny.length > 0) {
    const haystack = normalizeText(
      [runName, summary?.run_label, summary?.state, summary?.norm_mode, summary?.ffn_type, summary?.use_rope].join(" ")
    );
    const matched = matchAny.some((token) => token.length > 0 && haystack.includes(token));
    if (!matched) return false;
  }

  if (typeof options.useRope === "boolean") {
    const ropeRaw = normalizeText(summary?.use_rope);
    const ropeValue = ropeRaw === "true" || ropeRaw === "1" || ropeRaw === "yes" || ropeRaw === "on";
    if (ropeValue !== options.useRope) return false;
  }

  return normalizedRun.length > 0;
}

function plotLossAcrossAblations(historyByRun, runNames, mainByRun, excludeStart, excludeEnd, yScale = "linear", yMax) {
  const warmRunColors = d3.quantize(d3.interpolateWarm, Math.max(runNames.length, 2)).slice(0, runNames.length);
  const referenceRows = runNames.flatMap((runName) => historyByRun.get(runName) || []);
  const rows = runNames.flatMap((runName) => {
    const trimmed = trimPoints(historyByRun.get(runName) || [], excludeStart, excludeEnd, referenceRows);
    return trimmed
      .filter((row) => Number.isFinite(row.step) && isFinitePositive(row.loss))
      .map((row) => ({
        run_name: runName,
        run_label: mainByRun.get(runName)?.run_label || "",
        step: row.step,
        loss: row.loss
      }));
  });

  if (rows.length === 0) return emptyState("No finite non-zero loss points available for cross-ablation view.");

  const yValues = rows.map((row) => row.loss);
  return Plot.plot({
    width: 920,
    height: 340,
    x: buildXAxisConfig(rows, "Step"),
    y: buildYAxisConfig(yValues, "Loss", yScale, yMax),
    color: {legend: true, domain: runNames, range: warmRunColors},
    marks: [
      Plot.lineY(rows, {
        x: "step",
        y: "loss",
        stroke: "run_name",
        curve: "linear",
        tip: true,
        title: (d) => {
          const label = d.run_label ? `${d.run_label} (${d.run_name})` : d.run_name;
          return `${label}\nstep: ${d.step}\nloss: ${fmt(d.loss, 6)}`;
        }
      })
    ]
  });
}

function plotEvalLossAcrossAblations(
  historyByRun,
  runNames,
  mainByRun,
  excludeStart,
  excludeEnd,
  evalLossCurve = EVAL_LOSS_CURVE,
  yScale = "linear",
  yMax
) {
  const warmRunColors = d3.quantize(d3.interpolateWarm, Math.max(runNames.length, 2)).slice(0, runNames.length);
  const referenceRows = runNames.flatMap((runName) => historyByRun.get(runName) || []);
  const rows = runNames.flatMap((runName) => {
    const trimmed = trimPoints(historyByRun.get(runName) || [], excludeStart, excludeEnd, referenceRows);
    return trimmed
      .filter((row) => Number.isFinite(row.step) && isFinitePositive(row.eval_loss))
      .map((row) => ({
        run_name: runName,
        run_label: mainByRun.get(runName)?.run_label || "",
        step: row.step,
        eval_loss: row.eval_loss
      }));
  });

  if (rows.length === 0) return emptyState("No finite non-zero eval-loss points available for cross-ablation view.");

  const yValues = rows.map((row) => row.eval_loss);
  return Plot.plot({
    width: 920,
    height: 340,
    x: buildXAxisConfig(rows, "Step"),
    y: buildYAxisConfig(yValues, "Eval Loss", yScale, yMax),
    color: {legend: true, domain: runNames, range: warmRunColors},
    marks: [
      Plot.lineY(rows, {
        x: "step",
        y: "eval_loss",
        stroke: "run_name",
        curve: evalLossCurve,
        tip: true,
        title: (d) => {
          const label = d.run_label ? `${d.run_label} (${d.run_name})` : d.run_name;
          return `${label}\nstep: ${d.step}\neval loss: ${fmt(d.eval_loss, 6)}`;
        }
      })
    ]
  });
}

function plotGradNormAcrossAblations(historyByRun, runNames, mainByRun, excludeStart, excludeEnd, yScale = "linear", yMax) {
  const warmRunColors = d3.quantize(d3.interpolateWarm, Math.max(runNames.length, 2)).slice(0, runNames.length);
  const referenceRows = runNames.flatMap((runName) => historyByRun.get(runName) || []);
  const rows = runNames.flatMap((runName) => {
    const trimmed = trimPoints(historyByRun.get(runName) || [], excludeStart, excludeEnd, referenceRows);
    return trimmed
      .filter((row) => Number.isFinite(row.step) && isFinitePositive(row.grad_norm_unclipped))
      .map((row) => ({
        run_name: runName,
        run_label: mainByRun.get(runName)?.run_label || "",
        step: row.step,
        grad_norm_unclipped: row.grad_norm_unclipped
      }));
  });

  if (rows.length === 0) return emptyState("No finite non-zero grad-norm points available for cross-ablation view.");

  const yValues = rows.map((row) => row.grad_norm_unclipped);
  return Plot.plot({
    width: 920,
    height: 340,
    x: buildXAxisConfig(rows, "Step"),
    y: buildYAxisConfig(yValues, "Grad Norm (unclipped)", yScale, yMax),
    color: {legend: true, domain: runNames, range: warmRunColors},
    marks: [
      Plot.lineY(rows, {
        x: "step",
        y: "grad_norm_unclipped",
        stroke: "run_name",
        curve: "linear",
        opacity: 0.45
      }),
      Plot.dot(rows, {
        x: "step",
        y: "grad_norm_unclipped",
        fill: "run_name",
        r: 1.8,
        opacity: 0.55,
        tip: true,
        title: (d) => {
          const label = d.run_label ? `${d.run_label} (${d.run_name})` : d.run_name;
          return `${label}\nstep: ${d.step}\ngrad norm: ${fmt(d.grad_norm_unclipped, 6)}`;
        }
      })
    ]
  });
}

function gradNormStabilityRows(historyByRun, runNames, mainByRun, excludeStart, excludeEnd, highPercentile, referenceRows) {
  return runNames.map((runName) => {
    const runRows = historyByRun.get(runName) || [];
    const trimmed = trimPoints(runRows, excludeStart, excludeEnd, referenceRows || runRows);
    const values = trimmed
      .map((row) => Number(row.grad_norm_unclipped))
      .filter((value) => isFinitePositive(value))
      .sort(d3.ascending);

    const summary = mainByRun.get(runName);
    const runDisplay = runDisplayName(summary, runName);
    const median = values.length > 0 ? d3.quantileSorted(values, 0.5) : NaN;
    const high = values.length > 0 ? d3.quantileSorted(values, highPercentile) : NaN;
    const ratio = isFinitePositive(median) && isFinitePositive(high) ? high / median : NaN;

    return {
      run_name: runName,
      run_display: runDisplay,
      count: values.length,
      median,
      high,
      ratio
    };
  });
}

function renderGradNormStabilitySummary(rows, highPercentile, valueScale = "linear", valueMax) {
  const host = card();
  const chartRows = rows.filter((row) => row.count > 0 && isFinitePositive(row.median) && isFinitePositive(row.high));
  const percentileLabel = `P${Math.round(highPercentile * 100)}`;

  if (chartRows.length === 0) {
    host.appendChild(emptyState("No finite non-zero grad-norm values for stability summary."));
    return host;
  }

  const chartHeight = Math.max(260, Math.min(900, 100 + chartRows.length * 24));
  const axisValues = chartRows.flatMap((row) => [row.median, row.high]);
  host.appendChild(
    Plot.plot({
      width: 920,
      height: chartHeight,
      marginLeft: 280,
      x: buildYAxisConfig(axisValues, "Grad Norm (unclipped)", valueScale, valueMax),
      y: {label: null},
      color: {legend: true, domain: ["Median", percentileLabel], range: [d3.interpolateWarm(0.25), d3.interpolateWarm(0.8)]},
      marks: [
        Plot.ruleY(chartRows, {
          y: "run_display",
          x1: "median",
          x2: "high",
          stroke: d3.interpolateWarm(0.55),
          strokeOpacity: 0.45
        }),
        Plot.dot(chartRows, {
          y: "run_display",
          x: "median",
          fill: () => "Median",
          r: 4.2,
          tip: true,
          title: (d) => `${d.run_display}\nMedian: ${fmt(d.median, 6)}\n${percentileLabel}: ${fmt(d.high, 6)}\nRatio: ${fmt(d.ratio, 3)}`
        }),
        Plot.dot(chartRows, {
          y: "run_display",
          x: "high",
          fill: () => percentileLabel,
          r: 4.2,
          tip: true,
          title: (d) => `${d.run_display}\nMedian: ${fmt(d.median, 6)}\n${percentileLabel}: ${fmt(d.high, 6)}\nRatio: ${fmt(d.ratio, 3)}`
        })
      ]
    })
  );

  host.appendChild(
    renderSimpleTable(rows, [
      {key: "run_display", label: "Run"},
      {key: "count", label: "Points", align: "right"},
      {
        key: "median",
        label: "Median",
        align: "right",
        format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")
      },
      {
        key: "high",
        label: percentileLabel,
        align: "right",
        format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "n/a")
      },
      {
        key: "ratio",
        label: `${percentileLabel}/Median`,
        align: "right",
        format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(3) : "n/a")
      }
    ])
  );

  return host;
}

async function loadAblationData() {
  if (!ablationDataPromise) {
    ablationDataPromise = (async () => {
      const [mainTable, historyTable] = await Promise.all([ATTACHMENTS.main.parquet(), ATTACHMENTS.history.parquet()]);

      const mainRows = Array.from(mainTable, (row) => ({
        run_name: pickString(row, ["run_name", "config.run_name"], "unknown-run"),
        run_label: pickString(row, ["run_label", "config.run_label"], ""),
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
      })).sort((a, b) => d3.ascending(a.eval_loss, b.eval_loss) || d3.ascending(a.run_name, b.run_name));

      const historyRows = Array.from(historyTable, (row) => ({
        run_name: pickString(row, ["run_name", "config.run_name"], "unknown-run"),
        run_label: pickString(row, ["run_label", "config.run_label"], ""),
        norm_mode: pickString(row, ["config.model_settings.norm_mode", "norm_mode"], "unknown"),
        use_rope: pickString(row, ["config.model_settings.use_rope", "use_rope"], "unknown"),
        ffn_type: pickString(row, ["config.model_settings.ffn_type", "ffn_type"], "unknown"),
        step: pickNumber(row, ["_step", "step"]),
        loss: pickNumber(row, ["Loss"]),
        eval_loss: pickNumber(row, ["Eval Loss", "Eval/Loss"]),
        eval_perplexity: pickNumber(row, ["Eval Perplexity", "Eval/Perplexity"]),
        grad_norm_unclipped: pickNumber(row, [
          "Grad/Norm (unclipped)",
          "Grad/Norm (Unclipped)",
          "Grad/Norm (raw)",
          "grad_norm_unclipped"
        ]),
        tokens_per_sec: pickNumber(row, ["Throughput/Tokens per sec"]),
        step_s: pickNumber(row, ["Time/Total step"])
      }))
        .filter((row) => Number.isFinite(row.step))
        .sort((a, b) => d3.ascending(a.run_name, b.run_name) || d3.ascending(a.step, b.step));

      return {mainRows, historyRows};
    })();
  }
  return ablationDataPromise;
}

function plotLossCurves(historyRows, yScale = "linear", yMax, lossSmoothAlpha = 0.08, evalLossCurve = EVAL_LOSS_CURVE) {
  const lossRowsRaw = historyRows
    .filter((row) => Number.isFinite(row.step) && isFinitePositive(row.loss))
    .map((row) => ({
      run_name: row.run_name,
      series_label: row.series_label || row.run_name,
      step: row.step,
      metric: "Loss",
      value: row.loss
    }));
  const lossRows = smoothEwmaBySeries(lossRowsRaw, lossSmoothAlpha).map((row) => ({
    ...row,
    series_key: `${row.series_label} | Loss`
  }));
  const evalLossRows = historyRows
    .filter((row) => Number.isFinite(row.step) && isFinitePositive(row.eval_loss))
    .map((row) => ({
      run_name: row.run_name,
      series_label: row.series_label || row.run_name,
      step: row.step,
      metric: "Eval Loss",
      value: row.eval_loss,
      series_key: `${row.series_label} | Eval Loss`
    }));

  if (lossRows.length === 0 && evalLossRows.length === 0) return emptyState("No finite Loss / Eval Loss history for this ablation.");
  const allRows = [...lossRows, ...evalLossRows];
  const seriesKeys = Array.from(new Set(allRows.map((row) => row.series_key)));
  const seriesColors = d3.quantize(d3.interpolateWarm, Math.max(seriesKeys.length, 2)).slice(0, seriesKeys.length);
  const yValues = [...lossRows.map((row) => row.value), ...evalLossRows.map((row) => row.value)];
  const alphaText = (Math.round(Math.max(0.005, Math.min(1, Number(lossSmoothAlpha) || 0.08)) * 1000) / 1000).toFixed(3);
  return Plot.plot({
    width: 860,
    height: 280,
    x: buildXAxisConfig(allRows, "Step"),
    y: buildYAxisConfig(yValues, `Loss / Eval Loss (Loss EWMA alpha=${alphaText}, Eval spline=${evalLossCurve})`, yScale, yMax),
    color: {legend: true, domain: seriesKeys, range: seriesColors},
    marks: [
      Plot.lineY(lossRows, {
        x: "step",
        y: "value",
        stroke: "series_key",
        curve: "linear",
        tip: true,
        title: (d) => `${d.series_label}\n${d.metric}\nstep: ${d.step}\nvalue: ${fmt(d.value, 6)}`
      }),
      Plot.lineY(evalLossRows, {
        x: "step",
        y: "value",
        stroke: "series_key",
        curve: evalLossCurve,
        tip: true,
        title: (d) => `${d.series_label}\n${d.metric}\nstep: ${d.step}\nvalue: ${fmt(d.value, 6)}`
      })
    ]
  });
}

function plotGradNorm(historyRows, yScale = "linear", yMax) {
  const gradRows = historyRows
    .filter((row) => Number.isFinite(row.step) && isFinitePositive(row.grad_norm_unclipped))
    .map((row) => ({
      ...row,
      series_label: row.series_label || row.run_name
    }));
  if (gradRows.length === 0) return emptyState("No finite unclipped grad norm rows for this ablation.");

  const seriesLabels = Array.from(new Set(gradRows.map((row) => row.series_label)));
  const baselineLabel = seriesLabels.find((label) => normalizeText(label).includes("baseline"));
  const seriesColors =
    seriesLabels.length === 1
      ? [d3.interpolateWarm(0.58)]
      : baselineLabel
      ? seriesLabels.map((label) => (label === baselineLabel ? d3.interpolateWarm(0.25) : d3.interpolateWarm(0.82)))
      : d3.quantize(d3.interpolateWarm, Math.max(seriesLabels.length, 2)).slice(0, seriesLabels.length);
  const yValues = gradRows.map((row) => row.grad_norm_unclipped);
  return Plot.plot({
    width: 860,
    height: 260,
    x: buildXAxisConfig(gradRows, "Step"),
    y: buildYAxisConfig(yValues, "Grad Norm (unclipped)", yScale, yMax),
    color: {legend: true, domain: seriesLabels, range: seriesColors},
    marks: [
      Plot.dot(gradRows, {
        x: "step",
        y: "grad_norm_unclipped",
        fill: "series_label",
        r: 3.4,
        opacity: 0.85,
        tip: true,
        title: (d) => `${d.series_label}\nstep: ${d.step}\nGrad/Norm (unclipped): ${fmt(d.grad_norm_unclipped, 6)}`
      })
    ]
  });
}

export async function renderAblationsByRun(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-ablations-by-run";
  root.style.display = "grid";
  root.style.gap = "1rem";
  const showHeading = options.showHeading !== false;
  const showOverall = options.showOverall !== false;
  const showPerRun = options.showPerRun !== false;
  const includeBaselineComparison = options.includeBaselineComparison !== false;

  let data;
  try {
    data = await loadAblationData();
  } catch (error) {
    root.appendChild(emptyState(`Failed to load ablations parquet snapshots: ${error.message}`));
    return root;
  }

  const {mainRows, historyRows} = data;
  if (historyRows.length === 0) {
    root.appendChild(emptyState("No ablation history rows available."));
    return root;
  }

  if (showHeading) {
    const title = el("h2", "Ablation-by-Ablation Performance");
    title.style.margin = "0";
    const subtitle = el(
      "p",
      "Each ablation includes aggressively smoothed training loss, spline eval loss, and an unclipped grad-norm dot plot."
    );
    subtitle.style.margin = "0";
    root.append(title, subtitle);
  }

  const historyByRun = d3.group(historyRows, (row) => row.run_name);
  const mainByRun = new Map();
  for (const row of mainRows) {
    if (!mainByRun.has(row.run_name)) mainByRun.set(row.run_name, row);
  }
  const allRunNames = sortRunNames(Array.from(new Set([...historyByRun.keys(), ...mainByRun.keys()])), mainByRun);
  const baselineRunName = pickBaselineRun(allRunNames, mainByRun);
  const runNames = allRunNames.filter((runName) => runMatchesOptions(runName, mainByRun.get(runName), options));
  if (runNames.length === 0) {
    root.appendChild(emptyState("No ablations matched the current section filter."));
    return root;
  }
  const runSet = new Set(runNames);
  const scopedHistoryRows = historyRows.filter((row) => runSet.has(row.run_name));

  const scopedStepCount = new Set(scopedHistoryRows.map((row) => Number(row.step)).filter((value) => Number.isFinite(value))).size;
  const gradBoundsOptions = {stepMultiplier: 0.1};

  if (showOverall) {
    const allChartCard = card();
    allChartCard.appendChild(sectionHeading("Loss Across All Ablations"));
    const allControls = card();
    allControls.style.gridTemplateColumns = "repeat(auto-fit, minmax(280px, 1fr))";
    const allLossValues = scopedHistoryRows.map((row) => Number(row.loss)).filter((value) => isFinitePositive(value));
    const allLossYAxis = createYAxisControls(
      "Loss",
      allLossValues,
      options.lossYScale || "linear",
      options.lossYMax
    );
    const allMaxTrim = Math.max(0, scopedStepCount - 1);
    const allExcludeStartControl = rangeControl("Exclude first N points", 0, allMaxTrim, 1, options.excludeStart ?? 0);
    const allExcludeEndControl = rangeControl("Exclude last N points", 0, allMaxTrim, 1, options.excludeEnd ?? 0);
    allControls.append(
      allLossYAxis.yScaleControl.node,
      allLossYAxis.yMaxControl.node,
      allExcludeStartControl.node,
      allExcludeEndControl.node
    );
    const allChartHost = card();
    allChartCard.append(allControls, allChartHost);
    root.appendChild(allChartCard);
    const hasLossYMaxOverride = options.lossYMax != null && Number.isFinite(Number(options.lossYMax));
    let allLossAutoY = !hasLossYMaxOverride;

    function refreshAllChart() {
      allExcludeStartControl.output.textContent = allExcludeStartControl.input.value;
      allExcludeEndControl.output.textContent = allExcludeEndControl.input.value;
      const excludeStart = Math.max(0, Number(allExcludeStartControl.input.value) || 0);
      const excludeEnd = Math.max(0, Number(allExcludeEndControl.input.value) || 0);
      const visibleLossValues = runNames.flatMap((name) =>
        trimPoints(historyByRun.get(name) || [], excludeStart, excludeEnd, scopedHistoryRows)
          .map((row) => Number(row.loss))
          .filter((value) => isFinitePositive(value))
      );
      syncYMaxControl(allLossYAxis.yMaxControl, visibleLossValues, allLossAutoY);
      const yScale = allLossYAxis.yScaleControl.select.value || "linear";
      const yMax = Number(allLossYAxis.yMaxControl.input.value);
      clearNode(allChartHost);
      allChartHost.appendChild(
        plotLossAcrossAblations(historyByRun, runNames, mainByRun, excludeStart, excludeEnd, yScale, yMax)
      );
    }

    const refreshAllChartDebounced = debounce(refreshAllChart, 120);
    allLossYAxis.yScaleControl.select.addEventListener("change", refreshAllChartDebounced);
    allLossYAxis.yMaxControl.input.addEventListener("input", () => {
      allLossAutoY = false;
      refreshAllChartDebounced();
    });
    allExcludeStartControl.input.addEventListener("input", () => {
      allLossAutoY = true;
      refreshAllChartDebounced();
    });
    allExcludeEndControl.input.addEventListener("input", () => {
      allLossAutoY = true;
      refreshAllChartDebounced();
    });
    refreshAllChart();

    const evalChartCard = card();
    evalChartCard.appendChild(sectionHeading("Eval Loss Across All Ablations"));
    const evalControls = card();
    evalControls.style.gridTemplateColumns = "repeat(auto-fit, minmax(280px, 1fr))";
    const allEvalValues = scopedHistoryRows.map((row) => Number(row.eval_loss)).filter((value) => isFinitePositive(value));
    const allEvalYAxis = createYAxisControls(
      "Eval",
      allEvalValues,
      options.evalYScale || "linear",
      options.evalYMax
    );
    const evalMaxTrim = Math.max(0, scopedStepCount - 1);
    const evalExcludeStartControl = rangeControl("Exclude first N points", 0, evalMaxTrim, 1, options.excludeStart ?? 0);
    const evalExcludeEndControl = rangeControl("Exclude last N points", 0, evalMaxTrim, 1, options.excludeEnd ?? 0);
    const evalCurveControl = selectControl(
      "Eval-loss spline curve",
      [
        {value: "catmull-rom", label: "Catmull-Rom"},
        {value: "basis", label: "Basis"},
        {value: "natural", label: "Natural"}
      ],
      options.evalSplineCurve || options.splineCurve || EVAL_LOSS_CURVE
    );
    evalControls.append(
      evalCurveControl.node,
      allEvalYAxis.yScaleControl.node,
      allEvalYAxis.yMaxControl.node,
      evalExcludeStartControl.node,
      evalExcludeEndControl.node
    );
    const evalChartHost = card();
    evalChartCard.append(evalControls, evalChartHost);
    root.appendChild(evalChartCard);
    const hasEvalYMaxOverride = options.evalYMax != null && Number.isFinite(Number(options.evalYMax));
    let allEvalAutoY = !hasEvalYMaxOverride;

    function refreshEvalChart() {
      evalExcludeStartControl.output.textContent = evalExcludeStartControl.input.value;
      evalExcludeEndControl.output.textContent = evalExcludeEndControl.input.value;
      const excludeStart = Math.max(0, Number(evalExcludeStartControl.input.value) || 0);
      const excludeEnd = Math.max(0, Number(evalExcludeEndControl.input.value) || 0);
      const visibleEvalValues = runNames.flatMap((name) =>
        trimPoints(historyByRun.get(name) || [], excludeStart, excludeEnd, scopedHistoryRows)
          .map((row) => Number(row.eval_loss))
          .filter((value) => isFinitePositive(value))
      );
      syncYMaxControl(allEvalYAxis.yMaxControl, visibleEvalValues, allEvalAutoY);
      const evalLossCurve = evalCurveControl.select.value || EVAL_LOSS_CURVE;
      const yScale = allEvalYAxis.yScaleControl.select.value || "linear";
      const yMax = Number(allEvalYAxis.yMaxControl.input.value);
      clearNode(evalChartHost);
      evalChartHost.appendChild(
        plotEvalLossAcrossAblations(
          historyByRun,
          runNames,
          mainByRun,
          excludeStart,
          excludeEnd,
          evalLossCurve,
          yScale,
          yMax
        )
      );
    }

    const refreshEvalChartDebounced = debounce(refreshEvalChart, 120);
    allEvalYAxis.yScaleControl.select.addEventListener("change", refreshEvalChartDebounced);
    allEvalYAxis.yMaxControl.input.addEventListener("input", () => {
      allEvalAutoY = false;
      refreshEvalChartDebounced();
    });
    evalExcludeStartControl.input.addEventListener("input", () => {
      allEvalAutoY = true;
      refreshEvalChartDebounced();
    });
    evalExcludeEndControl.input.addEventListener("input", () => {
      allEvalAutoY = true;
      refreshEvalChartDebounced();
    });
    evalCurveControl.select.addEventListener("change", refreshEvalChartDebounced);
    refreshEvalChart();

    const gradChartCard = card();
    gradChartCard.appendChild(sectionHeading("Grad Norm Across All Ablations"));
    const gradControls = card();
    gradControls.style.gridTemplateColumns = "repeat(auto-fit, minmax(280px, 1fr))";
    const allGradValues = scopedHistoryRows.map((row) => Number(row.grad_norm_unclipped)).filter((value) => isFinitePositive(value));
    const allGradYAxis = createYAxisControls(
      "Grad",
      allGradValues,
      options.gradYScale || "linear",
      options.gradYMax,
      gradBoundsOptions
    );
    const gradBounds = applyYAxisBoundsOptions(yTopBounds(allGradValues), gradBoundsOptions);
    const gradDefaultMax = Number.isFinite(Number(options.gradYMax))
      ? clamp(Number(options.gradYMax), gradBounds.min, gradBounds.max)
      : gradBounds.initial;
    const allGradYMaxControl = createLogMappedRangeControl("Grad Y max", gradBounds.min, gradBounds.max, gradDefaultMax);
    const gradMaxTrim = Math.max(0, scopedStepCount - 1);
    const gradExcludeStartControl = rangeControl("Exclude first N points", 0, gradMaxTrim, 1, options.excludeStart ?? 0);
    const gradExcludeEndControl = rangeControl("Exclude last N points", 0, gradMaxTrim, 1, options.excludeEnd ?? 0);
    gradControls.append(
      allGradYAxis.yScaleControl.node,
      allGradYMaxControl.node,
      gradExcludeStartControl.node,
      gradExcludeEndControl.node
    );
    const gradAllChartHost = card();
    gradChartCard.append(gradControls, gradAllChartHost);
    root.appendChild(gradChartCard);
    const hasGradYMaxOverride = options.gradYMax != null && Number.isFinite(Number(options.gradYMax));
    let allGradAutoY = !hasGradYMaxOverride;

    function refreshGradChart() {
      gradExcludeStartControl.output.textContent = gradExcludeStartControl.input.value;
      gradExcludeEndControl.output.textContent = gradExcludeEndControl.input.value;
      const excludeStart = Math.max(0, Number(gradExcludeStartControl.input.value) || 0);
      const excludeEnd = Math.max(0, Number(gradExcludeEndControl.input.value) || 0);
      const visibleGradValues = runNames.flatMap((name) =>
        trimPoints(historyByRun.get(name) || [], excludeStart, excludeEnd, scopedHistoryRows)
          .map((row) => Number(row.grad_norm_unclipped))
          .filter((value) => isFinitePositive(value))
      );
      syncLogYMaxControl(allGradYMaxControl, visibleGradValues, allGradAutoY, gradBoundsOptions);
      const yScale = allGradYAxis.yScaleControl.select.value || "linear";
      const yMax = getLogMappedRangeValue(allGradYMaxControl);
      clearNode(gradAllChartHost);
      gradAllChartHost.appendChild(
        plotGradNormAcrossAblations(historyByRun, runNames, mainByRun, excludeStart, excludeEnd, yScale, yMax)
      );
    }

    const refreshGradChartDebounced = debounce(refreshGradChart, 120);
    allGradYAxis.yScaleControl.select.addEventListener("change", refreshGradChartDebounced);
    allGradYMaxControl.input.addEventListener("input", () => {
      allGradAutoY = false;
      refreshGradChartDebounced();
    });
    gradExcludeStartControl.input.addEventListener("input", () => {
      allGradAutoY = true;
      refreshGradChartDebounced();
    });
    gradExcludeEndControl.input.addEventListener("input", () => {
      allGradAutoY = true;
      refreshGradChartDebounced();
    });
    refreshGradChart();

    const stabilityCard = card();
    stabilityCard.appendChild(sectionHeading("Grad-Norm Stability Summary"));
    const stabilityControls = card();
    stabilityControls.style.gridTemplateColumns = "repeat(auto-fit, minmax(280px, 1fr))";
    const stabilityMaxTrim = Math.max(0, scopedStepCount - 1);
    const stabilityExcludeStartControl = rangeControl("Exclude first N points", 0, stabilityMaxTrim, 1, options.excludeStart ?? 0);
    const stabilityExcludeEndControl = rangeControl("Exclude last N points", 0, stabilityMaxTrim, 1, options.excludeEnd ?? 0);
    const stabilityPercentileControl = selectControl(
      "High percentile",
      [
        {value: "0.95", label: "P95"},
        {value: "0.90", label: "P90"},
        {value: "0.99", label: "P99"}
      ],
      String(options.gradNormPercentile ?? "0.95")
    );
    const stabilityYAxis = createYAxisControls(
      "Summary",
      allGradValues,
      options.stabilityYScale || "linear",
      options.stabilityYMax,
      gradBoundsOptions
    );
    stabilityControls.append(
      stabilityPercentileControl.node,
      stabilityYAxis.yScaleControl.node,
      stabilityYAxis.yMaxControl.node,
      stabilityExcludeStartControl.node,
      stabilityExcludeEndControl.node
    );
    const stabilityHost = card();
    stabilityCard.append(stabilityControls, stabilityHost);
    root.appendChild(stabilityCard);
    const hasStabilityYMaxOverride = options.stabilityYMax != null && Number.isFinite(Number(options.stabilityYMax));
    let stabilityAutoY = !hasStabilityYMaxOverride;

    function refreshStabilitySummary() {
      stabilityExcludeStartControl.output.textContent = stabilityExcludeStartControl.input.value;
      stabilityExcludeEndControl.output.textContent = stabilityExcludeEndControl.input.value;
      const excludeStart = Math.max(0, Number(stabilityExcludeStartControl.input.value) || 0);
      const excludeEnd = Math.max(0, Number(stabilityExcludeEndControl.input.value) || 0);
      const highPercentile = Math.max(0.5, Math.min(0.999, Number(stabilityPercentileControl.select.value) || 0.95));
      const rows = gradNormStabilityRows(
        historyByRun,
        runNames,
        mainByRun,
        excludeStart,
        excludeEnd,
        highPercentile,
        scopedHistoryRows
      );
      const valueRows = rows.flatMap((row) => [Number(row.median), Number(row.high)]).filter((value) => isFinitePositive(value));
      syncYMaxControl(stabilityYAxis.yMaxControl, valueRows, stabilityAutoY, gradBoundsOptions);
      const valueScale = stabilityYAxis.yScaleControl.select.value || "linear";
      const valueMax = Number(stabilityYAxis.yMaxControl.input.value);
      clearNode(stabilityHost);
      stabilityHost.appendChild(renderGradNormStabilitySummary(rows, highPercentile, valueScale, valueMax));
    }

    const refreshStabilityDebounced = debounce(refreshStabilitySummary, 120);
    stabilityYAxis.yScaleControl.select.addEventListener("change", refreshStabilityDebounced);
    stabilityYAxis.yMaxControl.input.addEventListener("input", () => {
      stabilityAutoY = false;
      refreshStabilityDebounced();
    });
    stabilityExcludeStartControl.input.addEventListener("input", () => {
      stabilityAutoY = true;
      refreshStabilityDebounced();
    });
    stabilityExcludeEndControl.input.addEventListener("input", () => {
      stabilityAutoY = true;
      refreshStabilityDebounced();
    });
    stabilityPercentileControl.select.addEventListener("change", () => {
      stabilityAutoY = true;
      refreshStabilityDebounced();
    });
    refreshStabilitySummary();
  }

  if (showPerRun) {
    const panelsHost = el("div");
    panelsHost.style.display = "grid";
    panelsHost.style.gap = "1rem";
    root.appendChild(panelsHost);

    for (const runName of runNames) {
      const history = historyByRun.get(runName) || [];
      const summary = mainByRun.get(runName) || history[history.length - 1] || {run_name: runName};
      const runLabel = runDisplayName(summary, runName);
      const baselineSummary = baselineRunName ? mainByRun.get(baselineRunName) : null;
      const baselineLabel = baselineRunName ? runDisplayName(baselineSummary, baselineRunName) : null;
      const baselineHistory =
        includeBaselineComparison && baselineRunName && baselineRunName !== runName
          ? historyByRun.get(baselineRunName) || []
          : [];
      const panelReferenceRows = [...history, ...baselineHistory];
      const panelStepCount = new Set(panelReferenceRows.map((row) => Number(row.step)).filter((value) => Number.isFinite(value))).size;
      const maxTrim = Math.max(0, panelStepCount - 1);

      const panel = card();
      panel.style.padding = "0.25rem 0";
      panel.appendChild(sectionHeading(runLabel));

      const summaryText = el("p", runSummaryText(summary, history, history));
      summaryText.style.margin = "0";
      summaryText.style.fontSize = "0.9rem";
      panel.appendChild(summaryText);

      const lossControls = card();
      lossControls.style.gridTemplateColumns = "repeat(auto-fit, minmax(260px, 1fr))";
      const runLossValues = [...history, ...baselineHistory]
        .flatMap((row) => [Number(row.loss), Number(row.eval_loss)])
        .filter((value) => isFinitePositive(value));
      const runLossYAxis = createYAxisControls(
        "Loss",
        runLossValues,
        options.lossYScale || "linear",
        options.lossYMax
      );
      const evalCurveControl = selectControl(
        "Eval-loss spline curve",
        [
          {value: "catmull-rom", label: "Catmull-Rom"},
          {value: "basis", label: "Basis"},
          {value: "natural", label: "Natural"}
        ],
        options.evalSplineCurve || options.splineCurve || EVAL_LOSS_CURVE
      );
      const lossSmoothControl = rangeControl("Loss smooth alpha", 0.005, 1, 0.005, options.lossSmoothAlpha ?? 0.08);
      setRangeOutput(lossSmoothControl);
      const lossExcludeStartControl = rangeControl("Loss exclude first N", 0, maxTrim, 1, options.excludeStart ?? 0);
      const lossExcludeEndControl = rangeControl("Loss exclude last N", 0, maxTrim, 1, options.excludeEnd ?? 0);
      lossControls.append(
        evalCurveControl.node,
        runLossYAxis.yScaleControl.node,
        runLossYAxis.yMaxControl.node,
        lossSmoothControl.node,
        lossExcludeStartControl.node,
        lossExcludeEndControl.node
      );
      panel.appendChild(lossControls);

      panel.appendChild(el("h4", baselineHistory.length > 0 ? "Loss and Eval Loss (with baseline)" : "Loss and Eval Loss"));
      panel.lastChild.style.margin = "0";
      const lossChartHost = card();
      panel.appendChild(lossChartHost);

      const gradControls = card();
      gradControls.style.gridTemplateColumns = "repeat(auto-fit, minmax(260px, 1fr))";
      const runGradValues = [...history, ...baselineHistory]
        .map((row) => Number(row.grad_norm_unclipped))
        .filter((value) => isFinitePositive(value));
      const runGradYAxis = createYAxisControls(
        "Grad",
        runGradValues,
        options.gradYScale || "linear",
        options.gradYMax,
        gradBoundsOptions
      );
      const gradExcludeStartControl = rangeControl("Grad exclude first N", 0, maxTrim, 1, options.excludeStart ?? 0);
      const gradExcludeEndControl = rangeControl("Grad exclude last N", 0, maxTrim, 1, options.excludeEnd ?? 0);
      gradControls.append(
        runGradYAxis.yScaleControl.node,
        runGradYAxis.yMaxControl.node,
        gradExcludeStartControl.node,
        gradExcludeEndControl.node
      );
      panel.appendChild(gradControls);

      panel.appendChild(el("h4", baselineHistory.length > 0 ? "Unclipped Grad Norm (with baseline)" : "Unclipped Grad Norm"));
      panel.lastChild.style.margin = "0";
      const gradChartHost = card();
      panel.appendChild(gradChartHost);
      const hasRunLossYMaxOverride = options.lossYMax != null && Number.isFinite(Number(options.lossYMax));
      const hasRunGradYMaxOverride = options.gradYMax != null && Number.isFinite(Number(options.gradYMax));
      let runLossAutoY = !hasRunLossYMaxOverride;
      let runGradAutoY = !hasRunGradYMaxOverride;

      function refreshRunPanel() {
        lossExcludeStartControl.output.textContent = lossExcludeStartControl.input.value;
        lossExcludeEndControl.output.textContent = lossExcludeEndControl.input.value;
        gradExcludeStartControl.output.textContent = gradExcludeStartControl.input.value;
        gradExcludeEndControl.output.textContent = gradExcludeEndControl.input.value;

        const lossStart = Math.max(0, Number(lossExcludeStartControl.input.value) || 0);
        const lossEnd = Math.max(0, Number(lossExcludeEndControl.input.value) || 0);
        const gradStart = Math.max(0, Number(gradExcludeStartControl.input.value) || 0);
        const gradEnd = Math.max(0, Number(gradExcludeEndControl.input.value) || 0);
        const lossSmoothAlpha = Math.max(0.005, Math.min(1, Number(lossSmoothControl.input.value) || 0.08));
        const evalLossCurve = evalCurveControl.select.value || EVAL_LOSS_CURVE;
        const lossYScale = runLossYAxis.yScaleControl.select.value || "linear";
        const gradYScale = runGradYAxis.yScaleControl.select.value || "linear";

        const trimmedForLoss = trimPoints(history, lossStart, lossEnd, panelReferenceRows);
        const baselineLossTrimmed =
          baselineHistory.length > 0 ? trimPoints(baselineHistory, lossStart, lossEnd, panelReferenceRows) : [];
        const comparisonLossRows = [
          ...trimmedForLoss.map((row) => ({...row, series_label: runLabel})),
          ...baselineLossTrimmed.map((row) => ({...row, series_label: baselineLabel || "Baseline"}))
        ];

        const trimmedForGrad = trimPoints(history, gradStart, gradEnd, panelReferenceRows);
        const baselineGradTrimmed =
          baselineHistory.length > 0 ? trimPoints(baselineHistory, gradStart, gradEnd, panelReferenceRows) : [];
        const comparisonGradRows = [
          ...trimmedForGrad.map((row) => ({...row, series_label: runLabel})),
          ...baselineGradTrimmed.map((row) => ({...row, series_label: baselineLabel || "Baseline"}))
        ];
        const lossValues = comparisonLossRows
          .flatMap((row) => [Number(row.loss), Number(row.eval_loss)])
          .filter((value) => isFinitePositive(value));
        const gradValues = comparisonGradRows
          .map((row) => Number(row.grad_norm_unclipped))
          .filter((value) => isFinitePositive(value));
        syncYMaxControl(runLossYAxis.yMaxControl, lossValues, runLossAutoY);
        syncYMaxControl(runGradYAxis.yMaxControl, gradValues, runGradAutoY, gradBoundsOptions);
        const lossYMax = Number(runLossYAxis.yMaxControl.input.value);
        const gradYMax = Number(runGradYAxis.yMaxControl.input.value);
        setRangeOutput(lossSmoothControl);

        summaryText.textContent = runSummaryText(summary, history, trimmedForLoss);

        clearNode(lossChartHost);
        lossChartHost.appendChild(
          plotLossCurves(comparisonLossRows, lossYScale, lossYMax, lossSmoothAlpha, evalLossCurve)
        );

        clearNode(gradChartHost);
        gradChartHost.appendChild(plotGradNorm(comparisonGradRows, gradYScale, gradYMax));
      }

      const refreshRunPanelDebounced = debounce(refreshRunPanel, 120);
      evalCurveControl.select.addEventListener("change", refreshRunPanelDebounced);
      runLossYAxis.yScaleControl.select.addEventListener("change", refreshRunPanelDebounced);
      runLossYAxis.yMaxControl.input.addEventListener("input", () => {
        runLossAutoY = false;
        refreshRunPanelDebounced();
      });
      lossSmoothControl.input.addEventListener("input", refreshRunPanelDebounced);
      runGradYAxis.yScaleControl.select.addEventListener("change", refreshRunPanelDebounced);
      runGradYAxis.yMaxControl.input.addEventListener("input", () => {
        runGradAutoY = false;
        refreshRunPanelDebounced();
      });
      lossExcludeStartControl.input.addEventListener("input", () => {
        runLossAutoY = true;
        refreshRunPanelDebounced();
      });
      lossExcludeEndControl.input.addEventListener("input", () => {
        runLossAutoY = true;
        refreshRunPanelDebounced();
      });
      gradExcludeStartControl.input.addEventListener("input", () => {
        runGradAutoY = true;
        refreshRunPanelDebounced();
      });
      gradExcludeEndControl.input.addEventListener("input", () => {
        runGradAutoY = true;
        refreshRunPanelDebounced();
      });

      refreshRunPanel();
      panelsHost.appendChild(panel);
    }
  }
  return root;
}

export async function renderAblationsSummary(options = {}) {
  return renderAblationsByRun({...options, showPerRun: false});
}

export async function renderAblationsOverviewCharts(options = {}) {
  return renderAblationsByRun({...options, showPerRun: false});
}

export async function renderAblationsHistory(options = {}) {
  return renderAblationsByRun({...options, showOverall: false});
}

export async function renderAblationSection(options = {}) {
  return renderAblationsByRun({...options, showOverall: false, showHeading: false});
}

export async function renderAblations(options = {}) {
  return renderAblationsByRun(options);
}
