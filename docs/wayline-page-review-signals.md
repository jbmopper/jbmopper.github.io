# Wayline Page Review Signals

This repo's page-review tooling emits Wayline `review_finding` signals. The goal is to turn visual or UX findings into durable `work_item`s in the `wayline` repo through `POST /v1/signals`, not to treat a whole review run as one giant task.

## Scope

- Input: one `.review-screens/*.review.json` result produced by `scripts/review-page.mjs`
- Output: one Wayline signal per actionable recommendation in `review.recommendations`
- Non-goals:
  - no signal for strengths
  - no aggregate "review summary" work item
  - no automatic execution beyond Wayline intake

## Mapping

For each recommendation in the review output:

| Review field | Wayline field | Rule |
| --- | --- | --- |
| `recommendation.id` | `dedupe_key` | `repo:jbmopper.github.io:page-review:<route-key>:<recommendation.id>` |
| `recommendation.title` | `work_spec.title` | Copy verbatim |
| `recommendation.impact` | `work_spec.priority` | `high -> P1`, `medium -> P2`, `low -> P3` |
| `recommendation.fix` | `work_spec.objective` | Copy verbatim |
| `recommendation.why` + page snapshot | `work_spec.details` | Render into a short diagnostic brief |
| `recommendation.category` | `work_spec.labels` | Add `category:<category>` |
| reviewed URL | `source.identifier` | `page-review:<route-key>:<recommendation.id>` |
| review artifact path | `source.external_ref` | Relative path to the generated markdown brief |

Signal envelope:

- `kind`: `review_finding`
- `dedupe_key`: same value used in `work_spec.dedupe_key`
- `source.kind`: `review_finding`
- `source.identifier`: `page-review:<route-key>:<recommendation.id>`
- `source.external_ref`: local review markdown path when available

Work spec:

- `schema_version`: `wayline.work_spec.v1`
- `kind`: `review_finding`
- `dedupe_key`: same stable semantic key as the signal
- `title`: recommendation title
- `priority`: mapped from impact
- `objective`: recommendation fix text
- `details`: recommendation why + current page snapshot + artifact references
- `target.repo`: `jbmopper.github.io`
- `target.path`: inferred from the reviewed route when known, otherwise omitted unless the caller passes `--target-path`
- `acceptance_criteria`:
  - the reported finding is addressed on the reviewed route
  - the site builds successfully
  - a follow-up review no longer reports the same finding, or the remaining false positive is documented
- `validation.commands`:
  - default: `npm run build`
- `validation.notes`:
  - re-run the page review after the change
  - manually verify navigation and accessibility when hierarchy, CTA, or accessibility findings are touched
- `constraints`:
  - keep the change scoped to the reviewed route and necessary shared layout/theme files
  - do not remove user-facing behavior without replacing its purpose

## Identity Rules

Wayline distinguishes retry identity from logical issue identity. This adapter does the same:

- `Idempotency-Key`: `page-review:<route-key>:<generated-at>:<recommendation.id>`
  - stable for retries of the same generated review artifact
  - changes on a new review run
- `dedupe_key`: `repo:jbmopper.github.io:page-review:<route-key>:<recommendation.id>`
  - stable across review runs
  - collapses repeated reports of the same live finding onto one live Wayline work item

## Route Target Inference

The adapter infers `target.path` conservatively:

- `/` -> `src/pages/index.astro`
- `/resume` or `/resume/` -> `src/pages/resume.astro`

All other routes omit `target.path` unless the caller passes `--target-path`. This keeps the signal honest when the route-to-source mapping is ambiguous.

## Submission Contract

The review CLI submits to:

```text
POST <WAYLINE_BASE_URL>/v1/signals
Authorization: Bearer <WAYLINE_TOKEN>
Idempotency-Key: page-review:<route-key>:<generated-at>:<recommendation.id>
Content-Type: application/json; charset=utf-8
```

Environment variables:

- `WAYLINE_TOKEN` (required)
- `WAYLINE_BASE_URL` (optional, defaults to `http://127.0.0.1:8080`)

## Example

```json
{
  "kind": "review_finding",
  "dedupe_key": "repo:jbmopper.github.io:page-review:home:identity-led-hero",
  "source": {
    "kind": "review_finding",
    "identifier": "page-review:home:identity-led-hero",
    "external_ref": ".review-screens/juliusm-com.review.md"
  },
  "work_spec": {
    "schema_version": "wayline.work_spec.v1",
    "kind": "review_finding",
    "dedupe_key": "repo:jbmopper.github.io:page-review:home:identity-led-hero",
    "title": "Make the hero about the person or product, not the domain name.",
    "priority": "P1",
    "objective": "Use the H1 for the person, role, or product promise, and leave the domain for the browser chrome, nav, or metadata.",
    "details": "Automated page review finding for https://juliusm.com/ ...",
    "source": {
      "kind": "review_finding",
      "identifier": "page-review:home:identity-led-hero",
      "external_ref": ".review-screens/juliusm-com.review.md"
    },
    "target": {
      "repo": "jbmopper.github.io",
      "path": "src/pages/index.astro"
    },
    "acceptance_criteria": [
      "The reported finding is addressed on the reviewed route.",
      "The site builds successfully.",
      "A follow-up review no longer reports the same finding, or the remaining false positive is documented."
    ],
    "validation": {
      "commands": ["npm run build"],
      "notes": ["Re-run the page review after the change."]
    },
    "labels": [
      "page-review",
      "repo:jbmopper.github.io",
      "category:positioning",
      "impact:high",
      "route:home"
    ]
  }
}
```
