import { test, expect, type Page } from "@playwright/test";
import { uniqueTitle } from "./helpers/test-data";

/**
 * Regression coverage for #86ex792ze ("comment submission not persisted").
 *
 * The bug report says comments do not save. We do not yet know whether the
 * failure is in the INSERT, the post-insert RETURNING, the optimistic→fetched
 * handoff in RightPane.tsx, or PostgREST embed resolution. These tests are
 * designed to surface whichever stage fails:
 *
 *   1. submit a comment (UI optimistic add)
 *   2. assert it appears (would catch UI render failures)
 *   3. reload the page and reopen the modal (would catch persistence failures)
 *   4. assert the comment is still rendered post-reload (would catch fetch
 *      / PostgREST embed failures)
 *
 * Run with: npx playwright test tests/e2e/comments.spec.ts --headed
 */

async function bootstrapChartWithAction(page: Page, label: string) {
  const chartTitle = uniqueTitle(label);

  await page.goto("/charts");
  await page.waitForURL(/\/workspaces\/[a-f0-9-]+\/charts(\/|$|\?)/);
  await page.getByRole("button", { name: /チャートを作成/ }).click();
  await page.waitForURL(/\/workspaces\/[a-f0-9-]+\/charts\/[a-f0-9-]+/);

  await page.getByPlaceholder(/チャートの目的を一言で/).fill(chartTitle);
  await page.keyboard.press("Tab");

  // Vision + Reality (Tension UI usually requires both to be present).
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

  const tensionTitle = `T-${Date.now()}`;
  await page
    .getByPlaceholder(/VisionとRealityのギャップ|テンションのタイトル/)
    .first()
    .fill(tensionTitle);
  await page
    .getByPlaceholder(/VisionとRealityのギャップ|テンションのタイトル/)
    .first()
    .press("Enter");
  await expect(page.getByText(tensionTitle)).toBeVisible();

  const actionTitle = `A-${Date.now()}`;
  const addActionLink = page.getByText(/このTensionにActionを追加/).first();
  if (await addActionLink.isVisible().catch(() => false)) {
    await addActionLink.click();
  }
  await page
    .getByPlaceholder(/Actionを記述|アクションを追加/)
    .first()
    .fill(actionTitle);
  await page
    .getByPlaceholder(/Actionを記述|アクションを追加/)
    .first()
    .press("Enter");
  await expect(page.getByText(actionTitle)).toBeVisible();

  return { chartTitle, tensionTitle, actionTitle };
}

async function openActionDetailModal(page: Page, actionTitle: string) {
  // Click the action row to open the unified detail modal.
  await page.getByText(actionTitle).first().click();
  // The modal renders a Comment input with placeholder timeline.commentPlaceholder.
  await expect(
    page.getByPlaceholder(/コメントを入力/)
  ).toBeVisible({ timeout: 10000 });
}

async function postComment(page: Page, body: string) {
  // The Tiptap editor renders inside a contenteditable, but the Placeholder
  // extension surfaces a placeholder attribute Playwright can target.
  const editor = page.getByPlaceholder(/コメントを入力/);
  await editor.click();
  await page.keyboard.type(body);
  // Cmd+Enter binding submits.
  await page.keyboard.press("Meta+Enter");
}

test.describe("Comment regression #86ex792ze (F1-F3)", () => {
  test("F1: action comment persists across reload", async ({ page }) => {
    const { actionTitle } = await bootstrapChartWithAction(page, "f1-action");
    await openActionDetailModal(page, actionTitle);

    const body = `e2e-action-comment-${Date.now()}`;
    await postComment(page, body);

    // Optimistic UI: comment appears immediately.
    await expect(page.getByText(body)).toBeVisible({ timeout: 5000 });

    // Hard reload — this is the key step. Optimistic state is wiped, so the
    // comment must come from the server fetch path.
    await page.reload();
    await openActionDetailModal(page, actionTitle);
    await expect(page.getByText(body)).toBeVisible({ timeout: 10000 });
  });

  test("F2: vision comment persists across reload", async ({ page }) => {
    await bootstrapChartWithAction(page, "f2-vision");

    // Click the Vision item we created in bootstrap to open its detail modal.
    await page.getByText("理想").first().click();
    await expect(
      page.getByPlaceholder(/コメントを入力/)
    ).toBeVisible({ timeout: 10000 });

    const body = `e2e-vision-comment-${Date.now()}`;
    await postComment(page, body);
    await expect(page.getByText(body)).toBeVisible({ timeout: 5000 });

    await page.reload();
    await page.getByText("理想").first().click();
    await expect(page.getByText(body)).toBeVisible({ timeout: 10000 });
  });

  test("F3: reality comment persists across reload", async ({ page }) => {
    await bootstrapChartWithAction(page, "f3-reality");

    await page.getByText("現状").first().click();
    await expect(
      page.getByPlaceholder(/コメントを入力/)
    ).toBeVisible({ timeout: 10000 });

    const body = `e2e-reality-comment-${Date.now()}`;
    await postComment(page, body);
    await expect(page.getByText(body)).toBeVisible({ timeout: 5000 });

    await page.reload();
    await page.getByText("現状").first().click();
    await expect(page.getByText(body)).toBeVisible({ timeout: 10000 });
  });
});
