import {expect, test} from "@playwright/test";

test.describe("Mushbot chatbot", () => {
  test("toggle button appears on landing page", async ({page}) => {
    await page.goto("/");
    const fab = page.getByLabel("Open Mushbot");
    await expect(fab).toBeVisible();
  });

  test("opens and closes chat panel", async ({page}) => {
    await page.goto("/");
    const fab = page.getByLabel("Open Mushbot");
    await fab.click();
    await expect(page.getByRole("dialog", {name: "Mushbot chat"})).toBeVisible();
    await expect(page.getByPlaceholder("Ask Mushbot...")).toBeVisible();

    const closeBtn = page.getByLabel("Close chat");
    await closeBtn.click();
    await expect(page.getByRole("dialog", {name: "Mushbot chat"})).not.toBeVisible();
  });

  test("sends a message and receives a mock reply", async ({page}) => {
    await page.goto("/");
    await page.getByLabel("Open Mushbot").click();
    const input = page.getByPlaceholder("Ask Mushbot...");
    await input.fill("Tell me about the projects");
    await page.getByLabel("Send message").click();

    await expect(input).toHaveValue("");
    const messages = page.locator(".mushbot-root .msg");
    await expect(messages.first()).toBeVisible();
    await expect(messages).toHaveCount(2, {timeout: 5000});
  });

  test("closes with Escape key", async ({page}) => {
    await page.goto("/");
    await page.getByLabel("Open Mushbot").click();
    await expect(page.getByRole("dialog", {name: "Mushbot chat"})).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", {name: "Mushbot chat"})).not.toBeVisible();
  });

  test("toggle button appears on Observable page", async ({page}) => {
    await page.goto("/observable/projects/llm-fundamentals/");
    const fab = page.locator("#mushbot-root button").first();
    await expect(fab).toBeVisible({timeout: 10_000});
  });
});
