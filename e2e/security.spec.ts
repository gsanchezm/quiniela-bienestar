import { test, expect } from '@playwright/test';
import { blockYoutube } from './helpers';

// Guardrails de seguridad observables desde fuera.

test('todas las respuestas traen los encabezados de seguridad', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['permissions-policy']).toContain('camera=()');
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['content-security-policy']).toContain("object-src 'none'");
  expect(h['content-security-policy']).toContain('https://flagcdn.com');
});

test('la fuerza bruta en login se bloquea al sexto intento', async ({ page }) => {
  await blockYoutube(page);
  await page.goto('/login');
  const email = `fuerza-bruta-${Date.now()}@e2e.mx`;

  // Espera la respuesta de CADA intento antes del siguiente: React 19 resetea
  // el formulario al volver la action y un click adelantado iría vacío.
  const intento = async () => {
    await page.getByPlaceholder('tu@correo.com').fill(email);
    await page.getByPlaceholder('••••••••').fill('clave-mala');
    const respuesta = page.waitForResponse((r) => r.request().method() === 'POST');
    await page.getByRole('button', { name: 'ENTRAR A LA CANCHA' }).click();
    await respuesta;
  };

  for (let i = 0; i < 5; i++) {
    await intento();
    await expect(page.locator('.field-msg')).toHaveText('Correo o contraseña incorrectos.');
  }
  await intento();
  await expect(page.locator('.field-msg')).toContainText('Demasiados intentos');
});

test('el endpoint de sync rechaza un Bearer incorrecto', async ({ request }) => {
  const res = await request.post('/api/sync', {
    headers: { Authorization: 'Bearer un-secreto-equivocado' },
  });
  expect(res.status()).toBe(403);
});

test('las páginas protegidas no se sirven a un curl sin cookie', async ({ request }) => {
  const res = await request.get('/partidos', { maxRedirects: 0 });
  expect([302, 307]).toContain(res.status());
});
