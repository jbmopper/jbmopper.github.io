import {FileAttachment} from "../../_observablehq/stdlib.43270668.js";
import * as Plot from "../../_npm/@observablehq/plot@0.6.17/7c43807f.js";
import * as d3 from "../../_npm/d3@7.9.0/e324157d.js";
import {formatBytes} from "../components/data-utils.e2caa41c.js";
import {clearNode, emptyState, renderSimpleTable, sectionHeading} from "../components/dom-utils.aaca454b.js";

const MANIFEST_ATTACHMENT = FileAttachment({"name":"../../data/manifest.json","mimeType":"application/json","path":"../../_file/data/manifest.589b314f.json","lastModified":1771275386884,"size":14702}, import.meta.url);

const ATTACHMENTS = {
  "traces/bad_head_size_nsys.parquet": FileAttachment({"name":"../../data/raw/traces/bad_head_size_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/bad_head_size_nsys.0e5fcf94.parquet","lastModified":1770920604380,"size":699507}, import.meta.url),
  "traces/bandwidth_bound_nsys.parquet": FileAttachment({"name":"../../data/raw/traces/bandwidth_bound_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/bandwidth_bound_nsys.0570a4e8.parquet","lastModified":1770920604381,"size":526034}, import.meta.url),
  "traces/compute_bound_nsys.parquet": FileAttachment({"name":"../../data/raw/traces/compute_bound_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/compute_bound_nsys.9be21553.parquet","lastModified":1770920604383,"size":1020491}, import.meta.url),
  "traces/deep_sequential_nsys.parquet": FileAttachment({"name":"../../data/raw/traces/deep_sequential_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/deep_sequential_nsys.4ed702eb.parquet","lastModified":1770920604387,"size":3186034}, import.meta.url),
  "traces/latency_bound_nsys.parquet": FileAttachment({"name":"../../data/raw/traces/latency_bound_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/latency_bound_nsys.5b9c4edd.parquet","lastModified":1770920604389,"size":1104236}, import.meta.url),
  "traces/misaligned_dims_nsys.parquet": FileAttachment({"name":"../../data/raw/traces/misaligned_dims_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/misaligned_dims_nsys.e0e9fef3.parquet","lastModified":1770920604389,"size":834}, import.meta.url),
  "traces/model_a_nsys.parquet": FileAttachment({"name":"../../data/raw/traces/model_a_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/model_a_nsys.7c95f1f4.parquet","lastModified":1770920604390,"size":294932}, import.meta.url),
  "traces/model_b_nsys.parquet": FileAttachment({"name":"../../data/raw/traces/model_b_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/model_b_nsys.d909797c.parquet","lastModified":1770920604391,"size":1231233}, import.meta.url),
  "traces/vocab_bottleneck_nsys.parquet": FileAttachment({"name":"../../data/raw/traces/vocab_bottleneck_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/vocab_bottleneck_nsys.c6e0b393.parquet","lastModified":1770920604392,"size":509294}, import.meta.url),
  "traces/wide_ffn_nsys.parquet": FileAttachment({"name":"../../data/raw/traces/wide_ffn_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/wide_ffn_nsys.e3df5806.parquet","lastModified":1770920604393,"size":715444}, import.meta.url),
  "traces/nsys_sqlite_table_inventory.md": FileAttachment({"name":"../../data/raw/traces/nsys_sqlite_table_inventory.md","mimeType":"text/markdown","path":"../../_file/data/raw/traces/nsys_sqlite_table_inventory.8a62282f.md","lastModified":1770920604391,"size":25493}, import.meta.url),
  "benchmarks/ablations_main.parquet": FileAttachment({"name":"../../data/raw/benchmarks/ablations_main.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/ablations_main.684150ce.parquet","lastModified":1770927469233,"size":32700}, import.meta.url),
  "benchmarks/ablations_history.parquet": FileAttachment({"name":"../../data/raw/benchmarks/ablations_history.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/ablations_history.fa92f106.parquet","lastModified":1770927469232,"size":389841}, import.meta.url),
  "benchmarks/gpu_comp_main.parquet": FileAttachment({"name":"../../data/raw/benchmarks/gpu_comp_main.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/gpu_comp_main.8b657d6c.parquet","lastModified":1770927469234,"size":26614}, import.meta.url),
  "benchmarks/gpu_comp_history.parquet": FileAttachment({"name":"../../data/raw/benchmarks/gpu_comp_history.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/gpu_comp_history.4a516c8a.parquet","lastModified":1770927469233,"size":189583}, import.meta.url),
  "benchmarks/mps_comp_main.parquet": FileAttachment({"name":"../../data/raw/benchmarks/mps_comp_main.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/mps_comp_main.ccc27b69.parquet","lastModified":1770927469238,"size":25521}, import.meta.url),
  "benchmarks/mps_comp_history.parquet": FileAttachment({"name":"../../data/raw/benchmarks/mps_comp_history.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/mps_comp_history.81dcba33.parquet","lastModified":1770927469238,"size":220323}, import.meta.url),
  "benchmarks/lr_sweeps_main.parquet": FileAttachment({"name":"../../data/raw/benchmarks/lr_sweeps_main.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/lr_sweeps_main.f6fefad8.parquet","lastModified":1770920604377,"size":15604}, import.meta.url),
  "benchmarks/lr_sweeps_history.parquet": FileAttachment({"name":"../../data/raw/benchmarks/lr_sweeps_history.parquet","mimeType":undefined,"path":"../../_file/data/raw/benchmarks/lr_sweeps_history.ca369050.parquet","lastModified":1770927469237,"size":2077247}, import.meta.url),
  "benchmarks/micro_benchmarks_20260126_130256.json": FileAttachment(
    {"name":"../../data/raw/benchmarks/micro_benchmarks_20260126_130256.json","mimeType":"application/json","path":"../../_file/data/raw/benchmarks/micro_benchmarks_20260126_130256.0003d6fe.json","lastModified":1770920604377,"size":2403}, import.meta.url
  ),
  "benchmarks/train_benchmark_20260127_092323.json": FileAttachment(
    {"name":"../../data/raw/benchmarks/train_benchmark_20260127_092323.json","mimeType":"application/json","path":"../../_file/data/raw/benchmarks/train_benchmark_20260127_092323.e80aa474.json","lastModified":1770920604379,"size":1945563}, import.meta.url
  )
};

