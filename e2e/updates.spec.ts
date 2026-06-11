import { test, expect, type Page } from '@playwright/test';
import { login, matchCard } from './helpers';
import { E2E_ADMIN_EMAIL, E2E_USER_EMAIL } from './env';

// "Si la información cambia, se actualiza": corregir o borrar un resultado
// ya capturado debe recalcular puntos, tarjetas y tabla en cadena.

test.describe.configure({ mode: 'serial' });

async function erikPoints(page: Page): Promise<number> {
  await page.goto('/tabla');
  const txt = await page
    .locator('.standrow')
    .filter({ hasText: 'Prueba' })
    .locator('.standrow-pts')
    .innerText();
  return parseInt(txt, 10);
}

test('el jugador pickea Brasil con marcador 1-0 en el partido 06', async ({ page }) => {
  await login(page, E2E_USER_EMAIL);
  const card = matchCard(page, '06');
  await card.getByRole('button', { name: /brasil/i }).click();
  await expect(card.getByRole('button', { name: /brasil/i })).toHaveClass(/pick-on/);
  await card.getByLabel(/goles de brasil/i).fill('1');
  await card.getByLabel(/goles de marruecos/i).fill('0');
  await card.getByLabel(/goles de marruecos/i).blur();
  await expect(card.getByRole('button', { name: 'Quitar' })).toBeVisible();
});

test('admin captura 1-0 y el jugador ve +3 y la tabla sube', async ({ page }) => {
  await login(page, E2E_ADMIN_EMAIL);
  const antes = await erikPoints(page);

  await page.goto('/resultados');
  const row = page.locator('.admrow').filter({ hasText: 'Brasil' }).first();
  await row.locator('.goal-input').nth(0).fill('1');
  await row.locator('.goal-input').nth(1).fill('0');
  await row.getByRole('button', { name: /Finalizar|Actualizar/ }).click();
  await expect(row.getByRole('button', { name: 'Actualizar' })).toBeVisible();

  expect(await erikPoints(page)).toBe(antes + 3);
});

test('la tarjeta del jugador refleja el acierto exacto', async ({ page }) => {
  await login(page, E2E_USER_EMAIL);
  const card = matchCard(page, '06');
  await expect(card.getByRole('button', { name: /brasil/i })).toHaveClass(/pick-hit/);
  await expect(card.locator('.match-lockline')).toContainText('+3 puntos');
});

test('admin CORRIGE el marcador a 0-2 y todo se recalcula: -3 puntos y tarjeta en rojo', async ({ page }) => {
  await login(page, E2E_ADMIN_EMAIL);
  const antes = await erikPoints(page);

  await page.goto('/resultados');
  const row = page.locator('.admrow').filter({ hasText: 'Brasil' }).first();
  await row.locator('.goal-input').nth(0).fill('0');
  await row.locator('.goal-input').nth(1).fill('2');
  await row.getByRole('button', { name: 'Actualizar' }).click();
  await expect(row.locator('.goal-input').nth(1)).toHaveValue('2');

  expect(await erikPoints(page)).toBe(antes - 3);

  await page.getByRole('button', { name: 'Salir' }).click();
  await login(page, E2E_USER_EMAIL);
  const card = matchCard(page, '06');
  await expect(card.getByRole('button', { name: /brasil/i })).toHaveClass(/pick-miss/);
  await expect(card.locator('.match-lockline')).toContainText('Sin punto');
});

test('admin BORRA el resultado y el partido vuelve a estar abierto para picks', async ({ page }) => {
  await login(page, E2E_ADMIN_EMAIL);
  await page.goto('/resultados');
  const row = page.locator('.admrow').filter({ hasText: 'Brasil' }).first();
  await row.getByRole('button', { name: 'Borrar' }).click();
  await expect(row.getByRole('button', { name: 'Finalizar' })).toBeVisible();

  await page.getByRole('button', { name: 'Salir' }).click();
  await login(page, E2E_USER_EMAIL);
  const card = matchCard(page, '06');
  await expect(card.locator('.match-vs')).toHaveText('VS'); // sin marcador
  await expect(card.getByRole('button', { name: /brasil/i })).toBeEnabled(); // editable otra vez
  await expect(card.locator('.match-lockline')).toHaveCount(0);
});
