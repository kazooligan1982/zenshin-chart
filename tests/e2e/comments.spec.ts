import { test, expect, type Page } from "@playwright/test";
import { uniqueTitle } from "./helpers/test-data";

/**
 * Wait until any <input>/<textarea> on the page has `value === text`.
 * We cannot use `input[value="..."]` CSS — for React-managed inputs that
 * reflects only the initial attribute, not the live DOM property — and
 * Playwright 1.58 does not expose a `getByDisplayValue` locator.
 */
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
    .getByPlaceholder(/Tensionを追加|VisionとRealityのギャップ/)
    .first()
    .fill(tensionTitle);
  await page
    .getByPlaceholder(/Tensionを追加|VisionとRealityのギャップ/)
    .first()
    .press("Enter");
  // Tension title is rendered inside an editable textbox — match on the
  // live input value rather than text content.
  await waitForInputWithValue(page, tensionTitle);
  // Wait for the optimistic "temp-xxx" id to be replaced with a real UUID
  // from the server; otherwise adding an action immediately races and hits
  // "invalid input syntax for type uuid: temp-..." on the server.
  await page.waitForLoadState("networkidle");

  const actionTitle = `A-${Date.now()}`;
  // The action add input is itself a textbox (placeholder
  // "＋ このTensionにActionを追加"), not a link to click first.
  await page
    .getByPlaceholder(/このTensionにActionを追加|Actionを記述/)
    .first()
    .fill(actionTitle);
  await page
    .getByPlaceholder(/このTensionにActionを追加|Actionを記述/)
    .first()
    .press("Enter");
  await waitForInputWithValue(page, actionTitle);

  return { chartTitle, tensionTitle, actionTitle };
}

// Each section (Vision / Reality / Tension+Action) exposes a "詳細/履歴"
// button per item that opens the unified detail modal. Vision renders first,
// Reality second, and the Action (nested under the Tension) third — tensions
// themselves do not expose a detail button.
const DETAIL_INDEX = { vision: 0, reality: 1, action: 2 } as const;

async function openDetailModal(page: Page, which: keyof typeof DETAIL_INDEX) {
  await page
    .getByRole("button", { name: "詳細/履歴" })
    .nth(DETAIL_INDEX[which])
    .click();
  // The unified detail modal is a role="dialog". Wait for it to render the
  // アクティビティ section (which hosts the Tiptap comment editor).
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await expect(
    dialog.getByRole("heading", { name: "アクティビティ" })
  ).toBeVisible({ timeout: 10000 });
}

async function postComment(page: Page, body: string) {
  // Tiptap renders the editor as a contenteditable. The placeholder is shown
  // via a CSS pseudo-element, so we cannot target it with getByPlaceholder —
  // instead, find the contenteditable inside the dialog.
  const dialog = page.getByRole("dialog");
  const editor = dialog.locator('[contenteditable="true"]').first();
  await editor.click();
  await page.keyboard.type(body);
  // Cmd+Enter binding submits.
  await page.keyboard.press("Meta+Enter");
}

test.describe("Comment regression #86ex792ze (F1-F3)", () => {
  test("F1: action comment persists across reload", async ({ page }) => {
    await bootstrapChartWithAction(page, "f1-action");
    await openDetailModal(page, "action");

    const body = `e2e-action-comment-${Date.now()}`;
    await postComment(page, body);

    // Optimistic UI: comment appears immediately.
    await expect(page.getByText(body)).toBeVisible({ timeout: 5000 });

    // Hard reload — this is the key step. Optimistic state is wiped, so the
    // comment must come from the server fetch path.
    await page.reload();
    await openDetailModal(page, "action");
    await expect(page.getByText(body)).toBeVisible({ timeout: 10000 });
  });

  test("F2: vision comment persists across reload", async ({ page }) => {
    await bootstrapChartWithAction(page, "f2-vision");
    await openDetailModal(page, "vision");

    const body = `e2e-vision-comment-${Date.now()}`;
    await postComment(page, body);
    await expect(page.getByText(body)).toBeVisible({ timeout: 5000 });

    await page.reload();
    await openDetailModal(page, "vision");
    await expect(page.getByText(body)).toBeVisible({ timeout: 10000 });
  });

  test("F3: reality comment persists across reload", async ({ page }) => {
    await bootstrapChartWithAction(page, "f3-reality");
    await openDetailModal(page, "reality");

    const body = `e2e-reality-comment-${Date.now()}`;
    await postComment(page, body);
    await expect(page.getByText(body)).toBeVisible({ timeout: 5000 });

    await page.reload();
    await openDetailModal(page, "reality");
    await expect(page.getByText(body)).toBeVisible({ timeout: 10000 });
  });
});
