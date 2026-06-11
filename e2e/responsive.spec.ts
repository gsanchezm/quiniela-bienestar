import { test, expect } from '@playwright/test';
import { blockYoutube, login, matchCard } from './helpers';
import { E2E_USER_EMAIL } from './env';

// Validación del responsive acordado en el spec §5:
// móvil apila los 3 botones de pick (alto mínimo 44px) y el carrusel
// pasa arriba del formulario; en escritorio van lado a lado.

test.describe('responsive — móvil (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('login: el carrusel queda ARRIBA del formulario en una sola columna', async ({ page }) => {
    await blockYoutube(page);
    await page.goto('/login');
    const carousel = await page.locator('.carousel').boundingBox();
    const form = await page.locator('.authcard-flat').boundingBox();
    expect(carousel).not.toBeNull();
    expect(form).not.toBeNull();
    expect(carousel!.y + carousel!.height).toBeLessThanOrEqual(form!.y + 1); // apilados
    expect(Math.abs(carousel!.x - form!.x)).toBeLessThan(2); // misma columna
  });

  test('partidos: los 3 botones de pick se apilan y miden al menos 44px de alto', async ({ page }) => {
    await login(page, E2E_USER_EMAIL);
    const card = matchCard(page, '05');
    await card.scrollIntoViewIfNeeded();
    const boxes = [];
    for (const b of await card.locator('.pick').all()) {
      const box = await b.boundingBox();
      expect(box).not.toBeNull();
      boxes.push(box!);
    }
    expect(boxes).toHaveLength(3);
    // misma x (una columna) y y creciente (apilados)
    expect(Math.abs(boxes[0].x - boxes[1].x)).toBeLessThan(2);
    expect(Math.abs(boxes[1].x - boxes[2].x)).toBeLessThan(2);
    expect(boxes[0].y).toBeLessThan(boxes[1].y);
    expect(boxes[1].y).toBeLessThan(boxes[2].y);
    for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('header: en móvil se oculta el nombre y quedan tabs y avatar usables', async ({ page }) => {
    await login(page, E2E_USER_EMAIL);
    await expect(page.locator('.apphead-username')).toBeHidden();
    await expect(page.locator('.apphead-tabs')).toBeVisible();
    await expect(page.locator('.apphead-profile')).toBeVisible();
  });

  test('landing: logo, countdown y botones caben sin scroll horizontal', async ({ page }) => {
    await blockYoutube(page);
    await page.goto('/');
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const innerW = await page.evaluate(() => window.innerWidth);
    expect(scrollW).toBeLessThanOrEqual(innerW + 1);
    await expect(page.locator('.countdown')).toBeVisible();
    await expect(page.getByRole('link', { name: 'INICIAR SESIÓN' })).toBeVisible();
  });
});

test.describe('responsive — escritorio (1280×800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('login: carrusel a la IZQUIERDA del formulario, en la misma fila', async ({ page }) => {
    await blockYoutube(page);
    await page.goto('/login');
    const carousel = await page.locator('.carousel').boundingBox();
    const form = await page.locator('.authcard-flat').boundingBox();
    expect(carousel!.x + carousel!.width).toBeLessThanOrEqual(form!.x + 1); // lado a lado
    expect(Math.abs(carousel!.y - form!.y)).toBeLessThan(2); // misma fila
  });

  test('partidos: los 3 botones de pick van en una sola fila', async ({ page }) => {
    await login(page, E2E_USER_EMAIL);
    const card = matchCard(page, '05');
    await card.scrollIntoViewIfNeeded();
    const boxes = [];
    for (const b of await card.locator('.pick').all()) {
      boxes.push((await b.boundingBox())!);
    }
    expect(boxes).toHaveLength(3);
    expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(2);
    expect(Math.abs(boxes[1].y - boxes[2].y)).toBeLessThan(2);
    expect(boxes[0].x).toBeLessThan(boxes[1].x);
    expect(boxes[1].x).toBeLessThan(boxes[2].x);
  });
});
