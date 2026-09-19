import {cases, parseRaw, prompts} from "./finding-category-counts.d0e79f0a.js";

export const EVIDENCE_FIELD = "overall.evidence";

export const sources = [
  ["overall-evidence", "Evaluator's own · overall.evidence"],
  ["flashlite", "Gemini 3.5 Flash-Lite · low"],
  ["haiku", "Haiku 4.5 · 2K thinking"]
];

const text = (value) => typeof value === "string" ? value.trim() : "";
const unavailable = () => ({available: false, summary: null, origin: null});

export function summaryFor(review, source) {
  if (source === "overall-evidence") {
    const evidence = text(review?.fields?.find((entry) => entry?.field === EVIDENCE_FIELD)?.text);
    return evidence ? {available: true, summary: evidence, origin: "evidence"} : unavailable();
  }
  const output = review?.[source];
  const reported = text(output?.report?.summary);
  if (reported) return {available: true, summary: reported, origin: "report"};
  const rescued = text(parseRaw(output?.raw_output)?.summary);
  if (rescued) return {available: true, summary: rescued, origin: "raw-output"};
  return unavailable();
}

export function summaryGrid(rows, humanCases, evaluator, source) {
  return cases.map(([id, label]) => {
    const human = humanCases[id] ?? {};
    return {
      id,
      label,
      human: {provenance: human.provenance ?? null, summary: text(human.summary) || null},
      cells: prompts.map(([prompt, promptLabel]) => {
        const matches = rows.filter((row) => row.source_case_id === id &&
          row.source_model_key === evaluator && row.prompt_variant === prompt);
        if (matches.length > 1) throw new Error(`Duplicate single-review summary: ${id}/${evaluator}/${prompt}`);
        return {prompt, promptLabel, ...summaryFor(matches[0], source)};
      })
    };
  });
}
