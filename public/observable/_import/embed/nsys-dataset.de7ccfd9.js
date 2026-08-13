import {FileAttachment} from "../../_observablehq/stdlib.a50b4fda.js";

const TRACE_ATTACHMENTS = {
  bad_head_size: FileAttachment({"name":"../../data/raw/traces/bad_head_size_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/bad_head_size_nsys.0e5fcf94.parquet","lastModified":1771465633642,"size":699507}, import.meta.url),
  bandwidth_bound: FileAttachment({"name":"../../data/raw/traces/bandwidth_bound_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/bandwidth_bound_nsys.0570a4e8.parquet","lastModified":1771465633645,"size":526034}, import.meta.url),
  compute_bound: FileAttachment({"name":"../../data/raw/traces/compute_bound_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/compute_bound_nsys.9be21553.parquet","lastModified":1771465633647,"size":1020491}, import.meta.url),
  deep_sequential: FileAttachment({"name":"../../data/raw/traces/deep_sequential_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/deep_sequential_nsys.4ed702eb.parquet","lastModified":1771465633653,"size":3186034}, import.meta.url),
  latency_bound: FileAttachment({"name":"../../data/raw/traces/latency_bound_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/latency_bound_nsys.5b9c4edd.parquet","lastModified":1771465633657,"size":1104236}, import.meta.url),
  misaligned_dims: FileAttachment({"name":"../../data/raw/traces/misaligned_dims_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/misaligned_dims_nsys.accc5b6e.parquet","lastModified":1771874136944,"size":669386}, import.meta.url),
  model_a: FileAttachment({"name":"../../data/raw/traces/model_a_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/model_a_nsys.7c95f1f4.parquet","lastModified":1771465633660,"size":294932}, import.meta.url),
  model_b: FileAttachment({"name":"../../data/raw/traces/model_b_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/model_b_nsys.d909797c.parquet","lastModified":1771465633662,"size":1231233}, import.meta.url),
  vocab_bottleneck: FileAttachment({"name":"../../data/raw/traces/vocab_bottleneck_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/vocab_bottleneck_nsys.c6e0b393.parquet","lastModified":1771465633665,"size":509294}, import.meta.url),
  wide_ffn: FileAttachment({"name":"../../data/raw/traces/wide_ffn_nsys.parquet","mimeType":undefined,"path":"../../_file/data/raw/traces/wide_ffn_nsys.e3df5806.parquet","lastModified":1771465633667,"size":715444}, import.meta.url)
};

export const TRACE_NAMES = Object.keys(TRACE_ATTACHMENTS);

const summaryCache = new Map();
const detailedCache = new Map();
const summaryLoadPromises = new Map();
const detailedLoadPromises = new Map();
const TRACE_CACHE_IDLE_MS = 2 * 60 * 1000;
const SUMMARY_CACHE_MAX_ENTRIES = 4;
const DETAILED_CACHE_MAX_ENTRIES = 2;
let traceCacheTimer = null;

function touchTraceCaches() {
  if (typeof window === "undefined") return;
  if (traceCacheTimer) window.clearTimeout(traceCacheTimer);
  traceCacheTimer = window.setTimeout(() => {
    summaryCache.clear();
    detailedCache.clear();
    traceCacheTimer = null;
  }, TRACE_CACHE_IDLE_MS);
}

function getLru(cache, key) {
  if (!cache.has(key)) return undefined;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function setLru(cache, key, value, maxEntries) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey == null) break;
    cache.delete(oldestKey);
  }
}

