export interface DlfSection {
  slug: string;
  title: string;
  description: string;
  modulePath: string;
  exportName: string;
  options: Record<string, unknown>;
}

export const dlfSections: DlfSection[] = [
  {
    slug: "perf-expected",
    title: "Architecture and Expected Performance Analysis",
    description: "Interactive model-spec builder and expected compute/memory estimates.",
    modulePath: "/observable/embed/perf-expected.js",
    exportName: "renderPerfExpected",
    options: {}
  },
  {
    slug: "perf-empirical",
    title: "Benchmarks and Empirical Performance Analysis",
    description: "Device comparison, training curves, broad benchmark grids, and micro-benchmark views.",
    modulePath: "/observable/embed/perf-empirical.js",
    exportName: "renderPerfEmpirical",
    options: {}
  },
  {
    slug: "nsys",
    title: "NVIDIA CUDA NSYS Trace Analysis",
    description: "Kernel and memory event diagnostics with timeline and utilization controls.",
    modulePath: "/observable/embed/nsys.js",
    exportName: "renderNsys",
    options: {}
  },
  {
    slug: "lr-sweep",
    title: "Learning Parameter Sweeps",
    description: "Learning-rate frontier, threshold crossing, and run-history diagnostics.",
    modulePath: "/observable/embed/lr-sweep.js",
    exportName: "renderLrSweep",
    options: {}
  },
  {
    slug: "ablations",
    title: "Architectural Variations (Ablations)",
    description: "Ablation summary views with eval-loss, throughput, memory, and history controls.",
    modulePath: "/observable/embed/ablations.js",
    exportName: "renderAblations",
    options: {}
  }
];
