import {mount} from "svelte";
import Inference from "./Inference.svelte";

const MOUNT_SELECTOR = ".jm-inference-mount";
const OBSERVER_ROOT_MARGIN = "320px 0px";
const mountedNodes = new WeakSet<HTMLElement>();

interface InferenceModelOption {
  value: string;
  label: string;
  description?: string;
}

interface InferenceProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  verificationTitle?: string;
  verificationMessage?: string;
  promptLabel?: string;
  promptPlaceholder?: string;
  submitLabel?: string;
  resetLabel?: string;
  warmupPath?: string;
  models?: InferenceModelOption[];
  initialModel?: string;
  lockedModel?: string;
  promptRows?: number;
}

function readAttribute(element: HTMLElement, name: string, preserveEmpty = false): string | undefined {
  const value = element.getAttribute(name);
  if (value === null) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!preserveEmpty && trimmed === "") {
    return undefined;
  }

  return preserveEmpty ? value : trimmed;
}

function parsePromptRows(rawValue: string | undefined): number | undefined {
  if (!rawValue) {
    return undefined;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function parseModels(rawValue: string | undefined): InferenceModelOption[] | undefined {
  if (!rawValue) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return undefined;
    }

    return parsed
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        value: String(entry.value ?? ""),
        label: String(entry.label ?? entry.value ?? ""),
        description: typeof entry.description === "string" ? entry.description : undefined,
      }))
      .filter((entry) => entry.value.length > 0 && entry.label.length > 0);
  } catch (error) {
    console.warn("Failed to parse notebook inference models", error);
    return undefined;
  }
}

function readConfig(element: HTMLElement): InferenceProps {
  const config: InferenceProps = {};

  const simpleFields = [
    ["data-inference-eyebrow", "eyebrow"],
    ["data-inference-title", "title"],
    ["data-inference-description", "description"],
    ["data-inference-verification-title", "verificationTitle"],
    ["data-inference-verification-message", "verificationMessage"],
    ["data-inference-prompt-label", "promptLabel"],
    ["data-inference-prompt-placeholder", "promptPlaceholder"],
    ["data-inference-submit-label", "submitLabel"],
    ["data-inference-reset-label", "resetLabel"],
    ["data-inference-initial-model", "initialModel"],
    ["data-inference-locked-model", "lockedModel"],
  ] as const;

  for (const [attributeName, propName] of simpleFields) {
    const value = readAttribute(element, attributeName);
    if (value !== undefined) {
      config[propName] = value;
    }
  }

  const warmupPath = readAttribute(element, "data-inference-warmup-path", true);
  if (warmupPath !== undefined) {
    config.warmupPath = warmupPath.trim();
  }

  const promptRows = parsePromptRows(readAttribute(element, "data-inference-prompt-rows"));
  if (promptRows !== undefined) {
    config.promptRows = promptRows;
  }

  const models = parseModels(readAttribute(element, "data-inference-models", true));
  if (models && models.length > 0) {
    config.models = models;
  }

  return config;
}

function mountInference(element: HTMLElement) {
  if (mountedNodes.has(element)) {
    return;
  }

  mountedNodes.add(element);
  mount(Inference, {
    target: element,
    props: readConfig(element),
  });
}

function observeMounts(elements: HTMLElement[]) {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
    elements.forEach(mountInference);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }

        const element = entry.target;
        if (element instanceof HTMLElement) {
          observer.unobserve(element);
          mountInference(element);
        }
      }
    },
    {rootMargin: OBSERVER_ROOT_MARGIN},
  );

  for (const element of elements) {
    observer.observe(element);
  }
}

function init() {
  const mounts = Array.from(document.querySelectorAll<HTMLElement>(MOUNT_SELECTOR)).filter(
    (element) => !mountedNodes.has(element),
  );

  if (mounts.length === 0) {
    return;
  }

  observeMounts(mounts);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
