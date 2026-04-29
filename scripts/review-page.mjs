import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {parseArgs} from "node:util";
import {chromium} from "@playwright/test";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_NAME = path.basename(PROJECT_ROOT);
const DEFAULT_OUTPUT_DIR = path.join(PROJECT_ROOT, ".review-screens");
const DEFAULT_VIEWPORT = {width: 1440, height: 1080};
const IMPACT_ORDER = {high: 0, medium: 1, low: 2};
const IMPACT_PRIORITY = {high: "P1", medium: "P2", low: "P3"};
const DEFAULT_WAYLINE_BASE_URL = "http://127.0.0.1:8080";

function normalizeText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function countWords(value = "") {
  const text = normalizeText(value);
  return text ? text.split(" ").length : 0;
}

function slugify(value) {
  const slug = normalizeText(value)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "page-review";
}

function routeKeyForUrl(url) {
  const pathname = new URL(url).pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/") return "home";

  return pathname
    .slice(1)
    .split("/")
    .map((segment) => slugify(segment))
    .filter(Boolean)
    .join("--");
}

function inferTargetPath(url, explicitTargetPath = "") {
  if (explicitTargetPath) return explicitTargetPath;

  const pathname = new URL(url).pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/") return "src/pages/index.astro";
  if (pathname === "/resume") return "src/pages/resume.astro";
  return "";
}

function toRelativePath(filePath) {
  const relativePath = path.relative(PROJECT_ROOT, filePath);
  return relativePath && !relativePath.startsWith("..") ? relativePath : filePath;
}

