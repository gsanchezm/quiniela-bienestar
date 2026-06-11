import { test, expect } from '@playwright/test';
import { fillAdminGoals, login, matchCard } from './helpers';
import { E2E_ADMIN_EMAIL, E2E_USER_EMAIL } from './env';

test.describe.configure({ mode: 'serial' });

test.describe('picks y puntos — happy paths', () => {
  test('elegir un pick lo marca activo y persiste al recargar', async ({ page }) => {
    await login(page, E2E_USER_EMAIL);
    const card = matchCard(page, '01');
    const btn = card.getByRole('button', { name: /méxico/i });
    await btn.click();
    await expect(btn).toHaveClass(/pick-on/);
    await page.reload();
    await expect(matchCard(page, '01').getByRole('button', { name: /méxico/i })).toHaveClass(/pick-on/);
  });

  test('repetir el mismo pick lo des-selecciona (toggle)', async ({ page }) => {
    await login(page, E2E_USER_EMAIL);
    const card = matchCard(page, '02');
    const btn = card.getByRole('button', { name: /corea/i });
    await btn.click();
    await expect(btn).toHaveClass(/pick-on/);
    await btn.click();
    await expect(btn).not.toHaveClass(/pick-on/);
  });

  test('el marcador exacto se guarda al salir del campo y persiste', async ({ page }) => {
    await login(page, E2E_USER_EMAIL);
    const card = matchCard(page, '01');
    await card.getByLabel(/goles de méxico/i).fill('2');
    await card.getByLabel(/goles de sudáfrica/i).fill('0');
    await card.getByLabel(/goles de sudáfrica/i).blur();
    await expect(card.getByRole('button', { name: 'Quitar' })).toBeVisible();
    await page.reload();
    await expect(matchCard(page, '01').getByLabel(/goles de méxico/i)).toHaveValue('2');
  });

  test('capturar marcador sin pick auto-selecciona el 1X2 implícito', async ({ page }) => {
    await login(page, E2E_USER_EMAIL);
    const card = matchCard(page, '03');
    await card.getByLabel(/goles de canadá/i).fill('1');
    await card.getByLabel(/goles de bosnia/i).fill('1');
    await card.getByLabel(/goles de bosnia/i).blur();
    await expect(card.getByRole('button', { name: 'EMPATE' })).toHaveClass(/pick-on/);
  });

  test('un partido que cierra pronto muestra cuenta regresiva y el banner avisa', async ({ page }) => {
    await login(page, E2E_USER_EMAIL);
    // banner global: el partido 71 (sin pick) cierra en ~2 horas
    await expect(page.locator('.notice-urgent')).toContainText('sin pick');
    // su tarjeta (en J3) muestra la cuenta regresiva en ámbar
    await page.getByRole('button', { name: 'J3', exact: true }).click();
    const card = matchCard(page, '71');
    await expect(card.locator('.match-when')).toContainText('CIERRA EN 1 h');
    await expect(card.locator('.match-when')).toHaveClass(/match-when-urgent/);
  });

  test('pick y marcador contradictorios muestran la mini advertencia', async ({ page }) => {
    await login(page, E2E_USER_EMAIL);
    const card = matchCard(page, '03'); // pick EMPATE del test anterior
    await card.getByLabel(/goles de canadá/i).fill('2');
    await card.getByLabel(/goles de bosnia/i).fill('1');
    await card.getByLabel(/goles de bosnia/i).blur();
    await expect(card.locator('.match-pred-warn')).toContainText('resultados distintos');
    // espera la sincronización del servidor antes de editar de nuevo
    await expect(card.getByLabel(/goles de canadá/i)).toHaveValue('2');
    // al alinear el marcador con el pick, la advertencia desaparece
    await card.getByLabel(/goles de canadá/i).fill('1');
    await card.getByLabel(/goles de canadá/i).blur();
    await expect(card.locator('.match-pred-warn')).toHaveCount(0);
  });

  test('admin captura un resultado y la tabla suma 3 puntos (acierto + exacto)', async ({ page }) => {
    await login(page, E2E_ADMIN_EMAIL);
    await page.goto('/resultados');
    const row = page.locator('.admrow').filter({ hasText: 'México' }).first();
    await fillAdminGoals(row, '2', '0');
    await row.getByRole('button', { name: 'Finalizar' }).click();
    await expect(row.getByRole('button', { name: 'Actualizar' })).toBeVisible();

    await page.goto('/tabla');
    const erik = page.locator('.standrow').filter({ hasText: 'Erik Prueba' });
    await expect(erik.locator('.standrow-pts')).toHaveText('03');
    await expect(erik).toContainText('1 exacto');
  });

  test('el pick acertado se pinta verde y reporta los puntos en la tarjeta', async ({ page }) => {
    await login(page, E2E_USER_EMAIL);
    const card = matchCard(page, '01');
    await expect(card.getByRole('button', { name: /méxico/i })).toHaveClass(/pick-hit/);
    await expect(card.locator('.match-lockline')).toContainText('Marcador exacto · +3 puntos');
  });
});

test.describe('picks — sad paths', () => {
  test('un partido ya iniciado aparece cerrado y sin botones habilitados', async ({ page }) => {
    await login(page, E2E_USER_EMAIL);
    await page.getByRole('button', { name: 'J3', exact: true }).click();
    const card = matchCard(page, '72');
    await expect(card.locator('.match-when')).toHaveText('EN JUEGO / CERRADO');
    for (const b of await card.locator('.pick').all()) {
      await expect(b).toBeDisabled();
    }
    await expect(card.locator('.match-lockline')).toContainText('Picks cerrados');
  });

  test('una llave de eliminatoria sin equipos no permite picks', async ({ page }) => {
    await login(page, E2E_USER_EMAIL);
    await page.getByRole('button', { name: '16vos' }).click();
    const card = matchCard(page, '73');
    await expect(card.locator('.match-tbd')).toContainText('Equipos por definir');
    await expect(card.locator('.pick')).toHaveCount(0);
  });

  test('los inputs de marcador limpian letras, negativos y recortan a 2 dígitos', async ({ page }) => {
    await login(page, E2E_USER_EMAIL);
    const card = matchCard(page, '04');
    const input = card.getByLabel(/goles de ee\.uu\./i);
    await input.pressSequentially('abc');
    await expect(input).toHaveValue('');
    await input.pressSequentially('-5');
    await expect(input).toHaveValue('5');
    await input.fill('');
    await input.pressSequentially('123');
    await expect(input).toHaveValue('12');
  });

  test('un usuario normal no ve el tab Resultados y la ruta no existe para él', async ({ page }) => {
    await login(page, E2E_USER_EMAIL);
    await expect(page.locator('.apphead-tabs')).not.toContainText('RESULTADOS');
    const res = await page.goto('/resultados');
    expect(res!.status()).toBe(404);
  });

  test('los picks ajenos de partidos abiertos se muestran ocultos', async ({ page }) => {
    await login(page, E2E_ADMIN_EMAIL);
    await page.goto('/tabla');
    await page.locator('.standrow').filter({ hasText: 'Erik Prueba' }).click();
    await expect(page.locator('.player-name')).toContainText('Erik Prueba');
    // El partido 03 sigue abierto: el pick de Erik (empate 1-1) debe venir oculto.
    const row3 = page.locator('.pickrow').filter({ has: page.locator('.pickrow-n', { hasText: '03' }) });
    await expect(row3.locator('.pickrow-hidden')).toContainText('oculto');
  });
});
