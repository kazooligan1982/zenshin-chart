import { test, expect, type Page } from "@playwright/test";
import { uniqueTitle } from "./helpers/test-data";

async function waitForInputWithValue(page: Page, text: string, timeout = 5000) {
  await page.waitForFunction(
    (t) =>
      Array.from(document.querySelectorAll("input, textarea")).some(
        (el) => (el as HTMLInputElement | HTMLTextAreaElement).value === t
      ),
    text,
    { timeout }
  );
}

/**
 * Core VRTA CRUD coverage. Each test creates its own chart so the suite is
 * order-independent. Charts are tagged with [E2E] for easy cleanup.
 *
 * Selectors prefer accessible roles + visible text (UI labels are sourced from
 * messages/ja.json — keep in sync if i18n keys change).
 */

async function createChart(page: Page, title: string) {
  await page.goto("/charts");
  // /charts redirects to /workspaces/{wsId}/charts — wait for that to settle.
  await page.waitForURL(/\/workspaces\/[a-f0-9-]+\/charts(\/|$|\?)/);
  // The "チャートを作成" button is rendered by NewChartButton.
  await page.getByRole("button", { name: /チャートを作成/ }).click();
  // Redirects to /workspaces/[wsId]/charts/[id]
  await page.waitForURL(/\/workspaces\/[a-f0-9-]+\/charts\/[a-f0-9-]+/);

  // Rename via the chart title input. The placeholder is "チャートの目的を一言で".
  const titleInput = page.getByPlaceholder(/チャートの目的を一言で/);
  await titleInput.fill(title);
  await titleInput.blur();
  // Allow autosave to settle.
  await page.waitForTimeout(800);
}

async function deleteChartFromMenu(page: Page) {
  // Open the "more" menu in the editor toolbar (MoreVertical icon button).
  // The menu surface text differs; we look for the destructive delete confirm.
  const more = page.getByRole("button", { name: /more|menu|メニュー/i }).first();
  if (await more.isVisible().catch(() => false)) {
    await more.click();
  }
  const deleteEntry = page.getByText(/チャートを完全に削除|削除/).first();
  if (await deleteEntry.isVisible().catch(() => false)) {
    await deleteEntry.click();
    const confirm = page.getByRole("button", { name: /削除する|完全に削除/ });
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click();
    }
  }
}

test.describe("Chart CRUD (B1-B3)", () => {
  test("B1: create chart and land on editor with chosen title", async ({
    page,
  }) => {
    const title = uniqueTitle("crud-create");
    await createChart(page, title);
    await expect(
      page.getByPlaceholder(/チャートの目的を一言で/)
    ).toHaveValue(title);
  });

  test("B2: chart title persists across reload", async ({ page }) => {
    const title = uniqueTitle("crud-rename");
    await createChart(page, title);
    await page.reload();
    await expect(
      page.getByPlaceholder(/チャートの目的を一言で/)
    ).toHaveValue(title);
  });

  test("B3: deleted chart no longer appears in chart list", async ({
    page,
  }) => {
    const title = uniqueTitle("crud-delete");
    await createChart(page, title);
    const url = page.url();
    await deleteChartFromMenu(page);
    // After delete the user should be navigated away from the chart URL.
    await expect(page).not.toHaveURL(url, { timeout: 5000 });
    await page.goto("/charts");
    await expect(page.getByText(title)).toHaveCount(0);
  });
});

test.describe("Vision / Reality CRUD (C1-C2)", () => {
  test("C1: add Vision item, content persists on reload", async ({ page }) => {
    await createChart(page, uniqueTitle("c1-vision"));
    const visionContent = `vision-${Date.now()}`;

    // Vision input uses placeholder "＋ 新しいVisionを追加" or
    // "理想の状態を書く...". Try the additive placeholder first.
    const addVision = page
      .getByPlaceholder(/新しいVisionを追加|理想の状態/)
      .first();
    await addVision.click();
    await addVision.fill(visionContent);
    await addVision.press("Enter");

    await expect(page.getByText(visionContent)).toBeVisible();
    await page.reload();
    await expect(page.getByText(visionContent)).toBeVisible();
  });

  test("C2: add Reality item, content persists on reload", async ({ page }) => {
    await createChart(page, uniqueTitle("c2-reality"));
    const realityContent = `reality-${Date.now()}`;

    const addReality = page
      .getByPlaceholder(/新しいRealityを追加|今の現実/)
      .first();
    await addReality.click();
    await addReality.fill(realityContent);
    await addReality.press("Enter");

    await expect(page.getByText(realityContent)).toBeVisible();
    await page.reload();
    await expect(page.getByText(realityContent)).toBeVisible();
  });
});

test.describe("Tension & Action CRUD (D1, E1)", () => {
  test("D1+E1: add Tension and an Action under it", async ({ page }) => {
    await createChart(page, uniqueTitle("d1-e1-tension-action"));

    // Need a Vision and Reality first so the Tension UI is meaningful.
    await page
      .getByPlaceholder(/新しいVisionを追加|理想の状態/)
      .first()
      .fill("理想");
    await page
      .getByPlaceholder(/新しいVisionを追加|理想の状態/)
      .first()
      .press("Enter");
    await page
      .getByPlaceholder(/新しいRealityを追加|今の現実/)
      .first()
      .fill("現状");
    await page
      .getByPlaceholder(/新しいRealityを追加|今の現実/)
      .first()
      .press("Enter");

    // Add Tension. The placeholder lives in editor.tensionGapPlaceholder.
    const tensionTitle = `tension-${Date.now()}`;
    const tensionInput = page
      .getByPlaceholder(/Tensionを追加|VisionとRealityのギャップ/)
      .first();
    await tensionInput.fill(tensionTitle);
    await tensionInput.press("Enter");
    // Tension title lands in an editable textbox — match on the live value.
    await waitForInputWithValue(page, tensionTitle);
    // Wait for the optimistic "temp-xxx" id to be replaced by a real UUID
    // before adding an action (otherwise the server rejects it with
    // "invalid input syntax for type uuid: temp-...").
    await page.waitForLoadState("networkidle");

    // Add Action under the tension. The add-action input is itself a textbox
    // (placeholder "＋ このTensionにActionを追加") — no link to click first.
    const actionTitle = `action-${Date.now()}`;
    const actionInput = page
      .getByPlaceholder(/このTensionにActionを追加|Actionを記述/)
      .first();
    await actionInput.fill(actionTitle);
    await actionInput.press("Enter");

    await waitForInputWithValue(page, actionTitle);
    await page.reload();
    await waitForInputWithValue(page, actionTitle);
    await waitForInputWithValue(page, tensionTitle);
  });
});
