// Diagnóstico contra producción: registro con contraseña conocida → login
// inmediato. El mensaje de error revela qué capa falla.
// Uso: pnpm exec tsx scripts/debug-prod-login.ts
import { chromium } from '@playwright/test';

const BASE = 'https://quiniela-bienestar.onrender.com';
const EMAIL = `debug-${Date.now()}@example.com`;
const PASSWORD = 'SecretoDebug123';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);

  console.log(`1) Registrando ${EMAIL} ...`);
  await page.goto(`${BASE}/registro`);
  await page.getByPlaceholder('Nombre', { exact: true }).fill('Debug');
  await page.getByPlaceholder('Apellido').fill('Prueba');
  await page.getByPlaceholder('tu@correo.com').fill(EMAIL);
  await page.getByPlaceholder('Mínimo 6 caracteres').fill(PASSWORD);
  await page.getByRole('button', { name: 'REGISTRARME' }).click();
  await page.locator('.authok').waitFor();
  console.log('   ✓ registro OK (pantalla de éxito)');

  console.log('2) Login inmediato con la MISMA contraseña ...');
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder('tu@correo.com').fill(EMAIL);
  await page.getByPlaceholder('••••••••').fill(PASSWORD);
  await page.getByRole('button', { name: 'ENTRAR A LA CANCHA' }).click();

  await Promise.race([
    page.waitForURL(/\/partidos/),
    page.locator('.field-msg').waitFor(),
  ]);

  if (page.url().includes('/partidos')) {
    console.log('   RESULTADO: entró directo (¿¡sin confirmar!?)');
  } else {
    console.log(`   RESULTADO: "${await page.locator('.field-msg').innerText()}"`);
  }

  console.log('3) Control: login con contraseña INCORRECTA ...');
  await page.getByPlaceholder('tu@correo.com').fill(EMAIL);
  await page.getByPlaceholder('••••••••').fill('otra-clave-equivocada');
  await page.getByRole('button', { name: 'ENTRAR A LA CANCHA' }).click();
  await page.waitForTimeout(2500);
  console.log(`   RESULTADO: "${await page.locator('.field-msg').innerText()}"`);

  await browser.close();
  console.log(`\nNOTA: borra la cuenta ${EMAIL} desde JUGADORES cuando terminemos.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