const SUPPORTED_EXTENSIONS = new Set(["parquet", "json", "md", "txt"]);
let datasetCatalogPromise;
const datasetCache = new Map();

function fileExtension(filename) {
  const dot = String(filename).lastIndexOf(".");
  if (dot < 0) return "";
  return filename.slice(dot + 1).toLowerCase();
}

function el(tag, text) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  return node;
}

function card() {
  const node = el("div");
  node.className = "card";
  node.style.display = "grid";
  node.style.gap = "0.7rem";
  return node;
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeValue(value) {
  if (value == null) return null;
  if (typeof value === "bigint") {
    const asNum = Number(value);
    return Number.isSafeInteger(asNum) ? asNum : value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function normalizeRow(row) {
  if (row == null || typeof row !== "object" || Array.isArray(row)) {
    return {value: normalizeValue(row)};
  }
  const out = {};
  for (const [key, value] of Object.entries({...row})) {
    out[key] = normalizeValue(value);
  }
  return out;
}

function sampleParquetRows(table, sampleLimit) {
  const rows = [];
  let count = 0;
  for (const row of table) {
    rows.push(normalizeRow(row));
    count += 1;
    if (count >= sampleLimit) break;
  }
  return rows;
}

function extractRowsFromJson(raw, sampleLimit) {
  if (Array.isArray(raw)) {
    return {
      rows: raw.slice(0, sampleLimit).map((row) => normalizeRow(row)),
      rowCount: raw.length,
      note: null
    };
  }

  if (raw && typeof raw === "object") {
    const arrayEntries = Object.entries(raw).filter(([, value]) => Array.isArray(value));
    if (arrayEntries.length > 0) {
      const [key, value] = arrayEntries.reduce((best, current) => (current[1].length > best[1].length ? current : best));
      return {
        rows: value.slice(0, sampleLimit).map((row) => normalizeRow(row)),
        rowCount: value.length,
        note: `Using array field "${key}" from JSON object.`
      };
    }
    return {
      rows: [normalizeRow(raw)],
      rowCount: 1,
      note: "JSON object converted to one-row table."
    };
  }

  return {
    rows: [{value: normalizeValue(raw)}],
    rowCount: 1,
    note: "Scalar JSON value converted to one-row table."
  };
}

function inferColumnType(stats) {
  if (stats.nonNull === 0) return "empty";
  if (stats.numericCount === stats.nonNull) return "number";
  if (stats.booleanCount === stats.nonNull) return "boolean";
  if (stats.stringCount === stats.nonNull) return "string";
  return "mixed";
}

function buildColumnProfiles(rows) {
  const columns = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) columns.add(key);
  }

  const sortedColumns = Array.from(columns).sort((a, b) => d3.ascending(a, b));
  return sortedColumns.map((column) => {
    const stats = {
      nonNull: 0,
      nullCount: 0,
      numericCount: 0,
      booleanCount: 0,
      stringCount: 0,
      distinct: new Set(),
      min: Infinity,
      max: -Infinity
    };

    for (const row of rows) {
      const value = row[column];
      if (value == null || value === "") {
        stats.nullCount += 1;
        continue;
      }
      stats.nonNull += 1;

      if (stats.distinct.size < 300) stats.distinct.add(String(value).slice(0, 120));

      if (typeof value === "number" && Number.isFinite(value)) {
        stats.numericCount += 1;
        stats.min = Math.min(stats.min, value);
        stats.max = Math.max(stats.max, value);
      } else if (typeof value === "boolean") {
        stats.booleanCount += 1;
      } else if (typeof value === "string") {
        const numeric = safeNumber(value);
        if (Number.isFinite(numeric)) {
          stats.numericCount += 1;
          stats.min = Math.min(stats.min, numeric);
          stats.max = Math.max(stats.max, numeric);
        } else {
          stats.stringCount += 1;
        }
      } else {
        stats.stringCount += 1;
      }
    }

    return {
      column,
      inferred_type: inferColumnType(stats),
      non_null_sampled: stats.nonNull,
      null_sampled: stats.nullCount,
      distinct_sampled: stats.distinct.size,
      sample_min: Number.isFinite(stats.min) ? stats.min : null,
      sample_max: Number.isFinite(stats.max) ? stats.max : null
    };
  });
}

function formatCellValue(value) {
  if (value == null) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 1000 || Math.abs(value) < 0.01) return value.toExponential(3);
    return value.toFixed(4);
  }
  const text = String(value);
  return text.length > 100 ? `${text.slice(0, 97)}...` : text;
}

