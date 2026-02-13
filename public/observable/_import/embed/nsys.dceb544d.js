import {FileAttachment} from "../../_observablehq/stdlib.43270668.js";
import * as Plot from "../../_npm/@observablehq/plot@0.6.17/7c43807f.js";
import * as d3 from "../../_npm/d3@7.9.0/e324157d.js";
import {calculateForwardFlops, calculateMemoryAccounting, calculateModelParams, calculateTrainingStepFlops} from "../components/perf-estimates.d771a94d.js";
import {formatBytes, formatMs} from "../components/data-utils.e2caa41c.js";
import {clearNode, emptyState, renderSimpleTable, sectionHeading} from "../components/dom-utils.aaca454b.js";

const TRACE_ATTACHMENTS = {
  bad_head_size: FileAttachment({"name":"../../data/raw/traces/bad_head_size_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/bad_head_size_nsys.0e5fcf94.parquet","lastModified":1770920604380,"size":699507}, import.meta.url),
  bandwidth_bound: FileAttachment({"name":"../../data/raw/traces/bandwidth_bound_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/bandwidth_bound_nsys.0570a4e8.parquet","lastModified":1770920604381,"size":526034}, import.meta.url),
  compute_bound: FileAttachment({"name":"../../data/raw/traces/compute_bound_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/compute_bound_nsys.9be21553.parquet","lastModified":1770920604383,"size":1020491}, import.meta.url),
  deep_sequential: FileAttachment({"name":"../../data/raw/traces/deep_sequential_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/deep_sequential_nsys.4ed702eb.parquet","lastModified":1770920604387,"size":3186034}, import.meta.url),
  latency_bound: FileAttachment({"name":"../../data/raw/traces/latency_bound_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/latency_bound_nsys.5b9c4edd.parquet","lastModified":1770920604389,"size":1104236}, import.meta.url),
  misaligned_dims: FileAttachment({"name":"../../data/raw/traces/misaligned_dims_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/misaligned_dims_nsys.e0e9fef3.parquet","lastModified":1770920604389,"size":834}, import.meta.url),
  model_a: FileAttachment({"name":"../../data/raw/traces/model_a_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/model_a_nsys.7c95f1f4.parquet","lastModified":1770920604390,"size":294932}, import.meta.url),
  model_b: FileAttachment({"name":"../../data/raw/traces/model_b_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/model_b_nsys.d909797c.parquet","lastModified":1770920604391,"size":1231233}, import.meta.url),
  vocab_bottleneck: FileAttachment({"name":"../../data/raw/traces/vocab_bottleneck_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/vocab_bottleneck_nsys.c6e0b393.parquet","lastModified":1770920604392,"size":509294}, import.meta.url),
  wide_ffn: FileAttachment({"name":"../../data/raw/traces/wide_ffn_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/wide_ffn_nsys.e3df5806.parquet","lastModified":1770920604393,"size":715444}, import.meta.url)
};

const TRACE_NAMES = Object.keys(TRACE_ATTACHMENTS);
const EVENT_TYPES = ["kernel", "memcpy", "memset"];
const traceCache = new Map();

