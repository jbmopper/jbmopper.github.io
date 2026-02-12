import {expect, test} from "@playwright/test";

test("embedded observable modules mount", async ({page}) => {
  const failedResponses = [] as string[];
  page.on("response", (response) => {
    const url = response.url();
    const isObservableAsset =
      url.includes("/observable/embed/") || url.includes("/observable/_observablehq/") || url.includes("/observable/_file/");
    if (isObservableAsset && response.status() >= 400) {
      failedResponses.push(`${response.status()} ${url}`);
    }
  });

  await page.goto("/projects/deep-learning-fundamentals/");
  await expect(page.getByRole("heading", {name: "Deep Learning Fundamentals"})).toBeVisible();
  await expect(page.getByText("NSYS Trace Analysis")).toBeVisible({timeout: 60_000});
  await expect(page.getByText("Benchmark Analysis")).toBeVisible({timeout: 60_000});
  await expect.poll(() => page.evaluate(() => (window as any).__observableEmbedState?.mounted ?? 0)).toBe(2);

  expect(failedResponses).toEqual([]);
});

test("embedded observable modules clean up on route change", async ({page}) => {
  await page.goto("/projects/deep-learning-fundamentals/");
  await expect.poll(() => page.evaluate(() => (window as any).__observableEmbedState?.mounted ?? 0)).toBe(2);

  await page.click('a[href="/projects/deep-learning-fundamentals/notes/"]');
  await expect(page.getByRole("heading", {name: "Deep Learning Fundamentals Notes"})).toBeVisible();

  await expect.poll(() => page.evaluate(() => (window as any).__observableEmbedState?.mounted ?? 0)).toBe(0);
});
