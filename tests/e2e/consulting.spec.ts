import {expect, test} from "@playwright/test";
import type {Page} from "@playwright/test";

async function fillRequiredIntakeFields(page: Page, email = "ada@example.com") {
  await page.getByLabel("Name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill(email);
  await page
    .getByLabel("Problem summary")
    .fill("We need to evaluate whether RAG can reduce repetitive internal support research work.");
  await page.getByLabel("Julius may contact me about this request.").check();
}

test.describe("Consulting intake page", () => {
  test("page loads and shows consulting positioning", async ({page}) => {
    await page.goto("/consulting/");
    await expect(
      page.getByRole("heading", {
        name: "AI implementation for teams that need more than a demo.",
      }),
    ).toBeVisible();
    await expect(page.getByRole("link", {name: "Start Intake"})).toBeVisible();
    await expect(page.getByRole("heading", {name: "Tell me about the workflow."})).toBeVisible();
  });

  test("nav exposes consulting and resume routes", async ({page}) => {
    await page.goto("/consulting/");
    await expect(page.locator(".nav-links a", {hasText: "Consulting"})).toHaveAttribute(
      "href",
      "/consulting/",
    );
    await expect(page.locator(".nav-links a", {hasText: "Resume"})).toHaveAttribute(
      "href",
      "/resume/",
    );
  });

  test("submit button stays disabled until required fields are valid", async ({page}) => {
    await page.goto("/consulting/");
    const submitBtn = page.getByRole("button", {name: "Submit Intake"});
    await expect(submitBtn).toBeDisabled();

    await page.getByLabel("Name").fill("Ada Lovelace");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Problem summary").fill("Too short");
    await page.getByLabel("Julius may contact me about this request.").check();
    await expect(submitBtn).toBeDisabled();

    await page
      .getByLabel("Problem summary")
      .fill("We need to evaluate whether RAG can reduce repetitive internal support research work.");
    await expect(submitBtn).toBeEnabled();
  });

  test("mock flow accepts a valid intake submission", async ({page}) => {
    await page.goto("/consulting/");
    await fillRequiredIntakeFields(page);

    await page.getByRole("button", {name: "Submit Intake"}).click();
    await expect(page.getByRole("heading", {name: "Submitting Intake"})).toBeVisible();
    await expect(page.getByRole("heading", {name: "Intake received"})).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Reference: mock-/)).toBeVisible();
  });

  test("mock failure shows retry and edit controls", async ({page}) => {
    await page.goto("/consulting/");
    await fillRequiredIntakeFields(page, "fail@example.com");

    await page.getByRole("button", {name: "Submit Intake"}).click();
    await expect(page.getByRole("heading", {name: "Submission failed"})).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Mock intake submission failed.")).toBeVisible();
    await expect(page.getByRole("button", {name: "Try Again"})).toBeVisible();

    await page.getByRole("button", {name: "Edit Form"}).click();
    await expect(page.getByRole("heading", {name: "Tell me about the workflow."})).toBeVisible();
  });

  test("mobile layout does not overflow horizontally", async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto("/consulting/");

    await expect(page.getByRole("heading", {name: "Tell me about the workflow."})).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
