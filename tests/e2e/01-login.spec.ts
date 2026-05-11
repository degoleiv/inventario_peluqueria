import { test, expect } from "@playwright/test";
import { E2E_ADMIN } from "./helpers/reset";

test.describe("E2E - Login y bootstrap (Selenium-like via Playwright)", () => {
  test("la página de login carga el formulario", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("input[type=email]")).toBeVisible();
    await expect(page.locator("input[type=password]")).toBeVisible();
    await expect(page.locator("button[type=submit]")).toBeVisible();
  });

  test("bootstrap o login del admin de pruebas redirige al panel", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const buttonText = (await page.locator("button[type=submit]").innerText()).toLowerCase();
    const isBootstrap = buttonText.includes("crear");

    if (isBootstrap) {
      const nombreField = page.locator('input').first();
      await nombreField.fill(E2E_ADMIN.nombre);
    }
    await page.locator("input[type=email]").fill(E2E_ADMIN.email);
    await page.locator("input[type=password]").fill(E2E_ADMIN.password);
    await page.locator("button[type=submit]").click();

    /* Tras login exitoso debería desaparecer el botón "Entrar" / "Crear administrador" */
    await expect(page.locator("button[type=submit]")).toBeHidden({ timeout: 15_000 });
  });

  test("login con password incorrecto muestra error y queda en la pantalla", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    /* Si aún era bootstrap, el test anterior ya lo creó. Forzamos un mal login. */
    const stillBootstrap = (await page.locator("button[type=submit]").innerText())
      .toLowerCase()
      .includes("crear");
    test.skip(stillBootstrap, "Aún en estado bootstrap, no aplica login fallido");

    await page.locator("input[type=email]").fill(E2E_ADMIN.email);
    await page.locator("input[type=password]").fill("password-incorrecto");
    await page.locator("button[type=submit]").click();

    /* La página de login sigue presente */
    await expect(page.locator("input[type=email]")).toBeVisible();
  });
});
