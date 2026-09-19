import * as echarts from "../../_npm/echarts@5.6.0/dist/echarts.esm.min.js.18b62dce.js";
import {registerTheme} from "./echart-theme.ac72768d.js";

registerTheme(echarts);

const DEFAULT_WIDTH = 920;
const DEFAULT_HEIGHT = 340;

const CHART_STATE = new WeakMap();

// Charts are usually built before their host is attached to the page. They wait
// here until it is. One observer serves every waiting chart and holds hosts only
// weakly, so a chart that is built and then discarded (never attached) can be
// garbage-collected rather than pinning its option, row index, and closures for
// the life of the page.
const pendingMounts = new Set();
let pendingObserver = null;

function flushPendingMounts() {
  for (const ref of pendingMounts) {
    const el = ref.deref();
    const state = el ? CHART_STATE.get(el) : null;
    if (!state || state.disposed || state.instance) {
      pendingMounts.delete(ref);
      continue;
    }
    if (!el.isConnected) continue;
    pendingMounts.delete(ref);
    const onConnected = state.onConnected;
    state.onConnected = null;
    onConnected?.(state);
  }
  if (pendingMounts.size === 0 && pendingObserver) {
    pendingObserver.disconnect();
    pendingObserver = null;
  }
}

function whenConnected(state, onConnected) {
  if (state.disposed || state.instance) return;
  if (state.el.isConnected) {
    onConnected(state);
    return;
  }
  if (state.onConnected) {
    state.onConnected = onConnected;
    return;
  }
  if (typeof WeakRef !== "function" || typeof MutationObserver !== "function" || !document?.body) return;
  state.onConnected = onConnected;
  pendingMounts.add(new WeakRef(state.el));
  if (!pendingObserver) {
    pendingObserver = new MutationObserver(flushPendingMounts);
    pendingObserver.observe(document.body, {childList: true, subtree: true});
  }
}

function initChart(state) {
  const {el, opts} = state;
  if (state.instance || state.disposed) return;
  if (!el.isConnected) return;

  const renderer = opts.renderer || "canvas";
  const theme = opts.theme || "ns_obv_dark";
  state.instance = echarts.init(el, theme, {renderer});
  state.instance.setOption(state.option || {}, opts.setOption || {});
  attachResizeObserver(state);
  if (typeof opts.onReady === "function") {
    try {
      opts.onReady(state.instance);
    } catch {
      // never block rendering on onReady callback errors
    }
    // Release any heavy closures captured by onReady once initialization runs.
    opts.onReady = null;
  }
}

function scheduleMount(state) {
  whenConnected(state, initChart);
}

function attachResizeObserver(state) {
  if (state.resizeObserver || typeof ResizeObserver !== "function") return;
  state.resizeObserver = new ResizeObserver(() => {
    if (state.instance) {
      state.instance.resize();
    }
  });
  state.resizeObserver.observe(state.el);
}

function createChartState(el, option, opts) {
  return {
    el,
    option,
    opts,
    instance: null,
    resizeObserver: null,
    intersectionObserver: null,
    onConnected: null,
    disposed: false
  };
}

function attachIntersectionObserver(state) {
  if (state.disposed || state.instance) return;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        observer.disconnect();
        state.intersectionObserver = null;
        initChart(state);
        break;
      }
    }
  }, {rootMargin: "200px"});
  state.intersectionObserver = observer;
  observer.observe(state.el);
}

function scheduleLazyMount(state) {
  if (typeof IntersectionObserver !== "function") {
    scheduleMount(state);
    return;
  }
  whenConnected(state, attachIntersectionObserver);
}

export function getChart(el) {
  const state = CHART_STATE.get(el);
  return state?.instance || null;
}

export function disposeChart(el) {
  const state = CHART_STATE.get(el);
  if (!state || state.disposed) return;
  state.disposed = true;
  if (state.intersectionObserver) {
    state.intersectionObserver.disconnect();
    state.intersectionObserver = null;
  }
  state.onConnected = null;
  if (state.resizeObserver) {
    state.resizeObserver.disconnect();
    state.resizeObserver = null;
  }
  if (state.instance) {
    state.instance.dispose();
    state.instance = null;
  }
  // Drop references to potentially large options/callback closures eagerly.
  state.option = null;
  if (state.opts) {
    state.opts.onReady = null;
    state.opts.setOption = null;
  }
}

export function updateChart(el, option, setOptionOpts = {}) {
  const state = CHART_STATE.get(el);
  if (!state) return;
  state.option = option;
  if (state.instance) {
    state.instance.setOption(option || {}, setOptionOpts);
    return;
  }
  scheduleMount(state);
}

export function chart(option, opts = {}) {
  const {
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    theme = "ns_obv_dark",
    renderer = "canvas",
    onReady,
    lazyMount = false
  } = opts;

  const el = document.createElement("div");
  el.className = "echart-host";
  // Fill available width up to configured max width to avoid card overflow.
  el.style.width = "100%";
  el.style.maxWidth = `${width}px`;
  el.style.marginInline = "auto";
  el.style.height = `${height}px`;
  el.style.minHeight = `${height}px`;

  const state = createChartState(el, option, {
    renderer,
    theme,
    onReady,
    setOption: opts.setOption || {}
  });
  CHART_STATE.set(el, state);

  Object.defineProperty(el, "__echart", {
    configurable: true,
    enumerable: false,
    get() {
      return state.instance;
    }
  });

  el.__cleanup = () => {
    disposeChart(el);
  };

  if (lazyMount) {
    scheduleLazyMount(state);
  } else {
    scheduleMount(state);
  }

  return el;
}

export {echarts};
