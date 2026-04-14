import {expect, test} from "@playwright/test";

test.describe("Jay chatbot", () => {
  test("toggle button appears on landing page", async ({page}) => {
    await page.goto("/");
    const fab = page.getByLabel("Open Jay");
    await expect(fab).toBeVisible();
  });

  test("opens and closes chat panel", async ({page}) => {
    await page.goto("/");
    const fab = page.getByLabel("Open Jay");
    await fab.click();
    await expect(page.getByRole("dialog", {name: "Jay chat"})).toBeVisible();
    await expect(page.getByPlaceholder("Ask Jay...")).toBeVisible();

    const closeBtn = page.getByLabel("Close chat");
    await closeBtn.click();
    await expect(page.getByRole("dialog", {name: "Jay chat"})).not.toBeVisible();
  });

  test("sends a message and receives a mock reply", async ({page}) => {
    await page.goto("/");
    await page.getByLabel("Open Jay").click();
    const input = page.getByPlaceholder("Ask Jay...");
    await input.fill("Tell me about the projects");
    await page.getByLabel("Send message").click();

    await expect(input).toHaveValue("");
    const messages = page.locator(".jay-root .msg");
    await expect(messages.first()).toBeVisible();
    await expect(messages).toHaveCount(2, {timeout: 5000});
  });

  test("closes with Escape key", async ({page}) => {
    await page.goto("/");
    await page.getByLabel("Open Jay").click();
    await expect(page.getByRole("dialog", {name: "Jay chat"})).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", {name: "Jay chat"})).not.toBeVisible();
  });

  test("toggle button appears on Observable page", async ({page}) => {
    await page.goto("/observable/projects/llm-fundamentals/");
    const fab = page.locator("#jay-root button").first();
    await expect(fab).toBeVisible({timeout: 10_000});
  });

  test("new chat button clears messages", async ({page}) => {
    await page.goto("/");
    await page.getByLabel("Open Jay").click();
    const input = page.getByPlaceholder("Ask Jay...");
    await input.fill("Hello");
    await page.getByLabel("Send message").click();
    await expect(page.locator(".jay-root .msg")).toHaveCount(2, {timeout: 5000});

    await page.getByLabel("New chat").click();
    await expect(page.locator(".jay-root .msg")).toHaveCount(0);
  });

  test("conversation ID persists across navigation", async ({page}) => {
    await page.goto("/");
    await expect(page.getByLabel("Open Jay")).toBeVisible();
    const id1 = await page.evaluate(() => localStorage.getItem("jay-conversation-id"));
    await page.goto("/");
    await expect(page.getByLabel("Open Jay")).toBeVisible();
    const id2 = await page.evaluate(() => localStorage.getItem("jay-conversation-id"));
    expect(id1).toBeTruthy();
    expect(id1).toBe(id2);
  });

  test("new chat generates a fresh conversation ID", async ({page}) => {
    await page.goto("/");
    await page.getByLabel("Open Jay").click();
    const idBefore = await page.evaluate(() => localStorage.getItem("jay-conversation-id"));
    await page.getByLabel("New chat").click();
    const idAfter = await page.evaluate(() => localStorage.getItem("jay-conversation-id"));
    expect(idBefore).toBeTruthy();
    expect(idAfter).toBeTruthy();
    expect(idBefore).not.toBe(idAfter);
  });

  test("session token in sessionStorage survives navigation", async ({page}) => {
    await page.goto("/");
    await page.evaluate(() => sessionStorage.setItem("jay-session-token", "test-token-123"));
    await page.goto("/observable/projects/llm-fundamentals/");
    const token = await page.evaluate(() => sessionStorage.getItem("jay-session-token"));
    expect(token).toBe("test-token-123");
  });

  test("session expiry in sessionStorage survives navigation", async ({page}) => {
    await page.goto("/");
    await page.evaluate(() => sessionStorage.setItem("jay-session-expires-at", "1893456000"));
    await page.goto("/observable/projects/llm-fundamentals/");
    const expiresAt = await page.evaluate(() => sessionStorage.getItem("jay-session-expires-at"));
    expect(expiresAt).toBe("1893456000");
  });

  test("mock reply renders on Observable page", async ({page}) => {
    await page.goto("/observable/projects/llm-fundamentals/");
    const fab = page.locator("#jay-root button").first();
    await expect(fab).toBeVisible({timeout: 10_000});
    await fab.click();

    const input = page.locator("#jay-root input");
    await expect(input).toBeVisible({timeout: 5000});
    await input.fill("Tell me something");
    await page.locator("#jay-root").getByLabel("Send message").click();

    const messages = page.locator("#jay-root .msg");
    await expect(messages).toHaveCount(2, {timeout: 5000});
  });

  test("new chat button is disabled while sending", async ({page}) => {
    await page.goto("/");
    await page.getByLabel("Open Jay").click();
    const input = page.getByPlaceholder("Ask Jay...");
    await input.fill("Hello");
    await page.getByLabel("Send message").click();

    const newChatBtn = page.getByLabel("New chat");
    await expect(newChatBtn).toBeDisabled();
    await expect(page.locator(".jay-root .msg")).toHaveCount(2, {timeout: 5000});
    await expect(newChatBtn).toBeEnabled();
  });
});
