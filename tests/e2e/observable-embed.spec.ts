import {expect, test} from "@playwright/test";

const llmRoutePattern = /\/observable\/projects\/llm-fundamentals\/(?:index\.html)?$/;
const dataPlaygroundPattern = /\/observable\/projects\/data-playground\/(?:index\.html)?$/;

test("landing project link opens canonical notebook and navigation is available", async ({page}) => {
  await page.goto("/");
  await page.getByRole("link", {name: "Deep Learning Fundamentals"}).click();
  await expect(page).toHaveURL(llmRoutePattern);
  await expect(page.getByRole("heading", {name: "Large Language Models and Deep Learning Fundamentals"})).toBeVisible();

  const projectsNavLink = page.locator("#observablehq-header a", {hasText: /^Projects$/});
  await expect(projectsNavLink).toBeVisible();
  await projectsNavLink.click();
  await expect(page).toHaveURL(/\/observable\/projects\/(?:index\.html)?$/);
  await expect(page.getByRole("heading", {name: "Projects"})).toBeVisible();
});

function observeObservableAssetFailures(page: import("@playwright/test").Page) {
  const failures = [] as string[];
  page.on("response", (response) => {
    const url = response.url();
    const observableAsset =
      url.includes("/observable/_observablehq/") ||
      url.includes("/observable/_file/") ||
      url.includes("/observable/embed/") ||
      url.includes("/observable/_import/");
    if (observableAsset && response.status() >= 400) {
      failures.push(`${response.status()} ${url}`);
    }
  });
  return failures;
}

async function collectNotebookLinks(page: import("@playwright/test").Page) {
  return page.evaluate(({llmPatternSource}) => {
    const llmPattern = new RegExp(llmPatternSource);
    const links = new Set<string>();

    for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) {
        continue;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) {
        continue;
      }

      if (!url.pathname.startsWith("/observable/") || url.hash) {
        continue;
      }

      if (url.pathname === "/observable/" || url.pathname === "/observable/index.html") {
        continue;
      }

      if (llmPattern.test(url.pathname)) {
        continue;
      }

      links.add(url.pathname);
    }

    return Array.from(links);
  }, {llmPatternSource: llmRoutePattern.source});
}

test("observable notebook links render from canonical routes", async ({page}) => {
  const failures = observeObservableAssetFailures(page);
  await page.goto("/");
  await page.getByRole("link", {name: "Deep Learning Fundamentals"}).click();
  await expect(page).toHaveURL(llmRoutePattern);
  await expect(page.getByRole("heading", {name: "Large Language Models and Deep Learning Fundamentals"})).toBeVisible();

  const linkedNotebookPaths = await collectNotebookLinks(page);
  expect(linkedNotebookPaths.length).toBeGreaterThanOrEqual(6);
  expect(linkedNotebookPaths.some((candidate) => dataPlaygroundPattern.test(candidate))).toBeTruthy();

  for (const notebookPath of linkedNotebookPaths) {
    const response = await page.goto(notebookPath);
    expect(response?.status(), `Expected ${notebookPath} to load without error`).toBeLessThan(400);
    await expect(page.locator("h1").first()).toBeVisible({timeout: 60_000});
  }

  expect(failures).toEqual([]);
});

test("legacy astro hybrid route is unavailable", async ({page}) => {
  const response = await page.goto("/projects/deep-learning-fundamentals/", {waitUntil: "domcontentloaded"});
  expect(response?.status()).toBe(404);
});
