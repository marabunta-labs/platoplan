/**
 * PlatoPlan - Demo walkthrough (records a mobile-format video)
 *
 * Runs against a local Metro web server (http://localhost:8081) in GUEST mode
 * and clicks through the main features so the recorded video can be shared
 * (e.g. on Twitter). Recording + mobile viewport live in
 * playwright.demo.config.ts.
 *
 * Steps are best-effort: a missing element (different data/state) never aborts
 * the whole demo — it just moves on to the next scene.
 */

import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.DEMO_URL || 'http://localhost:8081';

/** Human-friendly pause so viewers can read the screen. */
async function beat(page: Page, ms = 1000) {
  await page.waitForTimeout(ms);
}

/** Tap the first visible element matching `name` (text or aria-label). Best-effort. */
async function tap(page: Page, name: string | RegExp, opts: { timeout?: number; settle?: number } = {}) {
  const timeout = opts.timeout ?? 3500;
  const byText = page.getByText(name, { exact: false }).first();
  try {
    await byText.waitFor({ state: 'visible', timeout });
    await beat(page, opts.settle ?? 400);
    // force + short timeout so an overlay that "intercepts pointer events" can
    // never block the whole demo for the full test timeout.
    await byText.click({ timeout: 1500, force: true });
    return true;
  } catch {
    /* fall through */
  }
  try {
    const byLabel = page.getByLabel(name).first();
    await byLabel.waitFor({ state: 'visible', timeout: 1200 });
    await byLabel.click({ timeout: 1200, force: true });
    return true;
  } catch {
    return false;
  }
}

/** Click a specific calendar slot by its data-plan-slot="day:slot" attribute. */
async function tapSlot(page: Page, day: number, slot: 'comida' | 'cena') {
  const el = page.locator(`[data-plan-slot="${day}:${slot}"]`).first();
  try {
    await el.waitFor({ state: 'visible', timeout: 3000 });
    await beat(page, 450);
    await el.click({ timeout: 1500, force: true });
    return true;
  } catch {
    return false;
  }
}

async function scrollDown(page: Page, amount = 300) {
  await page.mouse.wheel(0, amount);
  await beat(page, 600);
}

async function scrollUp(page: Page, amount = 600) {
  await page.mouse.wheel(0, -amount);
  await beat(page, 450);
}