function uniqueTexts(values) {
  const seen = new Set();
  const unique = [];

  for (const value of values) {
    const text = normalizeText(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    unique.push(text);
  }

  return unique;
}

function intersectTexts(leftValues, rightValues) {
  const right = new Set(rightValues.map((value) => normalizeText(value).toLowerCase()));
  return leftValues.filter((value) => right.has(normalizeText(value).toLowerCase()));
}

function hasDomainLikeHeading(value) {
  return /\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(normalizeText(value));
}

function overallLabel(score) {
  if (score >= 85) return "strong";
  if (score >= 70) return "promising";
  if (score >= 55) return "needs focus";
  return "needs redesign";
}

function categoryLabel(score) {
  if (score >= 8) return "strong";
  if (score >= 6) return "workable";
  if (score >= 4) return "weak";
  return "critical";
}

function pushRecommendation(recommendations, categoryScores, recommendation) {
  categoryScores[recommendation.category] = Math.max(
    0,
    categoryScores[recommendation.category] - (recommendation.penalty ?? 1),
  );

  recommendations.push({
    id: recommendation.id,
    title: recommendation.title,
    impact: recommendation.impact,
    category: recommendation.category,
    why: recommendation.why,
    fix: recommendation.fix,
    planeWorkItem: recommendation.planeWorkItem,
  });
}

function buildWaylineDetails(review, recommendation) {
  const lines = [
    `Automated page review finding for ${review.url}.`,
    `Category: ${recommendation.category}. Impact: ${recommendation.impact}.`,
    `Overall review score at capture time: ${review.overallScore}/100 (${review.status}).`,
    `Why this was flagged: ${recommendation.why}`,
    `Suggested change: ${recommendation.fix}`,
  ];

  if (review.page.h1Text) {
    lines.push(`Current H1: ${review.page.h1Text}`);
  }

  if (review.page.title) {
    lines.push(`Current title: ${review.page.title}`);
  }

  if (review.page.metaDescription) {
    lines.push(`Current meta description: ${review.page.metaDescription}`);
  }

  if (review.artifacts?.markdownPath) {
    lines.push(`Local review brief: ${review.artifacts.markdownPath}`);
  }

  if (review.artifacts?.screenshotPath) {
    lines.push(`Screenshot artifact: ${review.artifacts.screenshotPath}`);
  }

  return lines.join("\n");
}

function buildWaylineAcceptanceCriteria(review, recommendation) {
  return uniqueTexts([
    `Address the finding "${recommendation.title}" on ${review.url}.`,
    recommendation.fix,
    "The site builds successfully.",
    "A follow-up review no longer reports the same finding, or the remaining false positive is documented.",
  ]);
}

function buildWaylineValidation(recommendation) {
  const notes = ["Re-run the page review after the change."];
  if (["hierarchy", "cta", "accessibility"].includes(recommendation.category)) {
    notes.push("Manually verify navigation, keyboard flow, and above-fold interactions on the changed page.");
  }

  return {
    commands: ["npm run build"],
    notes,
  };
}

function buildWaylineConstraints(recommendation) {
  const constraints = [
    "Keep the change scoped to the reviewed route and any shared layout/theme files needed to support it.",
    "Do not remove user-facing behavior without replacing its purpose or documenting the tradeoff.",
  ];

  if (recommendation.category === "accessibility") {
    constraints.push("Preserve or improve accessibility semantics while changing presentation.");
  }

  return constraints;
}

function buildWaylineLabels(routeKey, recommendation) {
  return [
    "page-review",
    `repo:${REPO_NAME}`,
    `category:${recommendation.category}`,
    `impact:${recommendation.impact}`,
    `route:${routeKey}`,
  ];
}

function buildWaylineSignal(review, recommendation, options = {}) {
  const routeKey = options.routeKey ?? routeKeyForUrl(review.url);
  const targetPath = inferTargetPath(review.url, options.targetPath);
  const sourceIdentifier = `page-review:${routeKey}:${recommendation.id}`;
  const externalRef =
    review.artifacts?.markdownPath ?? review.artifacts?.jsonPath ?? review.artifacts?.screenshotPath ?? "";
  const dedupeKey = `repo:${REPO_NAME}:page-review:${routeKey}:${recommendation.id}`;
  const source = {
    kind: "review_finding",
    identifier: sourceIdentifier,
  };

  if (externalRef) {
    source.external_ref = externalRef;
  }

  const workSpec = {
    schema_version: "wayline.work_spec.v1",
    kind: "review_finding",
    dedupe_key: dedupeKey,
    title: recommendation.title,
    priority: IMPACT_PRIORITY[recommendation.impact] ?? "P3",
    objective: recommendation.fix,
    details: buildWaylineDetails(review, recommendation),
    source,
    target: {
      repo: REPO_NAME,
    },
    acceptance_criteria: buildWaylineAcceptanceCriteria(review, recommendation),
    validation: buildWaylineValidation(recommendation),
    constraints: buildWaylineConstraints(recommendation),
    labels: buildWaylineLabels(routeKey, recommendation),
    implementation_notes: uniqueTexts([
      `Local review score at capture time: ${review.overallScore}/100 (${review.status}).`,
      review.artifacts?.screenshotPath ? `Screenshot artifact: ${review.artifacts.screenshotPath}` : "",
      review.page.h1Text ? `Current H1: ${review.page.h1Text}` : "",
    ]),
  };

  if (targetPath) {
    workSpec.target.path = targetPath;
  }

  const idempotencyRunKey = slugify(review.generatedAt);

  return {
    recommendationId: recommendation.id,
    title: recommendation.title,
    dedupeKey,
    priority: workSpec.priority,
    targetPath: workSpec.target.path ?? "",
    idempotencyKey: `page-review:${routeKey}:${idempotencyRunKey}:${recommendation.id}`,
    payload: {
      kind: "review_finding",
      dedupe_key: dedupeKey,
      source,
      work_spec: workSpec,
    },
  };
}

function buildWaylineSignals(review, options = {}) {
  return review.recommendations.map((recommendation) => buildWaylineSignal(review, recommendation, options));
}

async function collectSignals(url, screenshotPath) {
  const browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: DEFAULT_VIEWPORT});

  try {
    await page.goto(url, {waitUntil: "domcontentloaded", timeout: 120_000});
    await page.waitForLoadState("networkidle", {timeout: 15_000}).catch(() => {});
    await page.screenshot({path: screenshotPath, fullPage: true});

    const rawSignals = await page.evaluate(() => {
      const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
      const words = (value = "") => {
        const text = clean(value);
        return text ? text.split(" ").length : 0;
      };
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) return false;

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const isAboveFold = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      };

      const primarySurfaceBottom = window.innerHeight * 0.5;
      const headingTexts = [...document.querySelectorAll("h1, h2, h3")]
        .filter(isVisible)
        .map((element) => clean(element.textContent))
        .filter(Boolean);

      const actionElements = [...document.querySelectorAll("a, button")].filter(isVisible);
      const actions = actionElements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          text: clean(element.textContent || element.getAttribute("aria-label") || ""),
          href: element.tagName === "A" ? clean(element.getAttribute("href") || "") : "",
          aboveFold: rect.top < primarySurfaceBottom && rect.bottom > 0,
          inNav: Boolean(element.closest("nav")),
          inHeader: Boolean(element.closest("header")),
          top: rect.top,
        };
      });

      const paragraphs = [...document.querySelectorAll("p")]
        .filter(isVisible)
        .map((element) => ({
          text: clean(element.textContent),
          words: words(element.textContent),
          top: element.getBoundingClientRect().top,
        }))
        .filter((item) => item.text);

      const sections = [...document.querySelectorAll("main section, main article")]
        .filter(isVisible)
        .map((section) => {
          const sectionParagraphs = [...section.querySelectorAll("p")]
            .filter(isVisible)
            .map((element) => clean(element.textContent))
            .filter(Boolean);

          return {
            heading: clean(section.querySelector("h1, h2, h3")?.textContent || ""),
            wordCount: words(sectionParagraphs.join(" ")),
            paragraphCount: sectionParagraphs.length,
            listItemCount: [...section.querySelectorAll("li")].filter(isVisible).length,
          };
        })
        .filter((section) => section.heading || section.wordCount > 0 || section.listItemCount > 0);

      const images = [...document.querySelectorAll("img")]
        .filter(isVisible)
        .map((element) => ({
          alt: clean(element.getAttribute("alt") || ""),
          aboveFold: isAboveFold(element),
        }));

      const aboveFoldListItemCount = [...document.querySelectorAll("li")]
        .filter(isVisible)
        .filter((element) => isAboveFold(element))
        .length;

      return {
        title: document.title,
        metaDescription: clean(document.querySelector('meta[name="description"]')?.getAttribute("content") || ""),
        h1Text: clean(document.querySelector("h1")?.textContent || ""),
        h2Count: [...document.querySelectorAll("h2")].filter(isVisible).length,
        headingTexts,
        navLinkTexts: actions.filter((action) => action.inNav).map((action) => action.text),
        aboveFoldActionTexts: actions
          .filter((action) => action.aboveFold && !action.inHeader)
          .map((action) => action.text),
        headerLinkCount: actions.filter((action) => action.inNav).length,
        aboveFoldActionCount: actions.filter((action) => action.aboveFold && !action.inHeader).length,
        heroParagraphs: paragraphs.filter((paragraph) => paragraph.top < window.innerHeight * 0.85).slice(0, 3),
        leadParagraph: paragraphs.find((paragraph) => paragraph.words >= 12 && paragraph.top < window.innerHeight) ?? null,
        sections,
        firstSection: sections.find((section) => section.wordCount > 0 || section.listItemCount > 0) ?? null,
        firstNarrativeSection:
          sections.find((section) => section.wordCount >= 90 || section.paragraphCount >= 2) ??
          sections.find((section) => section.wordCount > 0 || section.listItemCount > 0) ??
          null,
        sectionCount: sections.length,
        aboveFoldListItemCount,
        bodyWordCount: words(document.body.innerText || ""),
        imagesWithoutAlt: images.filter((image) => !image.alt).length,
        unnamedActionCount: actions.filter((action) => !action.text).length,
        hasMain: Boolean(document.querySelector("main")),
      };
    });

    const navLinkTexts = uniqueTexts(rawSignals.navLinkTexts);
    const aboveFoldActionTexts = uniqueTexts(rawSignals.aboveFoldActionTexts);
    const navAboveFoldOverlapTexts = intersectTexts(navLinkTexts, aboveFoldActionTexts);

    return {
      ...rawSignals,
      navLinkTexts,
      aboveFoldActionTexts,
      navAboveFoldOverlapTexts,
      navAboveFoldOverlapCount: navAboveFoldOverlapTexts.length,
      heroWordCount: rawSignals.leadParagraph?.words ?? rawSignals.heroParagraphs[0]?.words ?? 0,
    };
  } finally {
    await page.close().catch(() => {});
    await browser.close();
  }
}

