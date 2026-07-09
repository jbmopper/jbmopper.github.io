import {expect, test} from "@playwright/test";
import type {Page} from "@playwright/test";

async function continueToInput(page: Page) {
  const continueBtn = page.getByRole("button", {name: "Continue"});
  const inputHeading = page.getByRole("heading", {name: "Job Description"});

  await expect(continueBtn).toBeVisible();
  await continueBtn.click();

  if (!(await inputHeading.isVisible())) {
    await page.waitForTimeout(300);
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }
  }

  await expect(inputHeading).toBeVisible();
}

test.describe("Resume Generator page", () => {
  test("page loads and shows intro", async ({page}) => {
    await page.goto("/resume/");
    await expect(page.getByRole("heading", {name: "Resume Generator"})).toBeVisible();
    await expect(page.getByRole("button", {name: "Continue"})).toBeVisible();
  });

  test("nav link is present in header", async ({page}) => {
    await page.goto("/resume/");
    const navLink = page.locator(".nav-links a", {hasText: "Resume"});
    await expect(navLink).toBeVisible();
    await expect(navLink).toHaveAttribute("href", "/resume/");
  });

  test("continue skips turnstile in mock mode and shows input", async ({page}) => {
    await page.goto("/resume/");
    await continueToInput(page);
    await expect(page.getByPlaceholder("Paste the job description here...")).toBeVisible();
  });

  test("generate button is disabled without input", async ({page}) => {
    await page.goto("/resume/");
    await continueToInput(page);
    const genBtn = page.getByRole("button", {name: "Generate Resume"});
    await expect(genBtn).toBeDisabled();
  });

  test("mock flow completes end-to-end", async ({page}) => {
    await page.goto("/resume/");
    await continueToInput(page);

    const textarea = page.getByPlaceholder("Paste the job description here...");
    await textarea.fill(
      "Senior AI Engineer role requiring deep learning, transformer architectures, and production ML systems experience.",
    );

    await page.getByRole("button", {name: "Generate Resume"}).click();
    await expect(page.getByRole("heading", {name: "Generating Resume"})).toBeVisible();

    await expect(page.getByRole("heading", {name: "Resume Ready"})).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", {name: "View PDF"})).toBeVisible();
  });

  test("back button returns to intro", async ({page}) => {
    await page.goto("/resume/");
    await continueToInput(page);

    await page.getByRole("button", {name: "Back"}).click();
    await expect(page.getByRole("heading", {name: "Resume Generator"})).toBeVisible();
  });

  test("can switch between text and file tabs", async ({page}) => {
    await page.goto("/resume/");
    await continueToInput(page);

    await page.getByRole("tab", {name: "Upload File"}).click();
    await expect(page.locator(".file-prompt")).toBeVisible();

    await page.getByRole("tab", {name: "Paste Text"}).click();
    await expect(page.getByPlaceholder("Paste the job description here...")).toBeVisible();
  });
});