async function getDatasetCatalog() {
  if (!datasetCatalogPromise) {
    datasetCatalogPromise = (async () => {
      const manifest = await MANIFEST_ATTACHMENT.json();
      const datasets = (manifest?.files || [])
        .map((entry) => {
          const filename = entry.filename || entry.file || "";
          const category = String(entry.category || "uncategorized");
          const id = `${category}/${filename}`;
          return {
            id,
            category,
            filename,
            extension: fileExtension(filename),
            size: Number(entry.size) || 0,
            sha256: entry.sha256 || entry.hash || "",
            importedAt: entry.imported_at || "",
            runtime: entry.runtime || ""
          };
        })
        .filter((entry) => SUPPORTED_EXTENSIONS.has(entry.extension) && ATTACHMENTS[entry.id])
        .sort((a, b) => d3.ascending(a.category, b.category) || d3.ascending(a.filename, b.filename));

      const datasetById = new Map(datasets.map((entry) => [entry.id, entry]));
      const defaultDatasetId = datasets.find((entry) => entry.id.includes("micro_benchmarks"))?.id || datasets[0]?.id || null;

      return {datasets, datasetById, defaultDatasetId};
    })();
  }
  return datasetCatalogPromise;
}

async function loadDataset(datasetById, datasetId, sampleLimit) {
  const cacheKey = `${datasetId}:${sampleLimit}`;
  if (datasetCache.has(cacheKey)) return datasetCache.get(cacheKey);

  const promise = (async () => {
    const dataset = datasetById.get(datasetId);
    if (!dataset) throw new Error(`Unknown dataset id: ${datasetId}`);

    const attachment = ATTACHMENTS[datasetId];
    if (!attachment) throw new Error(`Missing attachment mapping for ${datasetId}`);

    if (dataset.extension === "md" || dataset.extension === "txt") {
      const text = await attachment.text();
      return {
        dataset,
        kind: "text",
        lineCount: text.split(/\r?\n/).length,
        textPreview: text.slice(0, 8000),
        note: "Text preview only. Tabular controls are disabled."
      };
    }

    let rows = [];
    let rowCount = 0;
    let note = null;

    if (dataset.extension === "parquet") {
      const table = await attachment.parquet();
      rows = sampleParquetRows(table, sampleLimit);
      rowCount = Number(table?.numRows);
      if (!Number.isFinite(rowCount)) rowCount = rows.length;
      if (rowCount > rows.length) {
        note = `Showing a sample of ${rows.length.toLocaleString()} rows from ${rowCount.toLocaleString()} total rows.`;
      }
    } else if (dataset.extension === "json") {
      const jsonRaw = await attachment.json();
      const extracted = extractRowsFromJson(jsonRaw, sampleLimit);
      rows = extracted.rows;
      rowCount = extracted.rowCount;
      note = extracted.note;
      if (rowCount > rows.length) {
        note = note
          ? `${note} Showing a sample of ${rows.length.toLocaleString()} rows from ${rowCount.toLocaleString()} total rows.`
          : `Showing a sample of ${rows.length.toLocaleString()} rows from ${rowCount.toLocaleString()} total rows.`;
      }
    } else {
      throw new Error(`Unsupported extension: ${dataset.extension}`);
    }

    const profiles = buildColumnProfiles(rows);
    const numericColumns = profiles
      .filter((profile) => profile.inferred_type === "number")
      .map((profile) => profile.column);

    return {
      dataset,
      kind: "table",
      rows,
      rowCount,
      profiles,
      columns: profiles.map((profile) => profile.column),
      numericColumns,
      note
    };
  })();

  datasetCache.set(cacheKey, promise);
  return promise;
}

