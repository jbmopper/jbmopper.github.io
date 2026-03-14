import {expect, test} from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const deploymentRoute = "/observable/projects/llm-fundamentals/deployment/";
const GENERIC_ERROR_MESSAGE = "Something went wrong, please try again later.";

async function appendMount(
  page: Page,
  id: string,
  attributes: Record<string, string>,
): Promise<Locator> {
  await page.evaluate(
    ({id, attributes}) => {
      const mount = document.createElement("div");
      mount.id = id;
      mount.className = "jm-inference-mount";

      for (const [name, value] of Object.entries(attributes)) {
        mount.setAttribute(name, value);
      }

      document.querySelector("#observablehq-main")?.appendChild(mount);
    },
    {id, attributes},
  );

  const mount = page.locator(`#${id}`);
  await mount.scrollIntoViewIfNeeded();
  return mount.locator(".panel");
}

async function prepareUnlockedWidget(widget: Locator, model = "baseline") {
  await expect(widget.getByRole("heading", {name: "Select a model"})).toBeVisible();
  await widget.locator("select").selectOption(model);
  await widget.getByRole("button", {name: "Select"}).click();
  await expect(widget.getByRole("heading", {name: "Preparing model"})).toBeVisible();
  await expect(widget.locator("textarea")).toBeVisible();
}

test.describe("Inline inference widget", () => {
  test("unlocked flow requires explicit select and only shows the prompt after warmup", async ({page}) => {
    await page.goto(deploymentRoute);

    const widget = page.locator(".jm-inference-mount .panel").first();
    await expect(widget).toBeVisible();
    await expect(widget.locator(".status-pill")).toHaveCount(0);
    await expect(widget.locator("textarea")).toHaveCount(0);
    await expect(widget.locator("select")).toHaveValue("baseline");

    const optionLabels = await widget.locator("select option").allTextContents();
    expect(optionLabels).toEqual([
      "Assignment Default",
      "No-Norm Ablation",
      "No RoPE Ablation",
      "Post-Norm Ablation",
      "SiLU Activation Ablation",
      "\"Model A\" Wide Benchmarking Model",
      "\"Model B\" Deep Benchmarking Model",
      "Larger Wide-ish Model",
      "Larger Deep-ish Model",
    ]);

    await widget.locator("select").selectOption("model_J");
    await widget.getByRole("button", {name: "Select"}).click();

    await expect(widget.getByRole("heading", {name: "Preparing model"})).toBeVisible();
    await expect(widget).toContainText("Preparing Larger Deep-ish Model...");
    await expect(widget.locator("textarea")).toHaveAttribute("placeholder", "Once upon a time");
    await expect(widget.locator("textarea")).toHaveValue("");
    await expect(widget.locator(".prompt-suggestion")).toHaveCount(0);
    await expect(widget.getByRole("button", {name: "Change model"})).toBeVisible();
  });

  test("empty submit uses the end token, fresh round resets state, and change model returns to selection", async ({page}) => {
    await page.goto(deploymentRoute);

    const widget = page.locator(".jm-inference-mount .panel").first();
    await prepareUnlockedWidget(widget, "model_J");

    await widget.locator(".actions .btn-primary").click();
    await expect(widget.locator(".output-text")).toContainText("Prompt received:");
    await expect(widget.locator(".output-text")).not.toContainText("<|endoftext|>");

    await widget.getByRole("button", {name: "Fresh round"}).click();
    await expect(widget.locator("textarea")).toHaveValue("");
    await expect(widget.locator(".output-text")).toHaveCount(0);
    await expect(widget.locator(".output-placeholder")).toContainText("The streamed response will appear here.");

    await widget.getByRole("button", {name: "Change model"}).click();
    await expect(widget.getByRole("heading", {name: "Select a model"})).toBeVisible();
    await expect(widget.locator("textarea")).toHaveCount(0);
    await expect(widget.locator("select")).toHaveValue("model_J");
  });

  test("locked flow skips selection, warms immediately, and uses the default Continue label", async ({page}) => {
    await page.goto(deploymentRoute);

    const lockedWidget = await appendMount(page, "locked-model-test", {
      "data-inference-title": "Locked Model Test",
      "data-inference-locked-model": "baseline",
    });

    await expect(lockedWidget.getByRole("heading", {name: "Preparing model"})).toBeVisible();
    await expect(lockedWidget.locator("select")).toHaveCount(0);
    await expect(lockedWidget.locator(".status-pill")).toHaveCount(0);

    await expect(lockedWidget.locator("textarea")).toBeVisible();
    await expect(lockedWidget.locator(".locked-model")).toHaveText("Assignment Default");
    await expect(lockedWidget.getByRole("button", {name: "Continue"})).toBeVisible();
    await expect(lockedWidget.getByRole("button", {name: "Change model"})).toHaveCount(0);
  });

  test("warmup failure returns unlocked widgets to model selection with the generic error", async ({page}) => {
    await page.goto(deploymentRoute);

    const failureWidget = await appendMount(page, "warmup-failure-test", {
      "data-inference-title": "Warmup Failure Test",
      "data-inference-models": JSON.stringify([
        {value: "__fail_warmup__", label: "Broken Warmup"},
        {value: "baseline", label: "Assignment Default"},
      ]),
    });

    await expect(failureWidget.getByRole("heading", {name: "Select a model"})).toBeVisible();
    await failureWidget.locator("select").selectOption("__fail_warmup__");
    await failureWidget.getByRole("button", {name: "Select"}).click();

    await expect(failureWidget.getByRole("heading", {name: "Select a model"})).toBeVisible();
    await expect(failureWidget.locator(".alert-error")).toContainText(GENERIC_ERROR_MESSAGE);

    await failureWidget.locator("select").selectOption("baseline");
    await failureWidget.getByRole("button", {name: "Select"}).click();
    await expect(failureWidget.locator("textarea")).toBeVisible();
  });

  test("inference failure returns to the prompt with the generic error", async ({page}) => {
    await page.goto(deploymentRoute);

    const widget = page.locator(".jm-inference-mount .panel").first();
    await prepareUnlockedWidget(widget, "baseline");

    await widget.locator("textarea").fill("__fail_inference__");
    await widget.locator(".actions .btn-primary").click();

    await expect(widget.locator("textarea")).toBeVisible();
    await expect(widget.locator(".alert-error")).toContainText(GENERIC_ERROR_MESSAGE);
    await expect(widget.locator(".output-text")).toHaveCount(0);
  });
});
