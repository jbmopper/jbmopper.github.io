import {renderPerfEmpirical} from "./perf-empirical.9ea7c6fb.js";

export async function renderBenchmarks(options = {}) {
  const mergedOptions = {
    mode: options.mode || "summary",
    includeTraining: options.includeTraining ?? false,
    includeGrid: options.includeGrid ?? false,
    includeMicro: options.includeMicro ?? false,
    ...options
  };

  return renderPerfEmpirical(mergedOptions);
}
