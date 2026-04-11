import { expect, test } from "@playwright/test";

test.describe("ヘルスチェック", () => {
  test("ログインページが表示される", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/login/);
    await expect(page.locator("body")).not.toContainText(
      "Internal Server Error"
    );
  });

  test("未認証ユーザーはログインにリダイレクトされる", async ({ page }) => {
    await page.goto("/charts");
    await expect(page).toHaveURL(/login/);
  });
});
