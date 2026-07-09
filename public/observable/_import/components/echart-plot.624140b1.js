import * as d3 from "../../_npm/d3@7.9.0/080cf928.js";
import "../../_npm/echarts-gl@2.0.9/063c0475.js";
import {chart as createChart} from "./echart.24e04cd8.js";
import {resolveThemeTokens} from "./echart-theme.ac72768d.js";

const DEFAULT_WIDTH = 920;
const DEFAULT_HEIGHT = 340;
const DEFAULT_MARGIN = {top: 28, right: 24, bottom: 48, left: 64};

class ChannelProbe {
  constructor() {
    this.stats = new Map();
  }

  probe(rows, channelConfigs) {
    if (isArrowTable(rows)) {
      const rowCount = typeof rows.numRows === "number" ? rows.numRows : rows.length;
      for (const [channel, accessor] of Object.entries(channelConfigs)) {
        if (accessor == null) continue;
        if (typeof accessor === "string") {
          const col = rows.getChild(accessor);
          if (col) {
            for (let i = 0; i < col.length; i++) {
              this.update(channel, col.get(i));
            }
            continue;
          }
        }
        for (let i = 0; i < rowCount; i++) {
          this.update(channel, getValue(rows.get(i), accessor));
        }
      }
    } else if (Array.isArray(rows) || (rows != null && typeof rows[Symbol.iterator] === "function")) {
      for (const row of rows) {
        for (const [channel, accessor] of Object.entries(channelConfigs)) {
          if (accessor == null) continue;
          this.update(channel, getValue(row, accessor));
        }
      }
    }
  }

  update(channel, v) {
    if (v == null) return;
    if (!this.stats.has(channel)) {
      this.stats.set(channel, {
        min: Infinity,
        max: -Infinity,
        categories: [],
        seen: new Set(),
        hasNumber: false,
        hasString: false
      });
    }
    const s = this.stats.get(channel);
    if (typeof v === "string") {
      s.hasString = true;
      if (!s.seen.has(v)) {
        s.seen.add(v);
        s.categories.push(v);
      }
    } else {
      const n = Number(v);
      if (Number.isFinite(n)) {
        s.hasNumber = true;
        if (n < s.min) s.min = n;
        if (n > s.max) s.max = n;
      }
    }
  }

  get(channel) {
    return this.stats.get(channel);
  }
}

class ScaleManager {
  constructor(tokens) {
    this.tokens = tokens;
    this.scales = new Map();
    this.palette = tokens?.palette || ["#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de", "#3ba272", "#fc8452", "#9a60b4", "#ea7ccc"];
  }

  getColor(channel, value) {
    if (value == null) return null;
    const css = colorFromCss(value);
    if (css) return css;

    if (!this.scales.has(channel)) {
      this.scales.set(channel, new Map());
    }
    const scale = this.scales.get(channel);
    const key = String(value);
    if (!scale.has(key)) {
      scale.set(key, this.palette[scale.size % this.palette.length]);
    }
    return scale.get(key);
  }
}

function asArray(data) {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (isArrowTable(data)) return data;
  try {
    return Array.from(data);
  } catch {
    return [];
  }
}

function isArrowTable(data) {
  return (
    data != null &&
    typeof data.getChild === "function" &&
    (typeof data.numRows === "number" || typeof data.length === "number")
  );
}

function getValue(row, accessor, fallback = undefined) {
  if (accessor == null) return fallback;
  if (typeof accessor === "function") {
    try {
      return accessor(row);
    } catch {
      return fallback;
    }
  }
  if (typeof accessor === "string") {
    if (row != null && typeof row === "object") {
      if (typeof row.get === "function") return row.get(accessor);
      return row[accessor];
    }
    return fallback;
  }
  return accessor;
}

function toNumber(value, fallback = NaN) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asAxisIndices(value, fallback = 0) {
  if (Array.isArray(value)) {
    const indices = value
      .map((entry) => Number(entry))
      .filter((entry) => Number.isInteger(entry) && entry >= 0);
    return indices.length > 0 ? indices : [fallback];
  }
  if (Number.isInteger(Number(value)) && Number(value) >= 0) return [Number(value)];
  return [fallback];
}

function toFiniteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function baseDataZoomSlider(type, options = {}) {
  const slider = {
    type: "slider",
    filterMode: options.filterMode || "none",
    realtime: options.realtime ?? true
  };
  if (type === "x") {
    slider.xAxisIndex = asAxisIndices(options.xAxisIndex, 0);
    slider.height = toFiniteOr(options.height, 18);
    slider.bottom = toFiniteOr(options.bottom, 10);
  } else {
    slider.yAxisIndex = asAxisIndices(options.yAxisIndex, 0);
    slider.width = toFiniteOr(options.width, 14);
    slider.right = toFiniteOr(options.right, 8);
  }
  return slider;
}

export function dataZoomX(options = {}) {
  return [
    {
      type: "inside",
      xAxisIndex: asAxisIndices(options.xAxisIndex, 0),
      filterMode: options.filterMode || "none",
      zoomOnMouseWheel: options.zoomOnMouseWheel ?? true,
      moveOnMouseMove: options.moveOnMouseMove ?? true,
      moveOnMouseWheel: options.moveOnMouseWheel ?? false
    },
    baseDataZoomSlider("x", options)
  ];
}

export function dataZoomXY(options = {}) {
  return [
    ...dataZoomX(options),
    {
      type: "inside",
      yAxisIndex: asAxisIndices(options.yAxisIndex, 0),
      filterMode: options.filterMode || "none",
      zoomOnMouseWheel: options.zoomYOnMouseWheel ?? true,
      moveOnMouseMove: options.moveOnMouseMove ?? true,
      moveOnMouseWheel: options.moveOnMouseWheel ?? false
    },
    baseDataZoomSlider("y", options)
  ];
}

function isNumeric(value) {
  return Number.isFinite(Number(value));
}