const TRACE_RESOURCE_CONFIGS = [
  {
    trace: "model_a",
    category: "baseline",
    B: 32,
    S: 256,
    V: 10000,
    d_model: 768,
    n_heads: 12,
    n_blocks: 2,
    d_ff: 2048
  },
  {
    trace: "model_b",
    category: "baseline",
    B: 32,
    S: 256,
    V: 10000,
    d_model: 384,
    n_heads: 12,
    n_blocks: 12,
    d_ff: 1024
  },
  {
    trace: "latency_bound",
    category: "stress",
    B: 1,
    S: 128,
    V: 10000,
    d_model: 512,
    n_heads: 8,
    n_blocks: 12,
    d_ff: 1536
  },
  {
    trace: "misaligned_dims",
    category: "stress",
    B: 34,
    S: 257,
    V: 10000,
    d_model: 514,
    n_heads: 2,
    n_blocks: 6,
    d_ff: 1538
  },
  {
    trace: "bad_head_size",
    category: "stress",
    B: 32,
    S: 256,
    V: 10000,
    d_model: 672,
    n_heads: 12,
    n_blocks: 6,
    d_ff: 1792
  },
  {
    trace: "vocab_bottleneck",
    category: "stress",
    B: 64,
    S: 256,
    V: 50257,
    d_model: 512,
    n_heads: 8,
    n_blocks: 4,
    d_ff: 1536
  },
  {
    trace: "wide_ffn",
    category: "stress",
    B: 32,
    S: 256,
    V: 10000,
    d_model: 768,
    n_heads: 12,
    n_blocks: 6,
    d_ff: 4096
  },
  {
    trace: "bandwidth_bound",
    category: "stress",
    B: 256,
    S: 256,
    V: 10000,
    d_model: 384,
    n_heads: 6,
    n_blocks: 4,
    d_ff: 1024
  },
  {
    trace: "compute_bound",
    category: "stress",
    B: 32,
    S: 256,
    V: 10000,
    d_model: 1536,
    n_heads: 24,
    n_blocks: 8,
    d_ff: 4096
  },
  {
    trace: "deep_sequential",
    category: "stress",
    B: 32,
    S: 256,
    V: 10000,
    d_model: 512,
    n_heads: 8,
    n_blocks: 32,
    d_ff: 1536
  }
];

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

function nsToMs(value) {
  if (typeof value === "bigint") return Number(value) / 1e6;
  const n = Number(value);
  return Number.isFinite(n) ? n / 1e6 : NaN;
}

