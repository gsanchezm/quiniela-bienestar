import { defineConfig } from '@playwright/test';
import { E2E_ADMIN_EMAIL, E2E_DB_URL } from './e2e/env';

// E2E contra el server real de Next y un Postgres local (prisma dev).
// workers: 1 — las pruebas comparten base de datos.
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 }, // el primer hit compila la ruta en dev
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'es-MX',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DB_URL,
      ADMIN_EMAILS: E2E_ADMIN_EMAIL,
      SESSION_SECRET: 'e2e-secret',
      APP_URL: 'http://localhost:3000',
    },
  },
});