function assessSignals(signals) {
  const categoryScores = {
    positioning: 10,
    hierarchy: 10,
    proof: 10,
    cta: 10,
    scannability: 10,
    accessibility: 10,
  };
  const strengths = [];
  const recommendations = [];

  if (!hasDomainLikeHeading(signals.h1Text) && signals.h1Text) {
    strengths.push("The H1 reads like an identity or value statement instead of a bare domain.");
  }

  if (signals.aboveFoldActionCount >= 1 && signals.aboveFoldActionCount <= 2) {
    strengths.push("The first screen offers a focused set of actions instead of a crowded CTA cluster.");
  }

  if (signals.h2Count >= 2) {
    strengths.push("The page already has enough section anchors to support scanning.");
  }

  if (signals.imagesWithoutAlt === 0) {
    strengths.push("Visible images appear to carry alt text or are absent, which keeps the accessibility baseline cleaner.");
  }

  if (!signals.hasMain) {
    pushRecommendation(recommendations, categoryScores, {
      id: "missing-main",
      title: "Add a `<main>` landmark for page structure.",
      impact: "medium",
      category: "accessibility",
      penalty: 2,
      why: "A missing `<main>` landmark makes it harder for assistive technology and keyboard users to jump into the core content.",
      fix: "Wrap the primary content in a single `<main>` element and keep the global header and footer outside it.",
      planeWorkItem: "Add a `<main>` landmark and skip-link target to the reviewed page.",
    });
  }

  if (hasDomainLikeHeading(signals.h1Text)) {
    pushRecommendation(recommendations, categoryScores, {
      id: "identity-led-hero",
      title: "Make the hero about the person or product, not the domain name.",
      impact: "high",
      category: "positioning",
      penalty: 3,
      why: `The current H1 is "${signals.h1Text}", which reads like a URL instead of a positioning statement.`,
      fix: "Use the H1 for the person, role, or product promise, and leave the domain for the browser chrome, nav, or metadata.",
      planeWorkItem: "Rewrite the homepage hero so the H1 leads with identity and the value proposition.",
    });
  }

  if (
    countWords(signals.metaDescription) < 8 ||
    /portfolio site/i.test(signals.metaDescription) ||
    /portfolio site/i.test(signals.title)
  ) {
    pushRecommendation(recommendations, categoryScores, {
      id: "sharpen-metadata",
      title: "Replace generic metadata with a sharper search and share summary.",
      impact: "medium",
      category: "positioning",
      penalty: 2,
      why: `The current title/meta description pair (${signals.title} / ${signals.metaDescription || "none"}) is generic and undersells the page's actual value.`,
      fix: "Rewrite the title and meta description around the role, capability, and project proof you want search and social previews to communicate.",
      planeWorkItem: "Rewrite the homepage title and meta description to match the real positioning of the page.",
    });
  }

  if (signals.heroWordCount > 32) {
    pushRecommendation(recommendations, categoryScores, {
      id: "tighten-hero-copy",
      title: "Tighten the opening copy so the value proposition lands faster.",
      impact: "high",
      category: "scannability",
      penalty: 2,
      why: `The first hero paragraph is about ${signals.heroWordCount} words, which is heavy for a first impression.`,
      fix: "Cut the opening copy to one sharp positioning sentence, then move the extra explanation into proof bullets or a later intro section.",
      planeWorkItem: "Shorten the hero copy and move supporting detail into secondary proof content.",
    });
  }

  if (signals.navAboveFoldOverlapCount >= 2) {
    pushRecommendation(recommendations, categoryScores, {
      id: "dedupe-nav-and-hero-actions",
      title: "Reduce duplicate navigation and hero actions.",
      impact: "high",
      category: "hierarchy",
      penalty: 2,
      why: `${signals.navAboveFoldOverlapCount} labels appear in both the header and above-fold content: ${signals.navAboveFoldOverlapTexts.join(", ")}.`,
      fix: "Keep the header for global navigation, then use one primary CTA and one secondary CTA inside the hero.",
      planeWorkItem: "Simplify above-fold navigation so the hero uses fewer, more intentional actions.",
    });
  }

  if (signals.headerLinkCount > 5) {
    pushRecommendation(recommendations, categoryScores, {
      id: "trim-header-links",
      title: "Trim the header to the highest-value destinations.",
      impact: "medium",
      category: "hierarchy",
      penalty: 1,
      why: `The header currently exposes ${signals.headerLinkCount} visible links, which dilutes the hierarchy.`,
      fix: "Keep only the top-level destinations in the header and push lower-priority links into the footer or a contact block.",
      planeWorkItem: "Reduce the number of header links so the primary path is more obvious.",
    });
  }

  if (signals.aboveFoldActionCount === 0) {
    pushRecommendation(recommendations, categoryScores, {
      id: "missing-cta",
      title: "Add a clear above-fold CTA.",
      impact: "high",
      category: "cta",
      penalty: 3,
      why: "The first screen does not expose a visible call to action outside the navigation.",
      fix: "Add one primary action and, if needed, one secondary action that map to the page's most important next steps.",
      planeWorkItem: "Add a primary above-fold CTA to the reviewed page.",
    });
  } else if (signals.aboveFoldActionCount > 3) {
    pushRecommendation(recommendations, categoryScores, {
      id: "too-many-ctas",
      title: "Narrow the number of above-fold actions.",
      impact: "medium",
      category: "cta",
      penalty: 2,
      why: `There are ${signals.aboveFoldActionCount} visible actions above the fold, which makes it harder to tell what matters most.`,
      fix: "Reduce the hero to one primary CTA and one secondary CTA, and let the rest of the navigation live elsewhere.",
      planeWorkItem: "Reduce the hero CTA cluster to a smaller, prioritized set of actions.",
    });
  }

  if (signals.aboveFoldListItemCount === 0 && signals.heroWordCount > 20) {
    pushRecommendation(recommendations, categoryScores, {
      id: "add-proof-above-fold",
      title: "Bring proof above the fold.",
      impact: "high",
      category: "proof",
      penalty: 2,
      why: "The first screen leans on narrative copy but gives little scannable proof, such as metrics, capability bullets, or project signals.",
      fix: "Add a compact proof rail, capability list, or short set of evidence bullets beside the hero copy.",
      planeWorkItem: "Add above-fold proof elements that support the hero claim.",
    });
  }

  if ((signals.firstNarrativeSection?.wordCount ?? 0) > 90 && (signals.firstNarrativeSection?.listItemCount ?? 0) === 0) {
    pushRecommendation(recommendations, categoryScores, {
      id: "break-up-dense-section",
      title: "Break the first dense section into scannable chunks.",
      impact: "high",
      category: "scannability",
      penalty: 3,
      why: `The first text-heavy section contains about ${signals.firstNarrativeSection.wordCount} words without list support.`,
      fix: "Split the section into shorter paragraphs, callouts, or bullet-backed proof so a fast scan still communicates the page's value.",
      planeWorkItem: "Refactor the first long narrative section into shorter, more scannable content blocks.",
    });
  }

  if (signals.h2Count < 2 && signals.bodyWordCount > 350) {
    pushRecommendation(recommendations, categoryScores, {
      id: "strengthen-sections",
      title: "Strengthen the section hierarchy.",
      impact: "medium",
      category: "hierarchy",
      penalty: 1,
      why: "The page is long enough to need more obvious section anchors, but it currently has limited second-level structure.",
      fix: "Introduce distinct H2-level sections or clearer sectional treatments so readers can orient themselves quickly.",
      planeWorkItem: "Add stronger section anchors and hierarchy to the page layout.",
    });
  }

  if (signals.imagesWithoutAlt > 0) {
    pushRecommendation(recommendations, categoryScores, {
      id: "missing-alt-text",
      title: "Add alt text to visible images.",
      impact: "medium",
      category: "accessibility",
      penalty: 3,
      why: `${signals.imagesWithoutAlt} visible image(s) are missing alt text.`,
      fix: "Provide meaningful alt text for informative images, or empty alt text for purely decorative ones.",
      planeWorkItem: "Add correct alt text coverage for visible content images.",
    });
  }

  if (signals.unnamedActionCount > 0) {
    pushRecommendation(recommendations, categoryScores, {
      id: "label-interactive-elements",
      title: "Label icon-only or unnamed interactive elements.",
      impact: "medium",
      category: "accessibility",
      penalty: 2,
      why: `${signals.unnamedActionCount} interactive element(s) appear to lack visible text or an accessible label.`,
      fix: "Add visible text or `aria-label` values so assistive technology can describe the control.",
      planeWorkItem: "Add accessible labels to unnamed actions on the page.",
    });
  }

  recommendations.sort((left, right) => IMPACT_ORDER[left.impact] - IMPACT_ORDER[right.impact]);

  const totalScore = Object.values(categoryScores).reduce((sum, value) => sum + value, 0);
  const overallScore = Math.round((totalScore / (Object.keys(categoryScores).length * 10)) * 100);

  return {
    strengths,
    recommendations,
    overallScore,
    status: overallLabel(overallScore),
    categoryScores: Object.fromEntries(
      Object.entries(categoryScores).map(([name, score]) => [name, {score, label: categoryLabel(score)}]),
    ),
  };
}