function safeNumber(value, fallback = NaN) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function checkboxGroup(values, initialValues, legendText, keyPrefix) {
  const fieldset = el("fieldset");
  fieldset.style.border = "none";
  fieldset.style.padding = "0";
  fieldset.style.margin = "0";
  fieldset.style.display = "flex";
  fieldset.style.flexWrap = "wrap";
  fieldset.style.gap = "0.75rem";

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
    label.style.cursor = "pointer";

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

async function loadTraceRows(traceName) {
  if (traceCache.has(traceName)) return traceCache.get(traceName);

  const attachment = TRACE_ATTACHMENTS[traceName];
  if (!attachment) throw new Error(`Unknown trace: ${traceName}`);

  const table = await attachment.parquet();
  const rows = Array.from(table, (row) => {
    const startMs = nsToMs(row.start_ns);
    const endMs = nsToMs(row.end_ns);
    const durationMs = Number.isFinite(Number(row.duration_ms))
      ? Number(row.duration_ms)
      : Number.isFinite(startMs) && Number.isFinite(endMs)
        ? Math.max(0, endMs - startMs)
        : NaN;

    return {
      trace: traceName,
      event_type: String(row.event_type || "unknown"),
      event_name: String(row.event_name || "unknown"),
      start_ms: startMs,
      end_ms: endMs,
      duration_ms: durationMs,
      bytes: safeNumber(row.bytes, 0)
    };
  }).filter((row) => Number.isFinite(row.start_ms) && Number.isFinite(row.end_ms));

  traceCache.set(traceName, rows);
  return rows;
}

function aggregateSummary(rows) {
  return d3
    .rollups(
      rows,
      (group) => ({
        event_count: group.length,
        total_duration_ms: d3.sum(group, (row) => row.duration_ms)
      }),
      (row) => row.trace,
      (row) => row.event_type
    )
    .flatMap(([trace, perType]) => perType.map(([eventType, stats]) => ({trace, event_type: eventType, ...stats})))
    .sort((a, b) => d3.ascending(a.trace, b.trace) || d3.ascending(a.event_type, b.event_type));
}

function aggregateTimeline(rows, mode, laneStyle, rank, maxEvents, bucketMs, topLanes) {
  if (rows.length === 0) return {rows: [], laneCountTotal: 0, laneCountKept: 0};

  const ranked =
    rank === "longest"
      ? [...rows].sort((a, b) => d3.descending(a.duration_ms, b.duration_ms))
      : [...rows].sort((a, b) => d3.ascending(a.start_ms, b.start_ms));

  const selected = ranked.slice(0, maxEvents);
  const minStart = d3.min(selected, (row) => row.start_ms) || 0;

  const withRelative = selected.map((row) => ({
    ...row,
    start_ms: row.start_ms - minStart,
    end_ms: row.end_ms - minStart,
    lane: laneStyle === "trace_event" ? `${row.trace} | ${row.event_name}` : row.trace
  }));

  let timelineRows;
  if (mode === "rolled") {
    timelineRows = d3
      .rollups(
        withRelative,
        (group) => ({
          event_count: group.length,
          total_duration_ms: d3.sum(group, (row) => row.duration_ms),
          avg_duration_ms: d3.mean(group, (row) => row.duration_ms) || 0,
          trace: group[0].trace,
          event_type: group[0].event_type,
          lane: group[0].lane,
          start_ms: (Math.floor(group[0].start_ms / bucketMs) || 0) * bucketMs
        }),
        (row) => row.lane,
        (row) => row.event_type,
        (row) => Math.floor(row.start_ms / bucketMs)
      )
      .flatMap(([lane, eventTypeBuckets]) =>
        eventTypeBuckets.flatMap(([eventType, buckets]) =>
          buckets.map(([, stats]) => ({
            lane,
            event_type: eventType,
            trace: stats.trace,
            event_count: stats.event_count,
            total_duration_ms: stats.total_duration_ms,
            avg_duration_ms: stats.avg_duration_ms,
            start_ms: stats.start_ms,
            end_ms: stats.start_ms + bucketMs
          }))
        )
      )
      .sort((a, b) => d3.ascending(a.start_ms, b.start_ms));
  } else {
    timelineRows = withRelative;
  }

  const durationKey = mode === "rolled" ? "total_duration_ms" : "duration_ms";
  const laneTotals = d3
    .rollups(
      timelineRows,
      (group) => d3.sum(group, (row) => row[durationKey]),
      (row) => row.lane
    )
    .map(([lane, totalDuration]) => ({lane, total_duration: totalDuration}))
    .sort((a, b) => d3.descending(a.total_duration, b.total_duration));

  const allowedLanes = new Set(laneTotals.slice(0, topLanes).map((row) => row.lane));
  const filtered = timelineRows.filter((row) => allowedLanes.has(row.lane));

  return {
    rows: filtered,
    laneCountTotal: laneTotals.length,
    laneCountKept: Math.min(topLanes, laneTotals.length)
  };
}

function aggregateKernels(rows, topK) {
  const kernelRows = rows.filter((row) => row.event_type === "kernel");

  const byTraceKernel = d3
    .rollups(
      kernelRows,
      (group) => ({
        invocations: group.length,
        total_duration_ms: d3.sum(group, (row) => row.duration_ms),
        avg_duration_ms: d3.mean(group, (row) => row.duration_ms) || 0
      }),
      (row) => row.trace,
      (row) => row.event_name
    )
    .flatMap(([trace, kernels]) => kernels.map(([kernel_name, stats]) => ({trace, kernel_name, ...stats})));

  const topNames = d3
    .rollups(
      byTraceKernel,
      (group) => ({
        invocations: d3.sum(group, (row) => row.invocations),
        total_duration_ms: d3.sum(group, (row) => row.total_duration_ms)
      }),
      (row) => row.kernel_name
    )
    .sort((a, b) => d3.descending(a[1].total_duration_ms, b[1].total_duration_ms))
    .slice(0, topK)
    .map(([name]) => name);

  return byTraceKernel.filter((row) => topNames.includes(row.kernel_name));
}

function aggregateMemory(rows) {
  const memRows = rows.filter((row) => row.event_type === "memcpy" || row.event_type === "memset");

  return d3
    .rollups(
      memRows,
      (group) => ({
        op_count: group.length,
        total_duration_ms: d3.sum(group, (row) => row.duration_ms),
        total_bytes: d3.sum(group, (row) => row.bytes)
      }),
      (row) => row.trace,
      (row) => row.event_name
    )
    .flatMap(([trace, ops]) => ops.map(([operation, stats]) => ({trace, operation, ...stats})))
    .sort((a, b) => d3.descending(a.total_duration_ms, b.total_duration_ms));
}

function resourceEnvelopeRows(selectedTraces) {
  return TRACE_RESOURCE_CONFIGS.filter((spec) => selectedTraces.includes(spec.trace)).map((spec) => {
    const dHead = spec.d_model % spec.n_heads === 0 ? spec.d_model / spec.n_heads : NaN;
    if (!Number.isFinite(dHead)) {
      return {
        trace: spec.trace,
        category: spec.category,
        B: spec.B,
        S: spec.S,
        d_model: spec.d_model,
        n_heads: spec.n_heads,
        d_head: "n/a",
        d_ff: spec.d_ff,
        params_m: NaN,
        peak_mem_gb: NaN,
        steady_mem_gb: NaN,
        train_tflops: NaN,
        fits_24gb: false,
        head_dim_multiple_32: false,
        d_ff_multiple_64: spec.d_ff % 64 === 0
      };
    }

    const memory = calculateMemoryAccounting({
      B: spec.B,
      S: spec.S,
      V: spec.V,
      d_model: spec.d_model,
      n_heads: spec.n_heads,
      n_blocks: spec.n_blocks,
      d_ff: spec.d_ff,
      d_head: dHead,
      wt_dtype: "float32",
      ft_dtype: "bfloat16",
      grad_dtype: "bfloat16",
      use_amp: true
    });
    const params = calculateModelParams(spec.V, spec.d_model, spec.n_heads, spec.n_blocks, spec.d_ff);
    const fwd = calculateForwardFlops(spec.B, spec.S, spec.V, spec.d_model, spec.n_heads, spec.n_blocks, spec.d_ff);
    const train = calculateTrainingStepFlops(fwd.total);

    return {
      trace: spec.trace,
      category: spec.category,
      B: spec.B,
      S: spec.S,
      d_model: spec.d_model,
      n_heads: spec.n_heads,
      d_head: dHead,
      d_ff: spec.d_ff,
      params_m: params.total_M,
      peak_mem_gb: memory.peak_training_raw / 1e9,
      steady_mem_gb: memory.steady_state_raw / 1e9,
      train_tflops: train.total_TFLOPs,
      fits_24gb: memory.peak_training_raw <= 24e9,
      head_dim_multiple_32: dHead % 32 === 0,
      d_ff_multiple_64: spec.d_ff % 64 === 0
    };
  });
}

export async function renderNsys(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-nsys";
  root.style.display = "grid";
  root.style.gap = "1rem";

  const title = el("h2", "NSYS Trace Analysis");
  title.style.margin = "0";
  const subtitle = el(
    "p",
    "Model resource envelope, advanced timeline controls, load diagnostics, and kernel/memory analysis."
  );
  subtitle.style.margin = "0";

  const status = el("p");
  status.style.margin = "0";

  const controls = card();
  const resourceHost = card();
  const diagnosticsHost = card();
  const summaryHost = card();
  const timelineHost = card();
  const kernelHost = card();
  const memoryHost = card();

  root.append(title, subtitle, controls, status, resourceHost, diagnosticsHost, summaryHost, timelineHost, kernelHost, memoryHost);

  const traceControl = checkboxGroup(
    TRACE_NAMES,
    Array.isArray(options.initialTraces) && options.initialTraces.length > 0 ? options.initialTraces : TRACE_NAMES,
    "Traces",
    "trace"
  );
  const typeControl = checkboxGroup(
    EVENT_TYPES,
    Array.isArray(options.initialEventTypes) && options.initialEventTypes.length > 0 ? options.initialEventTypes : EVENT_TYPES,
    "Event Types",
    "type"
  );

  const timelineMode = selectControl(
    "Timeline Mode",
    [
      {value: "rolled", label: "rolled up (buckets)"},
      {value: "raw", label: "raw events"}
    ],
    options.timelineMode || "rolled"
  );
  const timelineSource = selectControl(
    "Event Source",
    [
      {value: "all", label: "kernels + memory"},
      {value: "kernels", label: "kernels only"},
      {value: "memory", label: "memory only"}
    ],
    options.timelineSource || "all"
  );
  const laneStyle = selectControl(
    "Lane Style",
    [
      {value: "trace", label: "trace"},
      {value: "trace_event", label: "trace + event"}
    ],
    options.laneStyle || "trace"
  );
  const timelineRank = selectControl(
    "Event Selection",
    [
      {value: "earliest", label: "earliest first"},
      {value: "longest", label: "longest first"}
    ],
    options.timelineRank || "earliest"
  );

  const kernelMetric = selectControl(
    "Kernel Ranking",
    [
      {value: "duration", label: "total duration"},
      {value: "count", label: "invocation count"}
    ],
    options.kernelMetric || "duration"
  );

  const topK = rangeControl("Top kernels", 3, 50, 1, options.topK ?? 10);
  const maxEvents = rangeControl("Max timeline events", 100, 20000, 100, options.timelineMaxEvents ?? 6000);
  const bucket = rangeControl("Timeline bucket (ms)", 1, 200, 1, options.timelineBucketMs ?? 10);
  const topLanes = rangeControl("Top timeline lanes", 1, 200, 1, options.timelineTopLanes ?? 40);

  controls.style.gap = "0.8rem";
  controls.append(
    sectionHeading("Controls"),
    traceControl.node,
    typeControl.node,
    timelineMode.node,
    timelineSource.node,
    laneStyle.node,
    timelineRank.node,
    kernelMetric.node,
    topK.node,
    maxEvents.node,
    bucket.node,
    topLanes.node
  );

  const refresh = async () => {
    topK.output.textContent = topK.input.value;
    maxEvents.output.textContent = maxEvents.input.value;
    bucket.output.textContent = bucket.input.value;
    topLanes.output.textContent = topLanes.input.value;

    const selectedTraces = traceControl.getSelected();
    const selectedTypes = new Set(typeControl.getSelected());

    if (selectedTraces.length === 0 || selectedTypes.size === 0) {
      status.textContent = "Select at least one trace and one event type.";
      clearNode(resourceHost);
      clearNode(diagnosticsHost);
      clearNode(summaryHost);
      clearNode(timelineHost);
      clearNode(kernelHost);
      clearNode(memoryHost);
      resourceHost.append(sectionHeading("Model Resource Envelope"), emptyState("No traces selected."));
      diagnosticsHost.append(sectionHeading("Load Diagnostics"), emptyState("No traces selected."));
      summaryHost.append(sectionHeading("Trace/Event Summary"), emptyState("No rows to render."));
      timelineHost.append(sectionHeading("Timeline View"), emptyState("No timeline rows to render."));
      kernelHost.append(sectionHeading("Kernel Inventory"), emptyState("No kernel rows to render."));
      memoryHost.append(sectionHeading("Memory Operations"), emptyState("No memory rows to render."));
      return;
    }

    const loadErrors = [];
    const rowsByTrace = [];

    for (const traceName of selectedTraces) {
      try {
        rowsByTrace.push(...(await loadTraceRows(traceName)));
      } catch (error) {
        loadErrors.push({
          trace: traceName,
          stage: "load",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const source = timelineSource.select.value;
    const sourceFiltered = rowsByTrace.filter((row) => {
      if (!selectedTypes.has(row.event_type)) return false;
      if (source === "kernels") return row.event_type === "kernel";
      if (source === "memory") return row.event_type === "memcpy" || row.event_type === "memset";
      return true;
    });

    status.textContent = `${sourceFiltered.length.toLocaleString("en-US")} events loaded from ${selectedTraces.length} trace(s).`;

    clearNode(resourceHost);
    resourceHost.appendChild(sectionHeading("Model Resource Envelope (RTX 4090 AMP assumptions)"));
    const resourceRows = resourceEnvelopeRows(selectedTraces);
    if (resourceRows.length === 0) {
      resourceHost.appendChild(emptyState("No model-resource rows for selected traces."));
    } else {
      const scatterRows = resourceRows.filter((row) => Number.isFinite(row.peak_mem_gb) && Number.isFinite(row.train_tflops));
      if (scatterRows.length > 0) {
        resourceHost.appendChild(
          Plot.plot({
            width: 920,
            height: 320,
            x: {label: "Peak training memory (GB)", grid: true},
            y: {label: "Train step TFLOPs", grid: true},
            color: {legend: true},
            marks: [Plot.dot(scatterRows, {x: "peak_mem_gb", y: "train_tflops", fill: "category", tip: true})]
          })
        );
      }
      resourceHost.appendChild(
        renderSimpleTable(resourceRows, [
          {key: "trace", label: "Trace"},
          {key: "category", label: "Category"},
          {key: "B", label: "B", align: "right"},
          {key: "S", label: "S", align: "right"},
          {key: "d_model", label: "d_model", align: "right"},
          {key: "n_heads", label: "n_heads", align: "right"},
          {key: "d_head", label: "d_head", align: "right"},
          {
            key: "params_m",
            label: "Params (M)",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "n/a")
          },
          {
            key: "peak_mem_gb",
            label: "Peak Mem (GB)",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "n/a")
          },
          {
            key: "train_tflops",
            label: "Train TFLOPs",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(3) : "n/a")
          },
          {key: "fits_24gb", label: "Fits 24GB", format: (v) => (v ? "yes" : "no")}
        ])
      );
    }

    clearNode(diagnosticsHost);
    diagnosticsHost.appendChild(sectionHeading("Load Diagnostics"));
    if (loadErrors.length === 0) {
      diagnosticsHost.appendChild(emptyState("No trace load errors."));
    } else {
      diagnosticsHost.appendChild(
        renderSimpleTable(loadErrors, [
          {key: "trace", label: "Trace"},
          {key: "stage", label: "Stage"},
          {key: "error", label: "Error"}
        ])
      );
    }

    const summaryRows = aggregateSummary(sourceFiltered);
    clearNode(summaryHost);
    summaryHost.appendChild(sectionHeading("Trace/Event Summary"));
    if (summaryRows.length === 0) {
      summaryHost.appendChild(
        emptyState("No events for selected filters (sparse traces like misaligned_dims may legitimately have zero rows).")
      );
    } else {
      summaryHost.append(
        Plot.plot({
          width: 900,
          height: 280,
          marginLeft: 90,
          y: {grid: true, label: "events"},
          x: {label: "trace"},
          color: {legend: true},
          marks: [
            Plot.barY(summaryRows, {
              x: "trace",
              y: "event_count",
              fill: "event_type",
              fx: "event_type",
              tip: true
            })
          ]
        }),
        renderSimpleTable(summaryRows, [
          {key: "trace", label: "Trace"},
          {key: "event_type", label: "Type"},
          {key: "event_count", label: "Events", align: "right"},
          {key: "total_duration_ms", label: "Total Duration", align: "right", format: (v) => formatMs(v)}
        ])
      );
    }

    const timeline = aggregateTimeline(
      sourceFiltered,
      timelineMode.select.value,
      laneStyle.select.value,
      timelineRank.select.value,
      Number(maxEvents.input.value),
      Number(bucket.input.value),
      Number(topLanes.input.value)
    );

    clearNode(timelineHost);
    timelineHost.appendChild(sectionHeading("Timeline View"));
    if (timeline.rows.length === 0) {
      timelineHost.appendChild(emptyState("No timeline rows available for current filters."));
    } else {
      timelineHost.appendChild(
        Plot.plot({
          width: 920,
          height: Math.max(260, Math.min(960, timeline.laneCountKept * 18 + 100)),
          x: {label: "ms since first selected event", grid: true},
          y: {label: "lane"},
          color: {legend: true},
          marks:
            timelineMode.select.value === "rolled"
              ? [
                  Plot.barX(timeline.rows, {
                    x1: "start_ms",
                    x2: "end_ms",
                    y: "lane",
                    fill: "event_type",
                    tip: true
                  })
                ]
              : [
                  Plot.barX(timeline.rows, {
                    x1: "start_ms",
                    x2: "end_ms",
                    y: "lane",
                    fill: "event_type",
                    tip: true
                  })
                ]
        })
      );

      timelineHost.appendChild(
        renderSimpleTable(timeline.rows.slice(0, 1000), [
          {key: "trace", label: "Trace"},
          {key: "event_type", label: "Type"},
          {key: "lane", label: "Lane"},
          {
            key: "start_ms",
            label: "Start (ms)",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(3) : "n/a")
          },
          {
            key: "end_ms",
            label: "End (ms)",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(3) : "n/a")
          },
          {
            key: timelineMode.select.value === "rolled" ? "total_duration_ms" : "duration_ms",
            label: timelineMode.select.value === "rolled" ? "Total Duration" : "Duration",
            align: "right",
            format: (v) => formatMs(v)
          },
          {
            key: "event_count",
            label: "Count",
            align: "right",
            format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(0) : "")
          }
        ])
      );

      timelineHost.appendChild(el("p", `Lanes shown: ${timeline.laneCountKept} of ${timeline.laneCountTotal}`));
    }

    const kernelRows = aggregateKernels(sourceFiltered, Number(topK.input.value));
    clearNode(kernelHost);
    kernelHost.appendChild(sectionHeading("Kernel Inventory and Duration/Count Analysis"));
    if (kernelRows.length === 0) {
      kernelHost.appendChild(emptyState("No kernel rows for selected traces."));
    } else {
      const metric = kernelMetric.select.value === "count" ? "invocations" : "total_duration_ms";

      kernelHost.appendChild(
        Plot.plot({
          width: 920,
          height: Math.min(560, 120 + kernelRows.length * 18),
          marginLeft: 260,
          x: {label: metric === "invocations" ? "invocations" : "total duration (ms)", grid: true},
          y: {label: null},
          color: {legend: true},
          marks: [Plot.barX(kernelRows, {x: metric, y: "kernel_name", fill: "trace", tip: true})]
        })
      );

      kernelHost.appendChild(
        renderSimpleTable(kernelRows, [
          {key: "trace", label: "Trace"},
          {key: "kernel_name", label: "Kernel"},
          {key: "invocations", label: "Calls", align: "right"},
          {key: "total_duration_ms", label: "Total", align: "right", format: (v) => formatMs(v)},
          {key: "avg_duration_ms", label: "Avg", align: "right", format: (v) => formatMs(v)}
        ])
      );
    }

    const memoryRows = aggregateMemory(sourceFiltered);
    clearNode(memoryHost);
    memoryHost.appendChild(sectionHeading("Memory Operations"));
    if (memoryRows.length === 0) {
      memoryHost.appendChild(emptyState("No memcpy/memset rows for selected traces."));
    } else {
      memoryHost.appendChild(
        Plot.plot({
          width: 920,
          height: Math.min(540, 120 + memoryRows.length * 18),
          marginLeft: 220,
          x: {label: "total duration (ms)", grid: true},
          y: {label: null},
          color: {legend: true},
          marks: [Plot.barX(memoryRows, {x: "total_duration_ms", y: "operation", fill: "trace", tip: true})]
        })
      );

      memoryHost.appendChild(
        renderSimpleTable(memoryRows, [
          {key: "trace", label: "Trace"},
          {key: "operation", label: "Operation"},
          {key: "op_count", label: "Calls", align: "right"},
          {key: "total_duration_ms", label: "Total Duration", align: "right", format: (v) => formatMs(v)},
          {key: "total_bytes", label: "Bytes", align: "right", format: (v) => formatBytes(v)}
        ])
      );
    }
  };

  traceControl.onChange(refresh);
  typeControl.onChange(refresh);
  timelineMode.select.addEventListener("change", refresh);
  timelineSource.select.addEventListener("change", refresh);
  laneStyle.select.addEventListener("change", refresh);
  timelineRank.select.addEventListener("change", refresh);
  kernelMetric.select.addEventListener("change", refresh);
  topK.input.addEventListener("input", refresh);
  maxEvents.input.addEventListener("input", refresh);
  bucket.input.addEventListener("input", refresh);
  topLanes.input.addEventListener("input", refresh);

  await refresh();
  return root;
}
