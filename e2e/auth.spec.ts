import { test, expect } from '@playwright/test';
import { blockYoutube, login } from './helpers';
import { E2E_UNCONFIRMED_EMAIL, E2E_USER_EMAIL, E2E_PASSWORD } from './env';

// IP propia del spec: el rate limit de registro (5/h por IP) cuenta por
// cliente, igual que en producción detrás del proxy de Render.
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '10.77.0.11' } });

test.describe('autenticación — happy paths', () => {
  test('login correcto entra a Partidos y muestra al usuario en el header', async ({ page }) => {
    await login(page, E2E_USER_EMAIL);
    await expect(page.locator('.apphead-username')).toHaveText('Erik');
    await expect(page.locator('.stagetitle')).toHaveText('Jornada 1');
  });

  test('registro nuevo termina en la pantalla de "revisa tu correo"', async ({ page }) => {
    await blockYoutube(page);
    await page.goto('/registro');
    await page.getByPlaceholder('Nombre', { exact: true }).fill('Nueva');
    await page.getByPlaceholder('Apellido').fill('Jugadora');
    await page.getByPlaceholder('tu@correo.com').fill(`nueva+${Date.now()}@e2e.mx`);
    await page.getByPlaceholder('Mínimo 6 caracteres').fill('secreto1');
    await page.getByRole('button', { name: 'REGISTRARME' }).click();
    await expect(page.locator('.authok')).toContainText('El organizador de la quiniela la activará');
  });

  test('cerrar sesión regresa al landing', async ({ page }) => {
    await login(page, E2E_USER_EMAIL);
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.landing-badge')).toContainText('COPA MUNDIAL 2026');
  });
});

test.describe('autenticación — sad paths', () => {
  test('contraseña incorrecta muestra el error sin revelar cuál campo falló', async ({ page }) => {
    await blockYoutube(page);
    await page.goto('/login');
    await page.getByPlaceholder('tu@correo.com').fill(E2E_USER_EMAIL);
    await page.getByPlaceholder('••••••••').fill('incorrecta');
    await page.getByRole('button', { name: 'ENTRAR A LA CANCHA' }).click();
    await expect(page.locator('.field-msg')).toHaveText('Correo o contraseña incorrectos.');
    await expect(page).toHaveURL(/\/login/);
  });

  test('cuenta sin confirmar no puede entrar', async ({ page }) => {
    await blockYoutube(page);
    await page.goto('/login');
    await page.getByPlaceholder('tu@correo.com').fill(E2E_UNCONFIRMED_EMAIL);
    await page.getByPlaceholder('••••••••').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'ENTRAR A LA CANCHA' }).click();
    await expect(page.locator('.field-msg')).toContainText('no está confirmada');
  });

  test('registro con correo duplicado se rechaza', async ({ page }) => {
    await blockYoutube(page);
    await page.goto('/registro');
    await page.getByPlaceholder('Nombre', { exact: true }).fill('Otra');
    await page.getByPlaceholder('Apellido').fill('Persona');
    await page.getByPlaceholder('tu@correo.com').fill(E2E_USER_EMAIL);
    await page.getByPlaceholder('Mínimo 6 caracteres').fill('secreto1');
    await page.getByRole('button', { name: 'REGISTRARME' }).click();
    await expect(page.locator('.field-msg')).toHaveText('Ese correo ya está registrado.');
  });

  test('registro con contraseña corta se rechaza con el mensaje del prototipo', async ({ page }) => {
    await blockYoutube(page);
    await page.goto('/registro');
    await page.getByPlaceholder('Nombre', { exact: true }).fill('Otra');
    await page.getByPlaceholder('Apellido').fill('Persona');
    await page.getByPlaceholder('tu@correo.com').fill(`corta+${Date.now()}@e2e.mx`);
    await page.getByPlaceholder('Mínimo 6 caracteres').fill('12345');
    await page.getByRole('button', { name: 'REGISTRARME' }).click();
    await expect(page.locator('.field-msg')).toHaveText('Mínimo 6 caracteres.');
  });

  test('rutas protegidas sin sesión redirigen al login', async ({ page }) => {
    await blockYoutube(page);
    await page.goto('/partidos');
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/tabla');
    await expect(page).toHaveURL(/\/login/);
  });

  test('un enlace de confirmación inválido avisa en el login', async ({ page }) => {
    await blockYoutube(page);
    await page.goto('/confirmar/un-token-que-no-existe');
    await expect(page).toHaveURL(/\/login\?aviso=enlace-invalido/);
    await expect(page.locator('.alertbar')).toContainText('ya no es válido');
  });
});
