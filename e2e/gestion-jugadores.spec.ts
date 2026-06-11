import { test, expect, type Page } from '@playwright/test';
import { blockYoutube, login } from './helpers';
import { E2E_ADMIN_EMAIL, E2E_PASSWORD, E2E_USER_EMAIL } from './env';

// Gestión de jugadores por el admin: enlace de reset, borrado definitivo,
// nombrar/quitar admins y guardrails de la propia cuenta.

test.describe.configure({ mode: 'serial' });

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '10.77.0.13' } });

async function registrar(page: Page, nombre: string, email: string) {
  await blockYoutube(page);
  await page.goto('/registro');
  await page.getByPlaceholder('Nombre', { exact: true }).fill(nombre);
  await page.getByPlaceholder('Apellido').fill('Gestión');
  await page.getByPlaceholder('tu@correo.com').fill(email);
  await page.getByPlaceholder('Mínimo 6 caracteres').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'REGISTRARME' }).click();
  await expect(page.locator('.authok')).toContainText('quedó registrada');
}

function filaDe(page: Page, email: string) {
  return page.locator('.admrow').filter({ hasText: email });
}

test('el enlace de reset generado por el admin permite elegir contraseña nueva', async ({ page }) => {
  const email = `reseteado-${Date.now()}@e2e.mx`;
  await registrar(page, 'Rita', email);

  await login(page, E2E_ADMIN_EMAIL);
  await page.goto('/jugadores');
  const fila = filaDe(page, email);
  await fila.getByRole('button', { name: /Confirmar cuenta/ }).click();
  await fila.getByRole('button', { name: /Enlace de reset/ }).click();
  const url = await fila.locator('.resetlink input').inputValue();
  expect(url).toMatch(/\/reset\/[0-9a-f]{64}$/);

  // El jugador abre el enlace y elige su contraseña (el admin nunca la conoce)
  await page.getByRole('button', { name: 'Salir' }).click();
  await page.goto(url);
  await page.locator('input[name=password]').fill('clave-nueva-123');
  await page.locator('input[name=password2]').fill('clave-nueva-123');
  await page.getByRole('button', { name: 'GUARDAR' }).click();
  await expect(page.locator('.authok')).toContainText('actualizada');

  await page.goto('/login');
  await page.getByPlaceholder('tu@correo.com').fill(email);
  await page.getByPlaceholder('••••••••').fill('clave-nueva-123');
  await page.getByRole('button', { name: 'ENTRAR A LA CANCHA' }).click();
  await expect(page).toHaveURL(/\/partidos/);
});

test('borrar a un participante es definitivo y le cierra la puerta', async ({ page }) => {
  const email = `borrado-${Date.now()}@e2e.mx`;
  await registrar(page, 'Bruno', email);

  await login(page, E2E_ADMIN_EMAIL);
  await page.goto('/jugadores');
  const fila = filaDe(page, email);
  await fila.getByRole('button', { name: 'Borrar', exact: true }).click();
  await fila.getByRole('button', { name: 'Sí, borrar definitivo' }).click();
  await expect(fila).toHaveCount(0);

  await page.getByRole('button', { name: 'Salir' }).click();
  await page.goto('/login');
  await page.getByPlaceholder('tu@correo.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'ENTRAR A LA CANCHA' }).click();
  await expect(page.locator('.field-msg')).toHaveText('Correo o contraseña incorrectos.');
});

test('nombrar admin a un jugador le da los tabs y quitárselo se los quita', async ({ page }) => {
  await login(page, E2E_ADMIN_EMAIL);
  await page.goto('/jugadores');
  const fila = filaDe(page, E2E_USER_EMAIL);
  await fila.getByRole('button', { name: 'Hacer admin' }).click();
  await expect(fila.locator('.badge-accent')).toHaveText('ADMIN');

  await page.getByRole('button', { name: 'Salir' }).click();
  await login(page, E2E_USER_EMAIL);
  await expect(page.locator('.apphead-tabs')).toContainText('RESULTADOS');
  await expect(page.locator('.apphead-tabs')).toContainText('JUGADORES');

  // Y puede gestionar (es admin pleno): ve la pantalla de jugadores
  await page.goto('/jugadores');
  await expect(page.locator('.stagetitle')).toHaveText('Jugadores');

  // De regreso: el super-admin le quita el rol
  await page.getByRole('button', { name: 'Salir' }).click();
  await login(page, E2E_ADMIN_EMAIL);
  await page.goto('/jugadores');
  await filaDe(page, E2E_USER_EMAIL).getByRole('button', { name: 'Quitar admin' }).click();
  await expect(filaDe(page, E2E_USER_EMAIL).locator('.badge-accent')).toHaveCount(0);

  await page.getByRole('button', { name: 'Salir' }).click();
  await login(page, E2E_USER_EMAIL);
  await expect(page.locator('.apphead-tabs')).not.toContainText('RESULTADOS');
});

test('el respaldo CSV incluye a todos los jugadores y es solo para admins', async ({ page }) => {
  await login(page, E2E_USER_EMAIL);
  expect((await page.request.get('/api/export')).status()).toBe(403);
  await page.getByRole('button', { name: 'Salir' }).click();

  await login(page, E2E_ADMIN_EMAIL);
  const res = await page.request.get('/api/export');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/csv');
  expect(res.headers()['content-disposition']).toContain('quiniela-respaldo');
  const body = await res.text();
  expect(body).toContain('Jugador,Email,Confirmado');
  expect(body).toContain(E2E_USER_EMAIL); // jugadores sin picks también aparecen
  expect(body).toContain(E2E_ADMIN_EMAIL);
});

test('guardrail: el admin no ve acciones destructivas sobre su propia cuenta', async ({ page }) => {
  await login(page, E2E_ADMIN_EMAIL);
  await page.goto('/jugadores');
  const miFila = filaDe(page, E2E_ADMIN_EMAIL);
  await expect(miFila.locator('.badge-accent').first()).toHaveText('TÚ');
  await expect(miFila.getByRole('button', { name: 'Borrar', exact: true })).toHaveCount(0);
  await expect(miFila.getByRole('button', { name: /Enlace de reset/ })).toHaveCount(0);
  await expect(miFila.getByRole('button', { name: /admin/i })).toHaveCount(0);
});
