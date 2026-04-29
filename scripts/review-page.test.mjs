import test from "node:test";
import assert from "node:assert/strict";
import {buildWaylineSignals, inferTargetPath, routeKeyForUrl} from "./review-page.mjs";

const sampleReview = {
  generatedAt: "2026-04-24T16:00:00.000Z",
  url: "https://juliusm.com/",
  overallScore: 78,
  status: "promising",
  artifacts: {
    screenshotPath: ".review-screens/juliusm-com.png",
    jsonPath: ".review-screens/juliusm-com.review.json",
    markdownPath: ".review-screens/juliusm-com.review.md",
  },
  page: {
    title: "juliusm.com | Portfolio Site",
    metaDescription: "Julius M's Portfolio Site",
    h1Text: "juliusm.com",
    navLinkTexts: ["Welcome", "Projects"],
    aboveFoldActionTexts: ["Welcome", "Projects"],
  },
  recommendations: [
    {
      id: "identity-led-hero",
      title: "Make the hero about the person or product, not the domain name.",
      impact: "high",
      category: "positioning",
      why: 'The current H1 is "juliusm.com", which reads like a URL instead of a positioning statement.',
      fix: "Use the H1 for the person, role, or product promise, and leave the domain for the browser chrome, nav, or metadata.",
    },
  ],
};

test("routeKeyForUrl normalizes root and nested routes", () => {
  assert.equal(routeKeyForUrl("https://juliusm.com/"), "home");
  assert.equal(
    routeKeyForUrl("https://juliusm.com/observable/projects/llm-fundamentals/"),
    "observable--projects--llm-fundamentals",
  );
});

test("inferTargetPath maps known repo routes", () => {
  assert.equal(inferTargetPath("https://juliusm.com/"), "src/pages/index.astro");
  assert.equal(inferTargetPath("https://juliusm.com/resume/"), "src/pages/resume.astro");
  assert.equal(inferTargetPath("https://juliusm.com/observable/projects/"), "");
});

test("buildWaylineSignals maps a review recommendation into a Wayline review_finding", () => {
  const [signal] = buildWaylineSignals(sampleReview);

  assert.equal(signal.recommendationId, "identity-led-hero");
  assert.equal(signal.dedupeKey, "repo:jbmopper.github.io:page-review:home:identity-led-hero");
  assert.equal(signal.priority, "P1");
  assert.equal(signal.targetPath, "src/pages/index.astro");
  assert.equal(signal.payload.kind, "review_finding");
  assert.equal(signal.payload.source.kind, "review_finding");
  assert.equal(signal.payload.source.identifier, "page-review:home:identity-led-hero");
  assert.equal(signal.payload.work_spec.schema_version, "wayline.work_spec.v1");
  assert.equal(signal.payload.work_spec.kind, "review_finding");
  assert.equal(signal.payload.work_spec.dedupe_key, signal.dedupeKey);
  assert.deepEqual(signal.payload.work_spec.target, {
    repo: "jbmopper.github.io",
    path: "src/pages/index.astro",
  });
  assert.ok(signal.payload.work_spec.acceptance_criteria.length >= 3);
  assert.deepEqual(signal.payload.work_spec.validation.commands, ["npm run build"]);
  assert.ok(signal.idempotencyKey.startsWith("page-review:home:"));
});

test("buildWaylineSignals respects an explicit target path override", () => {
  const [signal] = buildWaylineSignals(
    {
      ...sampleReview,
      url: "https://juliusm.com/observable/projects/",
    },
    {targetPath: "src/data/projects.json"},
  );

  assert.equal(signal.targetPath, "src/data/projects.json");
  assert.equal(signal.payload.work_spec.target.path, "src/data/projects.json");
});
