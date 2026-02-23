import * as d3 from "../../_npm/d3@7.9.0/e324157d.js";
import {formatBytes, formatMs} from "../components/data-utils.e2caa41c.js";
import {buildLaneTree, buildTraceIndex, queryWindow, windowToRows} from "../components/nsys-viewer-core.ec8c6c6d.js";
import {clearNode, emptyState, renderSimpleTable, sectionHeading} from "../components/dom-utils.d6dae979.js";
import {TRACE_NAMES, loadTraceRowsDetailed} from "./nsys-dataset.bc4d863d.js";

const EVENT_TYPES = ["kernel", "memcpy", "memset"];

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

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function safeNumber(value, fallback = NaN) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatNs(value) {
  const n = safeNumber(value, 0);
  return `${Math.round(n).toLocaleString("en-US")} ns`;
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
    setSelected(values) {
      const selected = new Set(values);
      for (const input of fieldset.querySelectorAll("input[type=checkbox]")) {
        input.checked = selected.has(input.dataset.value || "");
      }
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

function debounce(fn, waitMs = 120) {
  let timeoutId;
  return () => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(fn, waitMs);
  };
}

function flattenLeaves(nodes) {
  const leaves = [];
  const visit = (node) => {
    if (!node.children || node.children.length === 0) {
      if (node.filter) leaves.push(node);
      return;
    }
    for (const child of node.children) visit(child);
  };
  for (const node of nodes) visit(node);
  return leaves;
}

function setClampedWindow(index, state, startNs, endNs) {
  if (!index) return;
  const spanStart = index.spanNs.start;
  const spanEnd = index.spanNs.end;
  const maxSpan = Math.max(1, spanEnd - spanStart);
  const minSpan = Math.max(1_000, Math.floor(maxSpan / 20000));

  let start = safeNumber(startNs, spanStart);
  let end = safeNumber(endNs, spanEnd);
  if (start > end) {
    const t = start;
    start = end;
    end = t;
  }

  let span = end - start;
  if (span < minSpan) {
    const center = (start + end) / 2;
    start = center - minSpan / 2;
    end = center + minSpan / 2;
    span = end - start;
  }

  if (span > maxSpan) {
    start = spanStart;
    end = spanEnd;
  } else {
    if (start < spanStart) {
      const delta = spanStart - start;
      start += delta;
      end += delta;
    }
    if (end > spanEnd) {
      const delta = end - spanEnd;
      start -= delta;
      end -= delta;
    }
    start = clamp(start, spanStart, spanEnd);
    end = clamp(end, spanStart, spanEnd);
  }

  state.windowStartNs = Math.floor(start);
  state.windowEndNs = Math.floor(end);
}

function createTraceState(index) {
  return {
    windowStartNs: index.spanNs.start,
    windowEndNs: index.spanNs.end,
    selectedEventId: null,
    collapsedNodeIds: new Set(),
    selectedLeafIdsByMode: {
      event_type: new Set(),
      event_name: new Set()
    }
  };
}

function selectOptions(select, values, activeValue) {
  clearNode(select);
  for (const value of values) {
    const option = el("option", value);
    option.value = value;
    if (value === activeValue) option.selected = true;
    select.appendChild(option);
  }
}

function renderDiagnostics(host, selectedTraces, errorsByTrace) {
  clearNode(host);
  host.appendChild(sectionHeading("Load Diagnostics"));

  const rows = [];
  for (const trace of selectedTraces) {
    if (errorsByTrace.has(trace)) {
      rows.push({trace, stage: "load", error: errorsByTrace.get(trace)});
    }
  }

  if (rows.length === 0) {
    host.appendChild(emptyState("No trace load errors."));
    return;
  }

  host.appendChild(
    renderSimpleTable(rows, [
      {key: "trace", label: "Trace"},
      {key: "stage", label: "Stage"},
      {key: "error", label: "Error"}
    ])
  );
}

function asMsRel(ns, startNs) {
  return (safeNumber(ns, 0) - safeNumber(startNs, 0)) / 1e6;
}

export async function renderNsysViewer(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-nsys-viewer";
  root.style.display = "grid";
  root.style.gap = "1rem";
  root.dataset.testid = "nsys-viewer";

  const defaultTrace = TRACE_NAMES.includes("bandwidth_bound") ? "bandwidth_bound" : TRACE_NAMES[0];
  const initialTraces = Array.isArray(options.initialTraces) && options.initialTraces.length > 0
    ? options.initialTraces.filter((trace) => TRACE_NAMES.includes(trace))
    : [defaultTrace];
  const selectedTracesInitial = initialTraces.length > 0 ? initialTraces : [defaultTrace];

  const traceIndexes = new Map();
  const traceStates = new Map();
  const traceLoadErrors = new Map();

  let activeTrace = TRACE_NAMES.includes(options.activeTrace) ? options.activeTrace : selectedTracesInitial[0];
  let currentIndex = null;
  let currentTree = [];
  let currentLeafFilterById = new Map();
  let overviewRefs = null;
  let suppressBrush = false;
  let refreshSeq = 0;

  const title = el("h2", "NSYS GPU Trace Viewer");
  title.style.margin = "0";
  const subtitle = el(
    "p",
    "GPU-focused Nsight-style explorer for kernel/memcpy/memset parquet traces with timeline windowing, lane tree filters, and full event drill-down."
  );
  subtitle.style.margin = "0";
  const status = el("p");
  status.style.margin = "0";

  const controls = card();
  const diagnosticsHost = card();
  const laneHost = card();
  const overviewHost = card();
  const detailHost = card();
  const tableHost = card();
  const detailsHost = card();
  detailsHost.dataset.testid = "nsys-viewer-details";

  root.append(title, subtitle, controls, status, diagnosticsHost, laneHost, overviewHost, detailHost, tableHost, detailsHost);

  const traceControl = checkboxGroup(TRACE_NAMES, selectedTracesInitial, "Loaded Traces", "nsys-viewer-trace");

  const activeTraceLabel = el("label");
  activeTraceLabel.style.display = "flex";
  activeTraceLabel.style.alignItems = "center";
  activeTraceLabel.style.gap = "0.5rem";
  const activeTraceSelect = el("select");
  activeTraceLabel.append(document.createTextNode("Active Timeline Trace"), activeTraceSelect);

  const laneMode = selectControl(
    "Lane tree mode",
    [
      {value: "event_type", label: "process/context/stream/event_type"},
      {value: "event_name", label: "split leaves by event_name"}
    ],
    options.laneMode || "event_type"
  );

  const renderMode = selectControl(
    "Timeline render mode",
    [
      {value: "auto", label: "auto (raw unless dense)"},
      {value: "raw", label: "raw"},
      {value: "rolled", label: "rolled"}
    ],
    options.renderMode || "auto"
  );

  const eventTypeControl = checkboxGroup(EVENT_TYPES, EVENT_TYPES, "Event Types", "nsys-viewer-type");
  const bucketMs = rangeControl("Rolled bucket (ms)", 1, 200, 1, options.bucketMs ?? 10);
  const maxVisible = rangeControl("Max raw events", 200, 30000, 100, options.maxVisibleEvents ?? 6000);

  controls.append(
    sectionHeading("Controls"),
    traceControl.node,
    activeTraceLabel,
    laneMode.node,
    renderMode.node,
    eventTypeControl.node,
    bucketMs.node,
    maxVisible.node
  );

  const updateRangeLabels = () => {
    bucketMs.output.textContent = bucketMs.input.value;
    maxVisible.output.textContent = maxVisible.input.value;
  };

  const getSelectedTraces = () => traceControl.getSelected().filter((trace) => TRACE_NAMES.includes(trace));

  const ensureTraceLoaded = async (traceName) => {
    if (traceIndexes.has(traceName)) return traceIndexes.get(traceName);
    const rows = await loadTraceRowsDetailed(traceName);
    const index = buildTraceIndex(rows);
    traceIndexes.set(traceName, index);
    return index;
  };

  const getTraceState = (traceName, index) => {
    if (!traceStates.has(traceName)) traceStates.set(traceName, createTraceState(index));
    const state = traceStates.get(traceName);
    setClampedWindow(index, state, state.windowStartNs, state.windowEndNs);
    return state;
  };

  const updateOverviewBrushSelection = () => {
    if (!overviewRefs || !currentIndex) return;
    if (overviewRefs.trace !== activeTrace) return;

    const state = getTraceState(activeTrace, currentIndex);
    suppressBrush = true;
    overviewRefs.brushGroup.call(overviewRefs.brush.move, [overviewRefs.xScale(state.windowStartNs), overviewRefs.xScale(state.windowEndNs)]);
    suppressBrush = false;
  };

  const buildActiveFilters = (state) => {
    const mode = laneMode.select.value;
    const selectedLeafIds = state.selectedLeafIdsByMode[mode] || new Set();
    const selectedTypes = new Set(eventTypeControl.getSelected());

    const laneKeys = new Set();
    const pairKeys = new Set();

    for (const leafId of selectedLeafIds) {
      const filter = currentLeafFilterById.get(leafId);
      if (!filter) continue;
      if (filter.laneKey) laneKeys.add(filter.laneKey);
      if (filter.laneKey && filter.eventName) pairKeys.add(`${filter.laneKey}||${filter.eventName}`);
    }

    const filters = {
      laneKeys,
      eventTypes: selectedTypes
    };

    if (mode === "event_name") {
      filters.predicate = (event) => pairKeys.has(`${event.lane_key}||${event.event_name}`);
    }

    return filters;
  };

  const renderSelectedDetails = (state) => {
    clearNode(detailsHost);
    detailsHost.appendChild(sectionHeading("Selected Event Details"));

    if (!currentIndex) {
      detailsHost.appendChild(emptyState("No active trace."));
      return;
    }

    if (!state.selectedEventId) {
      detailsHost.appendChild(emptyState("Select a raw event from the timeline or table to inspect metadata."));
      return;
    }

    const event = currentIndex.eventById.get(String(state.selectedEventId));
    if (!event) {
      detailsHost.appendChild(emptyState("Selected event is not available in the active trace."));
      return;
    }

    const rows = [
      {key: "event_id", value: event.event_id},
      {key: "trace", value: event.trace},
      {key: "event_type", value: event.event_type},
      {key: "event_name", value: event.event_name},
      {key: "start_ns", value: formatNs(event.start_ns)},
      {key: "end_ns", value: formatNs(event.end_ns)},
      {key: "duration_ns", value: formatNs(event.duration_ns)},
      {key: "duration_ms", value: formatMs(event.duration_ms)},
      {key: "device_id", value: Number.isFinite(event.device_id) ? String(event.device_id) : "n/a"},
      {key: "context_id", value: Number.isFinite(event.context_id) ? String(event.context_id) : "n/a"},
      {key: "stream_id", value: Number.isFinite(event.stream_id) ? String(event.stream_id) : "n/a"},
      {key: "correlation_id", value: Number.isFinite(event.correlation_id) ? String(event.correlation_id) : "n/a"},
      {key: "global_pid", value: Number.isFinite(event.global_pid) ? String(event.global_pid) : "n/a"},
      {key: "bytes", value: formatBytes(event.bytes)},
      {key: "grid_x", value: Number.isFinite(event.grid_x) ? String(event.grid_x) : "n/a"},
      {key: "grid_y", value: Number.isFinite(event.grid_y) ? String(event.grid_y) : "n/a"},
      {key: "grid_z", value: Number.isFinite(event.grid_z) ? String(event.grid_z) : "n/a"},
      {key: "block_x", value: Number.isFinite(event.block_x) ? String(event.block_x) : "n/a"},
      {key: "block_y", value: Number.isFinite(event.block_y) ? String(event.block_y) : "n/a"},
      {key: "block_z", value: Number.isFinite(event.block_z) ? String(event.block_z) : "n/a"},
      {key: "registers_per_thread", value: Number.isFinite(event.registers_per_thread) ? String(event.registers_per_thread) : "n/a"},
      {key: "static_shared_memory", value: Number.isFinite(event.static_shared_memory) ? String(event.static_shared_memory) : "n/a"},
      {key: "dynamic_shared_memory", value: Number.isFinite(event.dynamic_shared_memory) ? String(event.dynamic_shared_memory) : "n/a"},
      {key: "local_memory_per_thread", value: Number.isFinite(event.local_memory_per_thread) ? String(event.local_memory_per_thread) : "n/a"},
      {key: "local_memory_total", value: Number.isFinite(event.local_memory_total) ? String(event.local_memory_total) : "n/a"}
    ];

    detailsHost.appendChild(
      renderSimpleTable(rows, [
        {key: "key", label: "Field", width: "32%", bold: true},
        {key: "value", label: "Value"}
      ])
    );

    const correlationKey = Number.isFinite(event.correlation_id) ? String(event.correlation_id) : null;
    if (!correlationKey) return;

    const related = (currentIndex.eventsByCorrelation.get(correlationKey) || [])
      .filter((row) => row.event_id !== event.event_id)
      .slice(0, 25);

    if (related.length === 0) return;

    const relatedHost = card();
    relatedHost.appendChild(sectionHeading("Related by correlation_id"));

    for (const relatedEvent of related) {
      const btn = el(
        "button",
        `${relatedEvent.event_name} · ${formatMs(relatedEvent.duration_ms)} · ${Math.round(asMsRel(relatedEvent.start_ns, currentIndex.spanNs.start)).toLocaleString("en-US")} ms`
      );
      btn.type = "button";
      btn.style.textAlign = "left";
      btn.style.padding = "0.35rem 0.45rem";
      btn.style.border = "1px solid var(--theme-foreground-faint)";
      btn.style.borderRadius = "6px";
      btn.style.background = "transparent";
      btn.style.cursor = "pointer";
      btn.addEventListener("click", () => {
        state.selectedEventId = relatedEvent.event_id;
        renderSelectedDetails(state);
      });
      relatedHost.appendChild(btn);
    }

    detailsHost.appendChild(relatedHost);
  };

  const renderEventTable = (state, timelineData) => {
    clearNode(tableHost);
    tableHost.appendChild(sectionHeading("Events Table"));

    if (timelineData.rows.length === 0) {
      tableHost.appendChild(emptyState("No events for current window and filters."));
      return;
    }

    if (timelineData.mode === "rolled") {
      tableHost.appendChild(
        renderSimpleTable(timelineData.rows.slice(0, 500), [
          {key: "event_type", label: "Type"},
          {key: "lane_label", label: "Lane"},
          {key: "event_count", label: "Count", align: "right"},
          {key: "total_duration_ns", label: "Total Duration", align: "right", format: (v) => formatNs(v)},
          {key: "avg_duration_ns", label: "Avg Duration", align: "right", format: (v) => formatNs(v)}
        ])
      );
      return;
    }

    const rows = timelineData.rows.slice(0, 600);
    const table = el("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.fontSize = "0.88rem";

    const thead = el("thead");
    const trHead = el("tr");
    for (const header of ["Type", "Event", "Lane", "Start (ms)", "Duration", "Bytes"]) {
      const th = el("th", header);
      th.style.textAlign = "left";
      th.style.padding = "0.35rem";
      th.style.borderBottom = "1px solid var(--theme-foreground-faint)";
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = el("tbody");
    for (const row of rows) {
      const tr = el("tr");
      tr.dataset.testid = "nsys-viewer-event-row";
      tr.dataset.eventId = String(row.event_id);
      tr.style.cursor = "pointer";
      tr.style.borderBottom = "1px solid var(--theme-foreground-faintest)";
      if (String(state.selectedEventId) === String(row.event_id)) {
        tr.style.background = "color-mix(in oklab, var(--theme-foreground) 12%, transparent)";
      }

      const values = [
        row.event_type,
        row.event_name,
        row.lane_label,
        asMsRel(row.start_ns, currentIndex.spanNs.start).toFixed(3),
        formatMs(row.duration_ms),
        formatBytes(row.bytes)
      ];

      for (const value of values) {
        const td = el("td", String(value));
        td.style.padding = "0.35rem";
        td.style.verticalAlign = "top";
        tr.appendChild(td);
      }

      tr.addEventListener("click", () => {
        state.selectedEventId = row.event_id;
        renderEventTable(state, timelineData);
        renderSelectedDetails(state);
      });
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    tableHost.appendChild(table);

    if (timelineData.clipped) {
      tableHost.appendChild(el("p", `Showing first ${rows.length.toLocaleString("en-US")} of ${timelineData.totalMatches.toLocaleString("en-US")} raw matches.`));
    }
  };

  const renderLaneTree = (state) => {
    clearNode(laneHost);
    laneHost.appendChild(sectionHeading("Lane Tree"));

    if (!currentIndex) {
      laneHost.appendChild(emptyState("No active trace available."));
      return;
    }

    if (currentTree.length === 0) {
      laneHost.appendChild(emptyState("No lanes available for this trace."));
      return;
    }

    const mode = laneMode.select.value;
    const leaves = flattenLeaves(currentTree);
    currentLeafFilterById = new Map(leaves.map((leaf) => [leaf.id, leaf.filter]));

    if (!state.selectedLeafIdsByMode[mode]) state.selectedLeafIdsByMode[mode] = new Set();
    const selected = state.selectedLeafIdsByMode[mode];

    if (selected.size === 0) {
      for (const leaf of leaves) selected.add(leaf.id);
    }

    for (const leafId of [...selected]) {
      if (!currentLeafFilterById.has(leafId)) selected.delete(leafId);
    }

    const buttons = el("div");
    buttons.style.display = "flex";
    buttons.style.gap = "0.5rem";

    const selectAllBtn = el("button", "Select all leaves");
    selectAllBtn.type = "button";
    selectAllBtn.addEventListener("click", () => {
      selected.clear();
      for (const leaf of leaves) selected.add(leaf.id);
      renderLaneTree(state);
      renderTimelineAndTables(state);
    });

    const selectNoneBtn = el("button", "Select none");
    selectNoneBtn.type = "button";
    selectNoneBtn.addEventListener("click", () => {
      selected.clear();
      renderLaneTree(state);
      renderTimelineAndTables(state);
    });

    buttons.append(selectAllBtn, selectNoneBtn);
    laneHost.appendChild(buttons);

    const treeRoot = el("div");
    treeRoot.style.display = "grid";
    treeRoot.style.gap = "0.35rem";

    const renderNode = (node, depth) => {
      const row = el("div");
      row.style.marginLeft = `${depth * 0.5}rem`;

      if (node.children && node.children.length > 0) {
        const details = el("details");
        details.open = !state.collapsedNodeIds.has(node.id);
        details.addEventListener("toggle", () => {
          if (details.open) state.collapsedNodeIds.delete(node.id);
          else state.collapsedNodeIds.add(node.id);
        });

        const summary = el("summary", `${node.label} (${node.count.toLocaleString("en-US")})`);
        summary.style.cursor = "pointer";
        details.appendChild(summary);

        const childHost = el("div");
        childHost.style.display = "grid";
        childHost.style.gap = "0.25rem";
        childHost.style.marginTop = "0.2rem";
        for (const child of node.children) childHost.appendChild(renderNode(child, depth + 1));
        details.appendChild(childHost);
        row.appendChild(details);
        return row;
      }

      const label = el("label");
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "0.3rem";
      label.style.cursor = "pointer";

      const input = el("input");
      input.type = "checkbox";
      input.checked = selected.has(node.id);
      input.addEventListener("change", () => {
        if (input.checked) selected.add(node.id);
        else selected.delete(node.id);
        renderTimelineAndTables(state);
      });

      const text = `${node.label} (${node.count.toLocaleString("en-US")})`;
      label.append(input, document.createTextNode(text));
      row.appendChild(label);
      return row;
    };

    for (const node of currentTree) treeRoot.appendChild(renderNode(node, 0));
    laneHost.appendChild(treeRoot);
  };

  const renderOverview = (state, filters) => {
    clearNode(overviewHost);
    overviewHost.appendChild(sectionHeading("Overview Timeline (brush to set detail window)"));

    if (!currentIndex || currentIndex.spanNs.duration <= 0) {
      overviewHost.appendChild(emptyState("No overview data available for active trace."));
      overviewRefs = null;
      return;
    }

    const width = 920;
    const height = 170;
    const margin = {top: 12, right: 14, bottom: 28, left: 110};
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const bucketNs = Math.max(1_000, Math.floor(currentIndex.spanNs.duration / 600));
    const rolled = windowToRows(
      currentIndex,
      {
        startNs: currentIndex.spanNs.start,
        endNs: currentIndex.spanNs.end,
        filters
      },
      "rolled",
      bucketNs
    );

    if (rolled.rows.length === 0) {
      overviewHost.appendChild(emptyState("No overview rows for selected filters."));
      overviewRefs = null;
      return;
    }

    const eventTypes = EVENT_TYPES.filter((eventType) => rolled.rows.some((row) => row.event_type === eventType));
    const xScale = d3.scaleLinear()
      .domain([currentIndex.spanNs.start, currentIndex.spanNs.end])
      .range([margin.left, width - margin.right]);
    const yScale = d3.scaleBand()
      .domain(eventTypes)
      .range([margin.top, height - margin.bottom])
      .paddingInner(0.15);
    const color = d3.scaleOrdinal()
      .domain(EVENT_TYPES)
      .range(["#2f7ed8", "#f45b5b", "#90ed7d"]);

    const svg = d3.create("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", width)
      .attr("height", height)
      .style("maxWidth", "100%")
      .style("height", "auto")
      .style("background", "var(--theme-background, transparent)");

    svg.append("g")
      .selectAll("rect")
      .data(rolled.rows)
      .join("rect")
      .attr("x", (d) => xScale(d.start_ns))
      .attr("y", (d) => yScale(d.event_type) ?? margin.top)
      .attr("width", (d) => Math.max(1, xScale(d.end_ns) - xScale(d.start_ns)))
      .attr("height", yScale.bandwidth())
      .attr("fill", (d) => color(d.event_type))
      .attr("opacity", (d) => clamp(0.18 + Math.log10(1 + d.event_count) * 0.25, 0.18, 0.92));

    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(7).tickFormat((v) => `${((Number(v) - currentIndex.spanNs.start) / 1e6).toFixed(0)} ms`));

    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale));

    const brush = d3.brushX()
      .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]])
      .on("brush end", (event) => {
        if (!event.selection || suppressBrush) return;
        if (!event.sourceEvent) return;

        const [x0, x1] = event.selection;
        setClampedWindow(currentIndex, state, xScale.invert(x0), xScale.invert(x1));
        renderTimelineAndTables(state);
      });

    const brushGroup = svg.append("g").call(brush);
    overviewHost.appendChild(svg.node());

    overviewRefs = {
      trace: activeTrace,
      brush,
      brushGroup,
      xScale
    };
    updateOverviewBrushSelection();
  };

  const renderDetailTimeline = (state, timelineData, filters) => {
    clearNode(detailHost);
    detailHost.appendChild(sectionHeading("Detail Timeline"));

    if (!currentIndex) {
      detailHost.appendChild(emptyState("No active trace."));
      return;
    }

    const modeLabel = timelineData.mode === "rolled"
      ? `rolled (${timelineData.rows.length.toLocaleString("en-US")} buckets)`
      : `raw (${timelineData.rows.length.toLocaleString("en-US")} events)`;
    detailHost.appendChild(el("p", `Window mode: ${modeLabel}. Total matches: ${timelineData.totalMatches.toLocaleString("en-US")}.`));

    if (timelineData.rows.length === 0) {
      detailHost.appendChild(emptyState("No timeline rows in this window."));
      return;
    }

    const laneLabels = Array.from(new Set(timelineData.rows.map((row) => row.lane_label)));
    const width = 920;
    const height = Math.max(260, Math.min(980, laneLabels.length * 24 + 90));
    const margin = {top: 14, right: 14, bottom: 30, left: Math.max(180, Math.min(320, 120 + laneLabels.length * 2))};

    const xScale = d3.scaleLinear()
      .domain([state.windowStartNs, state.windowEndNs])
      .range([margin.left, width - margin.right]);
    const yScale = d3.scaleBand()
      .domain(laneLabels)
      .range([margin.top, height - margin.bottom])
      .paddingInner(0.15);

    const color = d3.scaleOrdinal()
      .domain(EVENT_TYPES)
      .range(["#2f7ed8", "#f45b5b", "#90ed7d"]);

    const svg = d3.create("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", width)
      .attr("height", height)
      .style("maxWidth", "100%")
      .style("height", "auto")
      .style("touchAction", "none");

    const bars = svg.append("g")
      .selectAll("rect")
      .data(timelineData.rows)
      .join("rect")
      .attr("x", (d) => xScale(d.start_ns))
      .attr("y", (d) => yScale(d.lane_label) ?? margin.top)
      .attr("width", (d) => Math.max(1, xScale(d.end_ns) - xScale(d.start_ns)))
      .attr("height", yScale.bandwidth())
      .attr("fill", (d) => color(d.event_type))
      .attr("opacity", 0.85);

    if (timelineData.mode === "raw") {
      bars
        .attr("data-event-id", (d) => String(d.event_id))
        .attr("stroke", (d) => (String(state.selectedEventId) === String(d.event_id) ? "black" : "none"))
        .attr("stroke-width", (d) => (String(state.selectedEventId) === String(d.event_id) ? 1.5 : 0))
        .style("cursor", "pointer")
        .on("click", (_event, d) => {
          state.selectedEventId = d.event_id;
          renderDetailTimeline(state, timelineData, filters);
          renderEventTable(state, timelineData);
          renderSelectedDetails(state);
        });
    }

    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(xScale).ticks(8).tickFormat((v) => `${((Number(v) - currentIndex.spanNs.start) / 1e6).toFixed(1)} ms`));

    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(yScale));

    const overlay = svg.append("rect")
      .attr("x", margin.left)
      .attr("y", margin.top)
      .attr("width", width - margin.left - margin.right)
      .attr("height", height - margin.top - margin.bottom)
      .attr("fill", "transparent")
      .style("cursor", "grab");

    overlay.on("wheel", (event) => {
      event.preventDefault();
      const [px] = d3.pointer(event, svg.node());
      const centerNs = xScale.invert(px);
      const oldSpan = Math.max(1, state.windowEndNs - state.windowStartNs);
      const factor = event.deltaY > 0 ? 1.2 : 0.82;
      const newSpan = oldSpan * factor;
      const leftRatio = (centerNs - state.windowStartNs) / oldSpan;
      const nextStart = centerNs - leftRatio * newSpan;
      const nextEnd = nextStart + newSpan;
      setClampedWindow(currentIndex, state, nextStart, nextEnd);
      updateOverviewBrushSelection();
      renderTimelineAndTables(state);
    });

    overlay.call(
      d3.drag()
        .on("start", () => {
          overlay.style("cursor", "grabbing");
        })
        .on("end", (event) => {
          overlay.style("cursor", "grab");
          const plotWidth = width - margin.left - margin.right;
          const span = Math.max(1, state.windowEndNs - state.windowStartNs);
          const deltaNs = (event.dx / Math.max(1, plotWidth)) * span;
          setClampedWindow(currentIndex, state, state.windowStartNs - deltaNs, state.windowEndNs - deltaNs);
          updateOverviewBrushSelection();
          renderTimelineAndTables(state);
        })
    );

    detailHost.appendChild(svg.node());

    if (timelineData.clipped) {
      detailHost.appendChild(
        el(
          "p",
          `Raw mode capped at ${Number(maxVisible.input.value).toLocaleString("en-US")} events. Switch to rolled mode or narrow the window for full fidelity.`
        )
      );
    }
  };

  const renderTimelineAndTables = (state) => {
    if (!currentIndex) {
      clearNode(overviewHost);
      clearNode(detailHost);
      clearNode(tableHost);
      clearNode(detailsHost);
      overviewHost.appendChild(sectionHeading("Overview Timeline (brush to set detail window)"));
      overviewHost.appendChild(emptyState("No trace selected."));
      detailHost.appendChild(sectionHeading("Detail Timeline"));
      detailHost.appendChild(emptyState("No trace selected."));
      tableHost.appendChild(sectionHeading("Events Table"));
      tableHost.appendChild(emptyState("No trace selected."));
      detailsHost.appendChild(sectionHeading("Selected Event Details"));
      detailsHost.appendChild(emptyState("No trace selected."));
      return;
    }

    const filters = buildActiveFilters(state);

    renderOverview(state, filters);

    const maxRawEvents = Number(maxVisible.input.value);
    const modeChoice = renderMode.select.value;
    const bucketNs = Math.max(1, Number(bucketMs.input.value) * 1e6);

    let timelineData;
    if (modeChoice === "rolled") {
      timelineData = windowToRows(
        currentIndex,
        {startNs: state.windowStartNs, endNs: state.windowEndNs, filters},
        "rolled",
        bucketNs
      );
    } else if (modeChoice === "raw") {
      timelineData = windowToRows(
        currentIndex,
        {startNs: state.windowStartNs, endNs: state.windowEndNs, filters, maxEvents: maxRawEvents},
        "raw",
        bucketNs
      );
    } else {
      const probe = queryWindow(currentIndex, state.windowStartNs, state.windowEndNs, filters, maxRawEvents);
      if (probe.totalMatches > maxRawEvents) {
        timelineData = windowToRows(
          currentIndex,
          {startNs: state.windowStartNs, endNs: state.windowEndNs, filters},
          "rolled",
          bucketNs
        );
      } else {
        timelineData = {
          mode: "raw",
          rows: probe.rows,
          totalMatches: probe.totalMatches,
          clipped: probe.clipped
        };
      }
    }

    renderDetailTimeline(state, timelineData, filters);
    renderEventTable(state, timelineData);
    renderSelectedDetails(state);
  };

  const renderActiveTrace = () => {
    if (!currentIndex) {
      renderLaneTree({
        selectedLeafIdsByMode: {event_type: new Set(), event_name: new Set()},
        collapsedNodeIds: new Set()
      });
      renderTimelineAndTables({
        selectedLeafIdsByMode: {event_type: new Set(), event_name: new Set()},
        collapsedNodeIds: new Set()
      });
      return;
    }

    const state = getTraceState(activeTrace, currentIndex);
    currentTree = buildLaneTree(currentIndex, laneMode.select.value);
    renderLaneTree(state);
    renderTimelineAndTables(state);
  };

  const syncData = async () => {
    const refreshId = ++refreshSeq;
    updateRangeLabels();

    const selectedTraces = getSelectedTraces();
    if (selectedTraces.length === 0) {
      status.textContent = "Select at least one trace.";
      selectOptions(activeTraceSelect, [], "");
      activeTrace = "";
      currentIndex = null;
      renderDiagnostics(diagnosticsHost, [], traceLoadErrors);
      renderActiveTrace();
      return;
    }

    if (!selectedTraces.includes(activeTrace)) activeTrace = selectedTraces[0];
    selectOptions(activeTraceSelect, selectedTraces, activeTrace);

    status.textContent = `Loading ${selectedTraces.length.toLocaleString("en-US")} trace(s)...`;
    traceLoadErrors.clear();

    const results = await Promise.allSettled(selectedTraces.map(async (traceName) => {
      await ensureTraceLoaded(traceName);
      return traceName;
    }));

    if (refreshId !== refreshSeq) return;

    for (const [idx, result] of results.entries()) {
      if (result.status === "rejected") {
        const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
        traceLoadErrors.set(selectedTraces[idx], errorMessage);
      }
    }

    if (!selectedTraces.includes(activeTrace)) activeTrace = selectedTraces[0];
    selectOptions(activeTraceSelect, selectedTraces, activeTrace);

    currentIndex = traceIndexes.get(activeTrace) || null;
    renderDiagnostics(diagnosticsHost, selectedTraces, traceLoadErrors);

    if (currentIndex) {
      const spanMs = currentIndex.spanNs.duration / 1e6;
      status.textContent = `${activeTrace}: ${currentIndex.allEvents.length.toLocaleString("en-US")} events across ${currentIndex.laneOrder.length} lanes (${spanMs.toFixed(2)} ms span).`;
    } else {
      status.textContent = "Unable to load active trace.";
    }

    renderActiveTrace();
  };

  const refreshDebounced = debounce(() => {
    const state = currentIndex ? getTraceState(activeTrace, currentIndex) : null;
    updateRangeLabels();
    if (state) renderTimelineAndTables(state);
  });

  traceControl.onChange(() => {
    void syncData();
  });

  activeTraceSelect.addEventListener("change", () => {
    activeTrace = activeTraceSelect.value;
    currentIndex = traceIndexes.get(activeTrace) || null;
    renderActiveTrace();
  });

  laneMode.select.addEventListener("change", () => {
    renderActiveTrace();
  });

  renderMode.select.addEventListener("change", () => {
    const state = currentIndex ? getTraceState(activeTrace, currentIndex) : null;
    if (state) renderTimelineAndTables(state);
  });

  eventTypeControl.onChange(() => {
    const state = currentIndex ? getTraceState(activeTrace, currentIndex) : null;
    if (state) renderTimelineAndTables(state);
  });

  bucketMs.input.addEventListener("input", refreshDebounced);
  maxVisible.input.addEventListener("input", refreshDebounced);

  await syncData();
  return root;
}
