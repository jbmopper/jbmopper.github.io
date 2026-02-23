function safeNumber(value, fallback = NaN) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sortEvents(a, b) {
  return (
    a.start_ns - b.start_ns ||
    a.end_ns - b.end_ns ||
    String(a.lane_key).localeCompare(String(b.lane_key)) ||
    String(a.event_id).localeCompare(String(b.event_id))
  );
}

function upperBound(sortedValues, target) {
  let lo = 0;
  let hi = sortedValues.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedValues[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function lowerBound(sortedValues, target) {
  let lo = 0;
  let hi = sortedValues.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedValues[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function normalizeSet(values) {
  if (!values) return null;
  if (values instanceof Set) return values.size > 0 ? values : null;
  if (Array.isArray(values)) {
    const set = new Set(values);
    return set.size > 0 ? set : null;
  }
  return null;
}

function laneComparator(a, b) {
  return (
    String(a.process_id).localeCompare(String(b.process_id), "en-US", {numeric: true}) ||
    String(a.context_id).localeCompare(String(b.context_id), "en-US", {numeric: true}) ||
    String(a.stream_id).localeCompare(String(b.stream_id), "en-US", {numeric: true}) ||
    String(a.event_type).localeCompare(String(b.event_type), "en-US") ||
    String(a.lane_key).localeCompare(String(b.lane_key), "en-US")
  );
}

function buildLaneLabel(processId, contextId, streamId, eventType) {
  return `pid ${processId} · ctx ${contextId} · stream ${streamId} · ${eventType}`;
}

export function buildTraceIndex(detailedRows) {
  if (!Array.isArray(detailedRows) || detailedRows.length === 0) {
    return {
      trace: "unknown",
      spanNs: {start: 0, end: 0, duration: 0},
      allEvents: [],
      allEventsSorted: [],
      lanes: new Map(),
      laneStats: [],
      laneOrder: [],
      eventById: new Map(),
      eventsByCorrelation: new Map()
    };
  }

  const trace = detailedRows[0]?.trace || "unknown";
  const lanes = new Map();
  const allEvents = [];
  const eventById = new Map();
  const eventsByCorrelation = new Map();
  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;

  for (const row of detailedRows) {
    const processId = String(row.global_pid ?? "unknown");
    const contextId = String(row.context_id ?? "unknown");
    const streamId = String(row.stream_id ?? "unknown");
    const eventType = String(row.event_type || "unknown");
    const eventName = String(row.event_name || "unknown");
    const laneKey = `p:${processId}|c:${contextId}|s:${streamId}|t:${eventType}`;
    const laneLabel = buildLaneLabel(processId, contextId, streamId, eventType);
    const startNs = safeNumber(row.start_ns);
    const endNs = safeNumber(row.end_ns);
    const durationNs = Number.isFinite(safeNumber(row.duration_ns))
      ? safeNumber(row.duration_ns)
      : Number.isFinite(startNs) && Number.isFinite(endNs)
        ? Math.max(0, endNs - startNs)
        : 0;

    const event = {
      ...row,
      trace,
      lane_key: laneKey,
      lane_label: laneLabel,
      process_id: processId,
      context_id_label: contextId,
      stream_id_label: streamId,
      event_type: eventType,
      event_name: eventName,
      start_ns: startNs,
      end_ns: endNs,
      duration_ns: durationNs
    };

    allEvents.push(event);
    eventById.set(String(event.event_id), event);

    if (Number.isFinite(startNs) && startNs < minStart) minStart = startNs;
    if (Number.isFinite(endNs) && endNs > maxEnd) maxEnd = endNs;

    let lane = lanes.get(laneKey);
    if (!lane) {
      lane = {
        lane_key: laneKey,
        lane_label: laneLabel,
        process_id: processId,
        context_id: contextId,
        stream_id: streamId,
        event_type: eventType,
        events: [],
        event_count: 0,
        total_duration_ns: 0,
        maxDurationNs: 0,
        event_name_counts: new Map(),
        event_name_durations: new Map(),
        starts: [],
        prefixMaxEnd: []
      };
      lanes.set(laneKey, lane);
    }

    lane.events.push(event);
    lane.event_count += 1;
    lane.total_duration_ns += durationNs;
    lane.maxDurationNs = Math.max(lane.maxDurationNs, durationNs);
    lane.event_name_counts.set(eventName, (lane.event_name_counts.get(eventName) || 0) + 1);
    lane.event_name_durations.set(eventName, (lane.event_name_durations.get(eventName) || 0) + durationNs);

    const correlationId = safeNumber(event.correlation_id);
    if (Number.isFinite(correlationId)) {
      const key = String(correlationId);
      let group = eventsByCorrelation.get(key);
      if (!group) {
        group = [];
        eventsByCorrelation.set(key, group);
      }
      group.push(event);
    }
  }

  const laneStats = [];
  for (const lane of lanes.values()) {
    lane.events.sort(sortEvents);
    lane.starts = lane.events.map((event) => event.start_ns);
    lane.prefixMaxEnd = [];
    let runningMaxEnd = Number.NEGATIVE_INFINITY;
    for (const event of lane.events) {
      runningMaxEnd = Math.max(runningMaxEnd, event.end_ns);
      lane.prefixMaxEnd.push(runningMaxEnd);
    }

    laneStats.push({
      lane_key: lane.lane_key,
      lane_label: lane.lane_label,
      process_id: lane.process_id,
      context_id: lane.context_id,
      stream_id: lane.stream_id,
      event_type: lane.event_type,
      event_count: lane.event_count,
      total_duration_ns: lane.total_duration_ns,
      maxDurationNs: lane.maxDurationNs,
      event_name_counts: lane.event_name_counts,
      event_name_durations: lane.event_name_durations
    });
  }

  laneStats.sort(laneComparator);
  const laneOrder = laneStats.map((lane) => lane.lane_key);
  const allEventsSorted = [...allEvents].sort(sortEvents);

  if (!Number.isFinite(minStart)) minStart = 0;
  if (!Number.isFinite(maxEnd)) maxEnd = minStart;

  return {
    trace,
    spanNs: {
      start: minStart,
      end: maxEnd,
      duration: Math.max(0, maxEnd - minStart)
    },
    allEvents,
    allEventsSorted,
    lanes,
    laneStats,
    laneOrder,
    eventById,
    eventsByCorrelation
  };
}

export function queryWindow(index, windowStartNs, windowEndNs, filters = {}, maxEvents = Number.POSITIVE_INFINITY) {
  if (!index || !index.lanes || index.lanes.size === 0) {
    return {rows: [], totalMatches: 0, clipped: false};
  }

  let startNs = safeNumber(windowStartNs, index.spanNs.start);
  let endNs = safeNumber(windowEndNs, index.spanNs.end);
  if (startNs > endNs) {
    const t = startNs;
    startNs = endNs;
    endNs = t;
  }

  const laneKeysFilter = normalizeSet(filters.laneKeys);
  const eventTypesFilter = normalizeSet(filters.eventTypes);
  const eventNamesFilter = normalizeSet(filters.eventNames);
  const predicate = typeof filters.predicate === "function" ? filters.predicate : null;

  const laneKeys = laneKeysFilter ? [...laneKeysFilter] : index.laneOrder;
  const rows = [];

  for (const laneKey of laneKeys) {
    const lane = index.lanes.get(laneKey);
    if (!lane || lane.events.length === 0) continue;
    if (eventTypesFilter && !eventTypesFilter.has(lane.event_type)) continue;

    const hi = upperBound(lane.starts, endNs);
    if (hi <= 0) continue;

    const lo = lowerBound(lane.prefixMaxEnd, startNs);
    if (lo >= hi) continue;

    for (let i = lo; i < hi; i += 1) {
      const event = lane.events[i];
      if (event.end_ns < startNs || event.start_ns > endNs) continue;
      if (eventTypesFilter && !eventTypesFilter.has(event.event_type)) continue;
      if (eventNamesFilter && !eventNamesFilter.has(event.event_name)) continue;
      if (predicate && !predicate(event)) continue;
      rows.push(event);
    }
  }

  rows.sort(sortEvents);
  const totalMatches = rows.length;
  const cap = Number.isFinite(maxEvents) ? Math.max(0, Number(maxEvents)) : rows.length;
  const clipped = totalMatches > cap;
  const limitedRows = clipped ? rows.slice(0, cap) : rows;

  return {rows: limitedRows, totalMatches, clipped};
}

export function buildLaneTree(index, laneMode = "event_type") {
  if (!index || !Array.isArray(index.laneStats) || index.laneStats.length === 0) return [];

  const processMap = new Map();

  const upsertChild = (parentMap, key, factory) => {
    if (!parentMap.has(key)) parentMap.set(key, factory());
    return parentMap.get(key);
  };

  for (const lane of index.laneStats) {
    const processNode = upsertChild(processMap, lane.process_id, () => ({
      id: `process:${lane.process_id}`,
      type: "process",
      label: `Process ${lane.process_id}`,
      key: lane.process_id,
      count: 0,
      total_duration_ns: 0,
      childrenMap: new Map()
    }));
    processNode.count += lane.event_count;
    processNode.total_duration_ns += lane.total_duration_ns;

    const contextNode = upsertChild(processNode.childrenMap, lane.context_id, () => ({
      id: `process:${lane.process_id}|context:${lane.context_id}`,
      type: "context",
      label: `Context ${lane.context_id}`,
      key: lane.context_id,
      count: 0,
      total_duration_ns: 0,
      childrenMap: new Map()
    }));
    contextNode.count += lane.event_count;
    contextNode.total_duration_ns += lane.total_duration_ns;

    const streamNode = upsertChild(contextNode.childrenMap, lane.stream_id, () => ({
      id: `process:${lane.process_id}|context:${lane.context_id}|stream:${lane.stream_id}`,
      type: "stream",
      label: `Stream ${lane.stream_id}`,
      key: lane.stream_id,
      count: 0,
      total_duration_ns: 0,
      childrenMap: new Map()
    }));
    streamNode.count += lane.event_count;
    streamNode.total_duration_ns += lane.total_duration_ns;

    const eventTypeNode = upsertChild(streamNode.childrenMap, lane.event_type, () => ({
      id: `process:${lane.process_id}|context:${lane.context_id}|stream:${lane.stream_id}|type:${lane.event_type}`,
      type: "event_type",
      label: lane.event_type,
      key: lane.event_type,
      count: 0,
      total_duration_ns: 0,
      filter: {laneKey: lane.lane_key},
      childrenMap: new Map()
    }));
    eventTypeNode.count += lane.event_count;
    eventTypeNode.total_duration_ns += lane.total_duration_ns;

    if (laneMode === "event_name") {
      const eventNames = [...lane.event_name_counts.entries()].sort((a, b) => {
        return (
          b[1] - a[1] ||
          String(a[0]).localeCompare(String(b[0]), "en-US")
        );
      });
      for (const [eventName, count] of eventNames) {
        const duration = lane.event_name_durations.get(eventName) || 0;
        const id = `${eventTypeNode.id}|name:${eventName}`;
        if (!eventTypeNode.childrenMap.has(id)) {
          eventTypeNode.childrenMap.set(id, {
            id,
            type: "event_name",
            label: eventName,
            key: eventName,
            count: 0,
            total_duration_ns: 0,
            filter: {laneKey: lane.lane_key, eventName},
            childrenMap: new Map()
          });
        }
        const nameNode = eventTypeNode.childrenMap.get(id);
        nameNode.count += count;
        nameNode.total_duration_ns += duration;
      }
    }
  }

  const sortNodeValues = (values) => values.sort((a, b) => {
    if (a.type === "event_name" && b.type === "event_name") {
      return (
        b.count - a.count ||
        String(a.label).localeCompare(String(b.label), "en-US")
      );
    }
    return String(a.label).localeCompare(String(b.label), "en-US", {numeric: true});
  });

  const materialize = (node) => {
    const children = sortNodeValues([...node.childrenMap.values()]).map(materialize);
    return {
      id: node.id,
      type: node.type,
      label: node.label,
      key: node.key,
      count: node.count,
      total_duration_ns: node.total_duration_ns,
      filter: node.filter,
      children
    };
  };

  return sortNodeValues([...processMap.values()]).map(materialize);
}

export function windowToRows(index, window, renderMode = "raw", bucketNs = 1_000_000) {
  if (!index || !window) return {mode: renderMode, rows: [], totalMatches: 0, clipped: false};

  const startNs = safeNumber(window.startNs, index.spanNs.start);
  const endNs = safeNumber(window.endNs, index.spanNs.end);
  const mode = renderMode === "rolled" ? "rolled" : "raw";
  const maxEvents = mode === "rolled" ? Number.POSITIVE_INFINITY : window.maxEvents;
  const queried = queryWindow(index, startNs, endNs, window.filters || {}, maxEvents);

  if (mode === "raw") {
    return {
      mode: "raw",
      rows: queried.rows.map((event) => ({
        ...event,
        start_ms_rel: (event.start_ns - index.spanNs.start) / 1e6,
        end_ms_rel: (event.end_ns - index.spanNs.start) / 1e6
      })),
      totalMatches: queried.totalMatches,
      clipped: queried.clipped
    };
  }

  const safeBucketNs = Math.max(1, Math.floor(safeNumber(bucketNs, 1_000_000)));
  const buckets = new Map();

  for (const event of queried.rows) {
    const bucketIndex = Math.floor((event.start_ns - startNs) / safeBucketNs);
    const bucketStart = startNs + bucketIndex * safeBucketNs;
    const bucketEnd = bucketStart + safeBucketNs;
    const key = `${event.lane_key}|${event.event_type}|${bucketIndex}`;

    if (!buckets.has(key)) {
      buckets.set(key, {
        trace: event.trace,
        lane_key: event.lane_key,
        lane_label: event.lane_label,
        event_type: event.event_type,
        start_ns: bucketStart,
        end_ns: bucketEnd,
        event_count: 0,
        total_duration_ns: 0,
        max_duration_ns: 0
      });
    }

    const bucket = buckets.get(key);
    bucket.event_count += 1;
    bucket.total_duration_ns += event.duration_ns;
    bucket.max_duration_ns = Math.max(bucket.max_duration_ns, event.duration_ns);
  }

  const rows = [...buckets.values()]
    .sort((a, b) => {
      return (
        a.start_ns - b.start_ns ||
        String(a.lane_key).localeCompare(String(b.lane_key), "en-US") ||
        String(a.event_type).localeCompare(String(b.event_type), "en-US")
      );
    })
    .map((row) => ({
      ...row,
      start_ms_rel: (row.start_ns - index.spanNs.start) / 1e6,
      end_ms_rel: (row.end_ns - index.spanNs.start) / 1e6,
      avg_duration_ns: row.event_count > 0 ? row.total_duration_ns / row.event_count : 0
    }));

  return {
    mode: "rolled",
    rows,
    bucket_ns: safeBucketNs,
    totalMatches: queried.totalMatches,
    clipped: false
  };
}

