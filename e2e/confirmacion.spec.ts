import { test, expect } from '@playwright/test';
import { blockYoutube, login } from './helpers';
import { E2E_ADMIN_EMAIL } from './env';

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '10.77.0.12' } });

// Flujo sin correo (Resend sin dominio): el amigo se registra, el correo no
// llega, el admin lo confirma manualmente desde Resultados y ya puede entrar.
test('registro → confirmación manual del admin → login del jugador', async ({ page }) => {
  const email = `amigo-${Date.now()}@e2e.mx`;

  // 1. El amigo se registra
  await blockYoutube(page);
  await page.goto('/registro');
  await page.getByPlaceholder('Nombre', { exact: true }).fill('Memo');
  await page.getByPlaceholder('Apellido').fill('Invitado');
  await page.getByPlaceholder('tu@correo.com').fill(email);
  await page.getByPlaceholder('Mínimo 6 caracteres').fill('secreto1');
  await page.getByRole('button', { name: 'REGISTRARME' }).click();
  await expect(page.locator('.authok')).toContainText('quedó registrada');

  // 2. Sin confirmar, el login se rechaza
  await page.goto('/login');
  await page.getByPlaceholder('tu@correo.com').fill(email);
  await page.getByPlaceholder('••••••••').fill('secreto1');
  await page.getByRole('button', { name: 'ENTRAR A LA CANCHA' }).click();
  await expect(page.locator('.field-msg')).toContainText('no está confirmada');

  // 3. El admin lo ve pendiente en JUGADORES y lo confirma
  await login(page, E2E_ADMIN_EMAIL);
  await page.goto('/jugadores');
  const fila = page.locator('.admrow').filter({ hasText: email });
  await expect(fila).toContainText('Memo Invitado');
  await expect(fila.locator('.badge-warn')).toHaveText('PENDIENTE');
  await fila.getByRole('button', { name: /Confirmar cuenta/ }).click();
  await expect(fila.locator('.badge-warn')).toHaveCount(0); // ya no está pendiente

  // 4. El amigo ya puede entrar a la cancha
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page).toHaveURL(/\/$/); // el logout regresa al landing
  await page.goto('/login');
  await page.getByPlaceholder('tu@correo.com').fill(email);
  await page.getByPlaceholder('••••••••').fill('secreto1');
  await page.getByRole('button', { name: 'ENTRAR A LA CANCHA' }).click();
  await expect(page).toHaveURL(/\/partidos/);
  await expect(page.locator('.apphead-username')).toHaveText('Memo');
});
