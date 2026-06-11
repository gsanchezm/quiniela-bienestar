import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';
import { E2E_USER_EMAIL } from './env';

// Foto de perfil (subir / cambiar / quitar / formato inválido) y
// actualización de información: lo guardado debe reflejarse en header y tabla.

test.describe.configure({ mode: 'serial' });

const fixture = (name: string) => path.join(__dirname, 'fixtures', name);

async function goToPerfil(page: Page) {
  await login(page, E2E_USER_EMAIL);
  await page.locator('.apphead-profile').click();
  await expect(page).toHaveURL(/\/perfil/);
}

test.describe('foto de perfil', () => {
  test('subir una imagen la recorta, se guarda y aparece en el header y la tabla', async ({ page }) => {
    await goToPerfil(page);
    await page.locator('.photopicker input[type=file]').setInputFiles(fixture('avatar-rojo.png'));
    await expect(page.locator('.photopicker-circle img')).toBeVisible(); // preview recortado
    await page.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
    await expect(page.locator('.profile-saved')).toHaveText('✓ Guardado');

    await expect(page.locator('.apphead-profile img.avatar')).toBeVisible(); // header actualizado
    await page.goto('/tabla');
    const fila = page.locator('.standrow').filter({ hasText: 'Prueba' });
    await expect(fila.locator('img.avatar')).toBeVisible(); // tabla actualizada

    await page.reload();
    await expect(page.locator('.apphead-profile img.avatar')).toBeVisible(); // persiste
  });

  test('cambiar la foto por otra también se guarda', async ({ page }) => {
    await goToPerfil(page);
    const antes = await page.locator('.photopicker input[type=hidden]').inputValue();
    await page.locator('.photopicker input[type=file]').setInputFiles(fixture('avatar-azul.png'));
    await expect
      .poll(async () => page.locator('.photopicker input[type=hidden]').inputValue())
      .not.toBe(antes); // la nueva imagen reemplazó a la anterior
    await page.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
    await expect(page.locator('.profile-saved')).toHaveText('✓ Guardado');
  });

  test('un archivo que no es imagen muestra error y no toca la foto actual', async ({ page }) => {
    await goToPerfil(page);
    await page.locator('.photopicker input[type=file]').setInputFiles(fixture('no-imagen.txt'));
    await expect(page.locator('.photopicker .field-msg')).toContainText('No pudimos leer esa imagen');
    await expect(page.locator('.photopicker-circle img')).toBeVisible(); // sigue la foto anterior
  });

  test('quitar la foto regresa al avatar de iniciales en header y tabla', async ({ page }) => {
    await goToPerfil(page);
    await page.getByRole('button', { name: 'Quitar' }).click();
    await expect(page.locator('.photopicker-circle img')).toHaveCount(0);
    await page.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
    await expect(page.locator('.profile-saved')).toHaveText('✓ Guardado');
    await expect(page.locator('.apphead-profile .avatar-initials')).toBeVisible();
    await page.goto('/tabla');
    const fila = page.locator('.standrow').filter({ hasText: 'Prueba' });
    await expect(fila.locator('.avatar-initials')).toBeVisible();
  });
});

test.describe('actualización de datos del perfil', () => {
  test('cambiar el nombre se refleja en el header y en la tabla (y se revierte igual)', async ({ page }) => {
    await goToPerfil(page);
    await page.locator('input[name=nombre]').fill('Erika');
    await page.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
    await expect(page.locator('.profile-saved')).toHaveText('✓ Guardado');
    await expect(page.locator('.apphead-username')).toHaveText('Erika');
    await page.goto('/tabla');
    await expect(page.locator('.standrow').filter({ hasText: 'Prueba' })).toContainText('Erika Prueba');

    // revertir — la actualización funciona en ambos sentidos
    await page.locator('.apphead-profile').click();
    await page.locator('input[name=nombre]').fill('Erik');
    await page.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
    await expect(page.locator('.profile-saved')).toHaveText('✓ Guardado');
    await expect(page.locator('.apphead-username')).toHaveText('Erik');
  });

  test('un correo inválido se rechaza con mensaje del servidor', async ({ page }) => {
    await goToPerfil(page);
    // 'erik@invalido' pasa la validación nativa del navegador pero no la de zod:
    // así probamos el rechazo del SERVIDOR, no el del input.
    await page.locator('input[name=email]').fill('erik@invalido');
    await page.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
    await expect(page.locator('.field-msg').first()).toHaveText('Correo inválido.');
  });

  test('cambiar el correo NO lo aplica de inmediato: manda confirmación al nuevo', async ({ page }) => {
    await goToPerfil(page);
    await page.locator('input[name=email]').fill(`erik+nuevo${Date.now()}@e2e.mx`);
    await page.getByRole('button', { name: 'GUARDAR CAMBIOS' }).click();
    await expect(page.locator('.authhint')).toContainText('correo a tu dirección nueva');
    // el correo vigente sigue siendo el anterior: recargar el perfil lo muestra
    await page.reload();
    await expect(page.locator('input[name=email]')).toHaveValue(E2E_USER_EMAIL);
  });
});
