import {cases, prompts} from "./finding-category-counts.d0e79f0a.js";

export const dimensions = [
  ["basics", "Basics"], ["writing", "Writing"], ["argument", "Argument"],
  ["grounding", "Grounding"], ["keywords", "Keywords"], ["overall", "Overall"]
];

export const evaluators = [
  ["gpt-5.4-high", "GPT-5.4 · high"],
  ["anthropic-claude-opus-4-6-adaptive-medium", "Opus 4.6 · adaptive medium"],
  ["gemini-gemini-3.1-pro-preview-high", "Gemini 3.1 Pro · high"]
];

export function scoreDistance(value, band) {
  if (!Number.isFinite(value) || !band || (band[0] === 0 && band[1] === 2)) return null;
  return Math.max(band[0] - value, value - band[1], 0);
}

export function averageDistances(rows, humanCases) {
  return evaluators.map(([id, label]) => {
    const grid = scoreGrid(rows, humanCases, id);
    return {id, label, cells: prompts.map(([prompt, promptLabel], index) => {
      const distances = grid.flatMap((row) => row.cells[index].scores.map((score) =>
        row.human.unscored?.includes(score.dimension) ? null :
          scoreDistance(score.value, row.human.scores[score.dimension])
      )).filter((value) => value !== null);
      const count = distances.length;
      const total = distances.reduce((sum, value) => sum + value, 0);
      return {prompt, promptLabel, count, total, mean: count ? total / count : null};
    })};
  });
}

export function displayBand(band) {
  return !band ? "—" : band[0] === band[1] ? String(band[0]) : `${band[0]}–${band[1]}`;
}

export function compareScore(value, band) {
  if (value === null || !band || (band[0] === 0 && band[1] === 2)) return "ungraded";
  return value < band[0] ? "lower" : value > band[1] ? "higher" : "within";
}

export function scoreGrid(rows, humanCases, evaluator) {
  return cases.map(([id, label]) => {
    const human = humanCases[id] ?? {scores: {}};
    return {
      id, label, human,
      cells: prompts.map(([prompt, promptLabel]) => {
        const matches = rows.filter((row) => row.source_case_id === id &&
          row.source_model_key === evaluator && row.prompt_variant === prompt);
        if (matches.length > 1) throw new Error(`Duplicate evaluator review: ${id}/${evaluator}/${prompt}`);
        const review = matches[0];
        return {
          prompt, promptLabel, available: !!review,
          scores: dimensions.map(([dimension, label]) => {
            const raw = review?.scores?.[dimension];
            const value = typeof raw === "number" && Number.isFinite(raw) ? raw * 2 : null;
            return {dimension, label, value, comparison: compareScore(value, human.scores[dimension])};
          })
        };
      })
    };
  });
}