test('PlatoPlan walkthrough (guest mode, mobile)', async ({ page }) => {
  test.setTimeout(240_000);

  // ── Scene 1: Open the app, enter as guest ────────────────────────────────
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await beat(page, 2500);
  await tap(page, /Continuar sin cuenta|Continue without account/, { timeout: 15000 });
  await beat(page, 2000);

  // ── Scene 2: Recipes (search + open one) ─────────────────────────────────
  await tap(page, /^Recetas$|^Recipes$/);
  await beat(page, 1200);
  const search = page.getByPlaceholder(/Buscar receta|Search recipe/).first();
  if (await search.isVisible().catch(() => false)) {
    await search.click();
    await search.type('pas', { delay: 150 });
    await beat(page, 1200);
    await search.fill('');
    await beat(page, 600);
  }
  await scrollDown(page);
  const firstRecipe = page.getByText(/tortilla|pasta|arroz|pollo|ensalada|huevos/i).first();
  if (await firstRecipe.isVisible().catch(() => false)) {
    await firstRecipe.click({ timeout: 1500, force: true }).catch(() => {});
    await beat(page, 2000);
    await scrollDown(page);
    await tap(page, /Volver|Back/);
    await beat(page, 900);
  }

  // ── Scene 3: Pantry + edit an ingredient ─────────────────────────────────
  await tap(page, /^Despensa$|^Pantry$/);
  await beat(page, 1300);
  await scrollDown(page);
  await beat(page, 600);
  // Tap an ingredient row to open its edit modal (name/unit/format/categories).
  const ingredientRow = page.getByText(/Huevos|Patata|Tomate|Arroz|Pasta|Aceite|Queso|Pollo/i).first();
  if (await ingredientRow.isVisible().catch(() => false)) {
    await ingredientRow.click({ timeout: 1500, force: true }).catch(() => {});
    await beat(page, 2200); // show the edit modal (categories with emoji, etc.)
    // Close it without changes.
    if (!(await tap(page, /Cancelar|Cancel/, { timeout: 1500 }))) {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await beat(page, 900);
  }
  await scrollUp(page);

  // ── Scene 4: Planning — walk the wizard, then edit the calendar ──────────
  await tap(page, /Planificar|^Plan$/);
  await beat(page, 1300);
  const openPlan = page.getByText(/Abrir y editar|Open and edit/).first();
  if (await openPlan.isVisible().catch(() => false)) {
    await openPlan.click({ timeout: 1500, force: true }).catch(() => {});
    await beat(page, 2300);

    // Opening a plan enters the wizard ("Editar menú", step 2/7). Advance until
    // the calendar (step 7) appears, detected by a [data-plan-slot] cell.
    for (let i = 0; i < 12; i++) {
      const slotCount = await page.locator('[data-plan-slot]').count().catch(() => 0);
      if (slotCount > 0) break;
      await tap(page, /Continuar igualmente|Continue anyway/, { timeout: 600 });
      await page.mouse.wheel(0, 1200);
      await beat(page, 450);
      const cta = page.getByText(/^Siguiente$|^Next$|Generar|Generate|Confirmar selección|Confirm selection/).last();
      if (await cta.isVisible().catch(() => false)) {
        await beat(page, 700);
        await cta.click({ timeout: 1500, force: true }).catch(() => {});
        await beat(page, 2000); // recipe-selection runs an async distribution
      } else {
        await beat(page, 600);
      }
    }
    await tap(page, /Continuar igualmente|Continue anyway/, { timeout: 1200 });
    await beat(page, 1500);

    // Show the calendar area (step 7).
    await scrollDown(page);
    await beat(page, 800);

    // 4a. Tap a filled lunch slot to open the slot menu, then close it.
    if (await tapSlot(page, 0, 'comida')) {
      await beat(page, 1800); // show the picker (change / note / move / remove)
      if (!(await tap(page, /Cancelar|Cancel/, { timeout: 1500 }))) {
        await page.keyboard.press('Escape').catch(() => {});
      }
      await beat(page, 900);
    }

    // 4b. Toggle the calendar view between vertical and horizontal.
    await scrollUp(page, 800);
    for (let i = 0; i < 2; i++) {
      const toggled =
        (await tap(page, /Horizontal/, { timeout: 1500 })) ||
        (await tap(page, /Vertical/, { timeout: 1500 }));
      if (toggled) {
        await beat(page, 1800); // let viewers see the layout change
      }
    }
    await scrollDown(page);
    await beat(page, 1000);
  }

  // ── Scene 5: Shopping list + export chooser ──────────────────────────────
  await tap(page, /^Compra$|^Shopping$/);
  await beat(page, 1300);
  const viewList = page.getByText(/Ver lista|View list/).first();
  if (await viewList.isVisible().catch(() => false)) {
    await viewList.click({ timeout: 1500, force: true }).catch(() => {});
    await beat(page, 2000);
    await scrollDown(page);
    await scrollDown(page);
    await scrollUp(page, 900);
    if (await tap(page, /Exportar|Export/, { timeout: 3000 })) {
      await beat(page, 1500); // show the PDF/Text chooser
      await tap(page, /Cancelar|Cancel/);
      await beat(page, 600);
    }
  }

  // ── Scene 6: Dark mode ───────────────────────────────────────────────────
  const themeToggle = page.getByLabel(/Modo oscuro|Modo claro|Dark mode|Light mode/).first();
  if (await themeToggle.isVisible().catch(() => false)) {
    await themeToggle.click({ timeout: 1500, force: true }).catch(() => {});
    await beat(page, 2000);
    await themeToggle.click({ timeout: 1500, force: true }).catch(() => {});
    await beat(page, 1300);
  }

  await beat(page, 1500);
  expect(true).toBeTruthy();
});