function buildPlaneDraft(review) {
  const priority = review.recommendations.some((recommendation) => recommendation.impact === "high") ? "high" : "medium";
  const headline = review.page.h1Text || review.page.title || review.url;
  const lines = [
    `Automated page review for ${review.url}.`,
    "",
    "## Snapshot",
    `- Overall score: ${review.overallScore}/100 (${review.status})`,
    `- H1: ${review.page.h1Text || "None detected"}`,
    `- Title: ${review.page.title || "None detected"}`,
    `- Header links: ${review.page.navLinkTexts.length}`,
    `- Above-fold actions: ${review.page.aboveFoldActionTexts.length}`,
    `- Screenshot: ${review.screenshotPath}`,
    "",
  ];

  if (review.strengths.length > 0) {
    lines.push("## Strengths", ...review.strengths.map((strength) => `- ${strength}`), "");
  }

  lines.push("## Recommendations");
  if (review.recommendations.length === 0) {
    lines.push("- No critical recommendations were generated.");
  } else {
    for (const recommendation of review.recommendations) {
      lines.push(
        `- **${recommendation.title}** (${recommendation.impact}, ${recommendation.category})`,
        `  - Why: ${recommendation.why}`,
        `  - Suggested fix: ${recommendation.fix}`,
      );
    }
  }

  return {
    issue: {
      name: `Page review: ${headline}`,
      description: lines.join("\n"),
      priority,
    },
  };
}

