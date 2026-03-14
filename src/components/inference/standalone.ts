import {mount} from "svelte";
import Inference from "./Inference.svelte";

const MOUNT_SELECTOR = ".jm-inference-mount";
const OBSERVER_ROOT_MARGIN = "320px 0px";
const MOUNTED_FLAG = "data-jm-inference-mounted";
const mountedNodes = new WeakSet<HTMLElement>();
let mountObserver: MutationObserver | null = null;

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
  if (mountedNodes.has(element) || element.getAttribute(MOUNTED_FLAG) === "true") {
    return;
  }

  mountedNodes.add(element);
  element.setAttribute(MOUNTED_FLAG, "true");
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
    (element) => !mountedNodes.has(element) && element.getAttribute(MOUNTED_FLAG) !== "true",
  );

  if (mounts.length === 0) {
    startWatchingForMounts();
    return;
  }

  observeMounts(mounts);
  startWatchingForMounts();
}

function collectNewMounts(node: Node): HTMLElement[] {
  if (!(node instanceof HTMLElement)) {
    return [];
  }

  const mounts: HTMLElement[] = [];
  if (node.matches(MOUNT_SELECTOR)) {
    mounts.push(node);
  }

  mounts.push(...node.querySelectorAll<HTMLElement>(MOUNT_SELECTOR));
  return mounts.filter(
    (element) => !mountedNodes.has(element) && element.getAttribute(MOUNTED_FLAG) !== "true",
  );
}

function startWatchingForMounts() {
  if (typeof window === "undefined" || mountObserver || typeof MutationObserver === "undefined") {
    return;
  }

  mountObserver = new MutationObserver((records) => {
    const mounts: HTMLElement[] = [];

    for (const record of records) {
      for (const node of record.addedNodes) {
        mounts.push(...collectNewMounts(node));
      }
    }

    if (mounts.length > 0) {
      observeMounts(mounts);
    }
  });

  mountObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
