function readCssVar(name, fallback) {
  if (typeof window === "undefined" || typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function resolveThemeTokens() {
  const foreground = readCssVar("--theme-foreground", "#e6edf3");
  const foregroundMuted = readCssVar("--theme-foreground-muted", "#8b949e");
  const foregroundFaint = readCssVar("--theme-foreground-faint", "#6e7681");
  const background = readCssVar("--theme-background", "#0f172a");

  return {
    foreground,
    foregroundMuted,
    foregroundFaint,
    background,
    grid: "rgba(148, 163, 184, 0.18)",
    splitArea: "rgba(148, 163, 184, 0.04)",
    tooltipBg: "rgba(15, 23, 42, 0.95)",
    tooltipBorder: "rgba(148, 163, 184, 0.35)",
    palette: [
      "#4e79a7",
      "#f28e2b",
      "#e15759",
      "#76b7b2",
      "#59a14f",
      "#edc948",
      "#b07aa1",
      "#ff9da7",
      "#9c755f",
      "#bab0ac"
    ]
  };
}

export function buildTooltipTheme(tokens = resolveThemeTokens()) {
  return {
    backgroundColor: tokens.tooltipBg,
    borderColor: tokens.tooltipBorder,
    borderWidth: 1,
    textStyle: {
      color: tokens.foreground,
      fontSize: 12,
      fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    },
    extraCssText: "box-shadow: 0 8px 24px rgba(2,6,23,0.35); border-radius: 8px;"
  };
}

export function buildBaseOptionTheme(tokens = resolveThemeTokens()) {
  return {
    backgroundColor: "transparent",
    color: tokens.palette,
    animation: false,
    textStyle: {
      color: tokens.foreground,
      fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    },
    title: {
      textStyle: {
        color: tokens.foreground,
        fontSize: 14,
        fontWeight: 600
      }
    },
    legend: {
      textStyle: {
        color: tokens.foregroundMuted
      }
    },
    grid: {
      containLabel: true,
      left: 64,
      right: 24,
      top: 28,
      bottom: 48
    },
    xAxis: {
      axisLine: {lineStyle: {color: tokens.foregroundFaint}},
      axisLabel: {color: tokens.foregroundMuted},
      splitLine: {show: true, lineStyle: {color: tokens.grid}},
      nameTextStyle: {color: tokens.foreground}
    },
    yAxis: {
      axisLine: {lineStyle: {color: tokens.foregroundFaint}},
      axisLabel: {color: tokens.foregroundMuted},
      splitLine: {show: true, lineStyle: {color: tokens.grid}},
      nameTextStyle: {color: tokens.foreground}
    },
    tooltip: buildTooltipTheme(tokens)
  };
}

export function registerTheme(echarts) {
  if (!echarts) return;
  let register = null;
  try {
    register = echarts.registerTheme;
  } catch {
    return;
  }
  if (typeof register !== "function") return;
  register.call(echarts, "ns_obv_dark", buildBaseOptionTheme());
}

export const DEFAULT_PALETTE = resolveThemeTokens().palette;