function selectControl(labelText, options, currentValue) {
  const wrapper = el("label");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "0.5rem";
  wrapper.style.flexWrap = "wrap";

  const text = el("span", labelText);
  text.style.fontWeight = "600";
  text.style.minWidth = "10rem";

  const select = el("select");
  for (const optionSpec of options) {
    const option = el("option", optionSpec.label);
    option.value = optionSpec.value;
    if (optionSpec.value === currentValue) option.selected = true;
    select.appendChild(option);
  }

  wrapper.append(text, select);
  return {node: wrapper, select};
}

function rangeControl(labelText, min, max, step, value) {
  const wrapper = el("label");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "0.5rem";
  wrapper.style.flexWrap = "wrap";

  const text = el("span", labelText);
  text.style.fontWeight = "600";
  text.style.minWidth = "10rem";

  const input = el("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);

  const output = el("output", String(value));
  output.style.minWidth = "3rem";

  wrapper.append(text, input, output);
  return {node: wrapper, input, output};
}

function checkboxGroup(values, initialValues, legendText, keyPrefix) {
  const fieldset = el("fieldset");
  fieldset.style.border = "none";
  fieldset.style.margin = "0";
  fieldset.style.padding = "0";
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
    label.style.gap = "0.35rem";
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

function buildRollupRows(rows, groupColumn, metricColumn, aggregate, maxGroups = 30) {
  const grouped = new Map();

  for (const row of rows) {
    const rawGroup = groupColumn ? row[groupColumn] : "(all rows)";
    const group = rawGroup == null || rawGroup === "" ? "(missing)" : String(rawGroup);
    if (!grouped.has(group)) {
      grouped.set(group, {
        group,
        count: 0,
        sum: 0,
        valueCount: 0,
        min: Infinity,
        max: -Infinity
      });
    }

    const bucket = grouped.get(group);
    bucket.count += 1;

    const metric = safeNumber(row[metricColumn]);
    if (Number.isFinite(metric)) {
      bucket.sum += metric;
      bucket.valueCount += 1;
      bucket.min = Math.min(bucket.min, metric);
      bucket.max = Math.max(bucket.max, metric);
    }
  }

  const out = [];
  for (const bucket of grouped.values()) {
    let value = NaN;
    if (aggregate === "count") value = bucket.count;
    else if (aggregate === "sum") value = bucket.sum;
    else if (aggregate === "mean") value = bucket.valueCount > 0 ? bucket.sum / bucket.valueCount : NaN;
    else if (aggregate === "min") value = Number.isFinite(bucket.min) ? bucket.min : NaN;
    else if (aggregate === "max") value = Number.isFinite(bucket.max) ? bucket.max : NaN;

    if (Number.isFinite(value)) {
      out.push({
        group: bucket.group.length > 48 ? `${bucket.group.slice(0, 45)}...` : bucket.group,
        full_group: bucket.group,
        value,
        count: bucket.count
      });
    }
  }

  out.sort((a, b) => d3.descending(a.value, b.value));
  return out.slice(0, maxGroups);
}

function covarianceStats(rows, xColumn, yColumn) {
  let n = 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (const row of rows) {
    const x = safeNumber(row[xColumn]);
    const y = safeNumber(row[yColumn]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    n += 1;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  if (n < 2) return {n, covariance: NaN, correlation: NaN};

  const meanX = sumX / n;
  const meanY = sumY / n;
  const covariance = sumXY / n - meanX * meanY;
  const varianceX = sumX2 / n - meanX * meanX;
  const varianceY = sumY2 / n - meanY * meanY;
  const denom = Math.sqrt(Math.max(varianceX, 0) * Math.max(varianceY, 0));
  const correlation = denom > 0 ? covariance / denom : NaN;

  return {n, covariance, correlation};
}

function buildCovarianceMatrix(rows, columns) {
  const matrix = [];
  for (const x of columns) {
    for (const y of columns) {
      const stats = covarianceStats(rows, x, y);
      matrix.push({
        x,
        y,
        n: stats.n,
        covariance: stats.covariance,
        correlation: stats.correlation
      });
    }
  }
  return matrix;
}

export async function renderDataPlayground(options = {}) {
  const root = el("section");
  root.className = "observable-embed observable-embed-data-playground";
  root.style.display = "grid";
  root.style.gap = "1rem";

  const title = el("h2", "Data Playground");
  title.style.margin = "0";
  const subtitle = el(
    "p",
    "Explore synced project datasets, inspect schema/size metadata, preview rows, and run interactive rollups and numeric diagnostics."
  );
  subtitle.style.margin = "0";

  const status = el("p");
  status.style.margin = "0";

  const controlsHost = card();
  const summaryHost = card();
  const profileHost = card();
  const previewHost = card();
  const rollupHost = card();
  const histogramHost = card();
  const covarianceHost = card();

  root.append(title, subtitle, status, controlsHost, summaryHost, profileHost, previewHost, rollupHost, histogramHost, covarianceHost);

  const catalog = await getDatasetCatalog();
  if (!catalog.defaultDatasetId) {
    status.textContent = "No datasets available for the playground.";
    controlsHost.appendChild(emptyState("Manifest has no supported files."));
    return root;
  }

  const datasetOptions = catalog.datasets.map((dataset) => ({
    value: dataset.id,
    label: `${dataset.category} / ${dataset.filename} (${dataset.extension}, ${formatBytes(dataset.size)})`
  }));

  const state = {
    datasetId: catalog.datasetById.has(options.datasetId) ? options.datasetId : catalog.defaultDatasetId,
    sampleLimit: Number(options.sampleLimit) > 0 ? Number(options.sampleLimit) : 5000,
    previewRows: Number(options.previewRows) > 0 ? Number(options.previewRows) : 30,
    rollupGroup: "",
    rollupMetric: "",
    rollupAggregate: "count",
    histogramMetric: "",
    histogramBins: 30,
    covarianceColumns: []
  };

  const datasetControl = selectControl("Dataset", datasetOptions, state.datasetId);
  const sampleControl = selectControl(
    "Sample rows",
    [
      {value: "500", label: "500"},
      {value: "1000", label: "1,000"},
      {value: "5000", label: "5,000"},
      {value: "20000", label: "20,000"}
    ],
    String(state.sampleLimit)
  );

  const dynamicControlsHost = card();
  controlsHost.append(datasetControl.node, sampleControl.node, dynamicControlsHost);

  let currentData = null;

  function ensureAnalysisDefaults(datasetData) {
    if (datasetData.kind !== "table") return;
    const columns = datasetData.columns;
    const numericColumns = datasetData.numericColumns;

    if (!columns.includes(state.rollupGroup)) state.rollupGroup = "";
    if (!numericColumns.includes(state.rollupMetric)) state.rollupMetric = numericColumns[0] || "";
    if (!numericColumns.includes(state.histogramMetric)) state.histogramMetric = numericColumns[0] || "";

    const selectedCov = state.covarianceColumns.filter((column) => numericColumns.includes(column));
    state.covarianceColumns = selectedCov.length >= 2 ? selectedCov : numericColumns.slice(0, Math.min(4, numericColumns.length));
  }

  function renderSummary(datasetData) {
    clearNode(summaryHost);
    summaryHost.appendChild(sectionHeading("Dataset Summary"));

    if (datasetData.kind === "text") {
      const rows = [
        {property: "Dataset", value: datasetData.dataset.id},
        {property: "Size", value: formatBytes(datasetData.dataset.size)},
        {property: "Type", value: datasetData.dataset.extension},
        {property: "Lines", value: String(datasetData.lineCount)},
        {property: "SHA256", value: datasetData.dataset.sha256 || "n/a"}
      ];
      summaryHost.appendChild(renderSimpleTable(rows, [{key: "property", label: "Property"}, {key: "value", label: "Value"}]));
      return;
    }

    const rows = [
      {property: "Dataset", value: datasetData.dataset.id},
      {property: "Type", value: datasetData.dataset.extension},
      {property: "Size", value: formatBytes(datasetData.dataset.size)},
      {property: "Rows (total)", value: datasetData.rowCount.toLocaleString()},
      {property: "Rows (sampled)", value: datasetData.rows.length.toLocaleString()},
      {property: "Columns", value: datasetData.columns.length.toLocaleString()},
      {property: "Numeric columns", value: datasetData.numericColumns.length.toLocaleString()},
      {property: "SHA256", value: datasetData.dataset.sha256 || "n/a"}
    ];
    summaryHost.appendChild(renderSimpleTable(rows, [{key: "property", label: "Property"}, {key: "value", label: "Value"}]));
  }

  function renderProfiles(datasetData) {
    clearNode(profileHost);
    profileHost.appendChild(sectionHeading("Column Profile"));

    if (datasetData.kind !== "table") {
      profileHost.appendChild(emptyState("No tabular columns to profile for this dataset type."));
      return;
    }
    if (datasetData.profiles.length === 0) {
      profileHost.appendChild(emptyState("No columns available in sampled rows."));
      return;
    }

    profileHost.appendChild(
      renderSimpleTable(datasetData.profiles, [
        {key: "column", label: "Column"},
        {key: "inferred_type", label: "Type"},
        {key: "non_null_sampled", label: "Non-null", align: "right"},
        {key: "null_sampled", label: "Null", align: "right"},
        {key: "distinct_sampled", label: "Distinct(sample)", align: "right"},
        {
          key: "sample_min",
          label: "Min(sample)",
          align: "right",
          format: (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(4) : "n/a")
        },
        {
          key: "sample_max",
          label: "Max(sample)",
          align: "right",
          format: (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(4) : "n/a")
        }
      ])
    );
  }

  function renderPreview(datasetData) {
    clearNode(previewHost);
    previewHost.appendChild(sectionHeading("Row Preview"));

    if (datasetData.kind === "text") {
      const pre = el("pre", datasetData.textPreview);
      pre.style.maxHeight = "360px";
      pre.style.overflow = "auto";
      pre.style.margin = "0";
      pre.style.padding = "0.75rem";
      pre.style.border = "1px solid var(--theme-foreground-faint)";
      pre.style.borderRadius = "8px";
      previewHost.appendChild(pre);
      return;
    }

    if (datasetData.rows.length === 0) {
      previewHost.appendChild(emptyState("No rows available in this dataset."));
      return;
    }

    const limitedRows = datasetData.rows.slice(0, state.previewRows);
    const previewColumns = datasetData.columns.slice(0, 12).map((column) => ({
      key: column,
      label: column.length > 36 ? `${column.slice(0, 33)}...` : column,
      format: (value) => formatCellValue(value)
    }));

    previewHost.appendChild(renderSimpleTable(limitedRows, previewColumns));
  }

  function renderRollups(datasetData) {
    clearNode(rollupHost);
    rollupHost.appendChild(sectionHeading("Rollups"));

    if (datasetData.kind !== "table") {
      rollupHost.appendChild(emptyState("Rollups are only available for tabular datasets."));
      return;
    }
    if (datasetData.rows.length === 0 || datasetData.columns.length === 0) {
      rollupHost.appendChild(emptyState("No sampled rows available for rollups."));
      return;
    }
    if (state.rollupAggregate !== "count" && !state.rollupMetric) {
      rollupHost.appendChild(emptyState("Select a numeric metric for this aggregation mode."));
      return;
    }

    const rollupRows = buildRollupRows(
      datasetData.rows,
      state.rollupGroup || null,
      state.rollupMetric || datasetData.numericColumns[0] || "",
      state.rollupAggregate
    );

    if (rollupRows.length === 0) {
      rollupHost.appendChild(emptyState("Rollup produced no rows. Try a different grouping/metric."));
      return;
    }

    const yLabel =
      state.rollupAggregate === "count"
        ? "count"
        : `${state.rollupAggregate}(${state.rollupMetric || datasetData.numericColumns[0] || "metric"})`;

    rollupHost.appendChild(
      Plot.plot({
        width: 860,
        height: 320,
        marginBottom: 100,
        x: {tickRotate: -30, label: state.rollupGroup || "(all rows)"},
        y: {label: yLabel},
        marks: [
          Plot.barY(rollupRows, {
            x: "group",
            y: "value",
            sort: {x: "-y"},
            fill: "var(--theme-accent)",
            title: (row) => `${row.full_group}\n${yLabel}: ${Number(row.value).toFixed(4)}`
          }),
          Plot.ruleY([0])
        ]
      })
    );

    rollupHost.appendChild(
      renderSimpleTable(rollupRows, [
        {key: "full_group", label: "Group"},
        {
          key: "value",
          label: yLabel,
          align: "right",
          format: (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(4) : "n/a")
        },
        {key: "count", label: "Rows", align: "right"}
      ])
    );
  }

  function renderHistogram(datasetData) {
    clearNode(histogramHost);
    histogramHost.appendChild(sectionHeading("Histogram"));

    if (datasetData.kind !== "table") {
      histogramHost.appendChild(emptyState("Histograms are only available for tabular datasets."));
      return;
    }
    if (!state.histogramMetric) {
      histogramHost.appendChild(emptyState("Select a numeric column for histogram rendering."));
      return;
    }

    const values = datasetData.rows.map((row) => safeNumber(row[state.histogramMetric])).filter((value) => Number.isFinite(value));
    if (values.length < 2) {
      histogramHost.appendChild(emptyState("Need at least two numeric values to render a histogram."));
      return;
    }

    histogramHost.appendChild(
      Plot.plot({
        width: 860,
        height: 300,
        x: {label: state.histogramMetric},
        y: {label: "Count"},
        marks: [
          Plot.rectY(
            values,
            Plot.binX(
              {y: "count"},
              {
                x: (value) => value,
                thresholds: Math.max(5, state.histogramBins),
                fill: "var(--theme-accent)"
              }
            )
          ),
          Plot.ruleY([0])
        ]
      })
    );
  }

  function renderCovariance(datasetData) {
    clearNode(covarianceHost);
    covarianceHost.appendChild(sectionHeading("Covariance and Correlation"));

    if (datasetData.kind !== "table") {
      covarianceHost.appendChild(emptyState("Covariance diagnostics are only available for tabular datasets."));
      return;
    }

    const columns = state.covarianceColumns.filter((column) => datasetData.numericColumns.includes(column));
    if (columns.length < 2) {
      covarianceHost.appendChild(emptyState("Select at least two numeric columns."));
      return;
    }

    const matrix = buildCovarianceMatrix(datasetData.rows, columns);
    covarianceHost.appendChild(
      Plot.plot({
        width: 860,
        height: Math.max(260, columns.length * 70),
        marginLeft: 170,
        color: {domain: [-1, 1], scheme: "RdBu", legend: true, label: "Correlation"},
        marks: [
          Plot.cell(matrix, {
            x: "x",
            y: "y",
            fill: "correlation",
            title: (row) =>
              `${row.x} vs ${row.y}\nN: ${row.n}\nCovariance: ${
                Number.isFinite(row.covariance) ? row.covariance.toFixed(6) : "n/a"
              }\nCorrelation: ${Number.isFinite(row.correlation) ? row.correlation.toFixed(6) : "n/a"}`
          }),
          Plot.frame()
        ]
      })
    );

    const upperTriangle = matrix.filter((row) => columns.indexOf(row.x) <= columns.indexOf(row.y));
    covarianceHost.appendChild(
      renderSimpleTable(upperTriangle, [
        {key: "x", label: "X"},
        {key: "y", label: "Y"},
        {key: "n", label: "N", align: "right"},
        {
          key: "covariance",
          label: "Covariance",
          align: "right",
          format: (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(6) : "n/a")
        },
        {
          key: "correlation",
          label: "Correlation",
          align: "right",
          format: (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(6) : "n/a")
        }
      ])
    );
  }

  function renderDynamicControls(datasetData) {
    clearNode(dynamicControlsHost);

    const previewControl = rangeControl("Preview rows", 5, 200, 5, state.previewRows);
    previewControl.output.textContent = String(state.previewRows);
    previewControl.input.addEventListener("input", () => {
      state.previewRows = Number(previewControl.input.value);
      previewControl.output.textContent = String(state.previewRows);
      if (currentData) renderPreview(currentData);
    });
    dynamicControlsHost.appendChild(previewControl.node);

    if (datasetData.kind !== "table") return;

    const groupOptions = [{value: "", label: "(no grouping)"}].concat(
      datasetData.columns.map((column) => ({value: column, label: column}))
    );
    const metricOptions = datasetData.numericColumns.map((column) => ({value: column, label: column}));
    const aggregateOptions = [
      {value: "count", label: "count"},
      {value: "sum", label: "sum"},
      {value: "mean", label: "mean"},
      {value: "min", label: "min"},
      {value: "max", label: "max"}
    ];

    const rollupGroupControl = selectControl("Rollup group", groupOptions, state.rollupGroup);
    const rollupMetricControl = selectControl(
      "Rollup metric",
      metricOptions.length > 0 ? metricOptions : [{value: "", label: "(no numeric columns)"}],
      state.rollupMetric
    );
    const rollupAggControl = selectControl("Rollup aggregate", aggregateOptions, state.rollupAggregate);
    const histogramMetricControl = selectControl(
      "Histogram metric",
      metricOptions.length > 0 ? metricOptions : [{value: "", label: "(no numeric columns)"}],
      state.histogramMetric
    );
    const histogramBinsControl = rangeControl("Histogram bins", 5, 80, 1, state.histogramBins);
    histogramBinsControl.output.textContent = String(state.histogramBins);

    rollupGroupControl.select.addEventListener("change", () => {
      state.rollupGroup = rollupGroupControl.select.value;
      if (currentData) renderRollups(currentData);
    });
    rollupMetricControl.select.addEventListener("change", () => {
      state.rollupMetric = rollupMetricControl.select.value;
      if (currentData) renderRollups(currentData);
    });
    rollupAggControl.select.addEventListener("change", () => {
      state.rollupAggregate = rollupAggControl.select.value;
      if (currentData) renderRollups(currentData);
    });
    histogramMetricControl.select.addEventListener("change", () => {
      state.histogramMetric = histogramMetricControl.select.value;
      if (currentData) renderHistogram(currentData);
    });
    histogramBinsControl.input.addEventListener("input", () => {
      state.histogramBins = Number(histogramBinsControl.input.value);
      histogramBinsControl.output.textContent = String(state.histogramBins);
      if (currentData) renderHistogram(currentData);
    });

    dynamicControlsHost.append(
      rollupGroupControl.node,
      rollupMetricControl.node,
      rollupAggControl.node,
      histogramMetricControl.node,
      histogramBinsControl.node
    );

    if (datasetData.numericColumns.length > 0) {
      const covarianceControl = checkboxGroup(
        datasetData.numericColumns.slice(0, 12),
        state.covarianceColumns,
        "Covariance columns",
        "cov-col"
      );
      covarianceControl.onChange(() => {
        state.covarianceColumns = covarianceControl.getSelected();
        if (currentData) renderCovariance(currentData);
      });
      dynamicControlsHost.appendChild(covarianceControl.node);
    }
  }

  async function refreshDataset() {
    const selected = catalog.datasetById.get(state.datasetId);
    status.textContent = `Loading ${selected?.id || state.datasetId} ...`;

    try {
      const datasetData = await loadDataset(catalog.datasetById, state.datasetId, state.sampleLimit);
      currentData = datasetData;
      ensureAnalysisDefaults(datasetData);
      renderDynamicControls(datasetData);
      renderSummary(datasetData);
      renderProfiles(datasetData);
      renderPreview(datasetData);
      renderRollups(datasetData);
      renderHistogram(datasetData);
      renderCovariance(datasetData);

      const baseStatus = datasetData.kind === "table"
        ? `Loaded ${datasetData.dataset.id}: ${datasetData.rowCount.toLocaleString()} rows (${datasetData.rows.length.toLocaleString()} sampled).`
        : `Loaded ${datasetData.dataset.id}: ${datasetData.lineCount.toLocaleString()} lines.`;
      status.textContent = datasetData.note ? `${baseStatus} ${datasetData.note}` : baseStatus;
    } catch (error) {
      status.textContent = `Failed to load dataset: ${error.message}`;
      clearNode(dynamicControlsHost);
      clearNode(summaryHost);
      clearNode(profileHost);
      clearNode(previewHost);
      clearNode(rollupHost);
      clearNode(histogramHost);
      clearNode(covarianceHost);
      summaryHost.appendChild(emptyState("Dataset summary unavailable."));
      profileHost.appendChild(emptyState("Column profile unavailable."));
      previewHost.appendChild(emptyState("Preview unavailable."));
      rollupHost.appendChild(emptyState("Rollups unavailable."));
      histogramHost.appendChild(emptyState("Histogram unavailable."));
      covarianceHost.appendChild(emptyState("Covariance diagnostics unavailable."));
    }
  }

  datasetControl.select.addEventListener("change", () => {
    state.datasetId = datasetControl.select.value;
    refreshDataset();
  });

  sampleControl.select.addEventListener("change", () => {
    state.sampleLimit = Number(sampleControl.select.value);
    refreshDataset();
  });

  await refreshDataset();
  return root;
}
