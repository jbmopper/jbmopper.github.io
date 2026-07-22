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

  test("submit is always clickable and names the missing fields", async ({page}) => {
    await page.goto("/consulting/");
    const submitBtn = page.getByRole("button", {name: "Submit Intake"});
    await expect(submitBtn).toBeEnabled();

    // Empty form: submitting must explain itself rather than doing nothing.
    await submitBtn.click();
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Name is required.");
    await expect(alert).toContainText("A valid email is required.");
    await expect(alert).toContainText("Julius may contact you");
    await expect(page.getByRole("heading", {name: "Tell me about the workflow."})).toBeVisible();

    // A too-short summary reports its actual length.
    await page.getByLabel("Name").fill("Ada Lovelace");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Problem summary").fill("Too short");
    await page.getByLabel("Julius may contact me about this request.").check();
    await submitBtn.click();
    await expect(alert).toContainText("at least 30 characters (currently 9)");

    await page
      .getByLabel("Problem summary")
      .fill("We need to evaluate whether RAG can reduce repetitive internal support research work.");
    await submitBtn.click();
    await expect(page.getByRole("heading", {name: "Intake received"})).toBeVisible({
      timeout: 10_000,
    });
  });

  test("offer cards and the intake dropdown stay one-for-one", async ({page}) => {
    await page.goto("/consulting/");

    const cardHeadings = await page.locator(".offer-row h3").allInnerTexts();
    expect(cardHeadings).toEqual(["AI Pilot Sprint", "Evaluation & Readiness Review"]);

    const options = await page.locator("select >> nth=0").locator("option").allInnerTexts();
    expect(options).toEqual([...cardHeadings, "Not sure yet"]);
  });

  test("the pilot sprint offer states its price and scope", async ({page}) => {
    await page.goto("/consulting/");
    const primary = page.locator(".offer-row--primary");
    await expect(primary).toContainText("$3,500");
    await expect(primary).toContainText("two weeks");
    await expect(primary).toContainText("synthetic or redacted data");
    await expect(primary.locator(".offer-includes li")).toHaveCount(6);
  });

  test("form controls never overlap each other", async ({page}) => {
    for (const width of [1280, 860, 390]) {
      await page.setViewportSize({width, height: 900});
      await page.goto("/consulting/");

      const overlaps = await page.evaluate(() => {
        const els = [...document.querySelectorAll(".field-grid input, .field-grid select, .field-grid textarea")];
        const found: string[] = [];
        for (let i = 0; i < els.length; i++) {
          for (let j = i + 1; j < els.length; j++) {
            const a = els[i].getBoundingClientRect();
            const b = els[j].getBoundingClientRect();
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) {
              found.push(`${i}|${j}`);
            }
          }
        }
        return found;
      });

      expect(overlaps, `overlapping controls at ${width}px`).toEqual([]);
    }
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
