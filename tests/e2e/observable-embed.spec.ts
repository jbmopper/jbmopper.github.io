import {expect, test} from "@playwright/test";

const sections = [
  {
    path: "/observable/perf-expected/",
    title: "Architecture and Expected Performance Analysis",
  },
  {
    path: "/observable/perf-empirical/",
    title: "Benchmarks and Empirical Performance Analysis",
  },
  {
    path: "/observable/nsys/",
    title: "NSYS Traces",
  },
  {
    path: "/observable/lr-sweep/",
    title: "Learning-Rate Sweep Analysis",
  },
  {
    path: "/observable/ablations/",
    title: "Ablation Analysis",
  }
] as const;

test("landing project link opens notebook and returns home", async ({page}) => {
  await page.goto("/");
  await page.click('a[href="/observable/llm-fundamentals/"]');
  await expect(page).toHaveURL(/\/observable\/llm-fundamentals\/(?:index\.html)?$/);
  await expect(page.getByRole("heading", {name: "Large Language Models and Deep Learning Fundamentals"})).toBeVisible();

  const backHomeLink = page.getByRole("link", {name: /Back to Home/});
  await expect(backHomeLink).toBeVisible();
  await backHomeLink.click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", {name: "jbmopper.github.io"})).toBeVisible();
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

test("observable technical sections render from canonical routes", async ({page}) => {
  const failures = observeObservableAssetFailures(page);
  await page.goto("/observable/llm-fundamentals/");
  await expect(page.getByRole("heading", {name: "Large Language Models and Deep Learning Fundamentals"})).toBeVisible();

  for (const section of sections) {
    await page.goto(section.path);
    await expect(page.getByRole("heading", {name: section.title})).toBeVisible({timeout: 60_000});
  }

  expect(failures).toEqual([]);
});

test("legacy astro hybrid route is unavailable", async ({page}) => {
  const response = await page.goto("/projects/deep-learning-fundamentals/", {waitUntil: "domcontentloaded"});
  expect(response?.status()).toBe(404);
});
