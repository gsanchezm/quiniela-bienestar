import { expect, type Locator, type Page } from '@playwright/test';
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
  // 30 s: la primera compilación de /partidos en dev puede tardar más de 10 s.
  await expect(page).toHaveURL(/\/partidos/, { timeout: 30_000 });
}

// Tarjeta de partido que contiene el número LED dado (ej. '01').
export function matchCard(page: Page, n: string) {
  return page.locator('article.match').filter({ has: page.locator('.match-n', { hasText: n }) });
}

// Llena el marcador de una fila de admin con reintento: si React hidrata
// después del fill, el estado controlado limpia los inputs — se vuelve a
// llenar hasta que el botón de guardar quede habilitado.
export async function fillAdminGoals(row: Locator, h: string, a: string) {
  await expect(async () => {
    await row.locator('.goal-input').nth(0).fill(h);
    await row.locator('.goal-input').nth(1).fill(a);
    await expect(row.getByRole('button', { name: /Finalizar|Actualizar/ })).toBeEnabled({
      timeout: 1_500,
    });
  }).toPass({ timeout: 20_000 });
}