function formatMarkdown(review) {
  const lines = [
    `# Page Review: ${review.page.h1Text || review.page.title || review.url}`,
    "",
    `- URL: ${review.url}`,
    `- Overall score: ${review.overallScore}/100 (${review.status})`,
    `- Screenshot: ${review.screenshotPath}`,
    `- Generated: ${review.generatedAt}`,
    "",
    "## Snapshot",
    `- Title: ${review.page.title || "None detected"}`,
    `- Meta description: ${review.page.metaDescription || "None detected"}`,
    `- H1: ${review.page.h1Text || "None detected"}`,
    `- Header links: ${review.page.navLinkTexts.join(", ") || "None detected"}`,
    `- Above-fold actions: ${review.page.aboveFoldActionTexts.join(", ") || "None detected"}`,
    "",
    "## Category Scores",
    ...Object.entries(review.categoryScores).map(
      ([category, value]) => `- ${category}: ${value.score}/10 (${value.label})`,
    ),
    "",
  ];

  if (review.strengths.length > 0) {
    lines.push("## Strengths", ...review.strengths.map((strength) => `- ${strength}`), "");
  }

  lines.push("## Recommendations");
  if (review.recommendations.length === 0) {
    lines.push("- No major issues were flagged by the current heuristic checks.", "");
  } else {
    for (const recommendation of review.recommendations) {
      lines.push(
        `### ${recommendation.title}`,
        `- Impact: ${recommendation.impact}`,
        `- Category: ${recommendation.category}`,
        `- Why: ${recommendation.why}`,
        `- Suggested fix: ${recommendation.fix}`,
        `- Plane work item: ${recommendation.planeWorkItem}`,
        "",
      );
    }
  }

  lines.push(
    "## Wayline Drafts",
    ...(review.waylineSignals.length === 0
      ? ["- No actionable recommendations were generated, so no Wayline signals will be emitted.", ""]
      : review.waylineSignals.flatMap((signal) => [
          `### ${signal.title}`,
          `- Dedupe key: ${signal.dedupeKey}`,
          `- Priority: ${signal.priority}`,
          `- Idempotency key: ${signal.idempotencyKey}`,
          `- Target path: ${signal.targetPath || "Not inferred"}`,
          "",
        ])),
    "## Plane Draft",
    `- Issue name: ${review.planeDraft.issue.name}`,
    `- Priority: ${review.planeDraft.issue.priority}`,
    "",
    "Run with `--submit-wayline` and the `WAYLINE_*` environment variables to create Wayline signals directly.",
    "",
    "Run with `--submit-plane` and the `PLANE_*` environment variables to create an intake item directly in Plane.",
  );

  return lines.join("\n");
}

