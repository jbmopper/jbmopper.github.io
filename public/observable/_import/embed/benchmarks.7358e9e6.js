import {renderPerfEmpirical} from "./perf-empirical.af390cd3.js";

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
