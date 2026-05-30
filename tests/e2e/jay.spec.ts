import {expect, test} from "@playwright/test";

test.describe("AI helper chatbot", () => {
  test("toggle button appears on landing page", async ({page}) => {
    await page.goto("/");
    const fab = page.getByLabel("Open AI helper");
    await expect(fab).toBeVisible();
    await expect(fab.locator("img")).toHaveAttribute("src", "/images/ai-helper-mark.svg");
  });

  test("opens and closes chat panel", async ({page}) => {
    await page.goto("/");
    const fab = page.getByLabel("Open AI helper");
    await fab.click();
    await expect(page.getByRole("dialog", {name: "AI helper chat"})).toBeVisible();
    await expect(page.getByPlaceholder("Ask the site AI...")).toBeVisible();

    const closeBtn = page.getByLabel("Close chat");
    await closeBtn.click();
    await expect(page.getByRole("dialog", {name: "AI helper chat"})).not.toBeVisible();
  });

  test("sends a message and receives a mock reply", async ({page}) => {
    await page.goto("/");
    await page.getByLabel("Open AI helper").click();
    const input = page.getByPlaceholder("Ask the site AI...");
    await input.fill("Tell me about the projects");
    await page.getByLabel("Send message").click();

    await expect(input).toHaveValue("");
    const messages = page.locator(".jay-root .msg");
    await expect(messages.first()).toBeVisible();
    await expect(messages).toHaveCount(2, {timeout: 5000});
    await expect(page.locator(".jay-root .msg.user .speaker")).toHaveText("You");
    await expect(page.locator(".jay-root .msg.bot .speaker")).toHaveText("AI helper");
  });

  test("composer keeps the input usable across panel width", async ({page}) => {
    await page.setViewportSize({width: 390, height: 720});
    await page.goto("/");
    await page.getByLabel("Open AI helper").click();

    const layout = await page.locator(".jay-root .input-row").evaluate((row) => {
      const input = row.querySelector("input");
      const button = row.querySelector("button");
      const rowBox = row.getBoundingClientRect();
      const inputBox = input?.getBoundingClientRect();
      const buttonBox = button?.getBoundingClientRect();
      return {
        rowWidth: rowBox.width,
        inputWidth: inputBox?.width ?? 0,
        buttonWidth: buttonBox?.width ?? 0,
      };
    });

    expect(layout.inputWidth).toBeGreaterThan(layout.rowWidth * 0.68);
    expect(layout.buttonWidth).toBeGreaterThanOrEqual(36);
  });

  test("closes with Escape key", async ({page}) => {
    await page.goto("/");
    await page.getByLabel("Open AI helper").click();
    await expect(page.getByRole("dialog", {name: "AI helper chat"})).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", {name: "AI helper chat"})).not.toBeVisible();
  });

  test("toggle button appears on Observable page", async ({page}) => {
    await page.goto("/observable/projects/llm-fundamentals/");
    const fab = page.locator("#jay-root button").first();
    await expect(fab).toBeVisible({timeout: 10_000});
  });

  test("new chat button clears messages", async ({page}) => {
    await page.goto("/");
    await page.getByLabel("Open AI helper").click();
    const input = page.getByPlaceholder("Ask the site AI...");
    await input.fill("Hello");
    await page.getByLabel("Send message").click();
    await expect(page.locator(".jay-root .msg")).toHaveCount(2, {timeout: 5000});

    await page.getByLabel("New chat").click();
    await expect(page.locator(".jay-root .msg")).toHaveCount(0);
  });

  test("conversation ID persists across navigation", async ({page}) => {
    await page.goto("/");
    await expect(page.getByLabel("Open AI helper")).toBeVisible();
    const id1 = await page.evaluate(() => localStorage.getItem("jay-conversation-id"));
    await page.goto("/");
    await expect(page.getByLabel("Open AI helper")).toBeVisible();
    const id2 = await page.evaluate(() => localStorage.getItem("jay-conversation-id"));
    expect(id1).toBeTruthy();
    expect(id1).toBe(id2);
  });

  test("new chat generates a fresh conversation ID", async ({page}) => {
    await page.goto("/");
    await page.getByLabel("Open AI helper").click();
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
    await page.getByLabel("Open AI helper").click();
    const input = page.getByPlaceholder("Ask the site AI...");
    await input.fill("Hello");
    await page.getByLabel("Send message").click();

    const newChatBtn = page.getByLabel("New chat");
    await expect(newChatBtn).toBeDisabled();
    await expect(page.locator(".jay-root .msg")).toHaveCount(2, {timeout: 5000});
    await expect(newChatBtn).toBeEnabled();
  });

  test("model markdown escapes unsafe html and links", async ({page}) => {
    await page.addInitScript(() => {
      sessionStorage.setItem("jay-ui-state", JSON.stringify({isOpen: true, draftText: ""}));
      sessionStorage.setItem(
        "jay-messages",
        JSON.stringify([
          {
            id: "unsafe-model-message",
            role: "model",
            text: '<img src=x onerror="window.__jayXss = true"> [bad](javascript:alert(1))',
            timestamp: Date.now(),
          },
        ]),
      );
    });

    await page.goto("/");
    const bubble = page.locator(".jay-root .bubble.markdown").first();
    await expect(bubble).toBeVisible();
    await expect(bubble).toContainText("<img src=x");
    await expect(bubble.locator("img")).toHaveCount(0);
    await expect(bubble.getByRole("link", {name: "bad"})).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__jayXss)).toBeUndefined();
  });
});
