import { expect, type Page } from '@playwright/test';
import { E2E_PASSWORD } from './env';

// El embed de YouTube no aporta a las pruebas y mete ruido/latencia.
export async function blockYoutube(page: Page) {
  await page.route('**://*.youtube.com/**', (r) => r.abort());
}

export async function login(page: Page, email: string) {
  await blockYoutube(page);
  await page.goto('/login');
  await page.getByPlaceholder('tu@correo.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'ENTRAR A LA CANCHA' }).click();
  await expect(page).toHaveURL(/\/partidos/);
}

// Tarjeta de partido que contiene el número LED dado (ej. '01').
export function matchCard(page: Page, n: string) {
  return page.locator('article.match').filter({ has: page.locator('.match-n', { hasText: n }) });
}
