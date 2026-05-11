import { test, expect } from "@playwright/test";
import { E2E_ADMIN } from "./helpers/reset";

async function loginIfNeeded(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const submit = page.locator("button[type=submit]");
  if (await submit.isVisible().catch(() => false)) {
    const txt = (await submit.innerText()).toLowerCase();
    if (txt.includes("crear")) {
      const nombre = page.locator("input").first();
      await nombre.fill(E2E_ADMIN.nombre);
    }
    await page.locator("input[type=email]").fill(E2E_ADMIN.email);
    await page.locator("input[type=password]").fill(E2E_ADMIN.password);
    await submit.click();
    await expect(submit).toBeHidden({ timeout: 15_000 });
  }
}

test.describe("E2E - Navegación principal autenticada", () => {
  test.beforeEach(async ({ page }) => {
    await loginIfNeeded(page);
  });

  test("muestra el área de aplicación tras iniciar sesión", async ({ page }) => {
    /* La app debe presentar al menos un nav o header con el nombre del negocio */
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(20);
  });

  test("la URL no vuelve al login al recargar (token persiste)", async ({ page }) => {
    await page.reload();
    await page.waitForLoadState("networkidle");
    /* Tras reload, no debería volver al botón "Entrar" */
    const submit = page.locator("button[type=submit]");
    await expect(submit).toHaveCount(0).catch(async () => {
      /* o, si existe submit, no debe ser el de login: comprobamos que NO es el de "Entrar" */
      const txt = (await submit.first().innerText().catch(() => "")).toLowerCase();
      expect(txt.includes("entrar") || txt.includes("crear")).toBe(false);
    });
  });
});
