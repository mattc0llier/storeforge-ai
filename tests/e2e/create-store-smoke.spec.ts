import { expect, test } from "@playwright/test";

const storageState = process.env.STOREFORGE_E2E_AUTH_STATE;

test.skip(
  !storageState,
  "Set STOREFORGE_E2E_AUTH_STATE=playwright/.auth/user.json to run the authenticated create-store smoke test.",
);

test.use(storageState ? { storageState } : {});

test("create store to blueprint page to status shell", async ({ page }) => {
  await page.goto("/");

  await page
    .getByRole("textbox", { name: /store idea/i })
    .fill(
      "A compact coffee gear store for remote workers with three focused products.",
    );
  await page.getByRole("button", { name: /generate blueprint/i }).click();

  await expect(page).toHaveURL(/\/stores\/[^/]+$/i, { timeout: 45_000 });
  await expect(page.getByText(/Store ID:/i)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByText(
      /Launch Catalog|Products are being generated|Ready to generate the store/i,
    ),
  ).toBeVisible({ timeout: 60_000 });

  const blueprintUrl = page.url().replace(/\/$/, "");
  await page.goto(`${blueprintUrl}/status`);

  await expect(page.getByText("Generation")).toBeVisible();
  await expect(
    page.getByText(/Live sandbox preview|Production store/i),
  ).toBeVisible();
});
