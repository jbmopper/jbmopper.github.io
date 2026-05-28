import {expect, type Locator, test} from "@playwright/test";

async function expectImagesLoaded(images: Locator) {
  await expect
    .poll(() =>
      images.evaluateAll((nodes) =>
        nodes.every((node) => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)
      )
    )
    .toBe(true);
}

test("theme control cycles and persists across Astro and Observable pages", async ({page}) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.removeItem("juliusm-theme");
  });
  await page.reload();

  const themeControl = page.locator("[data-theme-control]");
  await expect(themeControl).toBeVisible();
  await expect(themeControl.locator("[data-theme-label]")).toHaveText("System");

  await themeControl.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(themeControl.locator("[data-theme-label]")).toHaveText("Dark");

  await themeControl.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(themeControl.locator("[data-theme-label]")).toHaveText("Light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f5f7f3");

  await page.goto("/observable/projects/");
  const observableControl = page.locator("[data-theme-control]");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(observableControl.locator("[data-theme-label]")).toHaveText("Light");

  await observableControl.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  await expect(observableControl.locator("[data-theme-label]")).toHaveText("System");
});

test("mobile layout keeps navigation, theme control, and project art within the viewport", async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});

  for (const path of ["/", "/observable/projects/", "/observable/projects/llm-fundamentals/"]) {
    await page.goto(path);
    await expect(page.locator("[data-theme-control]")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} should not overflow horizontally`).toBeLessThanOrEqual(1);
  }

  await page.goto("/");
  const projectImages = page.locator("#projects .project-card__art img");
  await expect(projectImages).toHaveCount(3);
  await expectImagesLoaded(projectImages);

  for (let index = 0; index < 3; index += 1) {
    const box = await projectImages.nth(index).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
    expect(box?.height ?? 0).toBeGreaterThan(150);
  }

  await page.goto("/observable/projects/");
  const observableProjectImages = page.locator(".project-card__art img");
  await expect(observableProjectImages).toHaveCount(3);
  await expectImagesLoaded(observableProjectImages);
});
