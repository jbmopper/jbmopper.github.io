export const cases = [
  ["voice-clean", "Voice · clean"],
  ["voice-imperative", "Voice · imperative"],
  ["mistargeted", "Mistargeted"],
  ["long-and-spammy", "Long and spammy"],
  ["truncated", "Truncated"],
  ["hollow-history", "Hollow history"],
  ["bolding-spam", "Bolding · present"],
  ["bolding-clean", "Bolding · removed"],
  ["pitch-calibrated", "Pitch · calibrated"],
  ["pitch-inflated", "Pitch · inflated"],
  ["salience-buried-lead", "Salience · buried lead"],
  ["salience-lead-first", "Salience · lead first"],
  ["credential-trap", "Credential trap"],
  ["grounding-fabricated", "Grounding · fabricated"],
  ["grounding-clean", "Grounding · clean"],
  ["skills-spam-trap", "Skills-spam trap"]
];

export const prompts = [
  ["anchored", "Base"],
  ["anchored-mechanism", "Mechanism"],
  ["anchored-pressure", "Criticism"],
  ["anchored-mixed", "Combined"]
];

export const categories = [
  ["grounding", "Grounding"],
  ["writing", "Writing"],
  ["argument", "Argument"],
  ["keywords", "Keywords"],
  ["basics", "Basics"],
  ["overall", "Overall"],
  ["other", "Other"]
];

const knownCategories = new Set(categories.slice(0, -1).map(([key]) => key));

export function categoryFor(dimension) {
  const key = typeof dimension === "string" ? dimension.trim().toLowerCase() : "";
  return knownCategories.has(key) ? key : "other";
}

export function parseRaw(raw) {
  try {
    return JSON.parse((raw ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
  } catch {
    return null;
  }
}

export function summarizeFindings(output) {
  const candidate = output?.report ?? parseRaw(output?.raw_output);
  if (!candidate || !Array.isArray(candidate.findings) ||
      candidate.findings.some((finding) => !finding || typeof finding !== "object")) {
    return {available: false, counts: null, total: null, findings: [], status: "No summary"};
  }
  const counts = Object.fromEntries(categories.map(([key]) => [key, 0]));
  for (const finding of candidate.findings) counts[categoryFor(finding.dimension)]++;
  const validated = output.acceptance?.citation_status === "validated" ||
    (!output.acceptance && output.result?.status === "COMPLETE" && !!output.report);
  const retried = output.acceptance?.source === "same-prompt-retry";
  return {
    available: true,
    counts,
    total: candidate.findings.length,
    findings: candidate.findings,
    validated,
    status: validated ? (retried ? "Validated retry" : "Validated") : "Unverified citations"
  };
}

export function categoryGrid(rows, evaluator, summarizer) {
  return cases.map(([id, label]) => ({
    id,
    label,
    cells: prompts.map(([prompt, promptLabel]) => {
      const matches = rows.filter((row) => row.source_case_id === id &&
        row.source_model_key === evaluator && row.prompt_variant === prompt);
      if (matches.length > 1) throw new Error(`Duplicate single-review summary: ${id}/${evaluator}/${prompt}`);
      return {prompt, promptLabel, ...summarizeFindings(matches[0]?.[summarizer])};
    })
  }));
}