async function submitWaylineSignal(signal) {
  const token = process.env.WAYLINE_TOKEN;
  const baseUrl = (process.env.WAYLINE_BASE_URL || DEFAULT_WAYLINE_BASE_URL).replace(/\/$/, "");

  if (!token) {
    throw new Error("Missing Wayline configuration. Set WAYLINE_TOKEN before using --submit-wayline.");
  }

  const response = await fetch(`${baseUrl}/v1/signals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": signal.idempotencyKey,
    },
    body: JSON.stringify(signal.payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Wayline signal submission failed (${response.status}): ${message}`);
  }

  return response.json();
}

async function submitPlaneDraft(planeDraft) {
  const apiKey = process.env.PLANE_API_KEY;
  const workspaceSlug = process.env.PLANE_WORKSPACE_SLUG;
  const projectId = process.env.PLANE_PROJECT_ID;
  const baseUrl = (process.env.PLANE_BASE_URL || "https://api.plane.so").replace(/\/$/, "");

  if (!apiKey || !workspaceSlug || !projectId) {
    throw new Error(
      "Missing Plane configuration. Set PLANE_API_KEY, PLANE_WORKSPACE_SLUG, and PLANE_PROJECT_ID before using --submit-plane.",
    );
  }

  const response = await fetch(
    `${baseUrl}/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/intake-issues/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(planeDraft),
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Plane intake submission failed (${response.status}): ${message}`);
  }

  return response.json();
}

