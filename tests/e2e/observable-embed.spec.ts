import {expect, test} from "@playwright/test";

const sections = [
  {
    path: "/projects/deep-learning-fundamentals/perf-expected/",
    title: "Architecture and Expected Performance Analysis",
    modulePath: "/observable/embed/perf-expected.js"
  },
  {
    path: "/projects/deep-learning-fundamentals/perf-empirical/",
    title: "Benchmarks and Empirical Performance Analysis",
    modulePath: "/observable/embed/perf-empirical.js"
  },
  {
    path: "/projects/deep-learning-fundamentals/nsys/",
    title: "NVIDIA CUDA NSYS Trace Analysis",
    modulePath: "/observable/embed/nsys.js"
  },
  {
    path: "/projects/deep-learning-fundamentals/lr-sweep/",
    title: "Learning Parameter Sweeps",
    modulePath: "/observable/embed/lr-sweep.js"
  },
  {
    path: "/projects/deep-learning-fundamentals/ablations/",
    title: "Architectural Variations (Ablations)",
    modulePath: "/observable/embed/ablations.js"
  }
] as const;

const MOUNT_TIMEOUT_MS = 120_000;

async function expectEmbedMounted(page: import("@playwright/test").Page, expectedMounted: number) {
  await expect
    .poll(() => page.evaluate(() => (window as any).__observableEmbedState?.mounted ?? 0), {
      timeout: MOUNT_TIMEOUT_MS
    })
    .toBe(expectedMounted);

  const errors = await page.evaluate(() => (window as any).__observableEmbedState?.errors ?? []);
  expect(errors).toEqual([]);
}

test("overview and section routes follow separate-page embed structure", async ({page}) => {
  const failedResponses = [] as string[];
  const requestedEmbedUrls = [] as string[];
  page.on("response", (response) => {
    const url = response.url();
    const isObservableAsset =
      url.includes("/observable/embed/") || url.includes("/observable/_observablehq/") || url.includes("/observable/_file/");
    if (isObservableAsset && response.status() >= 400) {
      failedResponses.push(`${response.status()} ${url}`);
    }
    if (url.includes("/observable/embed/") && response.status() < 400) {
      requestedEmbedUrls.push(url);
    }
  });

  await page.goto("/projects/deep-learning-fundamentals/");
  await expect(page.getByRole("heading", {name: "Large Language Models and Deep Learning Fundamentals"})).toBeVisible();
  await expect(page.getByRole("heading", {name: "Project Overview"})).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).__observableEmbedState?.mounted ?? 0), {
      timeout: MOUNT_TIMEOUT_MS
    })
    .toBe(0);

  const overviewLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("ol.toc-list a")).map((node) => node.textContent?.trim());
  });
  expect(overviewLinks).toEqual(sections.map((section) => section.title));

  await page.click(`a[href="${sections[0].path}"]`);
  await expect(page.getByRole("heading", {name: sections[0].title})).toBeVisible({timeout: 60_000});
  await expect(page.locator(".observable-embed-host")).toHaveAttribute("data-module-path", sections[0].modulePath);
  await expectEmbedMounted(page, 1);

  for (const section of sections.slice(1)) {
    await page.goto(section.path);
    await expect(page.getByRole("heading", {name: section.title})).toBeVisible({timeout: 60_000});
    await expect(page.locator(".observable-embed-host")).toHaveAttribute("data-module-path", section.modulePath);
    await expectEmbedMounted(page, 1);
  }

  expect(requestedEmbedUrls.some((url) => url.includes("/observable/embed/benchmarks.js"))).toBe(false);
  expect(failedResponses).toEqual([]);
});

test("embedded observable modules clean up on route change", async ({page}) => {
  await page.goto("/projects/deep-learning-fundamentals/nsys/");
  await expectEmbedMounted(page, 1);

  await page.click('a[href="/projects/deep-learning-fundamentals/notes/"]');
  await expect(page.getByRole("heading", {name: "Deep Learning Fundamentals Notes"})).toBeVisible();

  await expect
    .poll(() => page.evaluate(() => (window as any).__observableEmbedState?.mounted ?? 0), {
      timeout: MOUNT_TIMEOUT_MS
    })
    .toBe(0);
});