function safeNumber(value, fallback = NaN) {
  if (typeof value === "bigint") {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeString(value, fallback = "unknown") {
  if (value == null) return fallback;
  return String(value);
}

function nsToMs(value) {
  return safeNumber(value) / 1e6;
}

async function loadParquetTable(traceName) {
  const attachment = TRACE_ATTACHMENTS[traceName];
  if (!attachment) throw new Error(`Unknown trace: ${traceName}`);
  return attachment.parquet();
}

const MATERIALIZE_CHUNK = 5000;

async function materializeRows(table, mapFn, filterFn) {
  const rows = [];
  let i = 0;
  for (const arrowRow of table) {
    const row = mapFn(arrowRow, i);
    if (filterFn(row)) rows.push(row);
    i++;
    if (i % MATERIALIZE_CHUNK === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return rows;
}

export async function loadTraceRowsSummary(traceName) {
  const cached = getLru(summaryCache, traceName);
  if (cached) {
    touchTraceCaches();
    return cached;
  }
  if (summaryLoadPromises.has(traceName)) return summaryLoadPromises.get(traceName);

  const loadPromise = (async () => {
    const table = await loadParquetTable(traceName);
    const rows = await materializeRows(
      table,
      (row) => {
        const startMs = nsToMs(row.start_ns);
        const endMs = nsToMs(row.end_ns);
        const durationMs = Number.isFinite(Number(row.duration_ms))
          ? Number(row.duration_ms)
          : Number.isFinite(startMs) && Number.isFinite(endMs)
            ? Math.max(0, endMs - startMs)
            : NaN;

        return {
          trace: traceName,
          event_type: safeString(row.event_type),
          event_name: safeString(row.event_name),
          start_ms: startMs,
          end_ms: endMs,
          duration_ms: durationMs,
          bytes: safeNumber(row.bytes, 0)
        };
      },
      (row) => Number.isFinite(row.start_ms) && Number.isFinite(row.end_ms)
    );

    setLru(summaryCache, traceName, rows, SUMMARY_CACHE_MAX_ENTRIES);
    touchTraceCaches();
    return rows;
  })();

  summaryLoadPromises.set(traceName, loadPromise);
  try {
    return await loadPromise;
  } finally {
    summaryLoadPromises.delete(traceName);
  }
}

export async function loadTraceRowsDetailed(traceName) {
  const cached = getLru(detailedCache, traceName);
  if (cached) {
    touchTraceCaches();
    return cached;
  }
  if (detailedLoadPromises.has(traceName)) return detailedLoadPromises.get(traceName);

  const loadPromise = (async () => {
    const table = await loadParquetTable(traceName);
    const rows = await materializeRows(
      table,
      (row, idx) => {
        const startNs = safeNumber(row.start_ns);
        const endNs = safeNumber(row.end_ns);
        const durationNs = Number.isFinite(safeNumber(row.duration_ns))
          ? safeNumber(row.duration_ns)
          : Number.isFinite(startNs) && Number.isFinite(endNs)
            ? Math.max(0, endNs - startNs)
            : NaN;
        const durationMs = Number.isFinite(Number(row.duration_ms))
          ? Number(row.duration_ms)
          : Number.isFinite(durationNs)
            ? durationNs / 1e6
            : NaN;

        return {
          event_id: `${traceName}:${idx}`,
          trace: traceName,
          start_ns: startNs,
          end_ns: endNs,
          duration_ns: durationNs,
          duration_ms: durationMs,
          event_type: safeString(row.event_type),
          event_name: safeString(row.event_name),
          bytes: safeNumber(row.bytes, 0),
          device_id: safeNumber(row.device_id),
          context_id: safeNumber(row.context_id),
          stream_id: safeNumber(row.stream_id),
          correlation_id: safeNumber(row.correlation_id),
          global_pid: safeNumber(row.global_pid),
          grid_x: safeNumber(row.grid_x),
          grid_y: safeNumber(row.grid_y),
          grid_z: safeNumber(row.grid_z),
          block_x: safeNumber(row.block_x),
          block_y: safeNumber(row.block_y),
          block_z: safeNumber(row.block_z),
          registers_per_thread: safeNumber(row.registers_per_thread),
          static_shared_memory: safeNumber(row.static_shared_memory),
          dynamic_shared_memory: safeNumber(row.dynamic_shared_memory),
          local_memory_per_thread: safeNumber(row.local_memory_per_thread),
          local_memory_total: safeNumber(row.local_memory_total)
        };
      },
      (row) => Number.isFinite(row.start_ns) && Number.isFinite(row.end_ns)
    );

    setLru(detailedCache, traceName, rows, DETAILED_CACHE_MAX_ENTRIES);
    touchTraceCaches();
    return rows;
  })();

  detailedLoadPromises.set(traceName, loadPromise);
  try {
    return await loadPromise;
  } finally {
    detailedLoadPromises.delete(traceName);
  }
}