function printUsage() {
  console.log(
    "Usage: npm run review:page -- --url <page-url> [--output-dir .review-screens] [--target-path src/pages/index.astro] [--submit-wayline] [--submit-plane]",
  );
}

async function main() {
  const {values} = parseArgs({
    options: {
      url: {type: "string"},
      outputDir: {type: "string"},
      targetPath: {type: "string"},
      submitWayline: {type: "boolean"},
      submitPlane: {type: "boolean"},
    },
    allowPositionals: false,
  });

  if (!values.url) {
    printUsage();
    throw new Error("Missing required --url option.");
  }

  const url = new URL(values.url).toString();
  const outputDir = values.outputDir ? path.resolve(PROJECT_ROOT, values.outputDir) : DEFAULT_OUTPUT_DIR;
  const fileStem = slugify(`${new URL(url).hostname}${new URL(url).pathname}`);
  const screenshotPath = path.join(outputDir, `${fileStem}.png`);
  const jsonPath = path.join(outputDir, `${fileStem}.review.json`);
  const markdownPath = path.join(outputDir, `${fileStem}.review.md`);

  await mkdir(outputDir, {recursive: true});

  const signals = await collectSignals(url, screenshotPath);
  const assessment = assessSignals(signals);
  const review = {
    generatedAt: new Date().toISOString(),
    url,
    ...assessment,
    routeKey: routeKeyForUrl(url),
    artifacts: {
      screenshotPath: toRelativePath(screenshotPath),
      jsonPath: toRelativePath(jsonPath),
      markdownPath: toRelativePath(markdownPath),
    },
    page: {
      title: signals.title,
      metaDescription: signals.metaDescription,
      h1Text: signals.h1Text,
      navLinkTexts: signals.navLinkTexts,
      aboveFoldActionTexts: signals.aboveFoldActionTexts,
      navAboveFoldOverlapTexts: signals.navAboveFoldOverlapTexts,
      heroParagraphs: signals.heroParagraphs,
      firstSection: signals.firstSection,
      firstNarrativeSection: signals.firstNarrativeSection,
      h2Count: signals.h2Count,
      sectionCount: signals.sectionCount,
      bodyWordCount: signals.bodyWordCount,
      imagesWithoutAlt: signals.imagesWithoutAlt,
      unnamedActionCount: signals.unnamedActionCount,
    },
  };
  review.screenshotPath = review.artifacts.screenshotPath;
  review.waylineSignals = buildWaylineSignals(review, {targetPath: values.targetPath});
  review.planeDraft = buildPlaneDraft(review);

  await writeFile(jsonPath, `${JSON.stringify(review, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${formatMarkdown(review)}\n`, "utf8");

  console.log(`[review:page] Score ${review.overallScore}/100 (${review.status})`);
  console.log(`[review:page] Screenshot → ${toRelativePath(screenshotPath)}`);
  console.log(`[review:page] JSON report → ${toRelativePath(jsonPath)}`);
  console.log(`[review:page] Markdown brief → ${toRelativePath(markdownPath)}`);
  console.log(`[review:page] Wayline drafts → ${review.waylineSignals.length}`);

  if (values.submitWayline) {
    if (review.waylineSignals.length === 0) {
      console.log("[review:page] No Wayline signals to submit.");
    } else {
      for (const signal of review.waylineSignals) {
        const result = await submitWaylineSignal(signal);
        console.log(
          `[review:page] Wayline signal for ${signal.recommendationId} → ${result.resource?.id ?? result.id ?? "accepted"}`,
        );
      }
    }
  }

  if (values.submitPlane) {
    const result = await submitPlaneDraft(review.planeDraft);
    console.log(`[review:page] Plane intake created with id ${result.id ?? "unknown"}`);
  }
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch((error) => {
    console.error("[review:page] FAIL:");
    console.error(error.message);
    process.exitCode = 1;
  });
}

export {
  assessSignals,
  buildPlaneDraft,
  buildWaylineSignal,
  buildWaylineSignals,
  inferTargetPath,
  routeKeyForUrl,
};
