import {FileAttachment} from "../../_observablehq/stdlib.43270668.js";
import * as Plot from "../components/echart-plot.334353fc.js";
import * as d3 from "../../_npm/d3@7.9.0/e324157d.js";
import {formatMs} from "../components/data-utils.e2caa41c.js";
import {
  clearNode,
  emptyState,
  renderSimpleTable,
  sectionHeading,
  el,
  card,
  selectControl,
  rangeControl,
  debounce
} from "../components/dom-utils.facbe44a.js";

const ATTACHMENTS = {
  main: FileAttachment({"name":"../../data/raw/benchmarks/ablations_main.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/ablations_main.912ec8a5.parquet","lastModified":1771874136911,"size":26405}, import.meta.url),
  history: FileAttachment({"name":"../../data/raw/benchmarks/ablations_history.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/ablations_history.c15e6588.parquet","lastModified":1771874136910,"size":2777049}, import.meta.url)
};

const EVAL_LOSS_CURVE = "catmull-rom";

let ablationDataPromise;
const ABLATION_CACHE_IDLE_MS = 2 * 60 * 1000;
let ablationCacheTimer = null;

function touchAblationCache() {
  if (typeof window === "undefined") return;
  if (ablationCacheTimer) window.clearTimeout(ablationCacheTimer);
  ablationCacheTimer = window.setTimeout(() => {
    ablationDataPromise = null;
    ablationCacheTimer = null;
  }, ABLATION_CACHE_IDLE_MS);
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

function fmt(value, digits = 4) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
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

function resolveExcludeWindow(maxTrim, excludeStart, excludeEnd) {
  const start = Math.max(0, Math.min(maxTrim, Number(excludeStart) || 0));
  const end = Math.max(0, Math.min(maxTrim - start, Number(excludeEnd) || 0));
  return {
    excludeStart: Math.round(start),
    excludeEnd: Math.round(end)
  };
}

function isFinitePositive(value) {
  return Number.isFinite(value) && Number(value) > 0;
}

function createYAxisControls(defaultScale = "linear") {
  const yScaleControl = selectControl(
    "Y scale",
    [
      {value: "linear", label: "Linear"},
      {value: "log", label: "Log"}
    ],
    defaultScale
  );
  return {yScaleControl};
}

function buildYAxisConfig(values, label, yScale) {
  const positive = values.filter((value) => isFinitePositive(value));
  if (positive.length === 0) return {label, grid: true};

  const min = d3.min(positive);
  const maxData = d3.max(positive);
  const max = Math.max(maxData, min * 1.01);
  const tickFormat = d3.format(".3~g");
  if (yScale === "log") return {label, grid: true, type: "log", domain: [min, max], tickFormat};
  return {label, grid: true, domain: [min, max], tickFormat};
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

function makeControlsCard(minWidth = 320) {
  const controls = card();
  controls.style.gridTemplateColumns = `repeat(auto-fit, minmax(${minWidth}px, 1fr))`;
  controls.style.alignItems = "center";
  controls.style.gap = "0.75rem";
  return controls;
}

function appendControls(container, ...controls) {
  for (const controlNode of controls) {
    if (!controlNode) continue;
    controlNode.style.maxWidth = "100%";
    controlNode.style.minWidth = "0";
    container.appendChild(controlNode);
  }
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

function truncateText(value, max = 28) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
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

function plotLossAcrossAblations(historyByRun, runNames, mainByRun, excludeStart, excludeEnd, yScale = "linear") {
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
    marginBottom: 72,
    x: buildXAxisConfig(rows, "Step"),
    y: buildYAxisConfig(yValues, "Loss", yScale),
    dataZoom: Plot.dataZoomXY(),
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
  yScale = "linear"
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
    marginBottom: 72,
    x: buildXAxisConfig(rows, "Step"),
    y: buildYAxisConfig(yValues, "Eval Loss", yScale),
    dataZoom: Plot.dataZoomXY(),
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

function plotGradNormAcrossAblations(historyByRun, runNames, mainByRun, excludeStart, excludeEnd, yScale = "linear") {
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
    marginBottom: 72,
    x: buildXAxisConfig(rows, "Step"),
    y: buildYAxisConfig(yValues, "Grad Norm", yScale),
    dataZoom: Plot.dataZoomXY(),
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

function renderGradNormStabilitySummary(rows, highPercentile, valueScale = "linear") {
  const host = card();
  const chartRows = rows.filter((row) => row.count > 0 && isFinitePositive(row.median) && isFinitePositive(row.high));
  const percentileLabel = `P${Math.round(highPercentile * 100)}`;

  if (chartRows.length === 0) {
    host.appendChild(emptyState("No finite non-zero grad-norm values for stability summary."));
    return host;
  }

  const chartHeight = Math.max(260, Math.min(900, 100 + chartRows.length * 24));
  const axisValues = chartRows.flatMap((row) => [row.median, row.high]);
  const connectorRows = chartRows.flatMap((row) => ([
    {run_display: row.run_display, value: row.median},
    {run_display: row.run_display, value: row.high}
  ]));
  const medianColor = "#7dd3fc";
  const percentileColor = "#fb7185";
  const connectorColor = "rgba(147, 197, 253, 0.95)";
  host.appendChild(
    Plot.plot({
      width: 920,
      height: chartHeight,
      marginLeft: 112,
      marginRight: 28,
      x: buildYAxisConfig(axisValues, "Grad Norm", valueScale),
      y: {
        label: null,
        tickFormat: (value) => truncateText(value, 22)
      },
      dataZoom: Plot.dataZoomX(),
      color: {legend: true, domain: ["Median", percentileLabel], range: [medianColor, percentileColor]},
      marks: [
        Plot.line(connectorRows, {
          x: "value",
          y: "run_display",
          z: "run_display",
          seriesName: () => "",
          stroke: () => connectorColor,
          strokeWidth: 2.2
        }),
        Plot.dot(chartRows, {
          y: "run_display",
          x: "median",
          fill: () => "Median",
          r: 6,
          tip: true,
          title: (d) => `${d.run_display}\nMedian: ${fmt(d.median, 6)}\n${percentileLabel}: ${fmt(d.high, 6)}\nRatio: ${fmt(d.ratio, 3)}`
        }),
        Plot.dot(chartRows, {
          y: "run_display",
          x: "high",
          fill: () => percentileLabel,
          r: 6,
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
    ablationDataPromise.catch(() => {
      ablationDataPromise = null;
    });
  }
  touchAblationCache();
  return ablationDataPromise;
}

function plotLossCurves(historyRows, yScale = "linear", lossSmoothAlpha = 0.08, evalLossCurve = EVAL_LOSS_CURVE) {
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
    height: 360,
    marginBottom: 72,
    x: buildXAxisConfig(allRows, "Step"),
    y: buildYAxisConfig(yValues, "Loss / Eval Loss", yScale),
    dataZoom: Plot.dataZoomXY(),
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

function plotGradNorm(historyRows, yScale = "linear") {
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
    height: 320,
    marginBottom: 72,
    x: buildXAxisConfig(gradRows, "Step"),
    y: buildYAxisConfig(yValues, "Grad Norm", yScale),
    dataZoom: Plot.dataZoomXY(),
    color: {legend: true, domain: seriesLabels, range: seriesColors},
    marks: [
      Plot.dot(gradRows, {
        x: "step",
        y: "grad_norm_unclipped",
        fill: "series_label",
        r: 3.4,
        opacity: 0.85,
        tip: true,
        title: (d) => `${d.series_label}\nstep: ${d.step}\nGrad Norm: ${fmt(d.grad_norm_unclipped, 6)}`
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
  if (showOverall) {
    const allChartCard = card();
    allChartCard.appendChild(sectionHeading("Loss Across All Ablations"));
    const allControls = makeControlsCard();
    const allLossYAxis = createYAxisControls(options.lossYScale || "linear");
    const allMaxTrim = Math.max(0, scopedStepCount - 1);
    const allWindow = resolveExcludeWindow(allMaxTrim, options.excludeStart, options.excludeEnd);
    appendControls(allControls, allLossYAxis.yScaleControl.node);
    const allChartHost = card();
    allChartCard.append(allControls, allChartHost);
    root.appendChild(allChartCard);

    function refreshAllChart() {
      const {excludeStart, excludeEnd} = allWindow;
      const yScale = allLossYAxis.yScaleControl.select.value || "linear";
      clearNode(allChartHost);
      allChartHost.appendChild(
        plotLossAcrossAblations(historyByRun, runNames, mainByRun, excludeStart, excludeEnd, yScale)
      );
    }

    const refreshAllChartDebounced = debounce(refreshAllChart, 120);
    allLossYAxis.yScaleControl.select.addEventListener("change", refreshAllChartDebounced);
    refreshAllChart();

    const evalChartCard = card();
    evalChartCard.appendChild(sectionHeading("Eval Loss Across All Ablations"));
    const evalControls = makeControlsCard();
    const allEvalYAxis = createYAxisControls(options.evalYScale || "linear");
    const evalMaxTrim = Math.max(0, scopedStepCount - 1);
    const evalWindow = resolveExcludeWindow(evalMaxTrim, options.excludeStart, options.excludeEnd);
    const evalCurveControl = selectControl(
      "Eval-loss spline curve",
      [
        {value: "catmull-rom", label: "Catmull-Rom"},
        {value: "basis", label: "Basis"},
        {value: "natural", label: "Natural"}
      ],
      options.evalSplineCurve || options.splineCurve || EVAL_LOSS_CURVE
    );
    appendControls(evalControls, evalCurveControl.node, allEvalYAxis.yScaleControl.node);
    const evalChartHost = card();
    evalChartCard.append(evalControls, evalChartHost);
    root.appendChild(evalChartCard);
    function refreshEvalChart() {
      const {excludeStart, excludeEnd} = evalWindow;
      const evalLossCurve = evalCurveControl.select.value || EVAL_LOSS_CURVE;
      const yScale = allEvalYAxis.yScaleControl.select.value || "linear";
      clearNode(evalChartHost);
      evalChartHost.appendChild(
        plotEvalLossAcrossAblations(
          historyByRun,
          runNames,
          mainByRun,
          excludeStart,
          excludeEnd,
          evalLossCurve,
          yScale
        )
      );
    }

    const refreshEvalChartDebounced = debounce(refreshEvalChart, 120);
    allEvalYAxis.yScaleControl.select.addEventListener("change", refreshEvalChartDebounced);
    evalCurveControl.select.addEventListener("change", refreshEvalChartDebounced);
    refreshEvalChart();

    const gradChartCard = card();
    gradChartCard.appendChild(sectionHeading("Grad Norm Across All Ablations"));
    const gradControls = makeControlsCard();
    const allGradYAxis = createYAxisControls(options.gradYScale || "linear");
    const gradMaxTrim = Math.max(0, scopedStepCount - 1);
    const gradWindow = resolveExcludeWindow(gradMaxTrim, options.excludeStart, options.excludeEnd);
    appendControls(gradControls, allGradYAxis.yScaleControl.node);
    const gradAllChartHost = card();
    gradChartCard.append(gradControls, gradAllChartHost);
    root.appendChild(gradChartCard);

    function refreshGradChart() {
      const {excludeStart, excludeEnd} = gradWindow;
      const yScale = allGradYAxis.yScaleControl.select.value || "linear";
      clearNode(gradAllChartHost);
      gradAllChartHost.appendChild(
        plotGradNormAcrossAblations(historyByRun, runNames, mainByRun, excludeStart, excludeEnd, yScale)
      );
    }

    const refreshGradChartDebounced = debounce(refreshGradChart, 120);
    allGradYAxis.yScaleControl.select.addEventListener("change", refreshGradChartDebounced);
    refreshGradChart();

    const stabilityCard = card();
    stabilityCard.appendChild(sectionHeading("Grad-Norm Stability Summary"));
    const stabilityControls = makeControlsCard();
    const stabilityMaxTrim = Math.max(0, scopedStepCount - 1);
    const stabilityWindow = resolveExcludeWindow(stabilityMaxTrim, options.excludeStart, options.excludeEnd);
    const stabilityPercentileControl = selectControl(
      "High percentile",
      [
        {value: "0.95", label: "P95"},
        {value: "0.90", label: "P90"},
        {value: "0.99", label: "P99"}
      ],
      String(options.gradNormPercentile ?? "0.95")
    );
    const stabilityYAxis = createYAxisControls(options.stabilityYScale || "linear");
    appendControls(stabilityControls, stabilityPercentileControl.node, stabilityYAxis.yScaleControl.node);
    const stabilityHost = card();
    stabilityCard.append(stabilityControls, stabilityHost);
    root.appendChild(stabilityCard);
    function refreshStabilitySummary() {
      const {excludeStart, excludeEnd} = stabilityWindow;
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
      const valueScale = stabilityYAxis.yScaleControl.select.value || "linear";
      clearNode(stabilityHost);
      stabilityHost.appendChild(renderGradNormStabilitySummary(rows, highPercentile, valueScale));
    }

    const refreshStabilityDebounced = debounce(refreshStabilitySummary, 120);
    stabilityYAxis.yScaleControl.select.addEventListener("change", refreshStabilityDebounced);
    stabilityPercentileControl.select.addEventListener("change", refreshStabilityDebounced);
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
      panel.style.padding = "0.5rem";
      panel.appendChild(sectionHeading(runLabel));

      const summaryText = el("p", runSummaryText(summary, history, history));
      summaryText.style.margin = "0";
      summaryText.style.fontSize = "0.9rem";
      panel.appendChild(summaryText);

      const lossControls = makeControlsCard();
      const runLossYAxis = createYAxisControls(options.lossYScale || "linear");
      const evalCurveControl = selectControl(
        "Spline curve",
        [
          {value: "catmull-rom", label: "Catmull-Rom"},
          {value: "basis", label: "Basis"},
          {value: "natural", label: "Natural"}
        ],
        options.evalSplineCurve || options.splineCurve || EVAL_LOSS_CURVE
      );
      const lossSmoothControl = rangeControl("Smooth alpha", 0.005, 1, 0.005, options.lossSmoothAlpha ?? 0.08);
      setRangeOutput(lossSmoothControl);
      const lossWindow = resolveExcludeWindow(maxTrim, options.excludeStart, options.excludeEnd);
      appendControls(lossControls, evalCurveControl.node, runLossYAxis.yScaleControl.node, lossSmoothControl.node);
      panel.appendChild(lossControls);

      panel.appendChild(el("h4", baselineHistory.length > 0 ? "Loss and Eval Loss (with baseline)" : "Loss and Eval Loss"));
      panel.lastChild.style.margin = "0";
      const lossChartHost = card();
      panel.appendChild(lossChartHost);

      const gradControls = makeControlsCard();
      const runGradYAxis = createYAxisControls(options.gradYScale || "linear");
      const gradWindow = resolveExcludeWindow(maxTrim, options.excludeStart, options.excludeEnd);
      appendControls(gradControls, runGradYAxis.yScaleControl.node);
      panel.appendChild(gradControls);

      panel.appendChild(el("h4", baselineHistory.length > 0 ? "Unclipped Grad Norm (with baseline)" : "Unclipped Grad Norm"));
      panel.lastChild.style.margin = "0";
      const gradChartHost = card();
      panel.appendChild(gradChartHost);
      function refreshRunPanel() {
        const {excludeStart: lossStart, excludeEnd: lossEnd} = lossWindow;
        const {excludeStart: gradStart, excludeEnd: gradEnd} = gradWindow;
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
        setRangeOutput(lossSmoothControl);

        summaryText.textContent = runSummaryText(summary, history, trimmedForLoss);

        clearNode(lossChartHost);
        lossChartHost.appendChild(
          plotLossCurves(comparisonLossRows, lossYScale, lossSmoothAlpha, evalLossCurve)
        );

        clearNode(gradChartHost);
        gradChartHost.appendChild(plotGradNorm(comparisonGradRows, gradYScale));
      }

      const refreshRunPanelDebounced = debounce(refreshRunPanel, 120);
      evalCurveControl.select.addEventListener("change", refreshRunPanelDebounced);
      runLossYAxis.yScaleControl.select.addEventListener("change", refreshRunPanelDebounced);
      lossSmoothControl.input.addEventListener("input", refreshRunPanelDebounced);
      runGradYAxis.yScaleControl.select.addEventListener("change", refreshRunPanelDebounced);
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
