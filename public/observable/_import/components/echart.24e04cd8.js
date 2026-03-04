import * as echarts from "../../_npm/echarts@5.6.0/dist/echarts.esm.min.js.43ee27f9.js";
import {registerTheme} from "./echart-theme.ac72768d.js";

registerTheme(echarts);

const DEFAULT_WIDTH = 920;
const DEFAULT_HEIGHT = 340;
const MAX_MOUNT_ATTEMPTS = 24;

const CHART_STATE = new WeakMap();

function initChart(state) {
  const {el, opts} = state;
  if (state.instance || state.disposed) return;
  if (!el.isConnected) return;

  const renderer = opts.renderer || "canvas";
  const theme = opts.theme || "ns_obv_dark";
  state.instance = echarts.init(el, theme, {renderer});
  state.instance.setOption(state.option || {}, opts.setOption || {});
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
  if (state.disposed || state.instance) return;

  if (state.mountAttempts >= MAX_MOUNT_ATTEMPTS) {
    if (!state.connectObserver && typeof MutationObserver === "function" && document?.body) {
      state.connectObserver = new MutationObserver(() => {
        if (state.disposed || state.instance) return;
        if (!state.el.isConnected) return;
        state.connectObserver.disconnect();
        state.connectObserver = null;
        initChart(state);
      });
      state.connectObserver.observe(document.body, {childList: true, subtree: true});
    }
    return;
  }

  state.mountAttempts += 1;
  requestAnimationFrame(() => {
    if (state.disposed || state.instance) return;
    if (state.el.isConnected) {
      initChart(state);
      return;
    }
    scheduleMount(state);
  });
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
    connectObserver: null,
    intersectionObserver: null,
    disposed: false,
    mountAttempts: 0
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
  if (state.disposed || state.instance) return;
  if (typeof IntersectionObserver !== "function") {
    scheduleMount(state);
    return;
  }

  function waitForConnection() {
    if (state.disposed || state.instance) return;
    if (state.el.isConnected) {
      attachIntersectionObserver(state);
      return;
    }
    state.mountAttempts += 1;
    if (state.mountAttempts >= MAX_MOUNT_ATTEMPTS) {
      if (!state.connectObserver && typeof MutationObserver === "function" && document?.body) {
        state.connectObserver = new MutationObserver(() => {
          if (state.disposed || state.instance) return;
          if (!state.el.isConnected) return;
          state.connectObserver.disconnect();
          state.connectObserver = null;
          attachIntersectionObserver(state);
        });
        state.connectObserver.observe(document.body, {childList: true, subtree: true});
      }
      return;
    }
    requestAnimationFrame(waitForConnection);
  }

  waitForConnection();
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
  if (state.connectObserver) {
    state.connectObserver.disconnect();
    state.connectObserver = null;
  }
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

  attachResizeObserver(state);

  if (lazyMount) {
    scheduleLazyMount(state);
  } else {
    scheduleMount(state);
  }

  return el;
}

export {echarts};