function unique(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const key = `${typeof value}:${String(value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function parseSortDirection(value) {
  if (value == null) return null;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (text === "-x" || text === "-y" || text === "desc" || text === "descending" || text === "-1") return "desc";
  if (text === "x" || text === "+x" || text === "y" || text === "+y" || text === "asc" || text === "ascending" || text === "1") return "asc";
  return null;
}

function compareSortValues(a, b, direction) {
  const aMissing = a == null;
  const bMissing = b == null;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  const aNum = Number(a);
  const bNum = Number(b);
  const bothNumeric = Number.isFinite(aNum) && Number.isFinite(bNum);
  const cmp = bothNumeric ? (aNum - bNum) : String(a).localeCompare(String(b));
  return direction === "desc" ? -cmp : cmp;
}

function resolveBarSort(rows, options, orientation, valueAccessor, categoryAccessor) {
  const sort = options?.sort;
  const rawDirection =
    orientation === "barX"
      ? (sort && typeof sort === "object" ? sort.y : sort)
      : (sort && typeof sort === "object" ? sort.x : sort);
  const direction = parseSortDirection(rawDirection);
  if (!direction) return {rows, categoryOrder: null};

  const sortedRows = rows.slice().sort((a, b) => {
    const av = getValue(a, valueAccessor);
    const bv = getValue(b, valueAccessor);
    return compareSortValues(av, bv, direction);
  });

  const categoryOrder = unique(
    sortedRows
      .map((row) => getValue(row, categoryAccessor))
      .filter((value) => value != null)
      .map((value) => String(value))
  );

  return {rows: sortedRows, categoryOrder};
}

function normalizeOptions(options = {}) {
  if (options && options.__stackY) return {...options, stackY: true};
  if (options && options.__binX) return {...options.options, __binX: true, __binReduce: options.reduce};
  return options || {};
}

function toMark(type, data, options = {}) {
  return {__echartMark: true, type, data, options: normalizeOptions(options)};
}

export function dot(data, options = {}) {
  return toMark("dot", data, options);
}

export function lineY(data, options = {}) {
  return toMark("lineY", data, options);
}

export function line(data, options = {}) {
  return toMark("line", data, options);
}

export function barY(data, options = {}) {
  return toMark("barY", data, options);
}

export function barX(data, options = {}) {
  return toMark("barX", data, options);
}

export function rectY(data, options = {}) {
  return toMark("rectY", data, options);
}

export function ruleX(data, options = {}) {
  return toMark("ruleX", data, options);
}

export function ruleY(data, options = {}) {
  return toMark("ruleY", data, options);
}

export function text(data, options = {}) {
  return toMark("text", data, options);
}

export function boxY(data, options = {}) {
  return toMark("boxY", data, options);
}

export function linearRegressionY(data, options = {}) {
  return toMark("linearRegressionY", data, options);
}

export function cell(data, options = {}) {
  return toMark("cell", data, options);
}

export function frame(data = [0], options = {}) {
  return toMark("frame", data, options);
}

export function tip(data, pointerOptions = {}) {
  return toMark("tip", data, pointerOptions?.options || pointerOptions);
}

export function pointer(options = {}) {
  return {__pointer: true, options};
}

export function stackY(options = {}) {
  return {__stackY: true, ...options};
}

export function binX(reduce = {y: "count"}, options = {}) {
  return {__binX: true, reduce, options};
}

function colorFromCss(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.startsWith("#")) return text;
  if (text.startsWith("rgb(")) return text;
  if (text.startsWith("rgba(")) return text;
  if (text.startsWith("hsl(")) return text;
  if (text.startsWith("hsla(")) return text;
  if (text.startsWith("var(")) {
    const varMatch = text.match(/^var\((--[^,)]+).*/);
    if (varMatch && typeof document !== "undefined") {
      const resolved = getComputedStyle(document.documentElement).getPropertyValue(varMatch[1]).trim();
      return resolved || text;
    }
  }
  return null;
}

function titleFor(row, options) {
  if (!row || typeof row !== "object") return "";
  const titleAccessor = options?.title;
  if (titleAccessor != null) {
    const value = getValue(row, titleAccessor);
    if (value != null) return String(value);
  }

  const fields = [options?.x, options?.y, options?.fill, options?.stroke, options?.z]
    .filter((f) => typeof f === "string");
  const lines = [];
  const seen = new Set();
  for (const field of fields) {
    if (seen.has(field)) continue;
    seen.add(field);
    const value = row[field];
    if (value == null) continue;
    lines.push(`${field}: ${String(value)}`);
  }
  if (lines.length > 0) return lines.join("\n");

  const fallback = [];
  for (const [key, value] of Object.entries(row)) {
    if (value == null || typeof value === "object") continue;
    fallback.push(`${key}: ${String(value)}`);
    if (fallback.length >= 6) break;
  }
  return fallback.join("\n");
}

function analyzeAxis(spec, probe, channel) {
  function domainRange() {
    if (Array.isArray(spec?.domain) && spec.domain.length === 2) {
      const [lo, hi] = spec.domain;
      if (isNumeric(lo) && isNumeric(hi)) return [Number(lo), Number(hi)];
    }
    return null;
  }

  if (spec?.type === "log") return {type: "log", categories: null, range: domainRange()};
  if (spec?.type === "time") return {type: "time", categories: null, range: domainRange()};

  const domainIsStringy = Array.isArray(spec?.domain) && spec.domain.some((v) => typeof v === "string");
  if (spec?.type === "band" || domainIsStringy) {
    const cats = Array.isArray(spec?.domain) ? spec.domain.map(String) : null;
    return {type: "category", categories: cats, range: null};
  }

  const explicitRange = domainRange();
  if (explicitRange) {
    return {type: "value", categories: null, range: explicitRange};
  }

  const stats = probe.get(channel);
  const stats1 = probe.get(`${channel}1`);
  const stats2 = probe.get(`${channel}2`);

  const hasString = stats?.hasString || stats1?.hasString || stats2?.hasString;
  const hasNumber = stats?.hasNumber || stats1?.hasNumber || stats2?.hasNumber;
  const categories = stats?.categories || [];

  const type = (hasString && !hasNumber) ? "category" : "value";

  let min = Infinity, max = -Infinity;
  if (stats?.min < min) min = stats.min;
  if (stats1?.min < min) min = stats1.min;
  if (stats2?.min < min) min = stats2.min;
  if (stats?.max > max) max = stats.max;
  if (stats1?.max > max) max = stats1.max;
  if (stats2?.max > max) max = stats2.max;

  let range = null;
  if (min <= max) {
    range = min === max ? [min - 1, max + 1] : [min, max];
  }

  return {type, categories: type === "category" ? (categories.length > 0 ? categories : null) : null, range};
}

function probeAllMarks(marks) {
  const probe = new ChannelProbe();
  for (const mark of marks) {
    const rows = mark.data;
    const opts = mark.options || {};
    probe.probe(rows, {
      x: opts.x,
      x1: opts.x1,
      x2: opts.x2,
      y: opts.y,
      y1: opts.y1,
      y2: opts.y2,
      fill: opts.fill,
      stroke: opts.stroke,
      fx: opts.fx,
      fy: opts.fy
    });
  }
  return probe;
}

function buildFacets(probe) {
  const stats = probe.get("fx");
  return stats?.categories || [];
}

function wrapTooltipData(value, row, rowIndex) {
  if (rowIndex) {
    const idx = rowIndex.length;
    rowIndex.push(row);
    return {value, __rowIdx: idx};
  }
  return {value, __row: row};
}

function histogram(rows, xAccessor, thresholds = 20) {
  const numbers = rows.map((row) => toNumber(getValue(row, xAccessor))).filter((v) => Number.isFinite(v));
  if (numbers.length === 0) return [];
  const bins = d3.bin().thresholds(thresholds)(numbers);
  return bins.map((bin) => ({
    x1: bin.x0,
    x2: bin.x1,
    count: bin.length
  }));
}

function regression(rows, xAccessor, yAccessor) {
  const points = rows
    .map((row) => [toNumber(getValue(row, xAccessor)), toNumber(getValue(row, yAccessor))])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (points.length < 2) return null;
  const n = points.length;
  const sumX = points.reduce((acc, [x]) => acc + x, 0);
  const sumY = points.reduce((acc, [, y]) => acc + y, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of points) {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) ** 2;
  }
  if (!Number.isFinite(den) || den === 0) return null;
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  const xs = points.map(([x]) => x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  return [
    [minX, slope * minX + intercept],
    [maxX, slope * maxX + intercept]
  ];
}

function computeBox(rows, xAccessor, yAccessor) {
  const groups = new Map();
  for (const row of rows) {
    const x = getValue(row, xAccessor);
    const y = toNumber(getValue(row, yAccessor));
    if (x == null || !Number.isFinite(y)) continue;
    const key = String(x);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(y);
  }
  const categories = Array.from(groups.keys());
  const values = categories.map((key) => {
    const series = groups.get(key).slice().sort((a, b) => a - b);
    const q1 = d3.quantileSorted(series, 0.25) ?? series[0] ?? 0;
    const q2 = d3.quantileSorted(series, 0.5) ?? series[0] ?? 0;
    const q3 = d3.quantileSorted(series, 0.75) ?? series[0] ?? 0;
    return [series[0] ?? 0, q1, q2, q3, series[series.length - 1] ?? 0];
  });
  return {categories, values};
}

const MARK_RENDERERS = {
  dot: (rows, options, context) => {
    const {axisIndex, scaleManager, rowRef, tooltipFormatter} = context;
    const colorAccessor = options.fill ?? options.stroke;
    const dense = rows.length > 15000;
    const useGL = options.gl === true;
    const useLarge = options.large === true && dense && !useGL;
    return {
      series: [
        {
          type: dense && useGL ? "scatterGL" : "scatter",
          ...axisIndex,
          data: rows
            .map((row) => {
              const x = getValue(row, options.x);
              const y = getValue(row, options.y);
              if (x == null || y == null) return null;
              return {
                value: [x, y],
                __rowIdx: rowRef(row),
                symbolSize: Number.isFinite(Number(getValue(row, options.r))) ? Number(getValue(row, options.r)) : 6,
                itemStyle: {
                  color: scaleManager.getColor("fill", getValue(row, colorAccessor))
                }
              };
            })
            .filter(Boolean),
          progressive: dense && !useGL ? 5000 : 0,
          large: useLarge,
          tooltip: {formatter: tooltipFormatter}
        }
      ]
    };
  },
  line: (rows, options, context) => {
    const {axisIndex, scaleManager, tooltipFormatter} = context;
    const xAccessor = options.x;
    const yAccessor = options.y;
    const groupAccessor = options.z ?? options.stroke;
    const seriesNameAccessor = options.seriesName;
    const showPoints = options.showPoints === true;
    const symbolSize = Number.isFinite(Number(options.symbolSize)) ? Number(options.symbolSize) : 4;
    const groups = new Map();
    for (const row of rows) {
      const x = getValue(row, xAccessor);
      const y = getValue(row, yAccessor);
      if (x == null || y == null) continue;
      const key = groupAccessor != null ? String(getValue(row, groupAccessor, "")) : "__all";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({x, y, row});
    }
    const seriesList = [];
    for (const [key, pts] of groups.entries()) {
      const sorted = pts
        .slice()
        .sort((a, b) => (Number.isFinite(Number(a.x)) && Number.isFinite(Number(b.x)) ? Number(a.x) - Number(b.x) : 0));
      const seriesNameValue =
        seriesNameAccessor != null ? getValue(sorted[0]?.row, seriesNameAccessor) : key === "__all" ? undefined : key;
      seriesList.push({
        type: "line",
        ...axisIndex,
        name: seriesNameValue == null ? undefined : String(seriesNameValue),
        showSymbol: showPoints,
        symbol: showPoints ? (typeof options.symbol === "string" ? options.symbol : "circle") : "none",
        symbolSize,
        lineStyle: {
          width: Number.isFinite(Number(options.strokeWidth)) ? Number(options.strokeWidth) : 1,
          type: options.strokeDasharray ? "dashed" : "solid",
          color: (() => {
            const source = options.stroke != null ? getValue(sorted[0]?.row, options.stroke) : key;
            const css = colorFromCss(source);
            if (css) return css;
            if (key !== "__all" && groupAccessor != null) return scaleManager.getColor("stroke", source);
            return undefined;
          })()
        },
        data: sorted.map((point) => wrapTooltipData([point.x, point.y], point.row, context.rowIndex)),
        tooltip: {
          trigger: "item",
          formatter: tooltipFormatter
        }
      });
    }
    return {series: seriesList};
  },
  lineY: (rows, options, context) => MARK_RENDERERS.line(rows, options, context),
  barY: (rows, options, context) => {
    const {axisIndex, scaleManager, rowRef, tooltipFormatter} = context;
    const xAccessor = options.x;
    const yAccessor = options.y;
    const stack = Boolean(options.stackY);
    const fillAccessor = options.fill;
    const sorted = resolveBarSort(rows, options, "barY", yAccessor, xAccessor);
    const barRows = sorted.rows;
    if (Array.isArray(sorted.categoryOrder) && sorted.categoryOrder.length > 0) {
      context.overrideXCategories = sorted.categoryOrder;
    }
    const seriesList = [];
    if (fillAccessor != null && stack) {
      const categories = unique(barRows.map((row) => String(getValue(row, xAccessor, ""))));
      const groups = unique(barRows.map((row) => String(getValue(row, fillAccessor, ""))));
      for (const group of groups) {
        const values = new Map(categories.map((category) => [category, 0]));
        for (const row of barRows) {
          const category = String(getValue(row, xAccessor, ""));
          const g = String(getValue(row, fillAccessor, ""));
          if (g !== group) continue;
          const y = toNumber(getValue(row, yAccessor), 0);
          values.set(category, (values.get(category) || 0) + y);
        }
        seriesList.push({
          type: "bar",
          ...axisIndex,
          name: group,
          stack: "stack",
          itemStyle: {color: scaleManager.getColor("fill", group)},
          data: categories.map((category) =>
            wrapTooltipData([category, values.get(category) || 0], {category, group}, context.rowIndex)
          )
        });
      }
    } else if (fillAccessor != null) {
      const groups = unique(barRows.map((row) => String(getValue(row, fillAccessor, ""))));
      for (const group of groups) {
        const data = barRows
          .filter((row) => String(getValue(row, fillAccessor, "")) === group)
          .map((row) => {
            const x = getValue(row, xAccessor);
            const y = getValue(row, yAccessor);
            if (x == null || y == null) return null;
            return {
              value: [x, y],
              __rowIdx: rowRef(row)
            };
          })
          .filter(Boolean);
        if (data.length === 0) continue;
        seriesList.push({
          type: "bar",
          ...axisIndex,
          name: group,
          itemStyle: {color: scaleManager.getColor("fill", group)},
          data,
          tooltip: {formatter: tooltipFormatter}
        });
      }
    } else {
      const data = barRows
        .map((row) => {
          const x = getValue(row, xAccessor);
          const y = getValue(row, yAccessor);
          if (x == null || y == null) return null;
          return {
            value: [x, y],
            __rowIdx: rowRef(row),
            itemStyle: {
              color: scaleManager.getColor("fill", getValue(row, fillAccessor))
            }
          };
        })
        .filter(Boolean);
      const dense = data.length > 2000;
      seriesList.push({
        type: "bar",
        ...axisIndex,
        data,
        ...(dense ? {large: true, largeThreshold: 2000, progressive: 2000} : {}),
        tooltip: {formatter: tooltipFormatter}
      });
    }
    return {series: seriesList};
  },
  barX: (rows, options, context) => {
    const {axisIndex, scaleManager, rowRef, tooltipFormatter} = context;
    const xAccessor = options.x;
    const yAccessor = options.y;
    const fillAccessor = options.fill;
    const sorted = resolveBarSort(rows, options, "barX", xAccessor, yAccessor);
    const barRows = sorted.rows;
    if (Array.isArray(sorted.categoryOrder) && sorted.categoryOrder.length > 0) {
      context.overrideYCategories = sorted.categoryOrder;
    }
    const seriesList = [];
    if (options.x1 != null && options.x2 != null) {
      seriesList.push({
        type: "custom",
        ...axisIndex,
        renderItem(params, api) {
          const start = api.coord([api.value(0), api.value(2)]);
          const end = api.coord([api.value(1), api.value(2)]);
          const band = Math.max(1, api.size([0, 1])[1] * 0.72);
          return {
            type: "rect",
            shape: {
              x: Math.min(start[0], end[0]),
              y: start[1] - band / 2,
              width: Math.max(1, Math.abs(end[0] - start[0])),
              height: band
            },
            style: api.style({fill: api.value(3), opacity: 0.88})
          };
        },
        data: barRows
          .map((row) => {
            const x1 = getValue(row, options.x1);
            const x2 = getValue(row, options.x2);
            const y = getValue(row, yAccessor);
            if (x1 == null || x2 == null || y == null) return null;
            return {
              value: [x1, x2, y, scaleManager.getColor("fill", getValue(row, fillAccessor))],
              __rowIdx: rowRef(row)
            };
          })
          .filter(Boolean),
        tooltip: {formatter: tooltipFormatter}
      });
    } else if (fillAccessor != null) {
      const groups = unique(barRows.map((row) => String(getValue(row, fillAccessor, ""))));
      for (const group of groups) {
        const data = barRows
          .filter((row) => String(getValue(row, fillAccessor, "")) === group)
          .map((row) => {
            const x = getValue(row, xAccessor);
            const y = getValue(row, yAccessor);
            if (x == null || y == null) return null;
            return {
              value: [x, y],
              __rowIdx: rowRef(row)
            };
          })
          .filter(Boolean);
        if (data.length === 0) continue;
        seriesList.push({
          type: "bar",
          ...axisIndex,
          name: group,
          itemStyle: {color: scaleManager.getColor("fill", group)},
          data,
          tooltip: {formatter: tooltipFormatter}
        });
      }
    } else {
      const data = barRows
        .map((row) => {
          const x = getValue(row, xAccessor);
          const y = getValue(row, yAccessor);
          if (x == null || y == null) return null;
          return {
            value: [x, y],
            __rowIdx: rowRef(row),
            itemStyle: {
              color: scaleManager.getColor("fill", getValue(row, fillAccessor))
            }
          };
        })
        .filter(Boolean);
      const dense = data.length > 2000;
      seriesList.push({
        type: "bar",
        ...axisIndex,
        data,
        ...(dense ? {large: true, largeThreshold: 2000, progressive: 2000} : {}),
        tooltip: {formatter: tooltipFormatter}
      });
    }
    return {series: seriesList};
  },
  rectY: (rows, options, context) => {
    const {axisIndex, scaleManager, rowRef, tooltipFormatter} = context;
    const seriesList = [];
    if (options.__binX) {
      const bins = histogram(rows, options.x, options.thresholds || 24);
      const binIndex = [];
      seriesList.push({
        type: "bar",
        ...axisIndex,
        data: bins.map((bin) => {
          const idx = binIndex.length;
          binIndex.push(bin);
          return {
            value: [`${toNumber(bin.x1).toExponential(2)}-${toNumber(bin.x2).toExponential(2)}`, bin.count],
            __binIdx: idx,
            itemStyle: {color: scaleManager.getColor("fill", getValue(bin, options.fill))}
          };
        }),
        tooltip: {
          formatter(params) {
            const bin = binIndex[params.data?.__binIdx];
            return bin ? `x: ${bin.x1} .. ${bin.x2}<br/>count: ${bin.count}` : "";
          }
        }
      });
    } else if (options.x1 != null && options.x2 != null && options.y1 != null && options.y2 != null) {
      seriesList.push({
        type: "custom",
        ...axisIndex,
        renderItem(params, api) {
          const start = api.coord([api.value(0), api.value(2)]);
          const end = api.coord([api.value(1), api.value(3)]);
          return {
            type: "rect",
            shape: {
              x: Math.min(start[0], end[0]),
              y: Math.min(start[1], end[1]),
              width: Math.max(1, Math.abs(end[0] - start[0])),
              height: Math.max(1, Math.abs(end[1] - start[1]))
            },
            style: api.style({fill: api.value(4), opacity: 0.78})
          };
        },
        data: rows
          .map((row) => {
            const x1 = getValue(row, options.x1);
            const x2 = getValue(row, options.x2);
            const y1 = getValue(row, options.y1);
            const y2 = getValue(row, options.y2);
            if (x1 == null || x2 == null || y1 == null || y2 == null) return null;
            return {
              value: [x1, x2, y1, y2, scaleManager.getColor("fill", getValue(row, options.fill))],
              __rowIdx: rowRef(row)
            };
          })
          .filter(Boolean),
        tooltip: {formatter: tooltipFormatter}
      });
    } else if (options.x1 != null && options.x2 != null) {
      seriesList.push({
        type: "custom",
        ...axisIndex,
        renderItem(params, api) {
          const start = api.coord([api.value(0), api.value(2)]);
          const end = api.coord([api.value(1), api.value(3)]);
          return {
            type: "rect",
            shape: {
              x: Math.min(start[0], end[0]),
              y: Math.min(start[1], end[1]),
              width: Math.max(1, Math.abs(end[0] - start[0])),
              height: Math.max(1, Math.abs(end[1] - start[1]))
            },
            style: api.style({fill: api.value(4), opacity: 0.78})
          };
        },
        data: rows
          .map((row) => {
            const x1 = getValue(row, options.x1);
            const x2 = getValue(row, options.x2);
            const yValue = getValue(row, options.y2 ?? options.y);
            if (x1 == null || x2 == null || yValue == null) return null;
            return {
              value: [x1, x2, 0, yValue, scaleManager.getColor("fill", getValue(row, options.fill))],
              __rowIdx: rowRef(row)
            };
          })
          .filter(Boolean),
        tooltip: {formatter: tooltipFormatter}
      });
    } else {
      seriesList.push({
        type: "bar",
        ...axisIndex,
        data: rows
          .map((row) => {
            const x = getValue(row, options.x);
            const y2 = getValue(row, options.y2 ?? options.y);
            if (x == null || y2 == null) return null;
            return {
              value: [x, y2],
              __rowIdx: rowRef(row),
              itemStyle: {color: scaleManager.getColor("fill", getValue(row, options.fill))}
            };
          })
          .filter(Boolean)
      });
    }
    return {series: seriesList};
  },
  ruleX: (rows, options) => {
    const markLineX = rows
      .map((row) => {
        const v = typeof row === "object" ? getValue(row, options.x) : row;
        if (v == null) return null;
        return {
          xAxis: v,
          lineStyle: {
            type: options.strokeDasharray ? "dashed" : "solid",
            color: colorFromCss(options.stroke) || "#9ca3af",
            opacity: Number.isFinite(Number(options.strokeOpacity)) ? Number(options.strokeOpacity) : 0.75
          },
          label: {show: false}
        };
      })
      .filter(Boolean);
    return {markLineX};
  },
  ruleY: (rows, options) => {
    const markLineY = rows
      .map((row) => {
        const v = typeof row === "object" ? getValue(row, options.y) : row;
        if (v == null) return null;
        return {
          yAxis: v,
          lineStyle: {
            type: options.strokeDasharray ? "dashed" : "solid",
            color: colorFromCss(options.stroke) || "#9ca3af",
            opacity: Number.isFinite(Number(options.strokeOpacity)) ? Number(options.strokeOpacity) : 0.75
          },
          label: {show: false}
        };
      })
      .filter(Boolean);
    return {markLineY};
  },
  text: (rows, options, context) => {
    const {axisIndex, rowRef} = context;
    return {
      series: [
        {
          type: "scatter",
          ...axisIndex,
          symbolSize: 0,
          silent: true,
          data: rows
            .map((row) => {
              const x = getValue(row, options.x);
              const y = getValue(row, options.y);
              if (x == null || y == null) return null;
              return {
                value: [x, y],
                __rowIdx: rowRef(row),
                label: {
                  show: true,
                  formatter: String(getValue(row, options.text, "")),
                  color: colorFromCss(getValue(row, options.fill)) || "#94a3b8",
                  fontSize: Number.isFinite(Number(options.fontSize)) ? Number(options.fontSize) : 11
                }
              };
            })
            .filter(Boolean)
        }
      ]
    };
  },
  cell: (rows, options, context) => {
    const {axisIndex, rowRef, tooltipFormatter} = context;
    return {
      series: [
        {
          type: "heatmap",
          ...axisIndex,
          data: rows
            .map((row) => {
              const x = getValue(row, options.x);
              const y = getValue(row, options.y);
              const fill = getValue(row, options.fill);
              if (x == null || y == null) return null;
              return {
                value: [x, y, fill == null ? 0 : Number(fill)],
                __rowIdx: rowRef(row)
              };
            })
            .filter(Boolean),
          progressive: 2000,
          tooltip: {formatter: tooltipFormatter}
        }
      ]
    };
  },
  boxY: (rows, options, context) => {
    const {axisIndex} = context;
    const box = computeBox(rows, options.x, options.y);
    if (box.categories.length === 0) return {};
    context.overrideXCategories = box.categories;
    return {
      series: [
        {
          type: "boxplot",
          ...axisIndex,
          data: box.values,
          tooltip: {
            formatter(params) {
              const category = box.categories[params.dataIndex] || "";
              const [low, q1, median, q3, high] = params.data || [];
              return `${category}<br/>low: ${low}<br/>q1: ${q1}<br/>median: ${median}<br/>q3: ${q3}<br/>high: ${high}`;
            }
          }
        }
      ]
    };
  },
  linearRegressionY: (rows, options, context) => {
    const {axisIndex} = context;
    const linePoints = regression(rows, options.x, options.y);
    if (!linePoints) return {};
    return {
      series: [
        {
          type: "line",
          ...axisIndex,
          symbol: "none",
          lineStyle: {
            color: colorFromCss(options.stroke) || "#94a3b8",
            width: 1.4,
            type: options.strokeDasharray ? "dashed" : "solid"
          },
          data: linePoints
        }
      ]
    };
  }
};

function normalizeMark(mark) {
  if (!mark || !mark.__echartMark) return null;
  return {
    type: mark.type,
    data: asArray(mark.data),
    options: normalizeOptions(mark.options)
  };
}

function filterFacetRows(rows, options, facetValue) {
  if (facetValue == null) return rows;
  const fx = options?.fx;
  if (fx == null) return rows;
  if (typeof rows.filter !== "function") return rows;
  return rows.filter((row) => String(getValue(row, fx, "")) === String(facetValue));
}

function buildMarkSeries(mark, context, axisIndex = {xAxisIndex: 0, yAxisIndex: 0}, facetValue = null) {
  let rows = filterFacetRows(mark.data, mark.options, facetValue);
  if (isArrowTable(rows)) {
    rows = Array.from(rows);
  }
  const options = mark.options || {};
  const renderer = MARK_RENDERERS[mark.type];

  if (!renderer) return {series: [], markLineX: [], markLineY: []};

  const series = [];
  const markLineX = [];
  const markLineY = [];

  const markContext = {
    ...context,
    axisIndex,
    options,
    rowRef: (row) => {
      const idx = context.rowIndex.length;
      context.rowIndex.push(row);
      return idx;
    },
    tooltipFormatter: (params) => {
      const row = context.rowIndex[params.data?.__rowIdx];
      return titleFor(row, options) || "";
    }
  };

  const result = renderer(rows, options, markContext);
  if (Array.isArray(markContext.overrideXCategories)) {
    context.overrideXCategories = markContext.overrideXCategories;
  }
  if (Array.isArray(markContext.overrideYCategories)) {
    context.overrideYCategories = markContext.overrideYCategories;
  }
  if (result.series) series.push(...result.series);
  if (result.markLineX) markLineX.push(...result.markLineX);
  if (result.markLineY) markLineY.push(...result.markLineY);

  return {series, markLineX, markLineY};
}

function buildOption(config, marks) {
  const tokens = resolveThemeTokens();
  const scaleManager = new ScaleManager(tokens);
  const probe = probeAllMarks(marks);

  const xSpec = config.x || {};
  const ySpec = config.y || {};
  const legendSpec = config.legend;
  const brushSpec = config.brush;
  const dataZoomSpec = config.dataZoom;
  const legendForcedHidden =
    legendSpec === false || (legendSpec != null && typeof legendSpec === "object" && legendSpec.show === false);
  const legendForcedShown = legendSpec != null && typeof legendSpec === "object" && legendSpec.show === true;
  const hasTitle = Boolean(config.title);
  const baseGridTop = config.marginTop ?? config.margin?.top ?? DEFAULT_MARGIN.top;

  const xAxis = analyzeAxis(xSpec, probe, "x");
  const yAxis = analyzeAxis(ySpec, probe, "y");
  const xType = xAxis.type;
  const yType = yAxis.type;
  const xCategories = xAxis.categories;
  const yCategories = yAxis.categories;
  const xRange = xAxis.range;
  const yRange = yAxis.range;
  const xNameLocation = xSpec.nameLocation || "middle";
  const yNameLocation = ySpec.nameLocation || "middle";
  const xNameGap = Number.isFinite(Number(xSpec.nameGap)) ? Number(xSpec.nameGap) : 30;
  const yNameGap = Number.isFinite(Number(ySpec.nameGap)) ? Number(ySpec.nameGap) : 52;
  const xTickFormatter = typeof xSpec.tickFormat === "function" ? xSpec.tickFormat : null;
  const yTickFormatter = typeof ySpec.tickFormat === "function" ? ySpec.tickFormat : null;

  const option = {
    animation: false,
    title: hasTitle ? {text: String(config.title), left: 12, top: 6} : undefined,
    tooltip: {
      trigger: "item",
      confine: true
    },
    legend: {
      type: "scroll",
      show: false,
      left: 8,
      right: 8,
      top: hasTitle ? 36 : 8,
      itemWidth: 10,
      itemHeight: 10,
      pageIconColor: "#94a3b8",
      pageTextStyle: {fontSize: 11}
    },
    grid: {
      left: config.marginLeft ?? config.margin?.left ?? DEFAULT_MARGIN.left,
      right: config.marginRight ?? config.margin?.right ?? DEFAULT_MARGIN.right,
      top: baseGridTop,
      bottom: config.marginBottom ?? config.margin?.bottom ?? DEFAULT_MARGIN.bottom,
      containLabel: true
    },
    xAxis: {
      type: xType,
      name: xSpec.label || "",
      nameLocation: xNameLocation,
      nameGap: xNameGap,
      axisLabel: {
        color: tokens.foregroundMuted,
        ...(xTickFormatter ? {formatter: xTickFormatter} : {})
      },
      data: xType === "category" ? xCategories : undefined,
      min: xRange?.[0],
      max: xRange?.[1],
      scale: true
    },
    yAxis: {
      type: yType,
      name: ySpec.label || "",
      nameLocation: yNameLocation,
      nameGap: yNameGap,
      axisLabel: {
        color: tokens.foregroundMuted,
        ...(yTickFormatter ? {formatter: yTickFormatter} : {})
      },
      data: yType === "category" ? yCategories : undefined,
      min: yRange?.[0],
      max: yRange?.[1],
      scale: true
    },
    series: [],
    dataZoom: [],
    brush: {toolbox: ["rect", "polygon", "clear"]}
  };
  if (legendSpec != null && typeof legendSpec === "object") {
    option.legend = {...option.legend, ...legendSpec};
  }
  if (brushSpec === false) {
    delete option.brush;
  } else if (brushSpec != null && typeof brushSpec === "object") {
    option.brush = {...option.brush, ...brushSpec};
  }
  if (dataZoomSpec === false) {
    option.dataZoom = [];
  } else if (Array.isArray(dataZoomSpec)) {
    option.dataZoom = dataZoomSpec.slice();
  } else if (dataZoomSpec != null && typeof dataZoomSpec === "object") {
    option.dataZoom = [dataZoomSpec];
  }

  const facets = buildFacets(probe);
  const facetMode = facets.length > 1;

  const sharedContext = {
    probe,
    scaleManager,
    rowIndex: []
  };

  if (facetMode) {
    option.legend.show = false;
    const columns = Math.min(3, facets.length);
    const rows = Math.ceil(facets.length / columns);
    option.grid = [];
    option.xAxis = [];
    option.yAxis = [];

    for (let i = 0; i < facets.length; i += 1) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const leftPct = col * (100 / columns);
      const widthPct = 100 / columns;
      const topPct = row * (100 / rows);
      const heightPct = 100 / rows;

      option.grid.push({
        left: `${leftPct + 4}%`,
        width: `${Math.max(18, widthPct - 8)}%`,
        top: `${topPct + 7}%`,
        height: `${Math.max(18, heightPct - 14)}%`,
        containLabel: true
      });

      option.xAxis.push({
        gridIndex: i,
        type: xType,
        name: i === facets.length - 1 ? xSpec.label || "" : "",
        nameLocation: xNameLocation,
        nameGap: xNameGap,
        axisLabel: {
          color: tokens.foregroundMuted,
          ...(xTickFormatter ? {formatter: xTickFormatter} : {})
        },
        data: xType === "category" ? xCategories : undefined,
        min: xRange?.[0],
        max: xRange?.[1],
        scale: true
      });
      option.yAxis.push({
        gridIndex: i,
        type: yType,
        name: col === 0 ? ySpec.label || "" : "",
        nameLocation: yNameLocation,
        nameGap: yNameGap,
        axisLabel: {
          color: tokens.foregroundMuted,
          ...(yTickFormatter ? {formatter: yTickFormatter} : {})
        },
        data: yType === "category" ? yCategories : undefined,
        min: yRange?.[0],
        max: yRange?.[1],
        scale: true
      });

      option.series.push({
        type: "line",
        xAxisIndex: i,
        yAxisIndex: i,
        name: facets[i],
        data: [],
        tooltip: {show: false},
        lineStyle: {opacity: 0},
        silent: true,
        showSymbol: false
      });
    }

    for (let i = 0; i < facets.length; i += 1) {
      const facetValue = facets[i];
      for (const mark of marks) {
        const markContext = {...sharedContext};
        const built = buildMarkSeries(mark, markContext, {xAxisIndex: i, yAxisIndex: i}, facetValue);
        option.series.push(...built.series);
        if (markContext.overrideXCategories && Array.isArray(markContext.overrideXCategories)) {
          option.xAxis[i].type = "category";
          option.xAxis[i].data = markContext.overrideXCategories;
          option.xAxis[i].min = undefined;
          option.xAxis[i].max = undefined;
        }
        if (markContext.overrideYCategories && Array.isArray(markContext.overrideYCategories)) {
          option.yAxis[i].type = "category";
          option.yAxis[i].data = markContext.overrideYCategories;
          option.yAxis[i].min = undefined;
          option.yAxis[i].max = undefined;
        }
        if (built.markLineX.length > 0 || built.markLineY.length > 0) {
          const target = option.series.find((series) => series.xAxisIndex === i && series.type !== "custom");
          if (target) {
            target.markLine = target.markLine || {silent: true, data: []};
            target.markLine.data.push(...built.markLineX, ...built.markLineY);
          }
        }
      }

      option.series.push({
        type: "scatter",
        xAxisIndex: i,
        yAxisIndex: i,
        symbolSize: 0,
        data: [
          [
            xType === "category" ? xCategories?.[0] || "" : xRange?.[0] || 0,
            yType === "category" ? yCategories?.[0] || "" : yRange?.[0] || 0
          ]
        ],
        label: {
          show: true,
          formatter: facets[i],
          position: "top",
          color: tokens.foreground,
          fontSize: 12
        },
        tooltip: {show: false},
        silent: true
      });
    }
  } else {
    const collectedMarkLines = [];
    for (const mark of marks) {
      const markContext = {...sharedContext};
      const built = buildMarkSeries(mark, markContext, {xAxisIndex: 0, yAxisIndex: 0}, null);
      option.series.push(...built.series);
      collectedMarkLines.push(...built.markLineX, ...built.markLineY);
      if (markContext.overrideXCategories && Array.isArray(markContext.overrideXCategories)) {
        option.xAxis.type = "category";
        option.xAxis.data = markContext.overrideXCategories;
        option.xAxis.min = undefined;
        option.xAxis.max = undefined;
      }
      if (markContext.overrideYCategories && Array.isArray(markContext.overrideYCategories)) {
        option.yAxis.type = "category";
        option.yAxis.data = markContext.overrideYCategories;
        option.yAxis.min = undefined;
        option.yAxis.max = undefined;
      }
    }

    if (collectedMarkLines.length > 0) {
      if (option.series.length === 0) {
        option.series.push({type: "line", data: [], symbol: "none", silent: true});
      }
      const target = option.series.find((series) => series.type !== "custom") || option.series[0];
      target.markLine = {silent: true, data: collectedMarkLines};
    }

    const legendNames = unique(
      option.series
        .map((series) => (series && series.name != null ? String(series.name).trim() : ""))
        .filter((name) => name.length > 0)
    );
    const legendEnabled = legendNames.length > 1;
    option.legend.show = legendForcedHidden ? false : legendForcedShown ? true : legendEnabled;
    if (option.legend.show && legendEnabled) option.legend.data = legendNames;
    const headerPad = (hasTitle ? 30 : 0) + (option.legend.show ? 34 : 0) + 12;
    option.grid.top = Math.max(baseGridTop, headerPad);

    const hasDenseScatter = option.series.some(
      (series) => series.type === "scatterGL" || (series.type === "scatter" && (series.data?.length || 0) > 2000)
    );
    const shouldAutoDataZoom = dataZoomSpec == null;
    if (hasDenseScatter && shouldAutoDataZoom) {
      option.dataZoom = dataZoomX();
    }
  }

  return option;
}

function asAxisArray(axis) {
  return Array.isArray(axis) ? axis : [axis];
}

function normalizeDataValue(item) {
  if (Array.isArray(item)) return item;
  if (item && typeof item === "object" && Array.isArray(item.value)) return item.value;
  return null;
}

function collectSeriesPoints(option) {
  const pointsByPair = new Map();
  const seriesList = Array.isArray(option?.series) ? option.series : [];
  for (const series of seriesList) {
    if (!series || !Array.isArray(series.data)) continue;
    const type = String(series.type || "");
    if (type !== "line" && type !== "scatter" && type !== "scatterGL" && type !== "bar") continue;
    const xAxisIndex = Number.isFinite(Number(series.xAxisIndex)) ? Number(series.xAxisIndex) : 0;
    const yAxisIndex = Number.isFinite(Number(series.yAxisIndex)) ? Number(series.yAxisIndex) : 0;
    const key = `${xAxisIndex}:${yAxisIndex}`;
    let points = pointsByPair.get(key);
    if (!points) {
      points = [];
      pointsByPair.set(key, points);
    }
    for (const datum of series.data) {
      const value = normalizeDataValue(datum);
      if (!Array.isArray(value) || value.length < 2) continue;
      // Retain references to the existing value tuples to avoid duplicating
      // large point sets in memory for auto-scale bookkeeping.
      points.push(value);
    }
  }
  return pointsByPair;
}

function dataZoomAppliesToXAxis(dataZoomOption, xAxisIndex) {
  if (!dataZoomOption || typeof dataZoomOption !== "object") return false;
  const hasXTarget = dataZoomOption.xAxisIndex != null;
  const hasYTarget = dataZoomOption.yAxisIndex != null;
  if (!hasXTarget) {
    // Ignore Y-only zoom components when deriving X-visible domain.
    if (hasYTarget) return false;
    return xAxisIndex === 0;
  }
  const target = dataZoomOption.xAxisIndex;
  if (Array.isArray(target)) return target.includes(xAxisIndex);
  return Number(target) === xAxisIndex;
}

function resolveXAxisSlider(dataZoomOptions, xAxisIndex) {
  if (!Array.isArray(dataZoomOptions)) return null;
  let latest = null;
  for (const zoom of dataZoomOptions) {
    if (!zoom || typeof zoom !== "object") continue;
    if (String(zoom.type || "") !== "slider") continue;
    if (!dataZoomAppliesToXAxis(zoom, xAxisIndex)) continue;
    latest = zoom;
  }
  return latest;
}

function alignXAxisTitlesWithDataZoom(option) {
  const xAxes = asAxisArray(option?.xAxis || []);
  const grids = asAxisArray(option?.grid || []);
  const dataZoomOptions = Array.isArray(option?.dataZoom) ? option.dataZoom : [];
  if (xAxes.length === 0 || grids.length === 0 || dataZoomOptions.length === 0) return;

  for (let xAxisIndex = 0; xAxisIndex < xAxes.length; xAxisIndex += 1) {
    const axis = xAxes[xAxisIndex];
    if (!axis || typeof axis !== "object") continue;
    if (!axis.name || !String(axis.name).trim()) continue;
    const nameLocation = axis.nameLocation || "middle";
    if (nameLocation !== "middle") continue;

    const slider = resolveXAxisSlider(dataZoomOptions, xAxisIndex);
    if (!slider) continue;

    const gridIndex = Number.isFinite(Number(axis.gridIndex)) ? Number(axis.gridIndex) : 0;
    const grid = grids[gridIndex];
    const gridBottom = toNumber(grid?.bottom, NaN);
    if (!Number.isFinite(gridBottom)) continue;

    const sliderBottom = toNumber(slider.bottom, 10);
    const sliderHeight = toNumber(slider.height, 18);
    const centeredGap = gridBottom - sliderBottom - sliderHeight / 2;
    if (!Number.isFinite(centeredGap) || centeredGap <= 8) continue;
    axis.nameGap = centeredGap;
  }
}

function resolveXAxisZoomRange(instance, xAxisIndex, xAxisOption, points) {
  const model = instance?.getModel?.();
  const dataZoomModels = model?.queryComponents?.({mainType: "dataZoom"}) || [];
  const matches = dataZoomModels
    .map((dzModel) => dzModel?.option || null)
    .filter((dz) => dataZoomAppliesToXAxis(dz, xAxisIndex));
  const xSpecific = matches.filter((dz) => dz?.xAxisIndex != null);
  const zoomSource = xSpecific.length > 0 ? xSpecific : matches;
  const zoom = zoomSource.length > 0 ? zoomSource[zoomSource.length - 1] : null;

  const start = Number.isFinite(Number(zoom?.start)) ? Number(zoom.start) : 0;
  const end = Number.isFinite(Number(zoom?.end)) ? Number(zoom.end) : 100;
  const axisType = xAxisOption?.type || "value";

  if (axisType === "category") {
    const categories = Array.isArray(xAxisOption?.data)
      ? xAxisOption.data.map((value) => String(value))
      : unique(points.map((point) => String(point[0])));
    const count = categories.length;
    if (count === 0) return null;
    let startIndex = Math.floor((Math.max(0, Math.min(100, start)) / 100) * (count - 1));
    let endIndex = Math.ceil((Math.max(0, Math.min(100, end)) / 100) * (count - 1));
    if (zoom?.startValue != null) {
      const idx = categories.indexOf(String(zoom.startValue));
      if (idx >= 0) startIndex = idx;
    }
    if (zoom?.endValue != null) {
      const idx = categories.indexOf(String(zoom.endValue));
      if (idx >= 0) endIndex = idx;
    }
    if (endIndex < startIndex) [startIndex, endIndex] = [endIndex, startIndex];
    return {type: "category", categories, startIndex, endIndex};
  }

  const xs = points.map((point) => Number(point[0])).filter((value) => Number.isFinite(value));
  let fullMin = Number(xAxisOption?.min);
  let fullMax = Number(xAxisOption?.max);
  if (!Number.isFinite(fullMin)) fullMin = xs.length > 0 ? Math.min(...xs) : 0;
  if (!Number.isFinite(fullMax)) fullMax = xs.length > 0 ? Math.max(...xs) : 1;
  if (fullMax < fullMin) [fullMin, fullMax] = [fullMax, fullMin];
  const span = fullMax - fullMin;
  let min = span > 0 ? fullMin + (Math.max(0, Math.min(100, start)) / 100) * span : fullMin;
  let max = span > 0 ? fullMin + (Math.max(0, Math.min(100, end)) / 100) * span : fullMax;
  if (Number.isFinite(Number(zoom?.startValue))) min = Number(zoom.startValue);
  if (Number.isFinite(Number(zoom?.endValue))) max = Number(zoom.endValue);
  if (max < min) [min, max] = [max, min];
  return {type: "numeric", min, max};
}

function pointInXAxisRange(x, range) {
  if (!range) return true;
  if (range.type === "category") {
    if (Number.isFinite(Number(x))) {
      const idx = Number(x);
      return idx >= range.startIndex && idx <= range.endIndex;
    }
    const idx = range.categories.indexOf(String(x));
    return idx >= range.startIndex && idx <= range.endIndex;
  }
  const n = Number(x);
  if (!Number.isFinite(n)) return false;
  return n >= range.min && n <= range.max;
}

function computeVisibleYExtent(points, xRange, yAxisOption) {
  const isLog = String(yAxisOption?.type || "").toLowerCase() === "log";
  let min = Infinity;
  let max = -Infinity;
  let hasVisible = false;
  for (const point of points) {
    if (!pointInXAxisRange(point[0], xRange)) continue;
    const value = Number(point[1]);
    if (!Number.isFinite(value)) continue;
    if (isLog && value <= 0) continue;
    hasVisible = true;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (!hasVisible) {
    min = Infinity;
    max = -Infinity;
    for (const point of points) {
      const value = Number(point[1]);
      if (!Number.isFinite(value)) continue;
      if (isLog && value <= 0) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (isLog) {
    min = Math.max(min, 1e-12);
    if (max <= min) max = min * 1.05;
    return [min, max];
  }

  if (max === min) {
    const pad = Math.max(Math.abs(max) * 0.05, 1);
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.05;
  return [min - pad, max + pad];
}

function xRangeSignature(range) {
  if (!range) return "all";
  if (range.type === "category") return `c:${range.startIndex}:${range.endIndex}`;
  return `n:${range.min}:${range.max}`;
}

function enableAutoScaleYOnDataZoom(instance, option) {
  const xAxes = asAxisArray(option?.xAxis || []);
  const yAxes = asAxisArray(option?.yAxis || []);
  const pointsByPair = collectSeriesPoints(option);
  if (pointsByPair.size === 0) return;

  let previousSignature = "";

  const recompute = () => {
    const rangesByXAxis = new Map();
    for (let xAxisIndex = 0; xAxisIndex < xAxes.length; xAxisIndex += 1) {
      const points = [];
      for (const [pairKey, pairPoints] of pointsByPair.entries()) {
        const [xIdxText] = pairKey.split(":");
        if (Number(xIdxText) === xAxisIndex) points.push(...pairPoints);
      }
      const range = resolveXAxisZoomRange(instance, xAxisIndex, xAxes[xAxisIndex], points);
      rangesByXAxis.set(xAxisIndex, range);
    }

    const signature = Array.from(rangesByXAxis.entries())
      .map(([idx, range]) => `${idx}:${xRangeSignature(range)}`)
      .join("|");
    if (signature === previousSignature) return;
    previousSignature = signature;

    const updates = [];
    for (let yAxisIndex = 0; yAxisIndex < yAxes.length; yAxisIndex += 1) {
      const yAxis = yAxes[yAxisIndex];
      if (!yAxis || yAxis.type === "category") continue;
      let min = Infinity;
      let max = -Infinity;
      let hasData = false;
      for (const [pairKey, pairPoints] of pointsByPair.entries()) {
        const [xIdxText, yIdxText] = pairKey.split(":");
        if (Number(yIdxText) !== yAxisIndex) continue;
        const xRange = rangesByXAxis.get(Number(xIdxText));
        const extent = computeVisibleYExtent(pairPoints, xRange, yAxis);
        if (!extent) continue;
        hasData = true;
        min = Math.min(min, extent[0]);
        max = Math.max(max, extent[1]);
      }
      if (!hasData || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) continue;
      updates.push({id: `y-axis-${yAxisIndex}`, min, max});
    }

    if (updates.length > 0) {
      instance.setOption({yAxis: updates}, {lazyUpdate: true});
    }
  };

  recompute();
  instance.on("dataZoom", recompute);
  return () => {
    try {
      instance.off("dataZoom", recompute);
    } catch {
      // no-op
    }
    pointsByPair.clear();
  };
}

export function plot(config = {}) {
  const marks = asArray(config.marks).map(normalizeMark).filter(Boolean);
  const width = Number.isFinite(Number(config.width)) ? Number(config.width) : DEFAULT_WIDTH;
  const height = Number.isFinite(Number(config.height)) ? Number(config.height) : DEFAULT_HEIGHT;

  const option = buildOption(config, marks);
  const xAxes = asAxisArray(option.xAxis || []);
  const yAxes = asAxisArray(option.yAxis || []);
  for (let i = 0; i < xAxes.length; i += 1) {
    if (xAxes[i] && typeof xAxes[i] === "object" && xAxes[i].id == null) {
      xAxes[i].id = `x-axis-${i}`;
    }
  }
  for (let i = 0; i < yAxes.length; i += 1) {
    if (yAxes[i] && typeof yAxes[i] === "object" && yAxes[i].id == null) {
      yAxes[i].id = `y-axis-${i}`;
    }
  }
  option.xAxis = Array.isArray(option.xAxis) ? xAxes : xAxes[0];
  option.yAxis = Array.isArray(option.yAxis) ? yAxes : yAxes[0];
  alignXAxisTitlesWithDataZoom(option);

  const autoScaleYOnDataZoom =
    config.autoScaleYOnDataZoom ??
    (Array.isArray(option.dataZoom) &&
      option.dataZoom.length > 0 &&
      config?.y?.autoScaleOnDataZoom !== false &&
      !Array.isArray(config?.y?.domain));

  let autoScaleCleanup = null;
  const host = createChart(option, {
    width,
    height,
    renderer: "canvas",
    theme: "ns_obv_dark",
    lazyMount: true,
    onReady(instance) {
      if (autoScaleYOnDataZoom) {
        autoScaleCleanup = enableAutoScaleYOnDataZoom(instance, option);
      }
    }
  });
  const priorCleanup = host.__cleanup;
  host.__cleanup = () => {
    if (typeof autoScaleCleanup === "function") {
      autoScaleCleanup();
      autoScaleCleanup = null;
    }
    if (typeof priorCleanup === "function") priorCleanup();
  };
  host.classList.add("echart-plot-host");
  return host;
}

export default {
  plot,
  dataZoomX,
  dataZoomXY,
  dot,
  lineY,
  line,
  barY,
  barX,
  rectY,
  ruleX,
  ruleY,
  text,
  boxY,
  linearRegressionY,
  cell,
  frame,
  tip,
  pointer,
  stackY,
  binX
};
